import type { FastifyPluginAsync } from 'fastify'
import { tenantMiddleware, requireRole } from '../middleware/tenant'
import { Role, type MembershipRepository } from '../types/index'
import {
  CreateGroupBody,
  UpdateGroupBody,
  CreateInviteBody,
  UpdateMemberRoleBody,
} from './schemas'

type Params = { groupId: string }
type MemberParams = { groupId: string; memberId: string }
type InviteParams = { groupId: string; inviteId: string }

export const groupRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.prisma

  // ── Care group CRUD ────────────────────────────────────────────────────────

  // POST /api/groups — create group; calling user becomes LEAD
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const parsed = CreateGroupBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: parsed.error.issues[0]?.message ?? 'Ogiltig inmatning',
      })
    }

    const { name, recipientName, recipientDob, careType } = parsed.data
    const group = await db.careGroup.create({
      data: {
        name,
        recipientName,
        recipientDob: recipientDob ? new Date(recipientDob) : undefined,
        careType,
        members: { create: { userId, role: 'LEAD' } },
      },
    })

    return reply.code(201).send(group)
  })

  // GET /api/groups — list all groups the current user belongs to
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const memberships = await db.membership.findMany({
      where: { userId },
      include: {
        group: {
          include: { _count: { select: { members: true } } },
        },
      },
      orderBy: { joinedAt: 'desc' },
    })
    return reply.send(memberships.map((m) => ({ ...m.group, myRole: m.role })))
  })

  // GET /api/groups/:groupId
  fastify.get<{ Params: Params }>(
    '/:groupId',
    { onRequest: [fastify.authenticate], preHandler: [tenantMiddleware(db.membership as unknown as MembershipRepository)] },
    async (req, reply) => {
      const group = await db.careGroup.findUniqueOrThrow({
        where: { id: req.params.groupId },
        include: {
          _count: { select: { appointments: true, tasks: true, journalEntries: true } },
        },
      })
      return reply.send({ ...group, myRole: req.tenant.role })
    },
  )

  // PATCH /api/groups/:groupId — LEAD only
  fastify.patch<{ Params: Params }>(
    '/:groupId',
    { onRequest: [fastify.authenticate], preHandler: [tenantMiddleware(db.membership as unknown as MembershipRepository, Role.LEAD)] },
    async (req, reply) => {
      const parsed = UpdateGroupBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues[0]?.message ?? 'Ogiltig inmatning',
        })
      }

      const { name, recipientName, careType, recipientDob } = parsed.data
      const group = await db.careGroup.update({
        where: { id: req.params.groupId },
        data: {
          ...(name !== undefined && { name }),
          ...(recipientName !== undefined && { recipientName }),
          ...(careType !== undefined && { careType }),
          ...(recipientDob !== undefined && {
            recipientDob: recipientDob ? new Date(recipientDob) : null,
          }),
        },
      })
      return reply.send(group)
    },
  )

  // DELETE /api/groups/:groupId — LEAD only
  fastify.delete<{ Params: Params }>(
    '/:groupId',
    { onRequest: [fastify.authenticate], preHandler: [tenantMiddleware(db.membership as unknown as MembershipRepository, Role.LEAD)] },
    async (req, reply) => {
      await db.careGroup.delete({ where: { id: req.params.groupId } })
      return reply.code(204).send()
    },
  )

  // ── Members ────────────────────────────────────────────────────────────────

  // GET /api/groups/:groupId/members
  fastify.get<{ Params: Params }>(
    '/:groupId/members',
    { onRequest: [fastify.authenticate], preHandler: [tenantMiddleware(db.membership as unknown as MembershipRepository)] },
    async (req, reply) => {
      const members = await db.membership.findMany({
        where: { groupId: req.params.groupId },
        include: {
          user: { select: { id: true, email: true, emailVerified: true, totpEnabled: true } },
        },
        orderBy: { joinedAt: 'asc' },
      })
      return reply.send(members)
    },
  )

  // PATCH /api/groups/:groupId/members/:memberId — change role (LEAD only)
  fastify.patch<{ Params: MemberParams }>(
    '/:groupId/members/:memberId',
    { onRequest: [fastify.authenticate], preHandler: [tenantMiddleware(db.membership as unknown as MembershipRepository, Role.LEAD)] },
    async (req, reply) => {
      const { groupId, memberId } = req.params
      const parsed = UpdateMemberRoleBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Ogiltig roll' })
      }

      const existing = await db.membership.findUnique({
        where: { userId_groupId: { userId: memberId, groupId } },
      })
      if (!existing) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Medlemmen hittades inte' })
      }

      const updated = await db.membership.update({
        where: { userId_groupId: { userId: memberId, groupId } },
        data: { role: parsed.data.role },
      })
      return reply.send(updated)
    },
  )

  // DELETE /api/groups/:groupId/members/:memberId — remove member (LEAD only)
  fastify.delete<{ Params: MemberParams }>(
    '/:groupId/members/:memberId',
    { onRequest: [fastify.authenticate], preHandler: [tenantMiddleware(db.membership as unknown as MembershipRepository, Role.LEAD)] },
    async (req, reply) => {
      const { groupId, memberId } = req.params

      const [leadCount, target] = await Promise.all([
        db.membership.count({ where: { groupId, role: 'LEAD' } }),
        db.membership.findUnique({ where: { userId_groupId: { userId: memberId, groupId } } }),
      ])

      if (!target) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Medlemmen hittades inte' })
      }

      if (target.role === 'LEAD' && leadCount <= 1) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Kan inte ta bort den sista samordnaren',
        })
      }

      await db.membership.delete({ where: { userId_groupId: { userId: memberId, groupId } } })
      return reply.code(204).send()
    },
  )

  // ── Invites ────────────────────────────────────────────────────────────────

  // POST /api/groups/:groupId/invites — send invite (LEAD only)
  fastify.post<{ Params: Params }>(
    '/:groupId/invites',
    { onRequest: [fastify.authenticate], preHandler: [tenantMiddleware(db.membership as unknown as MembershipRepository, Role.LEAD)] },
    async (req, reply) => {
      const { groupId } = req.params
      const parsed = CreateInviteBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues[0]?.message ?? 'Ogiltig inmatning',
        })
      }

      const group = await db.careGroup.findUniqueOrThrow({
        where: { id: groupId },
        select: { name: true },
      })

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      const invite = await db.invite.create({
        data: {
          groupId,
          invitedById: req.tenant.userId,
          email: parsed.data.email,
          phone: parsed.data.phone,
          role: parsed.data.role,
          expiresAt,
        },
      })

      if (invite.email) {
        await fastify.mailer.sendInviteEmail(invite.email, invite.token, group.name)
      } else if (invite.phone) {
        // SMS provider not configured — log token so dev can test manually
        req.log.info(
          { phone: invite.phone, token: invite.token, group: group.name },
          '[sms] Invite link (SMS not configured)',
        )
      }

      return reply.code(201).send(invite)
    },
  )

  // GET /api/groups/:groupId/invites — list invites (LEAD only)
  fastify.get<{ Params: Params }>(
    '/:groupId/invites',
    { onRequest: [fastify.authenticate], preHandler: [tenantMiddleware(db.membership as unknown as MembershipRepository, Role.LEAD)] },
    async (req, reply) => {
      const invites = await db.invite.findMany({
        where: { groupId: req.params.groupId },
        orderBy: { createdAt: 'desc' },
      })
      return reply.send(invites)
    },
  )

  // POST /api/groups/:groupId/invites/:inviteId/resend — resend invite email (LEAD only)
  fastify.post<{ Params: InviteParams }>(
    '/:groupId/invites/:inviteId/resend',
    { onRequest: [fastify.authenticate], preHandler: [tenantMiddleware(db.membership as unknown as MembershipRepository, Role.LEAD)] },
    async (req, reply) => {
      const { groupId, inviteId } = req.params

      const invite = await db.invite.findUnique({
        where: { id: inviteId, groupId },
        select: { id: true, email: true, token: true, status: true, expiresAt: true },
      })

      if (!invite) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Inbjudan hittades inte' })
      }
      if (invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
        return reply.code(410).send({ statusCode: 410, error: 'Gone', message: 'Inbjudan är inte längre giltig' })
      }
      if (!invite.email) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Inbjudan saknar e-postadress' })
      }

      const group = await db.careGroup.findUniqueOrThrow({
        where: { id: groupId },
        select: { name: true },
      })

      await fastify.mailer.sendInviteEmail(invite.email, invite.token, group.name)
      return reply.code(204).send()
    },
  )

  // DELETE /api/groups/:groupId/invites/:inviteId — revoke invite (LEAD only)
  fastify.delete<{ Params: InviteParams }>(
    '/:groupId/invites/:inviteId',
    { onRequest: [fastify.authenticate], preHandler: [tenantMiddleware(db.membership as unknown as MembershipRepository, Role.LEAD)] },
    async (req, reply) => {
      const { groupId, inviteId } = req.params
      await db.invite.update({
        where: { id: inviteId, groupId },
        data: { status: 'REVOKED' },
      })
      return reply.code(204).send()
    },
  )
}
