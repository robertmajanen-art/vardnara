import type { FastifyPluginAsync } from 'fastify'
import { tenantMiddleware } from '../middleware/tenant'
import { Role, type MembershipRepository } from '../types/index'
import { createFeedItem } from '../services/feed'
import {
  CreateRecurringTaskBody,
  UpdateRecurringTaskBody,
  ConfirmLogBody,
} from './schemas'

type P = { groupId: string }
type RP = { groupId: string; recurringTaskId: string }
type LP = { groupId: string; recurringTaskId: string; logId: string }

export const recurringTaskRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.prisma
  const mw = () => tenantMiddleware(db.membership as unknown as MembershipRepository)
  const mwLead = () => tenantMiddleware(db.membership as unknown as MembershipRepository, Role.LEAD)
  const mwSupporter = () => tenantMiddleware(db.membership as unknown as MembershipRepository, Role.SUPPORTER)

  // GET /api/groups/:groupId/recurring-tasks
  fastify.get<{ Params: P }>(
    '/:groupId/recurring-tasks',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      const tasks = await db.recurringTask.findMany({
        where: { groupId: req.params.groupId },
        orderBy: [{ displayOrder: 'asc' }, { scheduledTime: 'asc' }],
      })
      return reply.send(tasks)
    },
  )

  // POST /api/groups/:groupId/recurring-tasks
  fastify.post<{ Params: P }>(
    '/:groupId/recurring-tasks',
    { onRequest: [fastify.authenticate], preHandler: [mwSupporter()] },
    async (req, reply) => {
      const parsed = CreateRecurringTaskBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Ogiltig inmatning' })
      }
      const task = await db.recurringTask.create({
        data: { groupId: req.params.groupId, ...parsed.data },
      })
      return reply.code(201).send(task)
    },
  )

  // GET /api/groups/:groupId/recurring-tasks/:recurringTaskId
  fastify.get<{ Params: RP }>(
    '/:groupId/recurring-tasks/:recurringTaskId',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      const task = await db.recurringTask.findUniqueOrThrow({
        where: { id: req.params.recurringTaskId, groupId: req.params.groupId },
        include: {
          logs: {
            orderBy: { scheduledFor: 'desc' },
            take: 30,
          },
        },
      })
      return reply.send(task)
    },
  )

  // PATCH /api/groups/:groupId/recurring-tasks/:recurringTaskId
  fastify.patch<{ Params: RP }>(
    '/:groupId/recurring-tasks/:recurringTaskId',
    { onRequest: [fastify.authenticate], preHandler: [mwSupporter()] },
    async (req, reply) => {
      const parsed = UpdateRecurringTaskBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Ogiltig inmatning' })
      }
      const task = await db.recurringTask.update({
        where: { id: req.params.recurringTaskId, groupId: req.params.groupId },
        data: parsed.data,
      })
      return reply.send(task)
    },
  )

  // DELETE /api/groups/:groupId/recurring-tasks/:recurringTaskId — LEAD only
  fastify.delete<{ Params: RP }>(
    '/:groupId/recurring-tasks/:recurringTaskId',
    { onRequest: [fastify.authenticate], preHandler: [mwLead()] },
    async (req, reply) => {
      await db.recurringTask.delete({
        where: { id: req.params.recurringTaskId, groupId: req.params.groupId },
      })
      return reply.code(204).send()
    },
  )

  // PATCH /api/groups/:groupId/recurring-tasks/:recurringTaskId/logs/:logId/confirm
  fastify.patch<{ Params: LP }>(
    '/:groupId/recurring-tasks/:recurringTaskId/logs/:logId/confirm',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      const parsed = ConfirmLogBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Ogiltig inmatning' })
      }
      const log = await db.recurringTaskLog.update({
        where: { id: req.params.logId, groupId: req.params.groupId },
        data: {
          confirmedAt: new Date(),
          confirmedById: req.tenant.userId,
          confirmedOnDisplay: parsed.data.confirmedOnDisplay,
        },
      })
      const recurringTask = await db.recurringTask.findUnique({
        where: { id: req.params.recurringTaskId },
        select: { title: true },
      })
      if (recurringTask) {
        await createFeedItem(db, fastify.io, req.params.groupId, req.tenant.userId, 'ACTIVITY_CONFIRMED', {}, `Aktivitet bekräftad: ${recurringTask.title}`)
        await db.journalEntry.create({
          data: {
            groupId: req.params.groupId,
            authorId: req.tenant.userId,
            entryType: 'ACTIVITY_CONFIRMED',
            title: `Bekräftad: ${recurringTask.title}`,
            body: `Aktiviteten "${recurringTask.title}" bekräftades kl ${log.scheduledFor.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}.`,
            tags: ['aktivitet', 'bekräftad'],
            photoKeys: [],
            recurringTaskLogId: log.id,
          },
        })
      }
      return reply.send(log)
    },
  )
}
