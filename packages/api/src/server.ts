import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import fastifyCookie from '@fastify/cookie'
import fastifyMultipart from '@fastify/multipart'

import prismaPlugin from './plugins/prisma'
import mailerPlugin from './plugins/mailer'
import socketioPlugin from './plugins/socketio'
import { authRoutes } from './auth/routes'
import { groupRoutes } from './groups/routes'
import { inviteRoutes } from './invite/routes'
import { voiceRoutes } from './voice/routes'
import { voiceParseFormRoute } from './voice/parse-form'
import { appointmentRoutes } from './appointments/routes'
import { taskRoutes } from './tasks/routes'
import { recurringTaskRoutes } from './recurring-tasks/routes'
import { feedRoutes } from './feed/routes'
import { displayTokenRoutes, publicDisplayRoute } from './display/routes'
import { journalRoutes } from './journal/routes'
import { expenseRoutes } from './expenses/routes'
import { startAlarmCron } from './jobs/alarmCron'

console.log('[startup] Fastify init')
const server = Fastify({ logger: true })

// ── Core plugins ──────────────────────────────────────────────────────────────

await server.register(fastifyCors, {
  origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
  credentials: true,
})

await server.register(fastifyCookie)

await server.register(fastifyMultipart, {
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — Whisper limit
})

const jwtSecret = process.env['JWT_SECRET']
if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required')

await server.register(fastifyJwt, { secret: jwtSecret })

// authenticate decorator — use as { onRequest: [fastify.authenticate] }
server.decorate(
  'authenticate',
  async function (request: Parameters<typeof server.authenticate>[0], reply: Parameters<typeof server.authenticate>[1]) {
    try {
      await request.jwtVerify()
    } catch {
      reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Autentisering krävs' })
    }
  },
)

// ── App plugins ───────────────────────────────────────────────────────────────

console.log('[startup] registering prismaPlugin')
await server.register(prismaPlugin)
console.log('[startup] registering mailerPlugin')
await server.register(mailerPlugin)
console.log('[startup] registering socketioPlugin')
await server.register(socketioPlugin)

// ── Routes ────────────────────────────────────────────────────────────────────

console.log('[startup] registering routes')
await server.register(authRoutes, { prefix: '/api/auth' })
await server.register(groupRoutes, { prefix: '/api/groups' })
await server.register(inviteRoutes, { prefix: '/api/invite' })
await server.register(voiceRoutes, { prefix: '/api/voice' })
await server.register(voiceParseFormRoute, { prefix: '/api/voice' })
await server.register(appointmentRoutes, { prefix: '/api/groups' })
await server.register(taskRoutes, { prefix: '/api/groups' })
await server.register(recurringTaskRoutes, { prefix: '/api/groups' })
await server.register(feedRoutes, { prefix: '/api/groups' })
await server.register(displayTokenRoutes, { prefix: '/api/groups' })
await server.register(publicDisplayRoute, { prefix: '/api/display' })
await server.register(journalRoutes, { prefix: '/api/groups' })
await server.register(expenseRoutes, { prefix: '/api/groups' })

server.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }))

// ── Background jobs ───────────────────────────────────────────────────────────

console.log('[startup] starting alarm cron')
startAlarmCron(server.prisma, server.io)

// ── Start ─────────────────────────────────────────────────────────────────────

const port = Number(process.env['PORT'] ?? 4000)
console.log(`[startup] listening on port ${port}`)
await server.listen({ port, host: '0.0.0.0' })
