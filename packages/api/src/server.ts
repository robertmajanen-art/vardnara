import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import fastifyCookie from '@fastify/cookie'

import prismaPlugin from './plugins/prisma'
import mailerPlugin from './plugins/mailer'
import { authRoutes } from './auth/routes'

const server = Fastify({ logger: true })

// --- Core plugins ---

await server.register(fastifyCors, {
  origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
  credentials: true,
})

await server.register(fastifyCookie)

await server.register(fastifyJwt, {
  secret: process.env['JWT_SECRET'] ?? (() => { throw new Error('JWT_SECRET is required') })(),
})

// Decorate with authenticate hook so route handlers can use { onRequest: [fastify.authenticate] }
server.decorate('authenticate', async function (request: Parameters<typeof server.authenticate>[0], reply: Parameters<typeof server.authenticate>[1]) {
  try {
    await request.jwtVerify()
  } catch {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Autentisering krävs' })
  }
})

// --- App plugins ---

await server.register(prismaPlugin)
await server.register(mailerPlugin)

// --- Routes ---

await server.register(authRoutes, { prefix: '/api/auth' })

server.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }))

// --- Start ---

const port = Number(process.env['PORT'] ?? 4000)
await server.listen({ port, host: '0.0.0.0' })
