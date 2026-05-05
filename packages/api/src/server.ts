import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'

const server = Fastify({ logger: true })

await server.register(fastifyCors, {
  origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
  credentials: true,
})

await server.register(fastifyJwt, {
  secret: process.env['JWT_SECRET'] ?? 'change-me',
})

server.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }))

const port = Number(process.env['PORT'] ?? 4000)
await server.listen({ port, host: '0.0.0.0' })
