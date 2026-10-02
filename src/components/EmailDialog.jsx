import { useEffect, useRef, useState } from 'react'
import EmailFacts from './EmailFacts.jsx'
import Stage from './Stage.jsx'
import { formatShortDate } from '../lib/format.js'

const PROVIDER_LABELS = { gmail: 'Gmail', outlook: 'Outlook' }

// Web addresses, without trailing punctuation that usually ends the sentence
const URL_PATTERN = /(https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]])/g

// Plain email text with clickable web links. React escapes the text, so nothing in an email
// can run as code or change the page.
function EmailText({ text }) {
  const tidy = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return tidy.split(URL_PATTERN).map((part, i) => (i % 2 === 1
    ? <a key={i} href={part} target="_blank" rel="noreferrer noopener">{part}</a>
    : part))
}

const formatReceived = (date) => date.toLocaleString(undefined, {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
})

// Reads a job's emails inside the app: text, sender, dates and the details found in each one.
// `emails` is newest first; jobs with several emails get a list to switch between them.
function EmailDialog({ job, emails, onAddInterview, onEditJob, onClose }) {
  const dialog = useRef(null)
  const [selectedId, setSelectedId] = useState(emails[0]?.id)

  useEffect(() => {
    dialog.current.showModal()
  }, [])

  const close = () => dialog.current.close()
  const email = emails.find((e) => e.id === selectedId) || emails[0]
  const interviewAt = email?.details?.interviewAt
  const provider = email && PROVIDER_LABELS[email.id.split(':')[0]]

  return (
    <dialog ref={dialog} className="dialog dialog-wide email-dialog" onClose={onClose}>
      {!email ? (
        <p className="empty">This job’s emails are no longer saved. Scan the inbox again to bring them back.</p>
      ) : (
        <>
          <header className="dialog-head">
            <p className="email-context">
              <Stage stage={email.stage} />
              <span>{job.company}{job.position ? ` · ${job.position}` : ''}</span>
            </p>
            <h2>{email.subject || '(no subject)'}</h2>
            <dl className="email-meta">
              <div>
                <dt>From</dt>
                <dd>
                  {email.from?.name || email.from?.address}
                  {email.from?.name && email.from?.address && <span className="email-address"> &lt;{email.from.address}&gt;</span>}
                </dd>
              </div>
              <div>
                <dt>Received</dt>
                <dd>{formatReceived(email.date)}</dd>
              </div>
              <div>
                <dt>Inbox</dt>
                <dd>{email.account}</dd>
              </div>
            </dl>
            <EmailFacts details={email.details} showPosition />
          </header>

          {emails.length > 1 && (
            <nav className="email-list" aria-label={`${emails.length} emails about this job`}>
              {emails.map((e) => (
                <button key={e.id} type="button" aria-current={e.id === email.id} onClick={() => setSelectedId(e.id)}>
                  <span className="email-list-date">{formatShortDate(e.date)}</span>
                  <span className="email-list-subject">{e.subject || '(no subject)'}</span>
                </button>
              ))}
            </nav>
          )}

          {/* Focusable so long emails can be scrolled with the keyboard */}
          <div className="email-body" tabIndex={0} aria-label="Email text">
            {email.body
              ? <EmailText text={email.body} />
              : <p className="note">This email was saved before Job Tracker kept email text. Scan the inbox again to read it here.</p>}
          </div>
        </>
      )}

      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={close}>Close</button>
        {interviewAt && new Date(interviewAt) > new Date() && (
          <button type="button" className="btn" onClick={() => { close(); onAddInterview(email) }}>Add interview</button>
        )}
        {onEditJob && <button type="button" className="btn" onClick={() => { close(); onEditJob() }}>Edit job</button>}
        {email?.link && (
          <a className="dialog-actions-end" href={email.link} target="_blank" rel="noreferrer">Open in {provider}</a>
        )}
      </div>
    </dialog>
  )
}
export default EmailDialog
