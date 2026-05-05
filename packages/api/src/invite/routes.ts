import type { FastifyPluginAsync } from 'fastify'

// Public + authenticated invite acceptance routes — no group membership required
export const inviteRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.prisma

  // GET /api/invite/:token — public: let the user see what they've been invited to
  fastify.get<{ Params: { token: string } }>('/:token', async (req, reply) => {
    const invite = await db.invite.findUnique({
      where: { token: req.params.token },
      select: {
        id: true,
        role: true,
        status: true,
        expiresAt: true,
        email: true,
        group: { select: { id: true, name: true, recipientName: true, careType: true } },
        invitedBy: { select: { email: true } },
      },
    })

    if (!invite) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Inbjudan hittades inte' })
    }
    if (invite.status !== 'PENDING') {
      return reply.code(410).send({ statusCode: 410, error: 'Gone', message: 'Inbjudan är inte längre giltig' })
    }
    if (invite.expiresAt < new Date()) {
      return reply.code(410).send({ statusCode: 410, error: 'Gone', message: 'Inbjudan har löpt ut' })
    }

    return reply.send(invite)
  })

  // POST /api/invite/:token/accept — authenticated: join the group
  fastify.post<{ Params: { token: string } }>(
    '/:token/accept',
    { onRequest: [fastify.authenticate] },
    async (req, reply) => {
      const userId = (req.user as { sub: string }).sub

      const invite = await db.invite.findUnique({
        where: { token: req.params.token },
        select: { id: true, groupId: true, role: true, status: true, expiresAt: true },
      })

      if (!invite) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Inbjudan hittades inte' })
      }
      if (invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
        return reply.code(410).send({ statusCode: 410, error: 'Gone', message: 'Inbjudan är inte längre giltig' })
      }

      // Already a member? Just accept silently
      const existing = await db.membership.findUnique({
        where: { userId_groupId: { userId, groupId: invite.groupId } },
      })

      if (!existing) {
        await db.membership.create({
          data: { userId, groupId: invite.groupId, role: invite.role },
        })
      }

      await db.invite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      })

      return reply.send({ groupId: invite.groupId, role: invite.role })
    },
  )
}
