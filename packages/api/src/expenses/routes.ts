import type { FastifyPluginAsync } from 'fastify'
import { tenantMiddleware } from '../middleware/tenant'
import { PrismaMembershipRepo } from '../repos/membership'
import { CreateExpenseBody, UpdateExpenseBody } from './schemas'

export const expenseRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.prisma
  const membershipRepo = new PrismaMembershipRepo(db)
  const tenant = tenantMiddleware(membershipRepo)
  const tenantSupporter = tenantMiddleware(membershipRepo, 'SUPPORTER')
  const tenantLead = tenantMiddleware(membershipRepo, 'LEAD')

  // GET /:groupId/expenses/summary — totals by category (must be before /:id)
  fastify.get<{ Params: { groupId: string }; Querystring: { from?: string; to?: string } }>(
    '/:groupId/expenses/summary',
    { onRequest: [fastify.authenticate], preHandler: [tenant] },
    async (request) => {
      const { groupId } = request.params
      const from = request.query.from ? new Date(request.query.from) : undefined
      const to = request.query.to ? new Date(request.query.to) : undefined
      const expenses = await db.expense.findMany({
        where: { groupId, ...(from || to ? { expenseDate: { gte: from, lte: to } } : {}) },
        select: { amount: true, category: true },
      })
      const totals: Record<string, number> = {}
      let grandTotal = 0
      for (const e of expenses) {
        totals[e.category] = (totals[e.category] ?? 0) + e.amount
        grandTotal += e.amount
      }
      return { totals, grandTotal, currency: 'SEK' }
    },
  )

  // GET /:groupId/expenses
  fastify.get<{ Params: { groupId: string }; Querystring: { category?: string; cursor?: string; limit?: string } }>(
    '/:groupId/expenses',
    { onRequest: [fastify.authenticate], preHandler: [tenant] },
    async (request) => {
      const { groupId } = request.params
      const limit = Math.min(Number(request.query.limit ?? 20), 50)
      const cursor = request.query.cursor
      const expenses = await db.expense.findMany({
        where: { groupId, ...(request.query.category ? { category: request.query.category as never } : {}) },
        orderBy: { expenseDate: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { createdBy: { select: { id: true, email: true } } },
      })
      const hasMore = expenses.length > limit
      return { items: hasMore ? expenses.slice(0, limit) : expenses, nextCursor: hasMore ? expenses[limit - 1]?.id ?? null : null }
    },
  )

  // POST /:groupId/expenses
  fastify.post<{ Params: { groupId: string } }>(
    '/:groupId/expenses',
    { onRequest: [fastify.authenticate], preHandler: [tenantSupporter] },
    async (request, reply) => {
      const { groupId } = request.params
      const userId = (request.user as { sub: string }).sub
      const parsed = CreateExpenseBody.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message })
      const expense = await db.expense.create({
        data: { groupId, createdById: userId, ...parsed.data, expenseDate: new Date(parsed.data.expenseDate) },
      })
      await db.feedItem.create({
        data: { groupId, actorId: userId, itemType: 'EXPENSE_ADDED', expenseId: expense.id, bodyText: parsed.data.description },
      })
      return reply.code(201).send(expense)
    },
  )

  // GET /:groupId/expenses/:id
  fastify.get<{ Params: { groupId: string; id: string } }>(
    '/:groupId/expenses/:id',
    { onRequest: [fastify.authenticate], preHandler: [tenant] },
    async (request, reply) => {
      const { groupId, id } = request.params
      const expense = await db.expense.findFirst({
        where: { id, groupId },
        include: { createdBy: { select: { id: true, email: true } }, comments: true },
      })
      if (!expense) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Utgift hittades inte' })
      return expense
    },
  )

  // PATCH /:groupId/expenses/:id
  fastify.patch<{ Params: { groupId: string; id: string } }>(
    '/:groupId/expenses/:id',
    { onRequest: [fastify.authenticate], preHandler: [tenantSupporter] },
    async (request, reply) => {
      const { groupId, id } = request.params
      const expense = await db.expense.findFirst({ where: { id, groupId } })
      if (!expense) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Utgift hittades inte' })
      const parsed = UpdateExpenseBody.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message })
      const data = { ...parsed.data, ...(parsed.data.expenseDate ? { expenseDate: new Date(parsed.data.expenseDate) } : {}) }
      return db.expense.update({ where: { id }, data })
    },
  )

  // DELETE /:groupId/expenses/:id
  fastify.delete<{ Params: { groupId: string; id: string } }>(
    '/:groupId/expenses/:id',
    { onRequest: [fastify.authenticate], preHandler: [tenantLead] },
    async (request, reply) => {
      const { groupId, id } = request.params
      const expense = await db.expense.findFirst({ where: { id, groupId } })
      if (!expense) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Utgift hittades inte' })
      await db.expense.delete({ where: { id } })
      return reply.code(204).send()
    },
  )
}
