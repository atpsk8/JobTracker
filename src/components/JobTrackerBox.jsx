import { useTheme } from '../lib/theme.js'
import { isOutlookConfigured } from '../lib/outlook.js'

const THEMES = [
  ['system', 'Auto'],
  ['light', 'Light'],
  ['dark', 'Dark'],
]

// Outlook only appears on a live site once it's registered with Microsoft; while developing it
// always shows, so its dialog can explain the setup
const PROVIDERS = [
  ['gmail', 'Gmail'],
  ...(isOutlookConfigured || import.meta.env.DEV ? [['outlook', 'Outlook']] : []),
]

// Page masthead: title, today's date, theme switch, and the inbox providers to scan
function JobTrackerBox({ onConnect, busy }) {
  const [theme, setTheme] = useTheme()
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <header className="masthead">
      <div className="masthead-title">
        <h1>Job Tracker</h1>
        <div className="masthead-meta">
          <p className="masthead-date">{today}</p>
          <div className="segmented segmented-small" role="group" aria-label="Colour theme">
            {THEMES.map(([id, label]) => (
              <button key={id} aria-pressed={theme === id} onClick={() => setTheme(id)}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      <nav className="masthead-connect" aria-label="Scan an inbox">
        <span className="masthead-label">Scan inbox</span>
        {PROVIDERS.map(([id, label]) => (
          <button key={id} className="btn btn-small" onClick={() => onConnect(id)} disabled={busy}>
            {label}
          </button>
        ))}
      </nav>
    </header>
  )
}

export default JobTrackerBox
