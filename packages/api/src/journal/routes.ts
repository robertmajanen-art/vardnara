import type { FastifyPluginAsync } from 'fastify'
import { tenantMiddleware } from '../middleware/tenant'
import { Role, type MembershipRepository } from '../types/index'
import { CreateJournalBody, UpdateJournalBody } from './schemas'

export const journalRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.prisma
  const repo = db.membership as unknown as MembershipRepository
  const tenant = tenantMiddleware(repo)
  const tenantSupporter = tenantMiddleware(repo, Role.SUPPORTER)
  const tenantLead = tenantMiddleware(repo, Role.LEAD)

  // GET /:groupId/journal
  fastify.get<{ Params: { groupId: string }; Querystring: { entryType?: string; cursor?: string; limit?: string } }>(
    '/:groupId/journal',
    { onRequest: [fastify.authenticate], preHandler: [tenant] },
    async (request) => {
      const { groupId } = request.params
      const limit = Math.min(Number(request.query.limit ?? 20), 50)
      const cursor = request.query.cursor
      const where = {
        groupId,
        ...(request.query.entryType ? { entryType: request.query.entryType as never } : {}),
      }
      const entries = await db.journalEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true, groupId: true, authorId: true, entryType: true,
          title: true, body: true, tags: true, createdAt: true, updatedAt: true,
        },
      })
      const hasMore = entries.length > limit
      return { items: hasMore ? entries.slice(0, limit) : entries, nextCursor: hasMore ? entries[limit - 1]?.id ?? null : null }
    },
  )

  // POST /:groupId/journal
  fastify.post<{ Params: { groupId: string } }>(
    '/:groupId/journal',
    { onRequest: [fastify.authenticate], preHandler: [tenantSupporter] },
    async (request, reply) => {
      const { groupId } = request.params
      const userId = (request.user as { sub: string }).sub
      const parsed = CreateJournalBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Ogiltig inmatning' })
      }
      const entry = await db.journalEntry.create({
        data: { groupId, authorId: userId, ...parsed.data },
      })
      await db.feedItem.create({
        data: { groupId, actorId: userId, itemType: 'JOURNAL_ENTRY', journalEntryId: entry.id, bodyText: entry.title },
      })
      return reply.code(201).send(entry)
    },
  )

  // GET /:groupId/journal/:id
  fastify.get<{ Params: { groupId: string; id: string } }>(
    '/:groupId/journal/:id',
    { onRequest: [fastify.authenticate], preHandler: [tenant] },
    async (request, reply) => {
      const { groupId, id } = request.params
      const entry = await db.journalEntry.findFirst({ where: { id, groupId } })
      if (!entry) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Dagbokspost hittades inte' })
      return entry
    },
  )

  // PATCH /:groupId/journal/:id
  fastify.patch<{ Params: { groupId: string; id: string } }>(
    '/:groupId/journal/:id',
    { onRequest: [fastify.authenticate], preHandler: [tenantSupporter] },
    async (request, reply) => {
      const { groupId, id } = request.params
      const userId = (request.user as { sub: string }).sub
      const tc = (request as unknown as { tenantContext: { role: string } }).tenantContext
      const entry = await db.journalEntry.findFirst({ where: { id, groupId } })
      if (!entry) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Dagbokspost hittades inte' })
      if (entry.authorId !== userId && tc.role !== 'LEAD') {
        return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Åtkomst nekad' })
      }
      const parsed = UpdateJournalBody.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message })
      return db.journalEntry.update({ where: { id }, data: parsed.data })
    },
  )

  // DELETE /:groupId/journal/:id
  fastify.delete<{ Params: { groupId: string; id: string } }>(
    '/:groupId/journal/:id',
    { onRequest: [fastify.authenticate], preHandler: [tenantLead] },
    async (request, reply) => {
      const { groupId, id } = request.params
      const entry = await db.journalEntry.findFirst({ where: { id, groupId } })
      if (!entry) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Dagbokspost hittades inte' })
      await db.journalEntry.delete({ where: { id } })
      return reply.code(204).send()
    },
  )
}
