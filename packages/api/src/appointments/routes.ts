import type { FastifyPluginAsync } from 'fastify'
import { tenantMiddleware, requireRole } from '../middleware/tenant'
import { Role, type MembershipRepository } from '../types/index'
import { createFeedItem } from '../services/feed'
import { sendCalendarInvites } from '../email/calendarService'
import {
  CreateAppointmentBody,
  UpdateAppointmentBody,
  AssignAppointmentBody,
  RespondAppointmentBody,
  OutcomeBody,
} from './schemas'

type P = { groupId: string }
type AP = { groupId: string; appointmentId: string }

export const appointmentRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.prisma
  const mw = () => tenantMiddleware(db.membership as unknown as MembershipRepository)
  const mwLead = () => tenantMiddleware(db.membership as unknown as MembershipRepository, Role.LEAD)
  const mwSupporter = () => tenantMiddleware(db.membership as unknown as MembershipRepository, Role.SUPPORTER)

  // GET /api/groups/:groupId/appointments?from=&to=
  fastify.get<{ Params: P; Querystring: { from?: string; to?: string } }>(
    '/:groupId/appointments',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      const { from, to } = req.query
      const appointments = await db.appointment.findMany({
        where: {
          groupId: req.params.groupId,
          ...(from || to ? {
            OR: [
              // Non-recurring: filter by date range as before
              {
                recurrence: 'NONE',
                startTime: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {}),
                },
              },
              // Recurring: return all that started on or before `to`
              // so the frontend can project future occurrences
              {
                NOT: { recurrence: 'NONE' },
                ...(to ? { startTime: { lte: new Date(to) } } : {}),
              },
            ],
          } : {}),
        },
        include: {
          assignee: { select: { id: true, email: true } },
          createdBy: { select: { id: true, email: true } },
        },
        orderBy: { startTime: 'asc' },
      })
      return reply.send(appointments)
    },
  )

  // POST /api/groups/:groupId/appointments
  fastify.post<{ Params: P }>(
    '/:groupId/appointments',
    { onRequest: [fastify.authenticate], preHandler: [mwSupporter()] },
    async (req, reply) => {
      const parsed = CreateAppointmentBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Ogiltig inmatning' })
      }
      const { reminderMinutes, assigneeId, transportPersonId, transportPersonName, ...data } = parsed.data
      const appointment = await db.appointment.create({
        data: {
          groupId: req.params.groupId,
          createdById: req.tenant.userId,
          assigneeId: assigneeId ?? null,
          transportPersonId: transportPersonId ?? null,
          transportPersonName: transportPersonName ?? null,
          ...data,
          startTime: new Date(data.startTime),
          endTime: data.endTime ? new Date(data.endTime) : undefined,
          ...(reminderMinutes?.length ? {
            reminders: { create: reminderMinutes.map((m) => ({ minutesBefore: m })) },
          } : {}),
        },
      })
      await createFeedItem(db, fastify.io, req.params.groupId, req.tenant.userId, 'APPOINTMENT_CREATED', { appointmentId: appointment.id }, `Nytt besök: ${appointment.title}`)

      // Send calendar invites to group members (fire-and-forget, never blocks response)
      const group = await db.careGroup.findUnique({
        where: { id: req.params.groupId },
        select: { name: true },
      })
      const organizer = await db.user.findUnique({
        where: { id: req.tenant.userId },
        select: { email: true },
      })
      void sendCalendarInvites(db, {
        appointment,
        groupId: req.params.groupId,
        groupName: group?.name ?? '',
        organizerEmail: organizer?.email ?? '',
        method: 'REQUEST',
        sequence: 0,
      })

      return reply.code(201).send(appointment)
    },
  )

  // GET /api/groups/:groupId/appointments/:appointmentId
  fastify.get<{ Params: AP }>(
    '/:groupId/appointments/:appointmentId',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      const appointment = await db.appointment.findUniqueOrThrow({
        where: { id: req.params.appointmentId, groupId: req.params.groupId },
        include: {
          assignee: { select: { id: true, email: true } },
          createdBy: { select: { id: true, email: true } },
          reminders: true,
          feedItems: { select: { id: true }, take: 1, orderBy: { createdAt: 'asc' } },
        },
      })
      return reply.send(appointment)
    },
  )

  // PATCH /api/groups/:groupId/appointments/:appointmentId
  fastify.patch<{ Params: AP }>(
    '/:groupId/appointments/:appointmentId',
    { onRequest: [fastify.authenticate], preHandler: [mwSupporter()] },
    async (req, reply) => {
      const parsed = UpdateAppointmentBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Ogiltig inmatning' })
      }
      const { startTime, endTime, transportPersonId, transportPersonName, ...rest } = parsed.data
      const appointment = await db.appointment.update({
        where: { id: req.params.appointmentId, groupId: req.params.groupId },
        data: {
          ...rest,
          ...(startTime !== undefined && { startTime: new Date(startTime) }),
          ...(endTime !== undefined && { endTime: endTime ? new Date(endTime) : null }),
          ...(transportPersonId !== undefined && { transportPersonId }),
          ...(transportPersonName !== undefined && { transportPersonName }),
        },
      })

      // Send calendar update to group members
      const groupUpd = await db.careGroup.findUnique({
        where: { id: req.params.groupId },
        select: { name: true },
      })
      const organizerUpd = await db.user.findUnique({
        where: { id: req.tenant.userId },
        select: { email: true },
      })
      void sendCalendarInvites(db, {
        appointment,
        groupId: req.params.groupId,
        groupName: groupUpd?.name ?? '',
        organizerEmail: organizerUpd?.email ?? '',
        method: 'REQUEST',
        sequence: 1,
      })

      return reply.send(appointment)
    },
  )

  // PATCH /api/groups/:groupId/appointments/:appointmentId/skip — skip one occurrence
  fastify.patch<{ Params: AP }>(
    '/:groupId/appointments/:appointmentId/skip',
    { onRequest: [fastify.authenticate], preHandler: [mwSupporter()] },
    async (req, reply) => {
      const { date } = req.body as { date?: string }
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return reply.code(400).send({ message: 'date (YYYY-MM-DD) required' })
      }
      const apt = await db.appointment.findUniqueOrThrow({
        where: { id: req.params.appointmentId, groupId: req.params.groupId },
      })
      const existing = (apt.exceptionDates ?? '').split(',').filter(Boolean)
      if (!existing.includes(date)) existing.push(date)
      const updated = await db.appointment.update({
        where: { id: req.params.appointmentId, groupId: req.params.groupId },
        data: { exceptionDates: existing.join(',') },
      })
      return reply.send(updated)
    },
  )

  // DELETE /api/groups/:groupId/appointments/:appointmentId — Supporter+
  fastify.delete<{ Params: AP }>(
    '/:groupId/appointments/:appointmentId',
    { onRequest: [fastify.authenticate], preHandler: [mwSupporter()] },
    async (req, reply) => {
      // Fetch data before deletion so we can send a cancellation invite
      const aptToDelete = await db.appointment.findUnique({
        where: { id: req.params.appointmentId, groupId: req.params.groupId },
      })

      await db.appointment.delete({
        where: { id: req.params.appointmentId, groupId: req.params.groupId },
      })

      // Send calendar cancellation to group members
      if (aptToDelete) {
        const groupDel = await db.careGroup.findUnique({
          where: { id: req.params.groupId },
          select: { name: true },
        })
        const organizerDel = await db.user.findUnique({
          where: { id: req.tenant.userId },
          select: { email: true },
        })
        void sendCalendarInvites(db, {
          appointment: aptToDelete,
          groupId: req.params.groupId,
          groupName: groupDel?.name ?? '',
          organizerEmail: organizerDel?.email ?? '',
          method: 'CANCEL',
          sequence: 2,
        })
      }

      return reply.code(204).send()
    },
  )

  // PATCH /api/groups/:groupId/appointments/:appointmentId/assign — LEAD only
  fastify.patch<{ Params: AP }>(
    '/:groupId/appointments/:appointmentId/assign',
    { onRequest: [fastify.authenticate], preHandler: [mwLead()] },
    async (req, reply) => {
      const parsed = AssignAppointmentBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Ogiltig inmatning' })
      }
      const appointment = await db.appointment.update({
        where: { id: req.params.appointmentId, groupId: req.params.groupId },
        data: { assigneeId: parsed.data.assigneeId, assigneeAccepted: null, assigneeNote: null },
      })
      if (parsed.data.assigneeId) {
        await createFeedItem(db, fastify.io, req.params.groupId, req.tenant.userId, 'APPOINTMENT_ASSIGNED', { appointmentId: appointment.id }, `Besök tilldelat: ${appointment.title}`)
      }
      return reply.send(appointment)
    },
  )

  // PATCH /api/groups/:groupId/appointments/:appointmentId/respond — assignee
  fastify.patch<{ Params: AP }>(
    '/:groupId/appointments/:appointmentId/respond',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      const parsed = RespondAppointmentBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Ogiltig inmatning' })
      }
      const existing = await db.appointment.findUniqueOrThrow({
        where: { id: req.params.appointmentId, groupId: req.params.groupId },
      })
      if (existing.assigneeId !== req.tenant.userId) {
        requireRole(req, reply, Role.LEAD)
        return
      }
      const appointment = await db.appointment.update({
        where: { id: req.params.appointmentId },
        data: { assigneeAccepted: parsed.data.accepted, assigneeNote: parsed.data.note ?? null },
      })
      const itemType = parsed.data.accepted ? 'APPOINTMENT_ACCEPTED' : 'APPOINTMENT_DECLINED'
      const text = parsed.data.accepted ? `Besök accepterat: ${appointment.title}` : `Besök avböjt: ${appointment.title}`
      await createFeedItem(db, fastify.io, req.params.groupId, req.tenant.userId, itemType, { appointmentId: appointment.id }, text)
      return reply.send(appointment)
    },
  )

  // PATCH /api/groups/:groupId/appointments/:appointmentId/outcome — assignee
  fastify.patch<{ Params: AP }>(
    '/:groupId/appointments/:appointmentId/outcome',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      const parsed = OutcomeBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Ogiltig inmatning' })
      }
      const existing = await db.appointment.findUniqueOrThrow({
        where: { id: req.params.appointmentId, groupId: req.params.groupId },
      })
      if (existing.assigneeId !== req.tenant.userId) {
        requireRole(req, reply, Role.LEAD)
        return
      }
      const appointment = await db.appointment.update({
        where: { id: req.params.appointmentId },
        data: { outcomeNotes: parsed.data.outcomeNotes, outcomeAddedAt: new Date() },
      })
      // Auto-create journal entry for outcome
      await db.journalEntry.create({
        data: {
          groupId: req.params.groupId,
          authorId: req.tenant.userId,
          entryType: 'APPOINTMENT_OUTCOME',
          title: `Utfall: ${existing.title}`,
          body: parsed.data.outcomeNotes,
          tags: ['besök', 'utfall'],
          photoKeys: [],
          appointmentId: existing.id,
        },
      })
      await createFeedItem(db, fastify.io, req.params.groupId, req.tenant.userId, 'APPOINTMENT_OUTCOME', { appointmentId: appointment.id }, `Utfall tillagt för: ${appointment.title}`)
      return reply.send(appointment)
    },
  )
}
