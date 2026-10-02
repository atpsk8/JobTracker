import { useEffect, useRef, useState } from 'react'

const EMPTY_STORY = { title: '', tags: '', situation: '', task: '', action: '', result: '' }

const STAR_FIELDS = [
  ['situation', 'Situation', 'Where were you, and what was going on?'],
  ['task', 'Task', 'What were you responsible for?'],
  ['action', 'Action', 'What did you do, specifically?'],
  ['result', 'Result', 'What changed? Numbers help.'],
]

// Adds or edits one STAR story; `story` is null for a new one
function StoryDialog({ story, onSave, onDelete, onClose }) {
  const dialog = useRef(null)
  const [form, setForm] = useState(() => ({ ...EMPTY_STORY, ...story }))
  const [error, setError] = useState('')

  useEffect(() => {
    dialog.current.showModal()
  }, [])

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    try {
      await onSave({ ...form, id: story?.id || crypto.randomUUID() })
      dialog.current.close()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete “${story.title}”?`)) return
    await onDelete(story.id)
    dialog.current.close()
  }

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <header className="dialog-head">
          <h2>{story ? 'Edit story' : 'New story'}</h2>
          <p>A STAR story is a short, reusable answer to “Tell me about a time when…” questions.</p>
        </header>
        <div className="form-grid">
          <label className="field">
            <span>Title</span>
            <input name="title" value={form.title} onChange={handleChange} required
              placeholder="Shipped the billing rewrite early" />
          </label>
          <label className="field">
            <span>Tags</span>
            <input name="tags" value={form.tags} onChange={handleChange} placeholder="leadership, deadline, conflict" />
          </label>
          {STAR_FIELDS.map(([name, label, hint]) => (
            <label key={name} className="field field-wide">
              <span>{label}</span>
              <textarea name={name} value={form[name]} onChange={handleChange} rows={2} placeholder={hint} />
            </label>
          ))}
        </div>
        {error && <p className="note" role="status">{error}</p>}
        <div className="dialog-actions">
          <button type="submit" className="btn btn-primary">Save</button>
          <button type="button" className="btn-text" onClick={() => dialog.current.close()}>Cancel</button>
          {story && (
            <button type="button" className="btn-text danger dialog-actions-end" onClick={handleDelete}>Delete story</button>
          )}
        </div>
      </form>
    </dialog>
  )
}
export default StoryDialog
