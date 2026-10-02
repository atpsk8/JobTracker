import { useEffect, useRef, useState } from 'react'
import { STAGE_LABELS } from '../lib/findJobs.js'
import {
  EMPTY_PREP, STAGE_ORDER, WORK_MODES, cleanOffer, needsFollowUp, normalizeCompany, offerToForm,
} from '../lib/jobs.js'
import { formatShortDate, formatTime } from '../lib/format.js'
import { dayKey } from './MonthCalendar.jsx'
import EmailFacts from './EmailFacts.jsx'

const TABS = [
  ['details', 'Details'],
  ['prep', 'Prep'],
  ['offer', 'Offer'],
]

function DetailsTab({ form, onChange, isEditable, resumes }) {
  return (
    <div className="form-grid">
      <label className="field">
        <span>Company</span>
        <input name="company" value={form.company} onChange={onChange} required />
      </label>
      <label className="field">
        <span>Position</span>
        <input name="position" value={form.position} onChange={onChange} />
      </label>
      <label className="field">
        <span>Stage</span>
        <select name="stage" value={form.stage} onChange={onChange}>
          {STAGE_ORDER.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
          {form.stage === 'unknown' && <option value="unknown">{STAGE_LABELS.unknown}</option>}
        </select>
      </label>
      {isEditable && (
        <label className="field">
          <span>Applied on</span>
          <input type="date" name="date" value={form.date} onChange={onChange} required />
        </label>
      )}
      <label className="field">
        <span>Resume sent</span>
        <select name="resumeId" value={form.resumeId} onChange={onChange}>
          <option value="">None</option>
          {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}
        </select>
      </label>
      <label className="field field-wide">
        <span>Notes</span>
        <textarea name="notes" value={form.notes} onChange={onChange} rows={4} />
      </label>
    </div>
  )
}

function PrepTab({ prep, onChange, onToggleStory, stories, pastRounds }) {
  return (
    <div className="form-stack">
      <label className="field">
        <span>Questions to ask them</span>
        <textarea name="questionsToAsk" value={prep.questionsToAsk} onChange={onChange} rows={4}
          placeholder="What does success look like in the first 90 days? How is the team structured?" />
      </label>
      <label className="field">
        <span>Research</span>
        <textarea name="research" value={prep.research} onChange={onChange} rows={4}
          placeholder="What they do, recent news, the team, why you want this role" />
      </label>

      <fieldset className="field">
        <legend>Stories to tell</legend>
        {stories.length === 0
          ? <p className="note">Add STAR stories to the Story bank in the sidebar, then pick the ones that fit this role.</p>
          : (
            <div className="check-list">
              {stories.map((story) => (
                <label key={story.id} className="check">
                  <input type="checkbox" checked={prep.storyIds.includes(story.id)} onChange={() => onToggleStory(story.id)} />
                  <span>{story.title}</span>
                </label>
              ))}
            </div>
          )}
      </fieldset>

      {pastRounds.length > 0 && (
        <div className="field">
          <span>Past rounds</span>
          <ul className="debrief-list">
            {pastRounds.map((round) => (
              <li key={round.id}>
                <span className="debrief-when">
                  {formatShortDate(new Date(round.dateTime))}, {formatTime(round.dateTime)}
                </span>
                {round.questionsAsked && <p><strong>They asked:</strong> {round.questionsAsked}</p>}
                {round.reflection && <p><strong>How it went:</strong> {round.reflection}</p>}
                {!round.questionsAsked && !round.reflection && <p className="note">No debrief yet.</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function OfferTab({ offer, onChange }) {
  const amount = (name, label) => (
    <label className="field">
      <span>{label}</span>
      <input type="number" min="0" step="any" inputMode="decimal" name={name} value={offer[name]} onChange={onChange} />
    </label>
  )
  return (
    <div className="form-grid">
      {amount('base', 'Base salary (yearly)')}
      {amount('bonus', 'Bonus (yearly target)')}
      {amount('signOn', 'Sign-on bonus')}
      {amount('equityPerYear', 'Equity per year (estimate)')}
      <label className="field">
        <span>Work mode</span>
        <select name="workMode" value={offer.workMode} onChange={onChange}>
          <option value="">Not set</option>
          {Object.entries(WORK_MODES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Location</span>
        <input name="location" value={offer.location} onChange={onChange} />
      </label>
      <label className="field">
        <span>Start date</span>
        <input type="date" name="startDate" value={offer.startDate} onChange={onChange} />
      </label>
      <label className="field">
        <span>Respond by</span>
        <input type="date" name="deadline" value={offer.deadline} onChange={onChange} />
      </label>
      <label className="field field-wide">
        <span>Benefits</span>
        <textarea name="benefits" value={offer.benefits} onChange={onChange} rows={2}
          placeholder="Health cover, retirement match, paid time off, learning budget" />
      </label>
      <label className="field field-wide">
        <span>Negotiation notes</span>
        <textarea name="notes" value={offer.notes} onChange={onChange} rows={3}
          placeholder="What you asked for, what they said, your walk-away number" />
      </label>
    </div>
  )
}

// Edits a job, or creates one by hand when `job` is null
function JobDialog({
  job, initialTab = 'details', resumes, interviews, stories,
  onSave, onDelete, onAddInterview, onFollowedUp, onViewEmail, onClose,
}) {
  const dialog = useRef(null)
  const isNew = !job
  const [tab, setTab] = useState(initialTab)
  const [form, setForm] = useState(() => ({
    company: job?.company || '',
    position: job?.position || '',
    stage: job?.stage || 'application_received',
    date: dayKey(job?.date || new Date()),
    resumeId: job?.resumeId || '',
    notes: job?.notes || '',
  }))
  const [prep, setPrep] = useState(() => ({ ...EMPTY_PREP, ...job?.prep }))
  // A salary read from an offer email pre-fills the Offer tab until the user saves their own numbers
  const [offer, setOffer] = useState(() =>
    offerToForm(job?.offer ?? (job?.extracted?.salary ? { base: job.extracted.salary } : null)))
  const [error, setError] = useState('')

  useEffect(() => {
    dialog.current.showModal()
  }, [])

  const update = (setter) => (event) => setter((prev) => ({ ...prev, [event.target.name]: event.target.value }))

  function toggleStory(id) {
    setPrep((prev) => ({
      ...prev,
      storyIds: prev.storyIds.includes(id) ? prev.storyIds.filter((s) => s !== id) : [...prev.storyIds, id],
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    // The browser only checks required fields on the visible tab
    if (!form.company.trim()) {
      setTab('details')
      setError('Company is required.')
      return
    }
    try {
      await onSave({ ...form, resumeId: form.resumeId || null, prep, offer: cleanOffer(offer) })
      dialog.current.close()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete() {
    const message = job.manual
      ? `Delete ${job.company}?`
      : `Hide ${job.company}? It won't come back on later scans.`
    if (!window.confirm(message)) return
    await onDelete()
    dialog.current.close()
  }

  // Interviews linked to this job, or added by hand under the same company name
  const jobInterviews = job
    ? interviews.filter((i) => i.jobId === job.id || normalizeCompany(i.company) === normalizeCompany(job.company))
    : []
  const now = new Date()
  const upcomingRounds = jobInterviews.filter((i) => new Date(i.dateTime) >= now)
  const pastRounds = jobInterviews.filter((i) => new Date(i.dateTime) < now)

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <header className="dialog-head">
          <h2>{isNew ? 'Add job' : job.company}</h2>
          {job?.emailCount > 0 && (
            <p>
              <button type="button" className="link-button" onClick={() => onViewEmail(job)}>
                Latest email: {job.subject}
              </button>
              {job.emailCount > 1 && <span className="note"> · {job.emailCount} emails</span>}
            </p>
          )}
          {/* Jobs imported from LinkedIn link to the posting itself */}
          {job && job.emailCount === 0 && job.link && (
            <a href={job.link} target="_blank" rel="noreferrer">Open job posting</a>
          )}
          {upcomingRounds.length > 0 && (
            <p className="note">
              Next interview: {formatShortDate(new Date(upcomingRounds[0].dateTime))}, {formatTime(upcomingRounds[0].dateTime)}
            </p>
          )}
          {job && <EmailFacts details={job.extracted} hasUpcomingInterview={upcomingRounds.length > 0} />}
        </header>

        <div className="tabs" role="tablist" aria-label="Job sections">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="tab-panel">
          {tab === 'details' && (
            <DetailsTab form={form} onChange={update(setForm)} isEditable={isNew || job.manual} resumes={resumes} />
          )}
          {tab === 'prep' && (
            <PrepTab prep={prep} onChange={update(setPrep)} onToggleStory={toggleStory} stories={stories} pastRounds={pastRounds} />
          )}
          {tab === 'offer' && <OfferTab offer={offer} onChange={update(setOffer)} />}
        </div>

        {job && needsFollowUp(job) && (
          <p className="callout">
            No reply in over two weeks. Consider following up.{' '}
            <button type="button" className="btn-text accent" onClick={() => { onFollowedUp(); dialog.current.close() }}>
              Mark as followed up
            </button>
          </p>
        )}
        {error && <p className="note" role="status">{error}</p>}

        <div className="dialog-actions">
          <button type="submit" className="btn btn-primary">Save</button>
          {job && (
            <button type="button" className="btn" onClick={() => { onAddInterview(); dialog.current.close() }}>
              Add interview
            </button>
          )}
          <button type="button" className="btn-text" onClick={() => dialog.current.close()}>Cancel</button>
          {job && (
            <button type="button" className="btn-text danger dialog-actions-end" onClick={handleDelete}>
              {job.manual ? 'Delete job' : 'Hide job'}
            </button>
          )}
        </div>
      </form>
    </dialog>
  )
}
export default JobDialog
