import { STAGE_LABELS } from '../lib/findJobs.js'
import { WORK_MODES, offerTotals } from '../lib/jobs.js'
import { daysUntil, formatAmount, formatShortDate, fromDateInput } from '../lib/format.js'

function deadlineLabel(deadline) {
  if (!deadline) return '–'
  const days = daysUntil(deadline)
  const date = formatShortDate(fromDateInput(deadline))
  if (days < 0) return `${date} · passed`
  if (days === 0) return `${date} · today`
  return `${date} · ${days} day${days === 1 ? '' : 's'} left`
}

// Offers side by side: one column per job, one row per term, with the highest amount in each row marked
function OfferComparison({ jobs, onEdit }) {
  if (jobs.length === 0) {
    return (
      <p className="empty">
        No offers yet. When one arrives, set the job’s stage to Offer and fill in its Offer tab to compare it here.
      </p>
    )
  }

  const totals = new Map(jobs.map((job) => [job.id, offerTotals(job.offer)]))
  const amountRows = [
    ['Base salary', (job) => job.offer?.base],
    ['Bonus (yearly)', (job) => job.offer?.bonus],
    ['Sign-on bonus', (job) => job.offer?.signOn],
    ['Equity per year', (job) => job.offer?.equityPerYear],
    ['Ongoing yearly total', (job) => (job.offer ? totals.get(job.id).ongoing : null), true],
    ['First-year total', (job) => (job.offer ? totals.get(job.id).firstYear : null), true],
  ]
  const textRows = [
    ['Work mode', (job) => [WORK_MODES[job.offer?.workMode], job.offer?.location].filter(Boolean).join(' · ') || '–'],
    ['Start date', (job) => (job.offer?.startDate ? formatShortDate(fromDateInput(job.offer.startDate)) : '–')],
    ['Respond by', (job) => deadlineLabel(job.offer?.deadline)],
    ['Benefits', (job) => job.offer?.benefits || '–'],
    ['Negotiation notes', (job) => job.offer?.notes || '–'],
  ]

  return (
    <div className="offer-table-wrap">
      <table className="offer-table">
        <thead>
          <tr>
            <th scope="col"><span className="visually-hidden">Term</span></th>
            {jobs.map((job) => (
              <th key={job.id} scope="col">
                <span className="offer-company">{job.company}</span>
                {job.position && <span className="job-position">{job.position}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Stage</th>
            {jobs.map((job) => <td key={job.id}>{STAGE_LABELS[job.stage]}</td>)}
          </tr>
          {amountRows.map(([label, value, isTotal]) => {
            const values = jobs.map(value)
            const known = values.filter((v) => v !== null && v !== undefined && v > 0)
            const highest = known.length > 1 ? Math.max(...known) : null
            return (
              <tr key={label} className={isTotal ? 'is-total' : undefined}>
                <th scope="row">{label}</th>
                {jobs.map((job, i) => (
                  <td key={job.id} className="amount">
                    {formatAmount(values[i])}
                    {highest !== null && values[i] === highest && <span className="best">highest</span>}
                  </td>
                ))}
              </tr>
            )
          })}
          {textRows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {jobs.map((job) => <td key={job.id} className="text-cell">{value(job)}</td>)}
            </tr>
          ))}
          <tr>
            <th scope="row"><span className="visually-hidden">Actions</span></th>
            {jobs.map((job) => (
              <td key={job.id}>
                <button className="btn-text accent" onClick={() => onEdit(job)}>Edit offer</button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="note">Amounts are in whatever currency you entered. Totals leave out benefits.</p>
    </div>
  )
}
export default OfferComparison
