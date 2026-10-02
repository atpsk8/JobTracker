import { formatShortDate } from '../lib/format.js'

function Figure({ label, value, hint }) {
  return (
    <div className="figure" title={hint}>
      <span className="figure-value">{value}</span>
      <span className="figure-label">{label}</span>
    </div>
  )
}

// Applications per week: one series, so no legend; each bar has a hover tooltip and an aria label
function WeeklyChart({ weekly }) {
  const max = Math.max(1, ...weekly.map((w) => w.count))
  const label = (w) => `Week of ${formatShortDate(w.start)}: ${w.count} applications`
  return (
    <figure className="weekly-chart">
      <figcaption>Applications per week</figcaption>
      <div className="weekly-bars" role="list">
        {weekly.map((w) => (
          <div key={w.start.toISOString()} className="weekly-slot" role="listitem" title={label(w)} aria-label={label(w)}>
            <div className="weekly-bar" style={{ height: `${(w.count / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="weekly-axis">
        <span>{formatShortDate(weekly[0].start)}</span>
        <span>This week</span>
      </div>
    </figure>
  )
}

function StatsBar({ stats }) {
  return (
    <section className="ledger" aria-label="Summary">
      <Figure label="Jobs" value={stats.total} />
      <Figure
        label="Response rate"
        value={stats.responseRate === null ? '–' : `${stats.responseRate}%`}
        hint="Jobs that moved past Applied, including rejections"
      />
      <Figure label="Interviewing" value={stats.interviewing} />
      <Figure label="Upcoming interviews" value={stats.upcomingInterviews} />
      <Figure label="Offers" value={stats.offers} />
      <Figure label="Need follow-up" value={stats.followUps} hint="Applied over two weeks ago with no reply" />
      <WeeklyChart weekly={stats.weekly} />
    </section>
  )
}
export default StatsBar
