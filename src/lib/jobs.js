import { STAGE_LABELS } from './findJobs.js'

// Pipeline order, used for the board columns and stage pickers
export const STAGE_ORDER = ['application_received', 'assessment', 'interview', 'offer', 'rejection', 'withdrawal_or_closed']

export const FOLLOW_UP_DAYS = 14
// Applications older than this are treated as stale rather than worth chasing
const FOLLOW_UP_MAX_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000

export const EMPTY_PREP = { questionsToAsk: '', research: '', storyIds: [] }

export const WORK_MODES = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' }
const OFFER_AMOUNTS = ['base', 'bonus', 'signOn', 'equityPerYear']
export const EMPTY_OFFER_FORM = {
  base: '', bonus: '', signOn: '', equityPerYear: '',
  workMode: '', location: '', startDate: '', deadline: '', benefits: '', notes: '',
}

// Stored offer -> form strings
export function offerToForm(offer) {
  const form = { ...EMPTY_OFFER_FORM }
  for (const key of Object.keys(form)) {
    if (offer?.[key] !== null && offer?.[key] !== undefined) form[key] = String(offer[key])
  }
  return form
}

// Form strings -> stored offer (amounts as numbers), or null when nothing was entered
export function cleanOffer(form) {
  const offer = {}
  for (const [key, value] of Object.entries(form)) {
    offer[key] = OFFER_AMOUNTS.includes(key)
      ? (value === '' ? null : Number(value))
      : value.trim()
  }
  return Object.values(offer).some((v) => v !== null && v !== '') ? offer : null
}

// "Ongoing" is a typical year; "first year" adds the one-off sign-on bonus
export function offerTotals(offer) {
  const amount = (key) => offer?.[key] || 0
  const ongoing = amount('base') + amount('bonus') + amount('equityPerYear')
  return { ongoing, firstYear: ongoing + amount('signOn') }
}

export const hasOffer = (job) => job.stage === 'offer' || Boolean(job.offer)

// Merges jobs found in email with the user's edits, and adds jobs entered by hand.
// A stage the user picked wins until a newer email arrives for that job.
export function buildJobs(emailJobs, details) {
  const detailsById = new Map(details.map((d) => [d.id, d]))

  const fromEmails = emailJobs.map((job) => {
    const d = detailsById.get(job.key) || {}
    const userStageIsCurrent = d.stage && d.stageSetAt >= job.date.getTime()
    return {
      id: job.key,
      manual: false,
      hidden: Boolean(d.hidden),
      company: d.company || job.company,
      // The title the user typed wins over one read from the emails
      position: d.position || job.extracted?.position || '',
      extracted: job.extracted || {},
      stage: userStageIsCurrent ? d.stage : job.stage,
      notes: d.notes || '',
      resumeId: d.resumeId || null,
      followedUpAt: d.followedUpAt || null,
      prep: { ...EMPTY_PREP, ...d.prep },
      offer: d.offer || null,
      date: job.date,
      firstDate: job.firstDate,
      subject: job.subject,
      link: job.link,
      emailCount: job.emailCount,
      emailIds: job.emailIds,
    }
  })

  const manual = details
    .filter((d) => d.manual)
    .map((d) => ({
      id: d.id,
      manual: true,
      hidden: false,
      company: d.company,
      position: d.position || '',
      extracted: {},
      stage: d.stage,
      notes: d.notes || '',
      resumeId: d.resumeId || null,
      followedUpAt: d.followedUpAt || null,
      prep: { ...EMPTY_PREP, ...d.prep },
      offer: d.offer || null,
      date: new Date(d.date),
      firstDate: new Date(d.date),
      subject: '',
      link: d.link || null,
      source: d.source || null,
      emailCount: 0,
      emailIds: [],
    }))

  // Hidden jobs are kept (flagged) so they can be restored
  return [...fromEmails, ...manual].sort((a, b) => b.date - a.date)
}

// Still at "Applied" with no news (or follow-up) for FOLLOW_UP_DAYS, but not long abandoned
export function needsFollowUp(job, now = Date.now()) {
  if (job.stage !== 'application_received') return false
  const quietFor = now - Math.max(job.date.getTime(), job.followedUpAt || 0)
  return quietFor > FOLLOW_UP_DAYS * DAY_MS && now - job.date.getTime() < FOLLOW_UP_MAX_DAYS * DAY_MS
}

// "Globex, Inc." and "globex" are the same company for duplicate checks
export function normalizeCompany(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(inc|incorporated|corp|corporation|co|company|llc|ltd|limited|plc|gmbh|group)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isBeforeStage(stage, target) {
  return STAGE_ORDER.indexOf(stage) < STAGE_ORDER.indexOf(target)
}

const WEEKS_SHOWN = 8

export function computeStats(jobs, interviews, now = new Date()) {
  const responded = jobs.filter((j) => j.stage !== 'application_received' && j.stage !== 'unknown').length

  // Weeks start on Sunday, oldest first
  const thisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  const weekly = Array.from({ length: WEEKS_SHOWN }, (_, i) => {
    const start = new Date(thisWeek)
    start.setDate(start.getDate() - (WEEKS_SHOWN - 1 - i) * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { start, count: jobs.filter((j) => j.firstDate >= start && j.firstDate < end).length }
  })

  return {
    total: jobs.length,
    responseRate: jobs.length ? Math.round((responded / jobs.length) * 100) : null,
    interviewing: jobs.filter((j) => j.stage === 'interview').length,
    upcomingInterviews: interviews.filter((i) => new Date(i.dateTime) > now).length,
    offers: jobs.filter((j) => j.stage === 'offer').length,
    followUps: jobs.filter((j) => needsFollowUp(j, now.getTime())).length,
    weekly,
  }
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function jobsToCsv(jobs, resumes) {
  const resumeNames = new Map(resumes.map((r) => [r.id, r.name]))
  const header = [
    'Company', 'Position', 'Stage', 'Job ID', 'Contact', 'Contact email',
    'First contact', 'Last activity', 'Emails', 'Resume', 'Notes', 'Email link',
  ]
  const rows = jobs.map((j) => [
    j.company,
    j.position,
    STAGE_LABELS[j.stage],
    j.extracted?.jobId || '',
    j.extracted?.contact?.name || '',
    j.extracted?.contact?.email || '',
    j.firstDate.toLocaleDateString(),
    j.date.toLocaleDateString(),
    j.emailCount,
    resumeNames.get(j.resumeId) || '',
    j.notes,
    j.link || '',
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}
