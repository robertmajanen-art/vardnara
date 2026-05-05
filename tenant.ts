// =============================================================================
// packages/api/src/middleware/tenant.ts
//
// Tenant isolation middleware for Fastify.
//
// Responsibilities:
//   1. Extract groupId from request (path param, body, or query)
//   2. Verify the authenticated user has a Membership row for that groupId
//   3. Attach TenantContext (groupId, userId, role, membership) to request
//   4. Optionally enforce a minimum role requirement
//
// Usage — apply to all routes under /api/groups/:groupId/*:
//
//   fastify.addHook('preHandler', tenantMiddleware(prisma.membership))
//
// Or with minimum role enforcement:
//
//   fastify.addHook('preHandler', tenantMiddleware(prisma.membership, Role.LEAD))
//
// Or as a one-off per route:
//
//   { preHandler: [tenantMiddleware(prisma.membership, Role.SUPPORTER)] }
// =============================================================================

import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify'
import {
  MembershipRepository,
  Role,
  TenantContext,
  roleAtLeast,
} from '../types/index'

// ---------------------------------------------------------------------------
// Error helpers — return structured JSON errors matching the API error format
// ---------------------------------------------------------------------------

function unauthorized(reply: FastifyReply, message: string): void {
  reply.code(401).send({
    statusCode: 401,
    error: 'Unauthorized',
    message,
  })
}

function forbidden(reply: FastifyReply, message: string): void {
  reply.code(403).send({
    statusCode: 403,
    error: 'Forbidden',
    message,
  })
}

function badRequest(reply: FastifyReply, message: string): void {
  reply.code(400).send({
    statusCode: 400,
    error: 'Bad Request',
    message,
  })
}

// ---------------------------------------------------------------------------
// groupId extraction — checks path params first, then body, then query
// ---------------------------------------------------------------------------

function extractGroupId(request: FastifyRequest): string | undefined {
  // Most routes: /api/groups/:groupId/...
  const params = request.params as Record<string, string>
  if (params?.groupId) return params.groupId

  // Fallback: body field (e.g. POST endpoints that include groupId in body)
  const body = request.body as Record<string, unknown> | undefined
  if (typeof body?.groupId === 'string' && body.groupId) return body.groupId

  // Last resort: query param (e.g. display token routes)
  const query = request.query as Record<string, string>
  if (query?.groupId) return query.groupId

  return undefined
}

// ---------------------------------------------------------------------------
// Core middleware factory
// ---------------------------------------------------------------------------

/**
 * Creates a Fastify preHandler hook that:
 *   - Resolves groupId from the request
 *   - Verifies the JWT-authenticated user is a member of that group
 *   - Optionally enforces a minimum role
 *   - Attaches `request.tenant` with full context
 *
 * @param membershipRepo  Prisma membership repository (or mock in tests)
 * @param minimumRole     Optional minimum role required. Defaults to OBSERVER
 *                        (any member can access). Pass Role.LEAD to restrict
 *                        to lead caregivers only.
 */
export function tenantMiddleware(
  membershipRepo: MembershipRepository,
  minimumRole: Role = Role.OBSERVER,
) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // 1. Require authenticated user (JWT must already be verified upstream)
    const jwtUser = request.user as { sub?: string } | undefined
    if (!jwtUser?.sub) {
      return unauthorized(reply, 'Authentication required')
    }
    const userId = jwtUser.sub

    // 2. Resolve groupId
    const groupId = extractGroupId(request)
    if (!groupId) {
      return badRequest(reply, 'groupId is required')
    }

    // 3. Look up membership — this is the single tenant isolation check
    let membership
    try {
      membership = await membershipRepo.findUnique({
        where: { userId_groupId: { userId, groupId } },
        select: { id: true, userId: true, groupId: true, role: true, joinedAt: true },
      })
    } catch (err) {
      request.log?.error({ err, userId, groupId }, 'Membership lookup failed')
      reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Failed to verify group membership',
      })
      return
    }

    if (!membership) {
      // Return 403 not 404 — don't reveal whether the group exists to non-members
      return forbidden(reply, 'You are not a member of this care group')
    }

    // 4. Enforce minimum role
    if (!roleAtLeast(membership.role, minimumRole)) {
      return forbidden(
        reply,
        `This action requires the ${minimumRole} role or higher`,
      )
    }

    // 5. Attach tenant context — available as request.tenant in all handlers
    const tenantContext: TenantContext = {
      groupId,
      userId,
      role: membership.role,
      membership,
    }
    request.tenant = tenantContext
  }
}

// ---------------------------------------------------------------------------
// Role guard helper — use inside route handlers for per-action checks
// ---------------------------------------------------------------------------

/**
 * Throws a 403 if the request's tenant role is below the required minimum.
 * Use this inside route handlers for fine-grained action-level checks,
 * as opposed to the route-level middleware.
 *
 * @example
 *   fastify.delete('/appointments/:id', async (request, reply) => {
 *     requireRole(request, reply, Role.LEAD)  // only leads can delete
 *     ...
 *   })
 */
export function requireRole(
  request: FastifyRequest,
  reply: FastifyReply,
  minimumRole: Role,
): boolean {
  if (!request.tenant) {
    unauthorized(reply, 'Authentication required')
    return false
  }
  if (!roleAtLeast(request.tenant.role, minimumRole)) {
    forbidden(reply, `This action requires the ${minimumRole} role or higher`)
    return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Feature gate helper — checks tenant plan before allowing access
// ---------------------------------------------------------------------------

import { Feature, Plan, PlanRepository } from '../types/index'

const PRO_FEATURES: Feature[] = [
  'EXPORT_PDF',
  'EXPORT_CSV',
  'CALENDAR_SYNC',
  'EXTERNAL_INVITE',
  'UNLIMITED_GROUPS',
  'BANKID_AUTH',
]

/**
 * Returns true if the care group's plan includes the requested feature.
 * All features are available on PRO. FREE tier has limited access.
 *
 * @example
 *   if (!(await canUseFeature(request, reply, planRepo, 'EXPORT_PDF'))) return
 */
export async function canUseFeature(
  request: FastifyRequest,
  reply: FastifyReply,
  planRepo: PlanRepository,
  feature: Feature,
): Promise<boolean> {
  const { groupId } = request.tenant

  let result: { plan: Plan } | null
  try {
    result = await planRepo.findUnique({
      where: { id: groupId },
      select: { plan: true },
    })
  } catch (err) {
    request.log?.error({ err, groupId, feature }, 'Plan lookup failed')
    reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to verify plan',
    })
    return false
  }

  if (!result) {
    forbidden(reply, 'Care group not found')
    return false
  }

  if (result.plan === 'FREE' && PRO_FEATURES.includes(feature)) {
    reply.code(402).send({
      statusCode: 402,
      error: 'Payment Required',
      message: `Feature '${feature}' requires the Pro plan`,
      upgradeUrl: '/settings/plan',
    })
    return false
  }

  return true
}
