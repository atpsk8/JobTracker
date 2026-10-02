import { useEffect, useRef, useState } from 'react'
import { APP_PASSWORD_PROVIDERS } from '../lib/appPassword.js'
import { REFRESH_MINUTES } from '../lib/useInboxes.js'

// How-to plus email and app password fields. The password is only stored if the user ticks
// "Keep scanning automatically", and then only encrypted in this browser.
function AppPasswordDialog({ provider, initialEmail = '', initialRemember = false, onSubmit, onClose }) {
  const dialog = useRef(null)
  const [email, setEmail] = useState(initialEmail)
  const [appPassword, setAppPassword] = useState('')
  const [remember, setRemember] = useState(initialRemember)
  const info = APP_PASSWORD_PROVIDERS[provider]

  useEffect(() => {
    dialog.current.showModal()
  }, [])

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit(email.trim(), appPassword, remember)
    dialog.current.close()
  }

  return (
    <dialog ref={dialog} className="dialog dialog-narrow" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <header className="dialog-head">
          <h2>Scan {info.label}</h2>
          <p>Job Tracker reads your mail with an <strong>app password</strong>, a separate password just for this site. Your normal password is never used.</p>
        </header>

        <ol className="steps">
          {info.steps.map((step) => (
            <li key={step.text}>
              {step.text}
              {step.href && (
                <>
                  {' '}
                  <a href={step.href} target="_blank" rel="noreferrer">{step.linkLabel}</a>
                </>
              )}
            </li>
          ))}
        </ol>

        <div className="form-stack">
          <label className="field">
            <span>Email address</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!initialEmail} />
          </label>
          <label className="field">
            <span>App password</span>
            <input
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              autoComplete="off"
              required
              autoFocus={Boolean(initialEmail)}
            />
          </label>
          <label className="field check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Keep scanning automatically on this device</span>
          </label>
        </div>
        <p className="note">
          {remember
            ? `The app password will be stored encrypted in this browser only, so new job emails are picked up every ${REFRESH_MINUTES} minutes whenever Job Tracker is open. Each check sends it to Job Tracker’s scanner to sign in to Gmail; the scanner doesn’t keep it. It is never included in backups, and you can forget it at any time from Accounts.`
            : `The app password is used for this visit only and never stored. New mail is checked every ${REFRESH_MINUTES} minutes until you close the page.`}
        </p>
        {info.unavailable && <p className="note">{info.unavailable}</p>}
        <div className="dialog-actions">
          <button type="submit" className="btn btn-primary">Scan inbox</button>
          <button type="button" className="btn-text" onClick={() => dialog.current.close()}>Cancel</button>
        </div>
      </form>
    </dialog>
  )
}
export default AppPasswordDialog
