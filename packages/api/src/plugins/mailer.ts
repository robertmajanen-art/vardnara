import fp from 'fastify-plugin'
import { Resend } from 'resend'
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
  const apiKey  = process.env['RESEND_API_KEY']
  const from    = process.env['RESEND_FROM'] ?? 'VårdNära <onboarding@resend.dev>'
  const baseUrl = process.env['BASE_URL'] ?? 'http://localhost:3000'

  const resend = apiKey ? new Resend(apiKey) : null

  const mailer: Mailer = {
    async sendVerificationEmail(to, token) {
      const link = `${baseUrl}/api/auth/verify-email?token=${token}`
      if (!resend) {
        fastify.log.info({ to, link }, '[mailer] Email verification link (RESEND_API_KEY not set)')
        return
      }
      await resend.emails.send({
        from,
        to,
        subject: 'Verifiera din e-postadress',
        html: `<p>Klicka på länken för att verifiera din e-postadress:</p>
               <p><a href="${link}">${link}</a></p>`,
      })
    },

    async sendInviteEmail(to, inviteToken, groupName) {
      const link = `${baseUrl}/invite/${inviteToken}`
      if (!resend) {
        fastify.log.info({ to, link }, `[mailer] Invite link for ${groupName} (RESEND_API_KEY not set)`)
        return
      }
      await resend.emails.send({
        from,
        to,
        subject: `Du har bjudits in till ${groupName}`,
        html: `<p>Du har bjudits in att delta i omsorgsgruppen "<strong>${groupName}</strong>".</p>
               <p><a href="${link}">Acceptera inbjudan</a></p>`,
      })
    },
  }

  fastify.decorate('mailer', mailer)
}

export default fp(mailerPlugin, { name: 'mailer' })
