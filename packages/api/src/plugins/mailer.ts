import fp from 'fastify-plugin'
import nodemailer from 'nodemailer'
import type { FastifyPluginAsync } from 'fastify'

export interface Mailer {
  sendVerificationEmail(to: string, token: string): Promise<void>
  sendInviteEmail(to: string, inviteToken: string, groupName: string): Promise<void>
}

declare module 'fastify' {
  interface FastifyInstance {
    mailer: Mailer
  }
}

const mailerPlugin: FastifyPluginAsync = async (fastify) => {
  const host = process.env['SMTP_HOST']
  const user = process.env['SMTP_USER']
  const pass = process.env['SMTP_PASS']
  const baseUrl = process.env['BASE_URL'] ?? 'http://localhost:3000'

  const transport = host && user && pass
    ? nodemailer.createTransport({ host, auth: { user, pass } })
    : null

  const mailer: Mailer = {
    async sendVerificationEmail(to, token) {
      const link = `${baseUrl}/api/auth/verify-email?token=${token}`
      if (!transport) {
        fastify.log.info({ to, link }, '[mailer] Email verification link (SMTP not configured)')
        return
      }
      await transport.sendMail({
        from: `"VårdNära" <${user}>`,
        to,
        subject: 'Verifiera din e-postadress',
        text: `Klicka på länken för att verifiera din e-postadress:\n\n${link}`,
        html: `<p>Klicka på länken för att verifiera din e-postadress:</p><p><a href="${link}">${link}</a></p>`,
      })
    },
    async sendInviteEmail(to, inviteToken, groupName) {
      const link = `${baseUrl}/invite/${inviteToken}`
      if (!transport) {
        fastify.log.info({ to, link }, `[mailer] Invite link for ${groupName}`)
        return
      }
      await transport.sendMail({
        from: `"VårdNära" <${user}>`,
        to,
        subject: `Du har bjudits in till ${groupName}`,
        text: `Du har bjudits in att delta i omsorgsgruppen "${groupName}".\n\nAcceptera inbjudan här:\n${link}`,
        html: `<p>Du har bjudits in att delta i omsorgsgruppen "<strong>${groupName}</strong>".</p><p><a href="${link}">Acceptera inbjudan</a></p>`,
      })
    },
  }

  fastify.decorate('mailer', mailer)
}

export default fp(mailerPlugin, { name: 'mailer' })
