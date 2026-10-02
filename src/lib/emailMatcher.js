// Decides whether an email is about one of the user's own job applications, using the keyword file
// (job-application-keywords.json). Shared by the browser (Outlook scans) and api/scan-email.js (IMAP scans).
//
// Rules, in order:
//  1. Subjects matching an `exclude` phrase are dropped (job alerts, newsletters...).
//  2. A phrase is "strong" when it names the application itself (applying, candidate, interview,
//     offer letter, other candidates...). Generic phrases ("unfortunately", "next steps", "zoom link")
//     are "weak": they add a little weight but can never qualify an email on their own.
//  3. The email must contain at least one strong phrase AND mention a job-related word
//     (so "Your credit card application" doesn't count).
//  4. The total score must reach SCORE_THRESHOLD. Applicant tracking systems (sender_domains) add
//     weight; job boards (job_board_domains) send mostly alerts, so their emails need more evidence.

const SCORE_THRESHOLD = 5
const STRONG_SUBJECT_POINTS = 3
const STRONG_BODY_POINTS = 2
const WEAK_SUBJECT_POINTS = 1
const WEAK_BODY_POINTS = 0.5
const MAX_WEAK_POINTS = 2
const ATS_SENDER_POINTS = 2
const SENDER_KEYWORD_POINTS = 1
const JOB_BOARD_PENALTY = 2

// A multi-word phrase containing one of these is specific to job applications
const STRONG_MARKERS = [
  'appl', // application, applied, applying, applicant
  'candida', // candidate, candidacy
  'interview',
  'recruit',
  'hiring',
  'requisition',
  'assessment',
  'coding',
  'take-home',
  'take home',
  'phone screen',
  'position',
  'job offer',
  'offer letter',
  'offer of employment',
  'employment offer',
  'verbal offer',
  'written offer',
  'extend an offer',
  'to offer you',
  'pleased to offer',
  'delighted to offer',
  'not moving forward',
  'not to move forward',
  'not selected',
  'talent acquisition',
  'talent team',
  'talent partner',
]

// At least one of these must appear somewhere in the email
const JOB_CONTEXT_WORDS = [
  'job', 'jobs', 'career', 'careers', 'position', 'role', 'opportunity', 'candidate', 'candidacy',
  'applicant', 'hiring', 'recruiter', 'recruiting', 'recruitment', 'talent', 'resume', 'cv',
  'employment', 'employer', 'internship', 'interview', 'requisition', 'vacancy',
]

// When an email matches several stages equally, the later stage wins
const STAGE_PRIORITY = ['offer', 'rejection', 'withdrawal_or_closed', 'interview', 'assessment', 'application_received']

const GENERIC_SENDER_WORDS =
  /\b(careers?|jobs?|recruiting|recruitment|recruiters?|talent acquisition|talent|hiring|team|hr|people|no-?reply|do-?not-?reply|notifications?|via \w+)\b/gi

const wordPatterns = new Map()
function hasWord(text, word) {
  if (!wordPatterns.has(word)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    wordPatterns.set(word, new RegExp(`\\b${escaped}\\b`))
  }
  return wordPatterns.get(word).test(text)
}

// Single words must match whole words ("offer" not in "offering"); phrases match anywhere
const contains = (text, phrase) => (phrase.includes(' ') ? text.includes(phrase) : hasWord(text, phrase))

export const isStrongPhrase = (phrase) => phrase.includes(' ') && STRONG_MARKERS.some((m) => phrase.includes(m))

// Drops phrases that only matched as part of a longer matched phrase ("your application" inside
// "your application was sent to"), so one sentence isn't counted several times
function longestMatches(phrases) {
  const unique = [...new Set(phrases)]
  return unique.filter((p) => !unique.some((other) => other !== p && other.includes(p)))
}

const domainOf = (address) => (address.split('@')[1] || '').toLowerCase()
const inDomains = (domain, list) => list.some((d) => domain === d || domain.endsWith(`.${d}`))
const lettersOnly = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

const FREE_MAIL_DOMAINS = [
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
]

// "mail.acme.co.uk" -> "acme"
function domainLabel(domain) {
  const parts = domain.split('.')
  const secondLevel = parts.length > 2 && ['co', 'com', 'org', 'net'].includes(parts[parts.length - 2])
  return parts[parts.length - (secondLevel ? 3 : 2)] || parts[0] || ''
}

// Company named in the text: "sent to Acme", "applying to Acme", "Acme has invited you", "Offer letter - Acme"
const COMPANY_PATTERNS = [
  /application (?:was )?sent to ([^\n,.!|:–-]{2,60})/i,
  /(?:application|applying|applied) (?:to|at|with) ([^\n,.!|:–-]{2,60}?)(?:\s+for\s+|\s*[,.!|:–-]|$)/i,
  /^([A-Z][\w&.' ]{1,40}?) (?:has invited you|invites you|would like to)/,
  /(?:submitted|sent) to ([A-Z][^\n,.!|:–-]{1,60})/,
  /\bat ([A-Z][\w&.' ]{1,40}?)(?:\s*[,!|:–-]|$)/,
  /\s[-–|]\s([A-Z][\w&.' ]{1,40})$/,
]

function companyFromText(...texts) {
  for (const text of texts) {
    for (const pattern of COMPANY_PATTERNS) {
      const match = text.trim().match(pattern)
      if (match) return match[1].trim().replace(/\s+/g, ' ')
    }
  }
  return null
}

function cleanDisplayName(name) {
  return (name || '')
    .replace(/["']/g, '')
    .replace(GENERIC_SENDER_WORDS, '')
    .replace(/[()]/g, '')
    .replace(/^[\s@|:,–-]+|[\s@|:,–-]+$/g, '')
    .replace(/\s+/g, ' ')
}

export function createMatcher(keywords) {
  const atsDomains = keywords.sender_domains || []
  const boardDomains = keywords.job_board_domains || []
  const senderWords = keywords.sender_keywords || []
  const excludePhrases = keywords.exclude || []

  const categories = Object.entries(keywords.categories).map(([name, c]) => ({
    name,
    subject: c.subject,
    body: c.body,
    keywords: c.keywords,
  }))
  const allSubjectPhrases = [...new Set(categories.flatMap((c) => c.subject))]
  const strongSubjectPhrases = allSubjectPhrases.filter(isStrongPhrase)
  // Single subject words that are themselves application words ("interview", "application")
  const markerWords = allSubjectPhrases.filter((p) => !p.includes(' ') && STRONG_MARKERS.some((m) => p.includes(m)))

  const isExcluded = (text) => excludePhrases.some((phrase) => text.includes(phrase))

  function companyName(email, { domain, fromAts, fromBoard }) {
    const fromText = companyFromText(email.subject, email.body || '')
    const display = cleanDisplayName(email.from.name)
    const label = domainLabel(domain)

    // Job boards always send as themselves; the company is only in the text
    if (fromBoard) return fromText || 'Unknown company'

    // Tracking systems send as "Acme Recruiting", but tools like HackerRank send under their own brand
    if (fromAts) {
      const isToolBrand = !display || lettersOnly(label).startsWith(lettersOnly(display)) || lettersOnly(display).startsWith(lettersOnly(label))
      return isToolBrand ? fromText || 'Unknown company' : display
    }

    if (!domain || FREE_MAIL_DOMAINS.includes(domain)) return fromText || display || 'Unknown company'

    // The company's own domain: keep the display name if it names the company ("Hooli Talent"),
    // otherwise it's probably a person ("Jane Smith"), so use the domain instead
    const labelLetters = lettersOnly(label)
    const namesCompany = display && display.split(' ').some((word) => {
      const w = lettersOnly(word)
      return w.length >= 3 && (labelLetters.startsWith(w) || w.startsWith(labelLetters))
    })
    if (namesCompany) return display
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : fromText || 'Unknown company'
  }

  // Cheap check on headers only, used to decide which IMAP messages are worth downloading
  function isCandidate(subject, fromAddress) {
    const s = (subject || '').toLowerCase()
    if (isExcluded(s)) return false
    if (inDomains(domainOf(fromAddress || ''), atsDomains)) return true
    // Recruiters often reply with plain subjects ("Re: Next steps") from recruiting@ or careers@
    const localPart = (fromAddress || '').split('@')[0].toLowerCase()
    if (senderWords.some((w) => hasWord(localPart, w))) return true
    return strongSubjectPhrases.some((p) => s.includes(p)) || markerWords.some((w) => hasWord(s, w))
  }

  // Returns { stage, company, score } for an application email, or null
  function classify(email) {
    const subject = email.subject.toLowerCase()
    const body = (email.body || '').toLowerCase()
    if (isExcluded(subject)) return null

    const domain = domainOf(email.from.address)
    const fromAts = inDomains(domain, atsDomains)
    const fromBoard = inDomains(domain, boardDomains)
    const senderText = `${email.from.name} ${email.from.address.split('@')[0]}`.toLowerCase()

    const subjectHits = longestMatches(categories.flatMap((c) => c.subject.filter((p) => contains(subject, p))))
    const bodyHits = longestMatches(categories.flatMap((c) => c.body.filter((p) => contains(body, p))))
    const strongSubject = subjectHits.filter(isStrongPhrase)
    const strongBody = bodyHits.filter(isStrongPhrase)
    if (strongSubject.length + strongBody.length === 0) return null

    // Footers of real application emails rarely mention alerts; only trust the body exclusion when the
    // subject itself doesn't name an application
    if (strongSubject.length === 0 && isExcluded(body)) return null

    // Tracking systems and job boards are job context by definition
    const text = `${subject} ${body}`
    if (!fromAts && !fromBoard && !JOB_CONTEXT_WORDS.some((w) => hasWord(text, w))) return null

    const weakPoints = Math.min(
      MAX_WEAK_POINTS,
      (subjectHits.length - strongSubject.length) * WEAK_SUBJECT_POINTS + (bodyHits.length - strongBody.length) * WEAK_BODY_POINTS,
    )
    let score = strongSubject.length * STRONG_SUBJECT_POINTS + strongBody.length * STRONG_BODY_POINTS + weakPoints
    if (fromAts) score += ATS_SENDER_POINTS
    if (senderWords.some((w) => hasWord(senderText, w))) score += SENDER_KEYWORD_POINTS
    // Job boards mostly send alerts and advice articles; let them through only with extra evidence,
    // unless the subject itself is about an application ("Your application was sent to Acme")
    const subjectNamesApplication = strongSubject.some((p) => p.includes('appl') || p.includes('candida'))
    if (fromBoard && !subjectNamesApplication) score -= JOB_BOARD_PENALTY
    if (score < SCORE_THRESHOLD) return null

    // Stage: the category whose phrases matched best; single keywords only break ties
    const phrasePointsFor = (hits, list, strongPoints, weakPoints) =>
      hits.filter((p) => list.includes(p)).reduce((sum, p) => sum + (isStrongPhrase(p) ? strongPoints : weakPoints), 0)
    let stage = 'unknown'
    let best = 0
    for (const name of STAGE_PRIORITY) {
      const category = categories.find((c) => c.name === name)
      if (!category) continue
      const phrasePoints =
        phrasePointsFor(subjectHits, category.subject, STRONG_SUBJECT_POINTS, WEAK_SUBJECT_POINTS) +
        phrasePointsFor(bodyHits, category.body, STRONG_BODY_POINTS, WEAK_BODY_POINTS)
      if (phrasePoints === 0) continue
      const points = phrasePoints + category.keywords.filter((w) => hasWord(text, w)).length * 0.1
      if (points > best) {
        best = points
        stage = name
      }
    }

    return { stage, company: companyName(email, { domain, fromAts, fromBoard }), score }
  }

  // Tracking systems and job boards: their sender is a system, never a recruiter you can contact
  const isSystemSender = (address) => inDomains(domainOf(address || ''), [...atsDomains, ...boardDomains])

  return { classify, isCandidate, isSystemSender }
}
