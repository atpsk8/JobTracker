import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser'

const SCOPES = ['User.Read', 'Mail.Read']
const GRAPH = 'https://graph.microsoft.com/v1.0'
const SCAN_DAYS = 180
const MAX_MESSAGES = 300

const clientId = import.meta.env.VITE_MS_CLIENT_ID
// Set in this tab while the user is away on Microsoft's sign-in page
const PENDING_KEY = 'job-tracker-outlook-sign-in'

// False until the site owner registers the app with Microsoft (see SETUP.md)
export const isOutlookConfigured = Boolean(clientId)

// Thrown when Microsoft needs the user to sign in again (automatic refreshes can't open a window)
export class SignInRequiredError extends Error {
  constructor() {
    super('Outlook needs you to sign in again.')
    this.code = 'sign_in_required'
  }
}

let msalPromise = null

// Created once per page load. The sign-in is kept in localStorage so automatic refreshes keep
// working after a reload (Microsoft lets a browser app refresh silently for about 24 hours).
// Microsoft returns to redirect.html, which hands the result back to the page the user left.
function getMsal() {
  if (!clientId) return Promise.reject(new Error('Outlook isn’t available on this site yet.'))
  if (!msalPromise) {
    const msal = new PublicClientApplication({
      auth: {
        clientId,
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: `${window.location.origin}/redirect.html`,
      },
      cache: { cacheLocation: 'localStorage' },
    })
    msalPromise = msal.initialize().then(() => msal)
  }
  return msalPromise
}

// Sends this tab to Microsoft's sign-in page. It comes back to Job Tracker afterwards, where
// finishOutlookSignIn picks up the result. A full-page redirect rather than a pop-up, because
// pop-ups get blocked or stranded on a blank page in some browsers.
export async function startOutlookSignIn() {
  const msal = await getMsal()
  // Clears any sign-in the user abandoned earlier, which would otherwise block a new one
  await msal.handleRedirectPromise().catch(() => {})
  sessionStorage.setItem(PENDING_KEY, '1')
  try {
    await msal.loginRedirect({ scopes: SCOPES, prompt: 'select_account' })
  } catch (err) {
    // Includes coming back with the Back button, which restores this page as it was
    sessionStorage.removeItem(PENDING_KEY)
    if (err.errorCode === 'user_cancelled') throw new Error('Outlook sign-in was cancelled, so nothing was scanned.')
    throw err
  }
}

// True on the page load right after the user went to Microsoft's sign-in page from this tab
export function isOutlookSignInPending() {
  try {
    return Boolean(clientId) && sessionStorage.getItem(PENDING_KEY) === '1'
  } catch {
    return false
  }
}

// Resolves with the account that just signed in, or null if the user came back without
// finishing (for example with the Back button)
export async function finishOutlookSignIn() {
  sessionStorage.removeItem(PENDING_KEY)
  const msal = await getMsal()
  try {
    const result = await msal.handleRedirectPromise()
    if (!result) return null
    return { provider: 'outlook', email: result.account.username, token: result.accessToken }
  } catch (err) {
    if (['user_cancelled', 'access_denied'].includes(err.errorCode)) {
      throw new Error('Outlook sign-in was cancelled, so nothing was scanned.')
    }
    throw err
  }
}

// For automatic refreshes: a fresh token without any window, or SignInRequiredError
export async function connectOutlookSilently(email) {
  const msal = await getMsal()
  const account = msal.getAllAccounts().find((a) => a.username.toLowerCase() === email.toLowerCase())
  if (!account) throw new SignInRequiredError()
  try {
    const result = await msal.acquireTokenSilent({ scopes: SCOPES, account })
    return { provider: 'outlook', email: account.username, token: result.accessToken }
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) throw new SignInRequiredError()
    throw err
  }
}

export async function signOutOutlook(email) {
  if (!clientId) return
  const msal = await getMsal()
  const account = msal.getAllAccounts().find((a) => a.username.toLowerCase() === email.toLowerCase())
  if (account) await msal.clearCache({ account })
}

// Emails received since `since` (a Date), or in the last SCAN_DAYS days, newest first
export async function fetchOutlookEmails(account, since) {
  const earliest = new Date(Date.now() - SCAN_DAYS * 24 * 60 * 60 * 1000)
  const from = since && since > earliest ? since : earliest
  const params = new URLSearchParams({
    $filter: `receivedDateTime ge ${from.toISOString()}`,
    $orderby: 'receivedDateTime desc',
    $top: '50',
    $select: 'id,subject,from,receivedDateTime,body,webLink',
  })

  const messages = []
  let url = `${GRAPH}/me/messages?${params}`
  while (url && messages.length < MAX_MESSAGES) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${account.token}`,
        Prefer: 'outlook.body-content-type="text"',
      },
    })
    if (res.status === 401) throw new SignInRequiredError()
    if (!res.ok) throw new Error(`Outlook request failed (${res.status})`)
    const page = await res.json()
    messages.push(...page.value)
    url = page['@odata.nextLink']
  }

  return messages.map((message) => ({
    id: `outlook:${message.id}`,
    account: account.email,
    from: {
      name: message.from?.emailAddress?.name || '',
      address: message.from?.emailAddress?.address || '',
    },
    subject: message.subject || '',
    date: new Date(message.receivedDateTime),
    body: message.body?.content || '',
    link: message.webLink,
  }))
}
