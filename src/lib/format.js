// Shared date and size formatting, so every part of the page writes them the same way

const isThisYear = (date) => date.getFullYear() === new Date().getFullYear()

// "Oct 04", or "Oct 04, 2024" for other years
export function formatShortDate(date) {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    ...(isThisYear(date) ? {} : { year: 'numeric' }),
  })
}

// "2:30 PM" from an interview's local "YYYY-MM-DDTHH:mm"
export function formatTime(dateTime) {
  return new Date(dateTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function formatLongDate(date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

// Whole-number amounts with grouping ("125,000"); no currency symbol, since the currency isn't known
export function formatAmount(value) {
  return value === null || value === undefined ? '–' : value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

// A date input's "YYYY-MM-DD" as a local date (noon, so time zones can't shift the day)
export const fromDateInput = (value) => new Date(`${value}T12:00`)

export function daysUntil(dateInput) {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  return Math.round((fromDateInput(dateInput) - today) / (24 * 60 * 60 * 1000))
}

// "just now", "12 min ago", "3 h ago", or a date for anything older than a day
export function formatAgo(timestamp, now = Date.now()) {
  const minutes = Math.round((now - timestamp) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`
  return formatShortDate(new Date(timestamp))
}

export function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
