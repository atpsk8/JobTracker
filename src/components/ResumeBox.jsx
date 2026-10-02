import { useRef, useState } from 'react'
import Section from './Section.jsx'
import { formatSize } from '../lib/format.js'

function ResumeBox({ resumes, onAdd, onDelete }) {
  const [error, setError] = useState('')
  const fileInput = useRef(null)

  async function handleUpload(event) {
    const files = [...event.target.files]
    event.target.value = ''
    try {
      await Promise.all(files.map(onAdd))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(resume) {
    if (!window.confirm(`Delete ${resume.name}?`)) return
    try {
      await onDelete(resume.id)
    } catch (err) {
      setError(err.message)
    }
  }

  function handleOpen(resume) {
    const url = URL.createObjectURL(resume.file)
    window.open(url, '_blank')
    // Give the new tab time to load the file before releasing it
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <Section
      title="Resumes"
      count={resumes.length}
      className="resumes"
      actions={<button className="btn btn-small" onClick={() => fileInput.current.click()}>Add</button>}
    >
      <input ref={fileInput} type="file" accept=".pdf,.doc,.docx,.txt" multiple hidden onChange={handleUpload} />
      {error && <p className="note" role="status">{error}</p>}
      {resumes.length === 0 && <p className="empty">No resumes yet. PDFs open right in the browser.</p>}
      <ul className="rows">
        {resumes.map((resume) => (
          <li key={resume.id} className="row">
            <button className="row-link" onClick={() => handleOpen(resume)} title="Open in a new tab">
              {resume.name}
            </button>
            <span className="row-meta">{formatSize(resume.size)}</span>
            <button className="btn-text danger" onClick={() => handleDelete(resume)} aria-label={`Delete ${resume.name}`}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}
export default ResumeBox
