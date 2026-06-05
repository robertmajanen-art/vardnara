// ── Email / SMTP configuration routes (LEAD only) ────────────────────────────
// GET/PUT /api/groups/:groupId/email-config
// POST    /api/groups/:groupId/email-config/test

import type { FastifyPluginAsync } from 'fastify'
import { tenantMiddleware } from '../middleware/tenant'
import { Role, type MembershipRepository } from '../types/index'
import { z } from 'zod'
import nodemailer from 'nodemailer'

type P = { groupId: string }

const EmailConfigBody = z.object({
  provider: z.enum(['gmail', 'office365', 'custom']),
  host: z.string().min(1, 'SMTP-server krävs'),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().min(1, 'Användarnamn krävs'),
  /** Optional — if omitted the server keeps the existing password */
  password: z.string().optional(),
  fromName: z.string().default('VårdNära'),
})

export const emailConfigRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.prisma
  const mwLead = () =>
    tenantMiddleware(db.membership as unknown as MembershipRepository, Role.LEAD)

  // ── GET /api/groups/:groupId/email-config ────────────────────────────────
  // Returns the config with password masked. If none exists returns null.
  fastify.get<{ Params: P }>(
    '/:groupId/email-config',
    { onRequest: [fastify.authenticate], preHandler: [mwLead()] },
    async (req, reply) => {
      const config = await db.emailConfig.findUnique({
        where: { groupId: req.params.groupId },
      })
      if (!config) return reply.send(null)
      // Never return the real password to the client
      return reply.send({ ...config, password: '', hasPassword: config.password.length > 0 })
    },
  )

  // ── PUT /api/groups/:groupId/email-config ────────────────────────────────
  // Creates or replaces the SMTP config. Password is optional — if omitted the
  // existing password is preserved.
  fastify.put<{ Params: P }>(
    '/:groupId/email-config',
    { onRequest: [fastify.authenticate], preHandler: [mwLead()] },
    async (req, reply) => {
      const parsed = EmailConfigBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues[0]?.message ?? 'Ogiltig inmatning',
        })
      }

      const { password, ...rest } = parsed.data

      // Fetch existing config to preserve password if caller didn't send a new one
      const existing = await db.emailConfig.findUnique({
        where: { groupId: req.params.groupId },
        select: { password: true },
      })

      const resolvedPassword =
        password && password.length > 0
          ? password
          : (existing?.password ?? '')

      const config = await db.emailConfig.upsert({
        where: { groupId: req.params.groupId },
        create: {
          groupId: req.params.groupId,
          ...rest,
          password: resolvedPassword,
        },
        update: {
          ...rest,
          ...(password && password.length > 0 ? { password } : {}),
        },
      })

      return reply.send({ ...config, password: '', hasPassword: config.password.length > 0 })
    },
  )

  // ── POST /api/groups/:groupId/email-config/test ──────────────────────────
  // Verifies the SMTP connection and sends a test email to the configured address.
  fastify.post<{ Params: P }>(
    '/:groupId/email-config/test',
    { onRequest: [fastify.authenticate], preHandler: [mwLead()] },
    async (req, reply) => {
      const config = await db.emailConfig.findUnique({
        where: { groupId: req.params.groupId },
      })
      if (!config || !config.host || !config.username || !config.password) {
        return reply
          .code(400)
          .send({ ok: false, message: 'Ingen fullständig e-postkonfiguration hittad. Spara konfigurationen först.' })
      }

      try {
        const transport = nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: { user: config.username, pass: config.password },
        })
        await transport.verify()
        await transport.sendMail({
          from: `"${config.fromName || 'VårdNära'}" <${config.username}>`,
          to: config.username,
          subject: 'VårdNära — e-postkonfiguration verifierad',
          html: '<p>Din SMTP-konfiguration fungerar korrekt. Kalenderinbjudningar kommer nu att skickas automatiskt.</p>',
        })
        return reply.send({ ok: true, message: 'Testmail skickat till ' + config.username })
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Anslutning misslyckades — kontrollera inställningarna'
        return reply.code(400).send({ ok: false, message })
      }
    },
  )

  // ── DELETE /api/groups/:groupId/email-config ─────────────────────────────
  fastify.delete<{ Params: P }>(
    '/:groupId/email-config',
    { onRequest: [fastify.authenticate], preHandler: [mwLead()] },
    async (req, reply) => {
      await db.emailConfig.deleteMany({ where: { groupId: req.params.groupId } })
      return reply.code(204).send()
    },
  )
}
