import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Server } from 'socket.io'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>
    io: Server
  }
}
