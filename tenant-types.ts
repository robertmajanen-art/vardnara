// =============================================================================
// packages/types/src/tenant.ts
// Shared types for tenant isolation — used across API, middleware, and tests
// =============================================================================

// Mirrors the Prisma Role enum exactly
export enum Role {
  LEAD = 'LEAD',
  SUPPORTER = 'SUPPORTER',
  OBSERVER = 'OBSERVER',
  EXTERNAL = 'EXTERNAL',
}

// Ordered by permission level — higher index = more permissions
const ROLE_HIERARCHY: Role[] = [
  Role.EXTERNAL,
  Role.OBSERVER,
  Role.SUPPORTER,
  Role.LEAD,
]

/**
 * Returns true if `userRole` has at least the permissions of `requiredRole`.
 * e.g. roleAtLeast(Role.LEAD, Role.SUPPORTER) === true
 */
export function roleAtLeast(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(requiredRole)
}

// The authenticated user payload decoded from JWT
export interface JwtPayload {
  sub: string        // userId
  email: string
  iat: number
  exp: number
}

// Membership record as returned from Prisma
export interface Membership {
  id: string
  userId: string
  groupId: string
  role: Role
  joinedAt: Date
}

// Attached to every request that passes tenant middleware
export interface TenantContext {
  groupId: string
  userId: string
  role: Role
  membership: Membership
}

// Minimal Prisma client interface — only the methods the middleware uses.
// Keeping this narrow makes it easy to mock in tests without importing Prisma.
export interface MembershipRepository {
  findUnique(args: {
    where: { userId_groupId: { userId: string; groupId: string } }
    select?: { id: boolean; userId: boolean; groupId: boolean; role: boolean; joinedAt: boolean }
  }): Promise<Membership | null>
}

// Feature flags — used by canUseFeature() helper
export type Feature =
  | 'EXPORT_PDF'
  | 'EXPORT_CSV'
  | 'CALENDAR_SYNC'
  | 'EXTERNAL_INVITE'
  | 'UNLIMITED_GROUPS'
  | 'BANKID_AUTH'

export type Plan = 'FREE' | 'PRO'

export interface CareGroupPlan {
  groupId: string
  plan: Plan
}

export interface PlanRepository {
  findUnique(args: {
    where: { id: string }
    select: { plan: boolean }
  }): Promise<{ plan: Plan } | null>
}

// Fastify augmentations — extend FastifyRequest with tenant context and JWT user
declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload | Record<string, unknown>
    tenant: TenantContext
  }
}
