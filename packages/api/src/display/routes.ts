import type { FastifyPluginAsync } from 'fastify'
import { tenantMiddleware } from '../middleware/tenant'
import { Role, type MembershipRepository } from '../types/index'
import { z } from 'zod'

type P = { groupId: string }
type DP = { groupId: string; tokenId: string }

const CreateDisplayTokenBody = z.object({
  label: z.string().min(1).max(100).default('Hemskärm'),
  lookaheadHours: z.number().int().min(1).max(72).default(24),
  volume: z.number().int().min(0).max(100).default(60),
})

const UpdateDisplayTokenBody = z.object({
  label: z.string().min(1).max(100).optional(),
  lookaheadHours: z.number().int().min(1).max(72).optional(),
  volume: z.number().int().min(0).max(100).optional(),
})

export const displayTokenRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.prisma
  const mwLead = () => tenantMiddleware(db.membership as unknown as MembershipRepository, Role.LEAD)

  // POST /api/groups/:groupId/display-tokens — LEAD only
  fastify.post<{ Params: P }>(
    '/:groupId/display-tokens',
    { onRequest: [fastify.authenticate], preHandler: [mwLead()] },
    async (req, reply) => {
      const parsed = CreateDisplayTokenBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Ogiltig inmatning' })
      }
      const displayToken = await db.displayToken.create({
        data: { groupId: req.params.groupId, ...parsed.data },
      })
      return reply.code(201).send(displayToken)
    },
  )

  // GET /api/groups/:groupId/display-tokens — LEAD only
  fastify.get<{ Params: P }>(
    '/:groupId/display-tokens',
    { onRequest: [fastify.authenticate], preHandler: [mwLead()] },
    async (req, reply) => {
      const tokens = await db.displayToken.findMany({
        where: { groupId: req.params.groupId },
        orderBy: { createdAt: 'asc' },
      })
      return reply.send(tokens)
    },
  )

  // PATCH /api/groups/:groupId/display-tokens/:tokenId — LEAD only
  fastify.patch<{ Params: DP }>(
    '/:groupId/display-tokens/:tokenId',
    { onRequest: [fastify.authenticate], preHandler: [mwLead()] },
    async (req, reply) => {
      const parsed = UpdateDisplayTokenBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Ogiltig inmatning' })
      }
      const displayToken = await db.displayToken.update({
        where: { id: req.params.tokenId, groupId: req.params.groupId },
        data: parsed.data,
      })
      return reply.send(displayToken)
    },
  )

  // DELETE /api/groups/:groupId/display-tokens/:tokenId — LEAD only
  fastify.delete<{ Params: DP }>(
    '/:groupId/display-tokens/:tokenId',
    { onRequest: [fastify.authenticate], preHandler: [mwLead()] },
    async (req, reply) => {
      await db.displayToken.update({
        where: { id: req.params.tokenId, groupId: req.params.groupId },
        data: { revokedAt: new Date(), isActive: false },
      })
      return reply.code(204).send()
    },
  )
}

// Public display route — no authentication, uses token from query string
export const publicDisplayRoute: FastifyPluginAsync = async (fastify) => {
  const db = fastify.prisma

  // GET /api/display/:token?from=ISO&to=ISO
  // The client should pass its LOCAL day boundaries (midnight..23:59:59 in local time, as UTC ISO
  // strings) so that the appointment filter matches the calendar's day boundary exactly.
  fastify.get<{ Params: { token: string }; Querystring: { from?: string; to?: string } }>(
    '/:token',
    async (req, reply) => {
      const displayToken = await db.displayToken.findUnique({
        where: { token: req.params.token },
      })
      if (!displayToken || !displayToken.isActive || displayToken.revokedAt) {
        return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Ogiltig skärmtoken' })
      }

      // Update lastSeenAt
      await db.displayToken.update({
        where: { id: displayToken.id },
        data: { lastSeenAt: new Date() },
      })

      const now = new Date()
      // Prefer client-supplied day boundaries (local midnight as UTC ISO) so the filter
      // agrees with the calendar's local-time day grouping regardless of server timezone.
      // Fall back to server UTC midnight if the client doesn't supply them.
      const { from: fromParam, to: toParam } = req.query
      const startOfToday = (fromParam && !isNaN(Date.parse(fromParam)))
        ? new Date(fromParam)
        : (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d })()
      const endOfToday = (toParam && !isNaN(Date.parse(toParam)))
        ? new Date(toParam)
        : (() => { const d = new Date(now); d.setHours(23, 59, 59, 999); return d })()

      const [appointments, recurringTasks] = await Promise.all([
        db.appointment.findMany({
          where: {
            groupId: displayToken.groupId,
            startTime: { gte: startOfToday, lte: endOfToday },
          },
          include: {
            assignee: { select: { id: true, email: true } },
          },
          orderBy: { startTime: 'asc' },
        }),
        db.recurringTask.findMany({
          where: { groupId: displayToken.groupId, isActive: true, showOnDisplay: true },
          orderBy: [{ displayOrder: 'asc' }, { scheduledTime: 'asc' }],
        }),
      ])

      return reply.send({
        groupId: displayToken.groupId,
        label: displayToken.label,
        volume: displayToken.volume,
        appointments,
        recurringTasks,
        serverTime: now.toISOString(),
      })
    },
  )
}
