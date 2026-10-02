import keywords from '../../job-application-keywords.json'
import { createMatcher } from './emailMatcher.js'
import { extractDetails } from './emailDetails.js'

const matcher = createMatcher(keywords)

export const STAGE_LABELS = {
  application_received: 'Applied',
  assessment: 'Assessment',
  interview: 'Interview',
  offer: 'Offer',
  rejection: 'Rejected',
  withdrawal_or_closed: 'Closed',
  unknown: 'Other',
}

const DETAIL_FIELDS = ['position', 'jobId', 'contact', 'interviewAt', 'deadline', 'salary']

// Groups classified emails into one job per company, using the newest email's stage.
// `date` is the newest email, `firstDate` the oldest. `extracted` holds the newest value of each
// detail found across the company's emails.
export function groupJobs(jobEmails) {
  const jobs = new Map()
  const newestFirst = [...jobEmails].sort((a, b) => b.date - a.date)

  for (const email of newestFirst) {
    const key = email.company === 'Unknown company' ? email.id : email.company.toLowerCase()
    let job = jobs.get(key)
    if (job) {
      job.emailCount += 1
      job.firstDate = email.date
      job.emailIds.push(email.id)
    } else {
      job = {
        key,
        company: email.company,
        stage: email.stage,
        subject: email.subject,
        date: email.date,
        firstDate: email.date,
        link: email.link,
        account: email.account,
        emailCount: 1,
        // Newest first, for the email viewer
        emailIds: [email.id],
        extracted: {},
      }
      jobs.set(key, job)
    }
    for (const field of DETAIL_FIELDS) {
      if (job.extracted[field] === undefined && email.details?.[field]) job.extracted[field] = email.details[field]
    }
  }
  return [...jobs.values()]
}

// Keeps only emails about the user's own applications, tagged with stage, company and extracted details
export function findJobEmails(emails) {
  return emails.flatMap((email) => {
    const result = matcher.classify(email)
    if (!result) return []
    const details = extractDetails(email, {
      stage: result.stage,
      company: result.company,
      isSystemDomain: matcher.isSystemSender(email.from.address),
    })
    return [{ ...email, stage: result.stage, company: result.company, details }]
  })
}
