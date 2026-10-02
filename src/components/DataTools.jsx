import { useRef, useState } from 'react'
import Section from './Section.jsx'

// Backup, restore and CSV export for the data kept in this browser
function DataTools({ onExport, onExportCsv, onImport }) {
  const fileInput = useRef(null)
  const [message, setMessage] = useState('')

  async function run(action, done) {
    try {
      await action()
      if (done) setMessage(done)
    } catch (err) {
      setMessage(err.message)
    }
  }

  function handleImport(event) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    if (!window.confirm('Restoring a backup replaces ALL current data in this browser. Continue?')) return
    run(() => onImport(file))
  }

  return (
    <Section title="Your data" className="data-tools">
      <p className="note">Everything is stored in this browser only. Export a backup to keep it safe or move to another computer.</p>
      <div className="button-row">
        <button className="btn btn-small" onClick={() => run(onExport, 'Backup downloaded.')}>Export backup</button>
        <button className="btn btn-small" onClick={() => fileInput.current.click()}>Restore</button>
        <button className="btn btn-small" onClick={() => run(onExportCsv)}>Jobs as CSV</button>
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={handleImport} />
      {message && <p className="note" role="status">{message}</p>}
    </Section>
  )
}
export default DataTools
