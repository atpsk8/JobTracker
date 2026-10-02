import { useEffect, useRef, useState } from 'react'
import Section from './Section.jsx'
import MonthCalendar, { dayKey } from './MonthCalendar.jsx'
import { downloadIcs, googleCalendarUrl } from '../lib/calendar.js'
import { formatLongDate, formatShortDate, formatTime } from '../lib/format.js'

const EMPTY_FORM = { company: '', position: '', dateTime: '', notes: '', questionsAsked: '', reflection: '', jobId: null }

const isPast = (dateTime) => Boolean(dateTime) && new Date(dateTime) < new Date()

function InterviewItem({ interview, onEdit, onDelete }) {
  const past = isPast(interview.dateTime)
  const hasDebrief = Boolean(interview.questionsAsked || interview.reflection)
  return (
    <li className={past ? 'interview is-past' : 'interview'}>
      <span className="interview-time">{formatTime(interview.dateTime)}</span>
      <div className="interview-body">
        <span className="interview-company">{interview.company}</span>
        <span className="interview-position">{interview.position}</span>
        {interview.notes && <p className="interview-notes">{interview.notes}</p>}
        {hasDebrief && (
          <details className="debrief">
            <summary className="btn-text">Debrief</summary>
            {interview.questionsAsked && <p><strong>They asked:</strong> {interview.questionsAsked}</p>}
            {interview.reflection && <p><strong>How it went:</strong> {interview.reflection}</p>}
          </details>
        )}
        <div className="inline-actions">
          {past && !hasDebrief && (
            <button className="btn-text accent" onClick={() => onEdit(interview)}>Add debrief</button>
          )}
          <button className="btn-text" onClick={() => onEdit(interview)}>Edit</button>
          <details className="menu">
            <summary className="btn-text">Add to calendar</summary>
            <div className="menu-panel">
              <a href={googleCalendarUrl(interview)} target="_blank" rel="noreferrer">Google Calendar</a>
              <button className="btn-text" onClick={() => downloadIcs(interview)}>Outlook / Apple (.ics)</button>
            </div>
          </details>
          <button className="btn-text danger" onClick={() => onDelete(interview)}>Delete</button>
        </div>
      </div>
    </li>
  )
}

// `draft` pre-fills the form (e.g. "Add interview" on a job); onDraftUsed clears it
function Interviews({ interviews, onSave, onDelete, draft, onDraftUsed }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()))
  const box = useRef(null)

  function openForm(values, id = null) {
    setForm({ ...EMPTY_FORM, ...values })
    setEditingId(id)
    setShowForm(true)
    setError('')
  }

  useEffect(() => {
    if (!draft) return
    openForm(draft)
    // A date read from an email: show that day on the calendar too
    if (draft.dateTime) {
      const key = draft.dateTime.slice(0, 10)
      setSelectedDay(key)
      setMonth(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1))
    }
    onDraftUsed()
    box.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [draft, onDraftUsed])

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  function closeForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    try {
      await onSave({ ...form, id: editingId || crypto.randomUUID() })
      closeForm()
    } catch (err) {
      setError(err.message)
    }
  }

  function handleEdit(interview) {
    openForm(interview, interview.id)
  }

  async function handleDelete(interview) {
    if (!window.confirm(`Delete the ${interview.company} interview?`)) return
    try {
      await onDelete(interview.id)
      if (editingId === interview.id) closeForm()
    } catch (err) {
      setError(err.message)
    }
  }

  // Clicking an upcoming interview jumps the calendar to its day
  function showDay(interview) {
    const key = interview.dateTime.slice(0, 10)
    setSelectedDay(key)
    setMonth(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1))
  }

  const selectedInterviews = interviews.filter((i) => i.dateTime.startsWith(selectedDay))
  const now = new Date()
  const upcoming = interviews.filter((i) => new Date(i.dateTime) >= now)

  return (
    <Section title="Interviews" count={upcoming.length} className="interviews" ref={box}>
      <MonthCalendar
        month={month}
        onMonthChange={setMonth}
        interviews={interviews}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      <div className="subhead">
        <h3>{formatLongDate(new Date(`${selectedDay}T00:00`))}</h3>
        {!showForm && (
          <button className="btn-text accent" onClick={() => openForm({ dateTime: `${selectedDay}T09:00` })}>
            Add interview
          </button>
        )}
      </div>

      {showForm && (
        <form className="form-stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Company</span>
            <input name="company" value={form.company} onChange={handleChange} required />
          </label>
          <label className="field">
            <span>Position</span>
            <input name="position" value={form.position} onChange={handleChange} required />
          </label>
          <label className="field">
            <span>Date and time</span>
            <input type="datetime-local" name="dateTime" value={form.dateTime} onChange={handleChange} required />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} />
          </label>
          {isPast(form.dateTime) && (
            <>
              <label className="field">
                <span>Questions they asked</span>
                <textarea name="questionsAsked" value={form.questionsAsked} onChange={handleChange} rows={3}
                  placeholder="Write them down while they're fresh; they often come up again" />
              </label>
              <label className="field">
                <span>How did it go?</span>
                <textarea name="reflection" value={form.reflection} onChange={handleChange} rows={3}
                  placeholder="What went well, what to improve, who you met, next steps" />
              </label>
            </>
          )}
          <div className="button-row">
            <button type="submit" className="btn btn-primary btn-small">{editingId ? 'Save' : 'Add interview'}</button>
            <button type="button" className="btn-text" onClick={closeForm}>Cancel</button>
          </div>
        </form>
      )}

      {error && <p className="note" role="status">{error}</p>}

      {selectedInterviews.length === 0 && !showForm && <p className="empty">Nothing scheduled.</p>}
      <ul className="interview-list">
        {selectedInterviews.map((interview) => (
          <InterviewItem key={interview.id} interview={interview} onEdit={handleEdit} onDelete={handleDelete} />
        ))}
      </ul>

      <div className="subhead">
        <h3>Upcoming</h3>
      </div>
      {upcoming.length === 0 && <p className="empty">No upcoming interviews.</p>}
      <ul className="upcoming-list">
        {upcoming.map((interview) => (
          <li key={interview.id}>
            <button
              className="upcoming-row"
              onClick={() => showDay(interview)}
              title={interview.position ? `${interview.company}, ${interview.position}` : interview.company}
            >
              <span className="upcoming-date">{formatShortDate(new Date(interview.dateTime))}</span>
              <span className="upcoming-company">{interview.company}</span>
              <span className="upcoming-time">{formatTime(interview.dateTime)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}
export default Interviews
