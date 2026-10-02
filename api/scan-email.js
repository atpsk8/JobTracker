// Vercel serverless function: signs in to a mailbox over IMAP with an app password, finds likely
// job emails from the last SCAN_DAYS days and returns them. Credentials are used once and never stored.
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createMatcher } from '../src/lib/emailMatcher.js'

// Outlook can't use app passwords (Microsoft disabled them for mail apps), so it signs in through
// Microsoft in the browser instead; see src/lib/outlook.js
const PROVIDERS = {
  gmail: { host: 'imap.gmail.com', allMail: true },
}

const SCAN_DAYS = 180
const MAX_ENVELOPES = 3000
const MAX_MESSAGES = 150
const MAX_SOURCE_BYTES = 300_000
// Long enough to read whole job emails in the app; 150 of these stay well under Vercel's 4.5 MB response limit
const MAX_BODY_CHARS = 10_000

const keywords = JSON.parse(readFileSync(path.join(process.cwd(), 'job-application-keywords.json'), 'utf8'))
const matcher = createMatcher(keywords)

const isCandidate = (envelope) => matcher.isCandidate(envelope.subject, envelope.from?.[0]?.address)

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function send(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

// Gmail keeps archived mail out of INBOX, so scan "All Mail" when the server advertises it
async function mailboxToScan(client, provider) {
  if (!provider.allMail) return 'INBOX'
  const mailboxes = await client.list()
  return mailboxes.find((m) => m.specialUse === '\\All')?.path || 'INBOX'
}

function gmailLink(account, emailId) {
  return emailId ? `https://mail.google.com/mail/u/${encodeURIComponent(account)}/#all/${BigInt(emailId).toString(16)}` : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })

  let body
  try {
    body = await readJson(req)
  } catch {
    return send(res, 400, { error: 'Invalid request' })
  }
  const { provider: providerId, email, appPassword, since: sinceParam } = body
  const provider = PROVIDERS[providerId]
  if (!provider || !email || !appPassword) return send(res, 400, { error: 'Provider, email and app password are required' })

  const client = new ImapFlow({
    host: provider.host,
    port: 993,
    secure: true,
    auth: { user: email, pass: appPassword.replace(/\s+/g, '') },
    logger: false,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock(await mailboxToScan(client, provider))
    try {
      // Refreshes pass `since` to fetch only newer mail; never look back further than SCAN_DAYS
      const earliest = new Date(Date.now() - SCAN_DAYS * 24 * 60 * 60 * 1000)
      const requested = sinceParam ? new Date(sinceParam) : null
      const since = requested && !Number.isNaN(requested.getTime()) && requested > earliest ? requested : earliest
      const uids = ((await client.search({ since }, { uid: true })) || []).slice(-MAX_ENVELOPES)

      // Cheap pass: headers only, to pick out likely job emails
      const candidates = []
      if (uids.length) {
        for await (const message of client.fetch(uids, { uid: true, envelope: true }, { uid: true })) {
          if (isCandidate(message.envelope)) candidates.push(message.uid)
        }
      }

      // Full pass: download the newest candidates so their bodies can be matched
      const chosen = candidates.sort((a, b) => b - a).slice(0, MAX_MESSAGES)
      const raw = []
      if (chosen.length) {
        const query = { uid: true, source: { maxLength: MAX_SOURCE_BYTES }, internalDate: true }
        for await (const message of client.fetch(chosen, query, { uid: true })) raw.push(message)
      }

      const emails = await Promise.all(
        raw.map(async (message) => {
          const parsed = await simpleParser(message.source, { skipHtmlToText: false, skipImageLinks: true })
          const from = parsed.from?.value?.[0] || {}
          return {
            id: `${providerId}:${message.emailId || message.uid}`,
            account: email,
            from: { name: from.name || '', address: from.address || '' },
            subject: parsed.subject || '',
            date: (parsed.date || new Date(message.internalDate)).toISOString(),
            body: (parsed.text || '').slice(0, MAX_BODY_CHARS),
            link: providerId === 'gmail' ? gmailLink(email, message.emailId) : null,
          }
        }),
      )
      return send(res, 200, { emails })
    } finally {
      lock.release()
    }
  } catch (err) {
    if (err.authenticationFailed) {
      return send(res, 401, { error: 'Sign-in failed. Check the email address and app password.' })
    }
    return send(res, 502, { error: `Couldn't read the mailbox: ${err.responseText || err.message}` })
  } finally {
    await client.logout().catch(() => {})
  }
}
