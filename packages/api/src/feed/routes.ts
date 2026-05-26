import type { FastifyPluginAsync } from 'fastify'
import { tenantMiddleware } from '../middleware/tenant'
import { type MembershipRepository } from '../types/index'
import { z } from 'zod'

type P = { groupId: string }
type FP = { groupId: string; feedItemId: string }

const AddCommentBody = z.object({
  body: z.string().min(1).max(2000),
})

export const feedRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.prisma
  const mw = () => tenantMiddleware(db.membership as unknown as MembershipRepository)

  // GET /api/groups/:groupId/feed?cursor=&limit=
  fastify.get<{ Params: P; Querystring: { cursor?: string; limit?: string } }>(
    '/:groupId/feed',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      const limit = Math.min(Number(req.query.limit ?? 30), 100)
      const cursor = req.query.cursor

      const items = await db.feedItem.findMany({
        where: { groupId: req.params.groupId },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
        include: {
          readBy: {
            where: { userId: req.tenant.userId },
            select: { readAt: true },
          },
          _count: { select: { comments: true } },
        },
      })

      const hasMore = items.length > limit
      const data = hasMore ? items.slice(0, limit) : items
      const nextCursor = hasMore ? data[data.length - 1]?.id : null

      return reply.send({ items: data, nextCursor })
    },
  )

  // POST /api/groups/:groupId/feed/:feedItemId/read
  fastify.post<{ Params: FP }>(
    '/:groupId/feed/:feedItemId/read',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      await db.feedItemRead.upsert({
        where: {
          feedItemId_userId: {
            feedItemId: req.params.feedItemId,
            userId: req.tenant.userId,
          },
        },
        create: {
          feedItemId: req.params.feedItemId,
          userId: req.tenant.userId,
        },
        update: {},
      })
      return reply.code(204).send()
    },
  )

  // GET /api/groups/:groupId/feed/:feedItemId/comments
  fastify.get<{ Params: FP }>(
    '/:groupId/feed/:feedItemId/comments',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      const comments = await db.feedComment.findMany({
        where: { feedItemId: req.params.feedItemId },
        orderBy: { createdAt: 'asc' },
      })
      // Enrich with author emails (FeedComment has no direct User relation)
      const authorIds = [...new Set(comments.map(c => c.authorId))]
      const authors = await db.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, email: true },
      })
      const authorMap = new Map(authors.map(a => [a.id, a.email]))
      return reply.send(comments.map(c => ({ ...c, authorEmail: authorMap.get(c.authorId) ?? null })))
    },
  )

  // POST /api/groups/:groupId/feed/:feedItemId/comments
  fastify.post<{ Params: FP }>(
    '/:groupId/feed/:feedItemId/comments',
    { onRequest: [fastify.authenticate], preHandler: [mw()] },
    async (req, reply) => {
      const parsed = AddCommentBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Ogiltig inmatning' })
      }
      const comment = await db.feedComment.create({
        data: {
          feedItemId: req.params.feedItemId,
          authorId: req.tenant.userId,
          body: parsed.data.body,
        },
      })
      fastify.io.to(`room:${req.params.groupId}`).emit('feed:comment', comment)
      return reply.code(201).send(comment)
    },
  )
}
