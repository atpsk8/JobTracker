import { downloadFile } from './download.js'

const INTERVIEW_LENGTH_MS = 60 * 60 * 1000

// 2026-10-10T14:30:00.000Z -> 20261010T143000Z
function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function eventTimes(interview) {
  const start = new Date(interview.dateTime)
  return { start, end: new Date(start.getTime() + INTERVIEW_LENGTH_MS) }
}

function eventDetails(interview) {
  return [interview.position && `Position: ${interview.position}`, interview.notes].filter(Boolean).join('\n\n')
}

export function googleCalendarUrl(interview) {
  const { start, end } = eventTimes(interview)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Interview: ${interview.company}`,
    dates: `${utcStamp(start)}/${utcStamp(end)}`,
    details: eventDetails(interview),
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

function escapeIcs(text) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// iCalendar lines should be at most 75 characters; continuation lines start with a space
function foldIcs(line) {
  const parts = []
  for (let i = 0; i < line.length; i += 73) parts.push(line.slice(i, i + 73))
  return parts.join('\r\n ')
}

// .ics files open in Outlook, Apple Calendar and most other calendar apps
export function downloadIcs(interview) {
  const { start, end } = eventTimes(interview)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Job Tracker//EN',
    'BEGIN:VEVENT',
    `UID:${interview.id}@job-tracker`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeIcs(`Interview: ${interview.company}`)}`,
    `DESCRIPTION:${escapeIcs(eventDetails(interview))}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Interview in 1 hour',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const fileName = `interview-${interview.company.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`
  downloadFile(fileName, lines.map(foldIcs).join('\r\n'), 'text/calendar')
}
