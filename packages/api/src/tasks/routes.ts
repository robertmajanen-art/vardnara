import type { FastifyPluginAsync } from 'fastify'
import { tenantMiddleware } from '../middleware/tenant'
import { Role, type MembershipRepository } from '../types/index'
import { createFeedItem } from '../services/feed'
import {
  CreateTaskBody,
  UpdateTaskBody,
  AssignTaskBody,
  CompleteTaskBody,
} from './schemas'

type P = { groupId: string }
type TP = { groupId: string; taskId: string }

export const taskRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.prisma
  const mw = () => tenantMiddleware(db.membership as unknown as MembershipRepository)
  const mwLead = () => tenantMiddleware(db.membership as unknown as MembershipRepository, Role.LEAD)
  const mwSupporter = () => tenantMiddleware(db.membership as unknown as MembershipRepository, Role.SUPPORTER)

  // GET /api/groups/:groupId/tasks?status=&assigneeId=
  fastify.get<{ Params: P; Querystring: { status?: string; assigneeId?: string } }>(
    '/:groupId/tasks',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      const { status, assigneeId } = req.query
      const tasks = await db.task.findMany({
        where: {
          groupId: req.params.groupId,
          ...(status ? { status: status as 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'OVERDUE' } : {}),
          ...(assigneeId ? { assigneeId } : {}),
        },
        include: {
          assignee: { select: { id: true, email: true } },
          createdBy: { select: { id: true, email: true } },
        },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      })
      return reply.send(tasks)
    },
  )

  // POST /api/groups/:groupId/tasks
  fastify.post<{ Params: P }>(
    '/:groupId/tasks',
    { onRequest: [fastify.authenticate], preHandler: [mwSupporter()] },
    async (req, reply) => {
      const parsed = CreateTaskBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Ogiltig inmatning' })
      }
      const { dueDate, ...rest } = parsed.data
      const task = await db.task.create({
        data: {
          groupId: req.params.groupId,
          createdById: req.tenant.userId,
          ...rest,
          ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
        },
      })
      await createFeedItem(db, fastify.io, req.params.groupId, req.tenant.userId, 'TASK_CREATED', { taskId: task.id }, `Ny uppgift: ${task.title}`)
      return reply.code(201).send(task)
    },
  )

  // GET /api/groups/:groupId/tasks/:taskId
  fastify.get<{ Params: TP }>(
    '/:groupId/tasks/:taskId',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      const task = await db.task.findUniqueOrThrow({
        where: { id: req.params.taskId, groupId: req.params.groupId },
        include: {
          assignee: { select: { id: true, email: true } },
          createdBy: { select: { id: true, email: true } },
        },
      })
      return reply.send(task)
    },
  )

  // PATCH /api/groups/:groupId/tasks/:taskId
  fastify.patch<{ Params: TP }>(
    '/:groupId/tasks/:taskId',
    { onRequest: [fastify.authenticate], preHandler: [mwSupporter()] },
    async (req, reply) => {
      const parsed = UpdateTaskBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Ogiltig inmatning' })
      }
      const { dueDate, ...rest } = parsed.data
      const task = await db.task.update({
        where: { id: req.params.taskId, groupId: req.params.groupId },
        data: {
          ...rest,
          ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        },
      })
      return reply.send(task)
    },
  )

  // PATCH /api/groups/:groupId/tasks/:taskId/skip — skip one occurrence
  fastify.patch<{ Params: TP }>(
    '/:groupId/tasks/:taskId/skip',
    { onRequest: [fastify.authenticate], preHandler: [mwSupporter()] },
    async (req, reply) => {
      const { date } = req.body as { date?: string }
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return reply.code(400).send({ message: 'date (YYYY-MM-DD) required' })
      }
      const task = await db.task.findUniqueOrThrow({
        where: { id: req.params.taskId, groupId: req.params.groupId },
      })
      const existing = (task.exceptionDates ?? '').split(',').filter(Boolean)
      if (!existing.includes(date)) existing.push(date)
      const updated = await db.task.update({
        where: { id: req.params.taskId, groupId: req.params.groupId },
        data: { exceptionDates: existing.join(',') },
        include: { assignee: { select: { id: true, email: true } }, createdBy: { select: { id: true, email: true } } },
      })
      return reply.send(updated)
    },
  )

  // PATCH /api/groups/:groupId/tasks/:taskId/complete-occurrence — mark one occurrence done
  // Adds the date to completedDates (not exceptionDates), so it stays visible but green.
  fastify.patch<{ Params: TP }>(
    '/:groupId/tasks/:taskId/complete-occurrence',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      const { date } = req.body as { date?: string }
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return reply.code(400).send({ message: 'date (YYYY-MM-DD) required' })
      }
      const task = await db.task.findUniqueOrThrow({
        where: { id: req.params.taskId, groupId: req.params.groupId },
      })
      const existing = (task.completedDates ?? '').split(',').filter(Boolean)
      if (!existing.includes(date)) existing.push(date)
      const updated = await db.task.update({
        where: { id: req.params.taskId, groupId: req.params.groupId },
        data: { completedDates: existing.join(',') },
        include: { assignee: { select: { id: true, email: true } }, createdBy: { select: { id: true, email: true } } },
      })
      await createFeedItem(db, fastify.io, req.params.groupId, req.tenant.userId, 'TASK_COMPLETED', { taskId: task.id }, `Uppgift klar: ${task.title} (${date})`)
      return reply.send(updated)
    },
  )

  // DELETE /api/groups/:groupId/tasks/:taskId — Supporter+
  fastify.delete<{ Params: TP }>(
    '/:groupId/tasks/:taskId',
    { onRequest: [fastify.authenticate], preHandler: [mwSupporter()] },
    async (req, reply) => {
      await db.task.delete({
        where: { id: req.params.taskId, groupId: req.params.groupId },
      })
      return reply.code(204).send()
    },
  )

  // PATCH /api/groups/:groupId/tasks/:taskId/assign — LEAD only
  fastify.patch<{ Params: TP }>(
    '/:groupId/tasks/:taskId/assign',
    { onRequest: [fastify.authenticate], preHandler: [mwLead()] },
    async (req, reply) => {
      const parsed = AssignTaskBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Ogiltig inmatning' })
      }
      const task = await db.task.update({
        where: { id: req.params.taskId, groupId: req.params.groupId },
        data: { assigneeId: parsed.data.assigneeId },
      })
      if (parsed.data.assigneeId) {
        await createFeedItem(db, fastify.io, req.params.groupId, req.tenant.userId, 'TASK_ASSIGNED', { taskId: task.id }, `Uppgift tilldelad: ${task.title}`)
      }
      return reply.send(task)
    },
  )

  // PATCH /api/groups/:groupId/tasks/:taskId/complete
  fastify.patch<{ Params: TP }>(
    '/:groupId/tasks/:taskId/complete',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      const parsed = CompleteTaskBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Ogiltig inmatning' })
      }
      const task = await db.task.update({
        where: { id: req.params.taskId, groupId: req.params.groupId },
        data: {
          status: 'DONE',
          completedAt: new Date(),
          completionNote: parsed.data.note ?? null,
        },
      })
      await createFeedItem(db, fastify.io, req.params.groupId, req.tenant.userId, 'TASK_COMPLETED', { taskId: task.id }, `Uppgift klar: ${task.title}`)
      return reply.send(task)
    },
  )
}
