const LOCALE = 'sv-SE'
const TIMEZONE = 'Europe/Stockholm'

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  month: 'short',
  day: 'numeric',
})

export function formatDate(date: Date): string {
  return dateFormatter.format(date)
}

export function formatTime(date: Date): string {
  return timeFormatter.format(date)
}

export function formatShortDate(date: Date): string {
  return shortDateFormatter.format(date)
}

/** Returns "Idag", "Imorgon", "I övermorgon", or formatted date */
export function formatRelativeDate(date: Date, now: Date = new Date()): string {
  const diffMs = startOfDay(date).getTime() - startOfDay(now).getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Idag'
  if (diffDays === 1) return 'Imorgon'
  if (diffDays === 2) return 'I övermorgon'
  return formatShortDate(date)
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Parses "HH:MM" string into { hours, minutes } */
export function parseTime(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(':').map(Number)
  if (h === undefined || m === undefined || isNaN(h) || isNaN(m)) {
    throw new Error(`Invalid time format: ${time}`)
  }
  return { hours: h, minutes: m }
}

/** Returns the next Date when "HH:MM" will occur (today or tomorrow) */
export function nextOccurrence(time: string, from: Date = new Date()): Date {
  const { hours, minutes } = parseTime(time)
  const candidate = new Date(from)
  candidate.setHours(hours, minutes, 0, 0)
  if (candidate <= from) {
    candidate.setDate(candidate.getDate() + 1)
  }
  return candidate
}
