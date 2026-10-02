// Reads the "Job Applications" CSV from a LinkedIn data export (Settings > Data privacy > Get a copy of your data)

// Handles quoted fields containing commas, quotes ("") and line breaks
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim()))
}

// LinkedIn writes dates like "10/1/24, 3:45 PM"; fall back to the browser's parser for anything else
function parseDate(value) {
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i)
  if (match) {
    const [, month, day, rawYear, rawHour = '12', minute = '0', ampm] = match
    const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear)
    let hour = Number(rawHour)
    if (ampm?.toUpperCase() === 'PM' && hour < 12) hour += 12
    if (ampm?.toUpperCase() === 'AM' && hour === 12) hour = 0
    return new Date(year, Number(month) - 1, Number(day), hour, Number(minute))
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

// Finds a column by trying header names in order (case-insensitive, partial match)
function findColumn(headers, candidates) {
  const lower = headers.map((h) => h.trim().toLowerCase())
  for (const candidate of candidates) {
    const index = lower.findIndex((h) => h === candidate || h.includes(candidate))
    if (index !== -1) return index
  }
  return -1
}

export function parseLinkedInApplications(text) {
  const [headers, ...rows] = parseCsv(text.replace(/^﻿/, ''))
  if (!headers) throw new Error('The file is empty.')

  const columns = {
    company: findColumn(headers, ['company name', 'company', 'organization']),
    position: findColumn(headers, ['job title', 'title', 'position']),
    date: findColumn(headers, ['application date', 'applied on', 'date']),
    link: findColumn(headers, ['job url', 'url', 'link']),
    resume: findColumn(headers, ['resume name', 'resume']),
  }
  if (columns.company === -1) {
    throw new Error("This doesn't look like LinkedIn's Job Applications file (no company column found).")
  }

  const cell = (row, index) => (index === -1 ? '' : (row[index] || '').trim())
  return rows
    .map((row) => ({
      company: cell(row, columns.company),
      position: cell(row, columns.position),
      date: parseDate(cell(row, columns.date)) || new Date(),
      link: cell(row, columns.link) || null,
      resumeName: cell(row, columns.resume),
    }))
    .filter((application) => application.company)
}

// Stable id so importing the same file twice doesn't create duplicates
export function linkedInJobId(application) {
  const slug = `${application.company}|${application.position}|${application.date.toISOString().slice(0, 10)}`
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, '-')
  return `manual:linkedin:${slug}`
}
