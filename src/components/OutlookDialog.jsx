import { useEffect, useRef } from 'react'
import { isOutlookConfigured } from '../lib/outlook.js'

// How-to shown before the page goes to Microsoft's sign-in. The scan starts when it comes back.
function OutlookDialog({ onContinue, onClose }) {
  const dialog = useRef(null)

  useEffect(() => {
    dialog.current.showModal()
  }, [])

  return (
    <dialog ref={dialog} className="dialog dialog-narrow" onClose={onClose}>
      <header className="dialog-head">
        <h2>Scan Outlook</h2>
        <p>Works with Outlook.com, Hotmail and Live addresses, and Microsoft 365 work or school accounts.</p>
      </header>

      {isOutlookConfigured ? (
        <>
          <ol className="steps">
            <li>Click <strong>Continue to Microsoft</strong>. This page switches to Microsoft’s sign-in.</li>
            <li>Sign in and pick the account you want to scan.</li>
            <li>When Microsoft asks, accept the permission to <strong>read your mail</strong>.</li>
            <li>You’re brought back here and the scan starts on its own.</li>
          </ol>
          <p className="note">
            Your password goes to Microsoft, never to Job Tracker. Your mail is read in this browser, and only the
            job emails it finds are kept.
          </p>
          <p className="note">
            Work or school account? Your organisation may need an administrator to approve the app first.
            Personal accounts can remove access at any time from{' '}
            <a href="https://account.live.com/consent/Manage" target="_blank" rel="noreferrer">your Microsoft app permissions</a>.
          </p>
        </>
      ) : (
        // Only reachable while developing: on a live site the Outlook button is hidden until this is done
        <div className="callout">
          <p><strong>Developer setup needed.</strong> Visitors to the live site won’t see the Outlook button until this is done.</p>
          <ol className="steps">
            <li>In the <a href="https://portal.azure.com" target="_blank" rel="noreferrer">Azure portal</a>, open <strong>App registrations → New registration</strong>.</li>
            <li>Account types: <strong>any organizational directory and personal Microsoft accounts</strong>. Redirect URI: <strong>Single-page application</strong>, <code>{window.location.origin}/redirect.html</code>.</li>
            <li>Under <strong>API permissions</strong>, add Microsoft Graph delegated permission <strong>Mail.Read</strong>.</li>
            <li>Put the <strong>Application (client) ID</strong> in <code>.env</code> as <code>VITE_MS_CLIENT_ID=…</code> and restart <code>npm run dev</code>.</li>
          </ol>
        </div>
      )}

      <div className="dialog-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!isOutlookConfigured}
          onClick={() => { dialog.current.close(); onContinue() }}
        >
          Continue to Microsoft
        </button>
        <button type="button" className="btn-text" onClick={() => dialog.current.close()}>Cancel</button>
      </div>
    </dialog>
  )
}
export default OutlookDialog
