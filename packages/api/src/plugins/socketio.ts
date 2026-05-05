import fp from 'fastify-plugin'
import { Server } from 'socket.io'

export default fp(async (fastify) => {
  const io = new Server(fastify.server, {
    cors: {
      origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
      credentials: true,
    },
  })

  // Authenticate socket connections using JWT
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth['token'] as string | undefined
      if (token) {
        await fastify.jwt.verify(token)
      }
    } catch {
      // Allow unauthenticated connections (display screens use token param)
    }
    next()
  })

  fastify.decorate('io', io)
  fastify.addHook('onClose', () => { io.close() })
})
