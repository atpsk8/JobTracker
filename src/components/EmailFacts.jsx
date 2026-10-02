import { formatAmount, formatShortDate, formatTime, fromDateInput } from '../lib/format.js'

// Details read from emails (job title, ID, recruiter, dates, salary), as a compact list.
// `showPosition` adds the job title, which the job dialog already has as a field.
function EmailFacts({ details = {}, showPosition = false, hasUpcomingInterview = false }) {
  const facts = []
  if (showPosition && details.position) facts.push(['Position', details.position])
  if (details.jobId) facts.push(['Job ID', details.jobId])
  if (details.contact) {
    facts.push(['Contact', <a key="c" href={`mailto:${details.contact.email}`}>{details.contact.name}</a>])
  }
  if (details.interviewAt && !hasUpcomingInterview && new Date(details.interviewAt) > new Date()) {
    facts.push(['Interview mentioned', `${formatShortDate(new Date(details.interviewAt))}, ${formatTime(details.interviewAt)}`])
  }
  if (details.deadline) facts.push(['Assessment due', formatShortDate(fromDateInput(details.deadline))])
  if (details.salary) facts.push(['Salary mentioned', formatAmount(details.salary)])
  if (facts.length === 0) return null
  return (
    <dl className="email-facts" aria-label="Found in the email">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
export default EmailFacts
