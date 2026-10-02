// Providers read over IMAP with an app password (via the /api/scan-email function)
export const APP_PASSWORD_PROVIDERS = {
  gmail: {
    label: 'Gmail',
    steps: [
      {
        text: 'Turn on 2-Step Verification for your Google account, if it isn’t on already.',
        href: 'https://myaccount.google.com/signinoptions/two-step-verification',
        linkLabel: 'Open 2-Step Verification',
      },
      {
        text: 'Create an app password: name it “Job Tracker” and click Create.',
        href: 'https://myaccount.google.com/apppasswords',
        linkLabel: 'Open App passwords',
      },
      { text: 'Copy the 16-character password Google shows you and paste it below. Spaces don’t matter.' },
    ],
    unavailable:
      'If Google says app passwords aren’t available, your account doesn’t allow them. This is common for work or school accounts and for Advanced Protection.',
  },
}

// Thrown when the mail server rejects the app password (e.g. it was revoked)
export class BadPasswordError extends Error {
  constructor(message) {
    super(message)
    this.code = 'bad_password'
  }
}

// `since` (a Date) limits a refresh to newer mail; a full scan covers the last 180 days
export async function scanWithAppPassword(provider, email, appPassword, since) {
  const res = await fetch('/api/scan-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, email, appPassword, since: since?.toISOString() }),
  })
  const data = await res.json().catch(() => null)
  if (res.status === 401) throw new BadPasswordError(data?.error || 'Sign-in failed.')
  if (!res.ok) throw new Error(data?.error || `Scan failed (${res.status})`)
  return data.emails.map((e) => ({ ...e, date: new Date(e.date) }))
}
