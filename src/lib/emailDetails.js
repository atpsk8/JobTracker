// Pulls structured details out of an application email: job title, job ID, the recruiter,
// an interview date/time, an assessment deadline and an offered salary. Every field is optional;
// anything that can't be read confidently is left out rather than guessed.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?'
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const WEEKDAY = '(sun|mon|tue|wed|thu|fri|sat)(?:day|s|sday|nesday|rsday|urday)?'
const TIME = '(\\d{1,2})(?::(\\d{2}))?\\s*([ap])\\.?m\\.?'
const JOINER = '(?:,?\\s+(?:at|@|from)\\s+|,?\\s+)'

const DATE_TIME_PATTERNS = [
  // "Tuesday, October 7 at 2:00 PM", "Oct 7, 2026 @ 2pm"
  { re: new RegExp(`(?:${WEEKDAY},?\\s+)?${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${JOINER}${TIME}`, 'gi'),
    parts: (m) => ({ month: m[2], day: m[3], year: m[4], hour: m[5], minute: m[6], ampm: m[7] }) },
  // "7 October at 14:00" style days-first, with am/pm
  { re: new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}(?:,?\\s+(\\d{4}))?${JOINER}${TIME}`, 'gi'),
    parts: (m) => ({ day: m[1], month: m[2], year: m[3], hour: m[4], minute: m[5], ampm: m[6] }) },
  // "10/7 at 2:00 PM", "10/07/2026, 2pm" (US order)
  { re: new RegExp(`\\b(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?${JOINER}${TIME}`, 'gi'),
    parts: (m) => ({ monthNumber: m[1], day: m[2], year: m[3], hour: m[4], minute: m[5], ampm: m[6] }) },
  // "Tuesday at 2pm": the next such weekday after the email
  { re: new RegExp(`\\b${WEEKDAY}${JOINER}${TIME}`, 'gi'),
    parts: (m) => ({ weekday: m[1], hour: m[2], minute: m[3], ampm: m[4] }) },
]

const DATE_PATTERNS = [
  { re: new RegExp(`${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'i'), parts: (m) => ({ month: m[1], day: m[2], year: m[3] }) },
  { re: new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}(?:,?\\s+(\\d{4}))?`, 'i'), parts: (m) => ({ day: m[1], month: m[2], year: m[3] }) },
  { re: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, parts: (m) => ({ monthNumber: m[1], day: m[2], year: m[3] }) },
]

const pad = (n) => String(n).padStart(2, '0')
const toLocalDateTime = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const toLocalDate = (d) => toLocalDateTime(d).slice(0, 10)

// Builds a local Date from matched parts. Missing years come from the email's date, rolling into
// next year when the date would otherwise be well before the email was sent.
function buildDate(p, sentAt) {
  let date
  if (p.weekday) {
    const target = WEEKDAYS.indexOf(p.weekday.toLowerCase().slice(0, 3))
    date = new Date(sentAt)
    date.setHours(0, 0, 0, 0)
    do date.setDate(date.getDate() + 1)
    while (date.getDay() !== target)
  } else {
    const month = p.monthNumber ? Number(p.monthNumber) - 1 : MONTHS.indexOf(p.month.toLowerCase().slice(0, 3))
    const day = Number(p.day)
    if (month < 0 || month > 11 || day < 1 || day > 31) return null
    let year = p.year ? Number(p.year.length === 2 ? `20${p.year}` : p.year) : sentAt.getFullYear()
    date = new Date(year, month, day)
    if (!p.year && date < new Date(sentAt.getTime() - 30 * 24 * 60 * 60 * 1000)) {
      year += 1
      date = new Date(year, month, day)
    }
    if (date.getDate() !== day) return null // e.g. February 31
  }
  if (p.hour !== undefined) {
    let hour = Number(p.hour)
    if (hour < 1 || hour > 12) return null
    if (p.ampm.toLowerCase() === 'p' && hour < 12) hour += 12
    if (p.ampm.toLowerCase() === 'a' && hour === 12) hour = 0
    date.setHours(hour, Number(p.minute || 0), 0, 0)
  }
  return date
}

// The earliest date and time mentioned in the text that falls after the email was sent
function findInterviewTime(text, sentAt) {
  const found = []
  for (const { re, parts } of DATE_TIME_PATTERNS) {
    for (const match of text.matchAll(re)) {
      const date = buildDate(parts(match), sentAt)
      if (date && date > sentAt) found.push(date)
    }
  }
  found.sort((a, b) => a - b)
  return found[0] ? toLocalDateTime(found[0]) : null
}

function findDeadline(text, sentAt) {
  // "complete it by October 10" (skipping unrelated uses of "by", such as "powered by Greenhouse")
  for (const byDate of text.matchAll(/\b(?:by|before|due(?: on| by)?|deadline(?: is|:)?)\s+((?:[a-z]+day,?\s+)?[^\n.;]{3,30})/gi)) {
    for (const { re, parts } of DATE_PATTERNS) {
      const m = byDate[1].match(re)
      const date = m && buildDate(parts(m), sentAt)
      if (date && date >= sentAt) return toLocalDate(date)
    }
  }
  const inDays = text.match(/\b(?:within|in)\s+(\d{1,2})\s+(days?|hours?)\b/i)
  if (inDays) {
    const amount = Number(inDays[1])
    const date = new Date(sentAt)
    if (inDays[2].toLowerCase().startsWith('hour')) date.setHours(date.getHours() + amount)
    else date.setDate(date.getDate() + amount)
    return toLocalDate(date)
  }
  return null
}

// Yearly amounts only; hourly rates are skipped
function findSalary(text) {
  const match = text.match(
    /\b(?:base salary|annual salary|annual base|base pay|starting salary|salary)\b[^\d$£€]{0,25}[$£€]?\s?(\d{1,3}(?:,\d{3})+|\d{4,7}|\d{2,3}(?=k\b))(k)?/i,
  )
  if (!match) return null
  const after = text.slice(match.index + match[0].length, match.index + match[0].length + 25).toLowerCase()
  if (/hour|\/hr|per hr/.test(after)) return null
  const amount = Number(match[1].replace(/,/g, '')) * (match[2] ? 1000 : 1)
  return amount >= 1000 ? amount : null
}

const NOT_A_TITLE = /\b(you|your|we|our|us|this|that|has|have|been|will|was|were|is|are|thank|thanks|update|status|received|confirmation)\b/i

function cleanTitle(raw, company) {
  if (!raw) return null
  const title = raw
    .replace(/\s+(?:at|with)\s+.+$/i, '')
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/^["'“‘\s]+|["'”’.,;:!\s]+$/g, '')
    .replace(/^(?:the|a|an)\b\s*/i, '')
    .replace(/\s+/g, ' ')
  if (title.length < 3 || title.length > 60) return null
  if (!/^[A-Za-z]/.test(title) || NOT_A_TITLE.test(title)) return null
  const letters = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (company && letters(title) === letters(company)) return null
  return title
}

const TITLE_PATTERNS = [
  /(?:application|applying|applied)\s+(?:to|for)\s+(?:the\s+)?(.{2,60}?)\s+(?:position|role|job|opening)\b/i,
  /\b(?:position|role) of\s+(.{2,60}?)(?:\s+(?:at|with|has|have|is|was|will)\b|[.,;:!(\n]|$)/i,
  /\bfor\s+(?:the|our)\s+(.{2,60}?)\s+(?:position|role|opening)\b/i,
  /\bthe\s+([A-Z][\w/&+.' -]{2,50}?)\s+(?:role|position)\b/,
]
// Subjects such as "Application received: Backend Engineer (R-1234)" or "Indeed Application: Frontend Developer"
const SUBJECT_TITLE = /(?:application|interview|assessment)(?:\s+(?:received|confirmation|invitation|request|submitted))?\s*(?:for|:|-|–)\s*(.{2,80})$/i
// LinkedIn bodies list "Software Engineer · Gotham"
const LISTING_LINE = /^\s*([A-Z][^\n·•|]{2,60}?)\s+[·•]\s+/m

function findTitle(subject, body, company) {
  for (const pattern of TITLE_PATTERNS) {
    for (const text of [subject, body]) {
      const title = cleanTitle(text.match(pattern)?.[1], company)
      if (title) return title
    }
  }
  return cleanTitle(subject.match(SUBJECT_TITLE)?.[1], company) || cleanTitle(body.match(LISTING_LINE)?.[1], company)
}

function findJobId(text) {
  const labelled = text.match(/\b(?:job|req(?:uisition)?|reference|posting)\s*(?:id|#|no\.?|number|code)\s*[:#]?\s*([A-Z0-9][A-Z0-9_-]{2,20})\b/i)
  if (labelled && /\d/.test(labelled[1])) return labelled[1]
  return text.match(/\b(R-\d{4,}|JR-?\d{4,}|REQ-?\d{3,})\b/i)?.[1] || null
}

const AUTOMATED_SENDER = /\b(no-?reply|do-?not-?reply|notifications?|alerts?|mailer|bounces?|jobs?|careers?|talent|recruiting|recruitment|hiring|hr|team|info|support)\b/i

// A real person who sent the email ("Jane Smith <jane.smith@acme.com>"), not a system mailbox
function findContact(from, isSystemDomain) {
  const name = (from.name || '').trim()
  const localPart = (from.address || '').split('@')[0]
  if (!name || isSystemDomain || AUTOMATED_SENDER.test(localPart) || AUTOMATED_SENDER.test(name)) return null
  if (name.split(/\s+/).length < 2) return null
  return { name, email: from.address }
}

export function extractDetails(email, { stage, company, isSystemDomain }) {
  const sentAt = email.date instanceof Date ? email.date : new Date(email.date)
  const subject = email.subject || ''
  const body = email.body || ''
  const text = `${subject}\n${body}`
  const mentionsInterview = stage === 'interview' || /\binterview/i.test(subject)

  const details = {
    position: findTitle(subject, body, company),
    jobId: findJobId(text),
    contact: findContact(email.from, isSystemDomain),
    interviewAt: mentionsInterview ? findInterviewTime(text, sentAt) : null,
    deadline: stage === 'assessment' ? findDeadline(text, sentAt) : null,
    salary: stage === 'offer' ? findSalary(text) : null,
  }
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value))
}
