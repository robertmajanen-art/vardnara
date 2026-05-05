import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { EmailPasswordProvider } from './email-password'

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Lösenordet måste vara minst 8 tecken'),
})

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string(),
  totpCode: z.string().optional(),
})

const TotpEnableBody = z.object({
  code: z.string().length(6),
})

const REFRESH_COOKIE = 'refresh_token'
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax' as const,
  path: '/api/auth',
  maxAge: 30 * 24 * 60 * 60,
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const provider = new EmailPasswordProvider(
    fastify.prisma,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (payload: any, opts?: any) => fastify.jwt.sign(payload, opts),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (token: string) => fastify.jwt.verify(token) as any,
  )

  // POST /api/auth/register — US-01
  fastify.post('/register', async (request, reply) => {
    const parsed = RegisterBody.safeParse(request.body)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Ogiltig inmatning'
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message })
    }

    try {
      const { email, emailVerifyToken } = await provider.register(
        parsed.data.email,
        parsed.data.password,
      )
      // Send verification email in background — don't block the response
      fastify.mailer.sendVerificationEmail(email, emailVerifyToken).catch((err) =>
        fastify.log.warn({ err }, '[register] Failed to send verification email'),
      )
      // Issue tokens so the user is logged in immediately after registration
      const { accessToken, refreshToken } = await provider.login({
        email: parsed.data.email,
        password: parsed.data.password,
      })
      reply.setCookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS)
      return reply.code(201).send({ accessToken, refreshToken })
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'EMAIL_TAKEN') {
        return reply.code(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'E-postadressen är redan registrerad',
        })
      }
      throw err
    }
  })

  // POST /api/auth/login — US-01 + US-02
  fastify.post('/login', async (request, reply) => {
    const parsed = LoginBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Ogiltig e-postadress eller lösenord',
      })
    }

    try {
      const { accessToken, refreshToken } = await provider.login({
        email: parsed.data.email,
        password: parsed.data.password,
      })

      reply.setCookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS)
      return reply.send({ accessToken })
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Felaktig e-postadress eller lösenord',
        })
      }
      throw err
    }
  })

  // POST /api/auth/refresh — US-02
  fastify.post('/refresh', async (request, reply) => {
    const rawToken = (request.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]
    if (!rawToken) {
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Ingen aktiv session',
      })
    }

    try {
      const { accessToken, refreshToken } = await provider.refreshTokens(rawToken)
      reply.setCookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS)
      return reply.send({ accessToken })
    } catch {
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Sessionen har löpt ut, logga in igen',
      })
    }
  })

  // POST /api/auth/logout
  fastify.post('/logout', async (request, reply) => {
    const rawToken = (request.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]
    if (rawToken) await provider.logout(rawToken)
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
    return reply.send({ message: 'Utloggad' })
  })

  // GET /api/auth/verify-email
  fastify.get('/verify-email', async (request, reply) => {
    const { token } = request.query as Record<string, string | undefined>
    if (!token) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Verifieringstoken saknas',
      })
    }
    try {
      await provider.verifyEmail(token)
      return reply.send({ message: 'E-postadressen är verifierad' })
    } catch {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Ogiltig eller utgången verifieringstoken',
      })
    }
  })

  // POST /api/auth/totp/setup — authenticated, returns secret + otpauth URL
  fastify.post('/totp/setup', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub
    const result = await provider.setupTotp(userId)
    return reply.send(result)
  })

  // POST /api/auth/totp/enable — authenticated, verifies code and activates 2FA
  fastify.post('/totp/enable', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsed = TotpEnableBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Ogiltig kod' })
    }

    const userId = (request.user as { sub: string }).sub
    try {
      await provider.enableTotp(userId, parsed.data.code)
      return reply.send({ message: 'Tvåfaktorsautentisering aktiverad' })
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'INVALID_TOTP_CODE') {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Felaktig kod, försök igen',
        })
      }
      throw err
    }
  })
}
