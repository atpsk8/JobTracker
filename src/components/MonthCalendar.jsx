const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MAX_MARKS_PER_DAY = 3

// Local-date key matching the first 10 characters of an interview's dateTime ("2026-10-10")
export function dayKey(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function MonthCalendar({ month, onMonthChange, interviews, selectedDay, onSelectDay }) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const today = dayKey(new Date())

  const byDay = new Map()
  for (const interview of interviews) {
    const key = interview.dateTime.slice(0, 10)
    byDay.set(key, [...(byDay.get(key) || []), interview])
  }

  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1)),
  ]

  return (
    <div className="calendar">
      <div className="calendar-nav">
        <h3>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <button className="btn-text" onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))} aria-label="Previous month">‹</button>
        <button className="btn-text" onClick={() => onMonthChange(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
        <button className="btn-text" onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))} aria-label="Next month">›</button>
      </div>
      <div className="calendar-grid">
        {WEEKDAYS.map((day) => <span key={day} className="calendar-weekday">{day}</span>)}
        {cells.map((date, i) => {
          if (!date) return <span key={`blank-${i}`} className="calendar-blank" />
          const key = dayKey(date)
          const dayInterviews = byDay.get(key) || []
          const classes = ['calendar-day']
          if (key === today) classes.push('is-today')
          if (key < today) classes.push('is-past')
          return (
            <button
              key={key}
              className={classes.join(' ')}
              onClick={() => onSelectDay(key)}
              aria-pressed={key === selectedDay}
              aria-label={`${date.toDateString()}, ${dayInterviews.length} interviews`}
              title={dayInterviews.map((i) => i.company).join(', ') || undefined}
            >
              <span className="calendar-date">{date.getDate()}</span>
              {dayInterviews.length > 0 && (
                <span className="calendar-marks" aria-hidden="true">
                  {dayInterviews.slice(0, MAX_MARKS_PER_DAY).map((interview) => <i key={interview.id} />)}
                  {dayInterviews.length > MAX_MARKS_PER_DAY && '+'}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
export default MonthCalendar
