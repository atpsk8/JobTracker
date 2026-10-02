import { useRef, useState } from 'react'
import Section from './Section.jsx'
import OfferComparison from './OfferComparison.jsx'
import TrashIcon from './TrashIcon.jsx'
import Stage from './Stage.jsx'
import { STAGE_LABELS } from '../lib/findJobs.js'
import { STAGE_ORDER, hasOffer, needsFollowUp, normalizeCompany } from '../lib/jobs.js'
import { daysUntil, formatShortDate, formatTime, fromDateInput } from '../lib/format.js'

const LINKEDIN_APPLIED_URL = 'https://www.linkedin.com/my-items/saved-jobs/?cardType=APPLIED'
const INDEED_APPLIED_URL = 'https://myjobs.indeed.com/applied'


function FollowUpFlag({ job }) {
  return needsFollowUp(job) ? <span className="flag" title="No reply in over two weeks">Follow up</span> : null
}

// Assessment deadline read from the emails, while it's still ahead
function DeadlineFlag({ job }) {
  const deadline = job.extracted?.deadline
  if (job.stage !== 'assessment' || !deadline || daysUntil(deadline) < 0) return null
  return <span className="flag" title="Deadline found in the assessment email">Due {formatShortDate(fromDateInput(deadline))}</span>
}

// Offer "Add interview" for interview-stage jobs, or when an email mentions an interview time,
// unless an upcoming interview is already on the calendar for this job
function suggestsInterview(job, interviews) {
  const mentioned = job.extracted?.interviewAt
  if (job.stage !== 'interview' && !(mentioned && new Date(mentioned) > new Date())) return false
  const now = new Date()
  return !interviews.some((i) =>
    new Date(i.dateTime) >= now &&
    (i.jobId === job.id || normalizeCompany(i.company) === normalizeCompany(job.company)))
}

// Hidden jobs show Restore instead of the trash button
function JobRow({ job, interviews, onOpen, onViewEmail, onAddInterview, onRemove, onRestore }) {
  const mentioned = job.extracted?.interviewAt
  const subject = job.subject || (job.source === 'linkedin' ? 'LinkedIn job posting' : job.link ? 'Job posting' : job.notes)
  return (
    <li className="job-row">
      <Stage stage={job.stage} />
      <button className="job-company" onClick={() => onOpen(job)} title="Edit job">
        <span className="job-company-name">{job.company}</span>
        {job.position && <span className="job-position">{job.position}</span>}
      </button>
      <span className="job-subject">
        {/* Emails open in the in-app viewer; jobs imported from LinkedIn link to the posting itself */}
        {job.emailCount > 0 ? (
          <button className="link-button" onClick={() => onViewEmail(job)} title="Read the email">{subject}</button>
        ) : job.link ? (
          <a href={job.link} target="_blank" rel="noreferrer">{subject}</a>
        ) : subject}
      </span>
      <span className="job-date">
        {formatShortDate(job.date)}
        {job.emailCount > 1 && <span className="job-count" title={`${job.emailCount} emails`}> ×{job.emailCount}</span>}
      </span>
      <span className="job-actions">
        {job.hidden ? (
          <button className="btn-text accent" onClick={() => onRestore(job)}>Restore</button>
        ) : (
          <>
            <FollowUpFlag job={job} />
            <DeadlineFlag job={job} />
            {suggestsInterview(job, interviews) && (
              <button
                className="btn-text accent"
                onClick={() => onAddInterview(job)}
                title={mentioned ? `Email mentions ${formatShortDate(new Date(mentioned))}, ${formatTime(mentioned)}` : undefined}
              >
                Add interview
              </button>
            )}
            <button
              className="icon-button danger"
              onClick={() => onRemove(job)}
              aria-label={`Remove ${job.company}`}
              title={job.manual ? 'Delete job' : 'Remove (won’t come back on later scans)'}
            >
              <TrashIcon />
            </button>
          </>
        )}
      </span>
    </li>
  )
}

// Columns per stage; drag a card to another column to change its stage
function JobBoard({ jobs, onOpen, onStageChange }) {
  const [dragOver, setDragOver] = useState(null)
  const columns = jobs.some((j) => j.stage === 'unknown') ? [...STAGE_ORDER, 'unknown'] : STAGE_ORDER

  function handleDrop(event, stage) {
    event.preventDefault()
    setDragOver(null)
    const job = jobs.find((j) => j.id === event.dataTransfer.getData('text/plain'))
    if (job && job.stage !== stage) onStageChange(job, stage)
  }

  return (
    <div className="board">
      {columns.map((stage) => {
        const columnJobs = jobs.filter((j) => j.stage === stage)
        return (
          <section
            key={stage}
            className={dragOver === stage ? 'board-column is-drop-target' : 'board-column'}
            onDragOver={(e) => { e.preventDefault(); setDragOver(stage) }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => handleDrop(e, stage)}
          >
            <h3 className="board-head">
              <Stage stage={stage} />
              <span className="board-count">{columnJobs.length}</span>
            </h3>
            {columnJobs.map((job) => (
              <button
                key={job.id}
                className="board-card"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', job.id)}
                onClick={() => onOpen(job)}
              >
                <span className="job-company-name">{job.company}</span>
                {job.position && <span className="job-position">{job.position}</span>}
                <span className="board-card-foot">
                  <span className="job-date">{formatShortDate(job.date)}</span>
                  <FollowUpFlag job={job} />
                </span>
              </button>
            ))}
          </section>
        )
      })}
    </div>
  )
}

// Links to the job sites' own "applied" pages, plus importing LinkedIn's data export
function JobSites({ onImportLinkedIn }) {
  const fileInput = useRef(null)
  const [message, setMessage] = useState('')

  async function handleFiles(event) {
    const files = [...event.target.files]
    event.target.value = ''
    if (!files.length) return
    try {
      setMessage(await onImportLinkedIn(files))
    } catch (err) {
      setMessage(err.message)
    }
  }

  return (
    <div className="job-sites">
      <span className="job-sites-label">Job sites</span>
      <a href={LINKEDIN_APPLIED_URL} target="_blank" rel="noreferrer">LinkedIn applications</a>
      <a href={INDEED_APPLIED_URL} target="_blank" rel="noreferrer">Indeed applications</a>
      <button className="btn-text accent" onClick={() => fileInput.current.click()}>Import from LinkedIn</button>
      <input ref={fileInput} type="file" accept=".csv,text/csv" multiple hidden onChange={handleFiles} />
      <details className="import-help">
        <summary className="btn-text">How to import</summary>
        <ol>
          <li>On LinkedIn, open <strong>Me → Settings &amp; Privacy → Data privacy → Get a copy of your data</strong>.</li>
          <li>Choose <strong>Want something in particular?</strong>, tick <strong>Job applications</strong>, and request the archive.</li>
          <li>LinkedIn emails you when it’s ready, usually within an hour. Download and unzip it.</li>
          <li>Click <strong>Import from LinkedIn</strong> and pick the <strong>Job Applications</strong> CSV file(s) from the <code>Jobs</code> folder.</li>
        </ol>
        <p>Indeed has no export, but its confirmation emails are picked up when you scan your inbox.</p>
      </details>
      {message && <p className="note" role="status">{message}</p>}
    </div>
  )
}

function FoundJobs({
  jobs, hiddenJobs, interviews, onRemoveJob, onRestoreJob, undo, onUndo, onViewEmail,
  onOpenJob, onNewJob, onStageChange, onAddInterview, onImportLinkedIn,
}) {
  const [view, setView] = useState('list')
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')

  // The "Hidden" filter lists removed jobs (as a list only) so they can be restored
  const showingHidden = stageFilter === 'hidden'
  const shownView = showingHidden ? 'list' : view
  const query = search.trim().toLowerCase()
  const visible = (showingHidden ? hiddenJobs : jobs).filter((job) => {
    if (stageFilter === 'follow_up' && !needsFollowUp(job)) return false
    if (!['all', 'follow_up', 'hidden'].includes(stageFilter) && job.stage !== stageFilter) return false
    if (!query) return true
    return [job.company, job.position, job.subject, job.notes].some((text) => text?.toLowerCase().includes(query))
  })

  return (
    <Section
      title="Jobs"
      count={jobs.length}
      className="jobs"
      actions={<button className="btn btn-primary btn-small" onClick={onNewJob}>Add job</button>}
    >
      <div className="toolbar">
        <input
          type="search"
          className="toolbar-search"
          placeholder="Search company, position, notes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search jobs"
        />
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} aria-label="Filter by stage">
          <option value="all">All stages</option>
          {STAGE_ORDER.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
          <option value="unknown">{STAGE_LABELS.unknown}</option>
          <option value="follow_up">Needs follow-up</option>
          <option value="hidden">Removed ({hiddenJobs.length})</option>
        </select>
        <div className="segmented" role="group" aria-label="View">
          <button aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
          <button aria-pressed={view === 'board'} onClick={() => setView('board')}>Board</button>
          <button aria-pressed={view === 'offers'} onClick={() => setView('offers')}>Offers</button>
        </div>
      </div>

      <JobSites onImportLinkedIn={onImportLinkedIn} />

      {undo && (
        <p className="undo-bar" role="status">
          {undo.message}
          <button className="btn-text accent" onClick={onUndo}>Undo</button>
        </p>
      )}

      {showingHidden && hiddenJobs.length === 0 && <p className="empty">Nothing removed.</p>}
      {!showingHidden && jobs.length === 0 && (
        <p className="empty">No jobs yet. Scan an inbox, import from LinkedIn, or add one by hand.</p>
      )}
      {(showingHidden ? hiddenJobs : jobs).length > 0 && visible.length === 0 && (
        <p className="empty">No jobs match your search.</p>
      )}

      {shownView === 'offers' && (
        <OfferComparison jobs={visible.filter(hasOffer)} onEdit={(job) => onOpenJob(job, 'offer')} />
      )}
      {shownView === 'list' && visible.length > 0 && (
        <div className="job-table">
          <div className="job-row job-row-head" aria-hidden="true">
            <span>Stage</span>
            <span>Company</span>
            <span>Latest</span>
            <span>Date</span>
            <span />
          </div>
          <ul>
            {visible.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                interviews={interviews}
                onOpen={onOpenJob}
                onViewEmail={onViewEmail}
                onAddInterview={onAddInterview}
                onRemove={onRemoveJob}
                onRestore={onRestoreJob}
              />
            ))}
          </ul>
        </div>
      )}
      {shownView === 'board' && <JobBoard jobs={visible} onOpen={onOpenJob} onStageChange={onStageChange} />}
    </Section>
  )
}
export default FoundJobs
