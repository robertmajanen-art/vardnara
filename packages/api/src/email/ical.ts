// ── iCal (.ics) generation for calendar invites ──────────────────────────────
// Compatible with Outlook, Google Calendar, Apple Calendar.

export type IcsMethod = 'REQUEST' | 'CANCEL'

export type IcsAppointment = {
  id: string
  title: string
  startTime: Date
  endTime?: Date | null
  location?: string | null
  notes?: string | null
  groupName: string
  organizerEmail: string
  organizerName?: string | null
}

/** Format a Date as iCal UTC timestamp: 20260605T120000Z */
function fmtDt(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Escape special characters per RFC 5545 §3.3.11 */
function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/**
 * Build an iCal string for a single appointment.
 * @param apt      Appointment data
 * @param method   'REQUEST' for new/updated events, 'CANCEL' for deleted
 * @param sequence Increment this for each subsequent send with the same UID
 *                 (0 = new, 1 = first update, 2 = cancel)
 */
export function buildIcs(apt: IcsAppointment, method: IcsMethod, sequence = 0): string {
  const dtStart = fmtDt(apt.startTime)
  const dtEnd = apt.endTime
    ? fmtDt(apt.endTime)
    : fmtDt(new Date(apt.startTime.getTime() + 60 * 60 * 1000)) // default 1 h
  const dtstamp = fmtDt(new Date())
  const uid = `${apt.id}@vardnara.app`

  const organizerCn = esc(apt.organizerName ?? apt.organizerEmail)

  const descParts: string[] = [`Grupp: ${esc(apt.groupName)}`]
  if (apt.notes) descParts.push(esc(apt.notes))
  const description = descParts.join('\\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VårdNära//Calendar//SV',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${esc(apt.title)}`,
    `SEQUENCE:${sequence}`,
    `ORGANIZER;CN="${organizerCn}":mailto:${apt.organizerEmail}`,
    `DESCRIPTION:${description}`,
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    `TRANSP:OPAQUE`,
  ]

  if (apt.location) {
    lines.push(`LOCATION:${esc(apt.location)}`)
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}
