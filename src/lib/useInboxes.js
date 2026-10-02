import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from './useStore.js'
import { deleteJobEmails, getJobEmails, saveJobEmails } from './storage.js'
import { findJobEmails } from './findJobs.js'
import { scanWithAppPassword } from './appPassword.js'
import { forgetPassword, recallPassword, rememberPassword } from './credentials.js'
import {
  connectOutlookSilently, fetchOutlookEmails, finishOutlookSignIn, isOutlookSignInPending, signOutOutlook,
  startOutlookSignIn,
} from './outlook.js'

// How often connected inboxes are checked for new mail while the page is open
export const REFRESH_MINUTES = 30
const REFRESH_MS = REFRESH_MINUTES * 60 * 1000
const TICK_MS = 60 * 1000
// Refreshes re-read a day of overlap, in case mail arrived late or mid-scan
const OVERLAP_MS = 24 * 60 * 60 * 1000

function mergeById(existing, incoming) {
  const byId = new Map(existing.map((e) => [e.id, e]))
  for (const e of incoming) byId.set(e.id, e)
  return [...byId.values()]
}

// Everything about connected inboxes: scanning, automatic refreshes, and each account's status.
// Accounts (and when they were last scanned) are saved; Gmail app passwords are only saved when
// the user asks, encrypted (see credentials.js), and otherwise kept in memory for this visit.
export function useInboxes() {
  const accounts = useStore('accounts')
  const [jobEmails, setJobEmails] = useState([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  // email -> { kind: 'refreshing' | 'needs_password' | 'sign_in_required' | 'error', message }
  const [accountStates, setAccountStates] = useState({})
  const [now, setNow] = useState(() => Date.now())
  const sessionPasswords = useRef(new Map())
  const lastAttempt = useRef(new Map())
  const refreshing = useRef(false)
  const checkedOutlookReturn = useRef(false)

  useEffect(() => {
    getJobEmails().then(setJobEmails).catch((err) => setStatus(`Couldn't load saved jobs: ${err.message}`))
  }, [])

  // Back from Microsoft's sign-in page: scan the account that just signed in
  useEffect(() => {
    if (checkedOutlookReturn.current || !isOutlookSignInPending()) return
    checkedOutlookReturn.current = true
    runFullScan('Outlook', async () => {
      const account = await finishOutlookSignIn()
      if (!account) return null
      setStatus(`Scanning ${account.email}…`)
      return { account, emails: await fetchOutlookEmails(account) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setAccountState = (email, state) => setAccountStates((prev) => ({ ...prev, [email]: state }))

  // Saves what a scan found and records when the account was scanned
  async function record(account, emails, mode, startedAt, extra = {}) {
    const found = findJobEmails(emails)
    await saveJobEmails(account.email, found, mode)
    setJobEmails((prev) => (mode === 'replace'
      ? [...prev.filter((e) => e.account !== account.email), ...found]
      : mergeById(prev, found)))
    const saved = accounts.items.find((a) => a.id === account.email)
    await accounts.save({ ...saved, ...extra, id: account.email, email: account.email, provider: account.provider, lastScanAt: startedAt })
    setAccountState(account.email, null)
    return found.length
  }

  // A full scan the user started: covers the last 180 days and replaces earlier results
  async function runFullScan(label, getAccountAndEmails, extra) {
    setBusy(true)
    setStatus(`Connecting to ${label}…`)
    const startedAt = Date.now()
    try {
      const result = await getAccountAndEmails()
      if (!result) {
        setStatus(`${label} sign-in didn’t finish, so nothing was scanned. Try again.`)
        return
      }
      const { account, emails } = result
      const count = await record(account, emails, 'replace', startedAt, extra)
      lastAttempt.current.set(account.email, startedAt)
      setStatus(`Found ${count} job emails in ${account.email}.`)
    } catch (err) {
      setStatus(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  async function scanGmail(email, appPassword, remember) {
    sessionPasswords.current.set(email, appPassword)
    if (remember) await rememberPassword(email, appPassword)
    else await forgetPassword(email)
    await runFullScan('Gmail', async () => {
      setStatus(`Scanning ${email}… this can take up to a minute.`)
      return { account: { provider: 'gmail', email }, emails: await scanWithAppPassword('gmail', email, appPassword) }
    }, { remembered: remember })
  }

  // Leaves for Microsoft's sign-in page; the scan runs when the page loads again (see above)
  async function scanOutlook() {
    setBusy(true)
    setStatus('Opening Microsoft sign-in…')
    try {
      await startOutlookSignIn()
    } catch (err) {
      setStatus(err.message || String(err))
      setBusy(false)
    }
  }

  // Checks one account for mail since its last scan, without opening any window
  async function refresh(account) {
    const email = account.email
    const startedAt = Date.now()
    const since = new Date((account.lastScanAt || startedAt) - OVERLAP_MS)
    lastAttempt.current.set(email, startedAt)
    setAccountState(email, { kind: 'refreshing' })
    try {
      let emails
      if (account.provider === 'gmail') {
        const password = sessionPasswords.current.get(email) || await recallPassword(email)
        if (!password) {
          setAccountState(email, { kind: 'needs_password' })
          return
        }
        try {
          emails = await scanWithAppPassword('gmail', email, password, since)
        } catch (err) {
          if (err.code !== 'bad_password') throw err
          sessionPasswords.current.delete(email)
          await forgetPassword(email)
          const saved = accounts.items.find((a) => a.id === email)
          if (saved) await accounts.save({ ...saved, remembered: false })
          setAccountState(email, { kind: 'needs_password', message: 'The app password stopped working. Enter a new one.' })
          return
        }
      } else {
        const connected = await connectOutlookSilently(email)
        emails = await fetchOutlookEmails(connected, since)
      }
      await record(account, emails, 'merge', startedAt)
    } catch (err) {
      setAccountState(email, err.code === 'sign_in_required'
        ? { kind: 'sign_in_required' }
        : { kind: 'error', message: err.message || String(err) })
    }
  }

  // Latest values for the timer, which outlives individual renders
  const latest = useRef()
  latest.current = { accounts: accounts.items, accountStates, busy, refresh }

  useEffect(() => {
    async function tick() {
      setNow(Date.now())
      const { accounts: list, accountStates: states, busy: scanning, refresh: refreshAccount } = latest.current
      if (refreshing.current || scanning) return
      refreshing.current = true
      try {
        for (const account of list) {
          const state = states[account.email]?.kind
          if (state === 'needs_password' || state === 'sign_in_required') continue
          const last = Math.max(account.lastScanAt || 0, lastAttempt.current.get(account.email) || 0)
          if (Date.now() - last < REFRESH_MS) continue
          await refreshAccount(account)
        }
      } finally {
        refreshing.current = false
      }
    }
    // Wait for saved accounts to load before the first check
    const first = setTimeout(tick, 3000)
    const timer = setInterval(tick, TICK_MS)
    return () => { clearTimeout(first); clearInterval(timer) }
  }, [])

  async function removeAccount(email) {
    try {
      await deleteJobEmails(email)
      await forgetPassword(email)
      sessionPasswords.current.delete(email)
      const saved = accounts.items.find((a) => a.id === email)
      if (saved) await accounts.remove(email)
      if (saved?.provider === 'outlook') await signOutOutlook(email).catch(() => {})
      setJobEmails((prev) => prev.filter((e) => e.account !== email))
      setAccountState(email, null)
      setStatus('')
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function forgetSavedPassword(email) {
    await forgetPassword(email)
    sessionPasswords.current.delete(email)
    const saved = accounts.items.find((a) => a.id === email)
    if (saved) await accounts.save({ ...saved, remembered: false })
  }

  // Saved accounts, plus accounts known only from older saved results (they can't refresh until rescanned)
  const accountList = useMemo(() => {
    const listed = accounts.items.map((a) => ({
      ...a,
      state: accountStates[a.email] || null,
      autoRefresh: a.provider === 'outlook' || a.remembered || sessionPasswords.current.has(a.email),
    }))
    const legacy = [...new Set(jobEmails.map((e) => e.account))]
      .filter((email) => !accounts.items.some((a) => a.email === email))
      .map((email) => ({
        id: email,
        email,
        provider: jobEmails.find((e) => e.account === email).id.split(':')[0],
        lastScanAt: null,
        autoRefresh: false,
        state: null,
      }))
    return [...listed, ...legacy].sort((a, b) => a.email.localeCompare(b.email))
    // `now` re-renders the "checked N minutes ago" text
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.items, jobEmails, accountStates, now])

  return {
    jobEmails,
    accountList,
    status: status || accounts.error,
    busy,
    now,
    scanGmail,
    scanOutlook,
    refresh,
    removeAccount,
    forgetSavedPassword,
  }
}
