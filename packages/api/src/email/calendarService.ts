// ── Calendar invite email sender ──────────────────────────────────────────────
// Sends iCal (.ics) attachments to eligible group members via the group's
// own SMTP configuration. Silently no-ops if no config is set.

import nodemailer from 'nodemailer'
import type { PrismaClient } from '@prisma/client'
import { buildIcs, type IcsMethod } from './ical'

type CalendarInviteParams = {
  appointment: {
    id: string
    title: string
    startTime: Date | string
    endTime?: Date | string | null
    location?: string | null
    notes?: string | null
  }
  groupId: string
  groupName: string
  /** Email of the person who created / last modified the appointment */
  organizerEmail: string
  organizerName?: string | null
  method: IcsMethod
  /** 0 = new, 1 = updated, 2 = cancelled */
  sequence?: number
}

/**
 * Send iCal calendar invites to all LEAD / SUPPORTER / OBSERVER members of the
 * group. Requires the group to have a valid EmailConfig row.
 *
 * Never throws — errors are logged but do not affect the HTTP response.
 */
export async function sendCalendarInvites(
  db: PrismaClient,
  params: CalendarInviteParams,
): Promise<void> {
  try {
    // 1. Load the group's SMTP config
    const config = await db.emailConfig.findUnique({ where: { groupId: params.groupId } })
    if (!config || !config.host || !config.username || !config.password) return

    // 2. Fetch eligible member emails
    const memberships = await db.membership.findMany({
      where: {
        groupId: params.groupId,
        role: { in: ['LEAD', 'SUPPORTER', 'OBSERVER'] },
      },
      include: { user: { select: { email: true } } },
    })
    if (memberships.length === 0) return

    // 3. Build the iCal payload
    const icsContent = buildIcs(
      {
        id: params.appointment.id,
        title: params.appointment.title,
        startTime: new Date(params.appointment.startTime),
        endTime: params.appointment.endTime ? new Date(params.appointment.endTime) : null,
        location: params.appointment.location,
        notes: params.appointment.notes,
        groupName: params.groupName,
        organizerEmail: params.organizerEmail,
        organizerName: params.organizerName,
      },
      params.method,
      params.sequence ?? 0,
    )

    // 4. Create transporter
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.username, pass: config.password },
    })

    // 5. Build email content
    const isCancel = params.method === 'CANCEL'
    const subject = isCancel
      ? `Inställt: ${params.appointment.title}`
      : `Kalenderinbjudan: ${params.appointment.title}`

    const startDate = new Date(params.appointment.startTime)
    const dateStr = new Intl.DateTimeFormat('sv-SE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(startDate)

    const endStr = params.appointment.endTime
      ? new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(
          new Date(params.appointment.endTime),
        )
      : null

    const timeLabel = endStr ? `${dateStr}–${endStr}` : dateStr

    const html = isCancel
      ? `<p>Besöket <strong>${params.appointment.title}</strong> (${timeLabel}) har ställts in.</p>
         <p style="color:#6c757d;font-size:0.875rem">Skickat från VårdNära</p>`
      : `<p>Du har bjudits in till ett besök i omsorgsgruppen <strong>${params.groupName}</strong>.</p>
         <table style="border-collapse:collapse;margin:1rem 0">
           <tr><td style="padding:0.25rem 1rem 0.25rem 0;font-weight:600">Besök</td><td>${params.appointment.title}</td></tr>
           <tr><td style="padding:0.25rem 1rem 0.25rem 0;font-weight:600">Tid</td><td>${timeLabel}</td></tr>
           ${params.appointment.location ? `<tr><td style="padding:0.25rem 1rem 0.25rem 0;font-weight:600">Plats</td><td>${params.appointment.location}</td></tr>` : ''}
           ${params.appointment.notes ? `<tr><td style="padding:0.25rem 1rem 0.25rem 0;font-weight:600">Anteckningar</td><td>${params.appointment.notes}</td></tr>` : ''}
         </table>
         <p>Se bifogad kalenderinbjudan för att lägga till i din kalender.</p>
         <p style="color:#6c757d;font-size:0.875rem">Skickat från VårdNära</p>`

    // 6. Send to each member
    const fromName = config.fromName || 'VårdNära'
    for (const m of memberships) {
      try {
        await transport.sendMail({
          from: `"${fromName}" <${config.username}>`,
          to: m.user.email,
          subject,
          html,
          attachments: [
            {
              filename: 'invite.ics',
              content: icsContent,
              contentType: `text/calendar; method=${params.method}; charset=utf-8`,
            },
          ],
        })
      } catch (err) {
        // Log per-recipient failure but continue sending to others
        console.error(`[calendar] Failed to send to ${m.user.email}:`, err)
      }
    }
  } catch (err) {
    // Top-level guard — calendar sending must never break the HTTP request
    console.error('[calendar] Unexpected error in sendCalendarInvites:', err)
  }
}
