import type { JwtPayload } from '@vardnara/types'

// Tell @fastify/jwt to use the same user type as tenant.ts declares,
// so both module augmentations on FastifyRequest.user agree.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: JwtPayload | Record<string, unknown>
  }
}
