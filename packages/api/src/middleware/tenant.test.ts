// =============================================================================
// packages/api/src/middleware/tenant.test.ts
//
// Full Jest test suite for tenant isolation middleware.
// Tests every access scenario: valid member, non-member, role enforcement,
// missing groupId, database errors, feature gating, and the role helpers.
// =============================================================================

import { FastifyRequest, FastifyReply } from 'fastify'
import {
  tenantMiddleware,
  requireRole,
  canUseFeature,
} from './tenant'
import {
  Role,
  roleAtLeast,
  MembershipRepository,
  PlanRepository,
  Membership,
  TenantContext,
} from '../types/index'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const GROUP_ID = 'group-uuid-001'
const USER_LEAD = 'user-uuid-lead'
const USER_SUPPORTER = 'user-uuid-supporter'
const USER_OBSERVER = 'user-uuid-observer'
const USER_EXTERNAL = 'user-uuid-external'
const USER_NON_MEMBER = 'user-uuid-stranger'

const MEMBERSHIPS: Record<string, Membership> = {
  [USER_LEAD]: {
    id: 'mem-001',
    userId: USER_LEAD,
    groupId: GROUP_ID,
    role: Role.LEAD,
    joinedAt: new Date('2024-01-01'),
  },
  [USER_SUPPORTER]: {
    id: 'mem-002',
    userId: USER_SUPPORTER,
    groupId: GROUP_ID,
    role: Role.SUPPORTER,
    joinedAt: new Date('2024-01-02'),
  },
  [USER_OBSERVER]: {
    id: 'mem-003',
    userId: USER_OBSERVER,
    groupId: GROUP_ID,
    role: Role.OBSERVER,
    joinedAt: new Date('2024-01-03'),
  },
  [USER_EXTERNAL]: {
    id: 'mem-004',
    userId: USER_EXTERNAL,
    groupId: GROUP_ID,
    role: Role.EXTERNAL,
    joinedAt: new Date('2024-01-04'),
  },
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/**
 * Creates a mock MembershipRepository that simulates Prisma behaviour.
 * Pass `shouldThrow: true` to simulate a database error.
 */
function makeMembershipRepo(opts: { shouldThrow?: boolean } = {}): MembershipRepository {
  return {
    findUnique: jest.fn(async ({ where }) => {
      if (opts.shouldThrow) throw new Error('Connection refused')
      const { userId, groupId } = where.userId_groupId
      if (groupId !== GROUP_ID) return null
      return MEMBERSHIPS[userId] ?? null
    }),
  }
}

function makePlanRepo(plan: 'FREE' | 'PRO' = 'FREE', shouldThrow = false): PlanRepository {
  return {
    findUnique: jest.fn(async ({ where }) => {
      if (shouldThrow) throw new Error('DB error')
      if (where.id !== GROUP_ID) return null
      return { plan }
    }),
  }
}

/**
 * Builds a minimal FastifyRequest mock.
 * `userId` goes into request.user.sub (as set by @fastify/jwt after verify).
 * `groupId` can come from params, body, or query.
 */
function makeRequest(opts: {
  userId?: string
  groupIdIn?: 'params' | 'body' | 'query' | 'none'
  groupId?: string
  existingTenant?: TenantContext
}): FastifyRequest {
  const {
    userId,
    groupIdIn = 'params',
    groupId = GROUP_ID,
    existingTenant,
  } = opts

  const params = groupIdIn === 'params' ? { groupId } : {}
  const body = groupIdIn === 'body' ? { groupId } : {}
  const query = groupIdIn === 'query' ? { groupId } : {}

  return {
    user: userId ? { sub: userId } : undefined,
    params,
    body,
    query,
    tenant: existingTenant,
    log: { error: jest.fn() },
  } as unknown as FastifyRequest
}

/**
 * Builds a FastifyReply mock that captures status code and payload.
 */
function makeReply(): FastifyReply & {
  _code: number | undefined
  _payload: unknown
} {
  const reply = {
    _code: undefined as number | undefined,
    _payload: undefined as unknown,
    code(n: number) {
      this._code = n
      return this
    },
    send(payload: unknown) {
      this._payload = payload
      return this
    },
  }
  return reply as unknown as FastifyReply & { _code: number | undefined; _payload: unknown }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Runs the middleware and returns the reply mock for assertions */
async function runMiddleware(
  request: FastifyRequest,
  repo: MembershipRepository,
  minimumRole?: Role,
) {
  const reply = makeReply()
  const middleware = tenantMiddleware(repo, minimumRole)
  await middleware(request, reply)
  return { request, reply }
}

// ===========================================================================
// TESTS
// ===========================================================================

describe('roleAtLeast()', () => {
  it('returns true when role equals required role', () => {
    expect(roleAtLeast(Role.LEAD, Role.LEAD)).toBe(true)
    expect(roleAtLeast(Role.SUPPORTER, Role.SUPPORTER)).toBe(true)
    expect(roleAtLeast(Role.OBSERVER, Role.OBSERVER)).toBe(true)
    expect(roleAtLeast(Role.EXTERNAL, Role.EXTERNAL)).toBe(true)
  })

  it('returns true when role is above required role', () => {
    expect(roleAtLeast(Role.LEAD, Role.SUPPORTER)).toBe(true)
    expect(roleAtLeast(Role.LEAD, Role.OBSERVER)).toBe(true)
    expect(roleAtLeast(Role.LEAD, Role.EXTERNAL)).toBe(true)
    expect(roleAtLeast(Role.SUPPORTER, Role.OBSERVER)).toBe(true)
    expect(roleAtLeast(Role.SUPPORTER, Role.EXTERNAL)).toBe(true)
    expect(roleAtLeast(Role.OBSERVER, Role.EXTERNAL)).toBe(true)
  })

  it('returns false when role is below required role', () => {
    expect(roleAtLeast(Role.OBSERVER, Role.LEAD)).toBe(false)
    expect(roleAtLeast(Role.OBSERVER, Role.SUPPORTER)).toBe(false)
    expect(roleAtLeast(Role.SUPPORTER, Role.LEAD)).toBe(false)
    expect(roleAtLeast(Role.EXTERNAL, Role.LEAD)).toBe(false)
    expect(roleAtLeast(Role.EXTERNAL, Role.OBSERVER)).toBe(false)
  })
})

// ---------------------------------------------------------------------------

describe('tenantMiddleware() — authentication', () => {
  it('returns 401 when no JWT user is present on request', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: undefined })
    const { reply } = await runMiddleware(request, repo)

    expect(reply._code).toBe(401)
    expect((reply._payload as any).error).toBe('Unauthorized')
    expect(repo.findUnique).not.toHaveBeenCalled()
  })

  it('returns 401 when JWT user has no sub field', async () => {
    const request = { user: { email: 'x@x.com' }, params: { groupId: GROUP_ID }, body: {}, query: {}, log: { error: jest.fn() } } as unknown as FastifyRequest
    const repo = makeMembershipRepo()
    const reply = makeReply()
    await tenantMiddleware(repo)(request, reply)

    expect(reply._code).toBe(401)
  })
})

// ---------------------------------------------------------------------------

describe('tenantMiddleware() — groupId extraction', () => {
  it('resolves groupId from path params (primary)', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: USER_LEAD, groupIdIn: 'params' })
    const { reply } = await runMiddleware(request, repo)

    expect(reply._code).toBeUndefined() // no error
    expect(request.tenant?.groupId).toBe(GROUP_ID)
  })

  it('resolves groupId from request body (fallback)', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: USER_LEAD, groupIdIn: 'body' })
    const { reply } = await runMiddleware(request, repo)

    expect(reply._code).toBeUndefined()
    expect(request.tenant?.groupId).toBe(GROUP_ID)
  })

  it('resolves groupId from query string (last resort)', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: USER_LEAD, groupIdIn: 'query' })
    const { reply } = await runMiddleware(request, repo)

    expect(reply._code).toBeUndefined()
    expect(request.tenant?.groupId).toBe(GROUP_ID)
  })

  it('returns 400 when groupId is absent from all sources', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: USER_LEAD, groupIdIn: 'none' })
    const { reply } = await runMiddleware(request, repo)

    expect(reply._code).toBe(400)
    expect((reply._payload as any).error).toBe('Bad Request')
    expect(repo.findUnique).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------

describe('tenantMiddleware() — membership check', () => {
  it('returns 403 when user is not a member of the group', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: USER_NON_MEMBER })
    const { reply } = await runMiddleware(request, repo)

    expect(reply._code).toBe(403)
    expect((reply._payload as any).error).toBe('Forbidden')
    // Must not leak whether the group exists
    expect((reply._payload as any).message).not.toMatch(/not found/i)
  })

  it('returns 403 for a valid user accessing a different group', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: USER_LEAD, groupId: 'group-other-999' })
    const { reply } = await runMiddleware(request, repo)

    expect(reply._code).toBe(403)
  })

  it('returns 500 when the database throws', async () => {
    const repo = makeMembershipRepo({ shouldThrow: true })
    const request = makeRequest({ userId: USER_LEAD })
    const { reply } = await runMiddleware(request, repo)

    expect(reply._code).toBe(500)
    expect((reply._payload as any).error).toBe('Internal Server Error')
  })

  it('calls findUnique with correct userId_groupId composite key', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: USER_SUPPORTER })
    await runMiddleware(request, repo)

    expect(repo.findUnique).toHaveBeenCalledWith({
      where: { userId_groupId: { userId: USER_SUPPORTER, groupId: GROUP_ID } },
      select: { id: true, userId: true, groupId: true, role: true, joinedAt: true },
    })
  })
})

// ---------------------------------------------------------------------------

describe('tenantMiddleware() — role enforcement', () => {
  describe('default minimum role (OBSERVER) — any member can access', () => {
    it.each([
      [Role.LEAD, USER_LEAD],
      [Role.SUPPORTER, USER_SUPPORTER],
      [Role.OBSERVER, USER_OBSERVER],
      
    ])('%s role passes', async (role, userId) => {
      const repo = makeMembershipRepo()
      const request = makeRequest({ userId })
      const { reply } = await runMiddleware(request, repo, Role.OBSERVER)

      expect(reply._code).toBeUndefined()
      expect(request.tenant?.role).toBe(role)
    })
  })

  describe('minimum role SUPPORTER', () => {
    it('LEAD passes', async () => {
      const repo = makeMembershipRepo()
      const { reply } = await runMiddleware(makeRequest({ userId: USER_LEAD }), repo, Role.SUPPORTER)
      expect(reply._code).toBeUndefined()
    })

    it('SUPPORTER passes', async () => {
      const repo = makeMembershipRepo()
      const { reply } = await runMiddleware(makeRequest({ userId: USER_SUPPORTER }), repo, Role.SUPPORTER)
      expect(reply._code).toBeUndefined()
    })

    it('OBSERVER is rejected with 403', async () => {
      const repo = makeMembershipRepo()
      const { reply } = await runMiddleware(makeRequest({ userId: USER_OBSERVER }), repo, Role.SUPPORTER)
      expect(reply._code).toBe(403)
      expect((reply._payload as any).message).toContain('SUPPORTER')
    })

    it('EXTERNAL is rejected with 403', async () => {
      const repo = makeMembershipRepo()
      const { reply } = await runMiddleware(makeRequest({ userId: USER_EXTERNAL }), repo, Role.SUPPORTER)
      expect(reply._code).toBe(403)
    })
  })

  describe('minimum role LEAD — lead caregiver only', () => {
    it('LEAD passes', async () => {
      const repo = makeMembershipRepo()
      const { reply } = await runMiddleware(makeRequest({ userId: USER_LEAD }), repo, Role.LEAD)
      expect(reply._code).toBeUndefined()
    })

    it.each([
      ['SUPPORTER', USER_SUPPORTER],
      ['OBSERVER', USER_OBSERVER],
      ['EXTERNAL', USER_EXTERNAL],
    ])('%s is rejected with 403', async (_label, userId) => {
      const repo = makeMembershipRepo()
      const { reply } = await runMiddleware(makeRequest({ userId }), repo, Role.LEAD)
      expect(reply._code).toBe(403)
    })
  })
})

// ---------------------------------------------------------------------------

describe('tenantMiddleware() — TenantContext attachment', () => {
  it('attaches full TenantContext to request.tenant on success', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: USER_LEAD })
    await runMiddleware(request, repo)

    expect(request.tenant).toMatchObject<TenantContext>({
      groupId: GROUP_ID,
      userId: USER_LEAD,
      role: Role.LEAD,
      membership: {
        id: 'mem-001',
        userId: USER_LEAD,
        groupId: GROUP_ID,
        role: Role.LEAD,
        joinedAt: new Date('2024-01-01'),
      },
    })
  })

  it('attaches correct role for SUPPORTER', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: USER_SUPPORTER })
    await runMiddleware(request, repo)

    expect(request.tenant.role).toBe(Role.SUPPORTER)
    expect(request.tenant.userId).toBe(USER_SUPPORTER)
  })

  it('does not attach tenant on 403', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: USER_NON_MEMBER }) as any
    delete request.tenant
    await runMiddleware(request, repo)

    expect(request.tenant).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------

describe('requireRole() helper', () => {
  function makeRequestWithTenant(role: Role): FastifyRequest {
    return {
      tenant: { groupId: GROUP_ID, userId: USER_LEAD, role, membership: MEMBERSHIPS[USER_LEAD] },
    } as unknown as FastifyRequest
  }

  it('returns true and does not touch reply when role is sufficient', () => {
    const request = makeRequestWithTenant(Role.LEAD)
    const reply = makeReply()
    const result = requireRole(request, reply, Role.SUPPORTER)

    expect(result).toBe(true)
    expect(reply._code).toBeUndefined()
  })

  it('returns false and sends 403 when role is insufficient', () => {
    const request = makeRequestWithTenant(Role.OBSERVER)
    const reply = makeReply()
    const result = requireRole(request, reply, Role.LEAD)

    expect(result).toBe(false)
    expect(reply._code).toBe(403)
  })

  it('returns false and sends 401 when tenant context is missing', () => {
    const request = { tenant: undefined } as unknown as FastifyRequest
    const reply = makeReply()
    const result = requireRole(request, reply, Role.SUPPORTER)

    expect(result).toBe(false)
    expect(reply._code).toBe(401)
  })

  it('passes SUPPORTER check for SUPPORTER role', () => {
    const request = makeRequestWithTenant(Role.SUPPORTER)
    const reply = makeReply()
    expect(requireRole(request, reply, Role.SUPPORTER)).toBe(true)
  })

  it('fails SUPPORTER check for OBSERVER role', () => {
    const request = makeRequestWithTenant(Role.OBSERVER)
    const reply = makeReply()
    expect(requireRole(request, reply, Role.SUPPORTER)).toBe(false)
    expect(reply._code).toBe(403)
  })
})

// ---------------------------------------------------------------------------

describe('canUseFeature() helper', () => {
  function makeRequestWithGroup(): FastifyRequest {
    return {
      tenant: { groupId: GROUP_ID, userId: USER_LEAD, role: Role.LEAD },
      log: { error: jest.fn() },
    } as unknown as FastifyRequest
  }

  it('returns true for a PRO feature when plan is PRO', async () => {
    const planRepo = makePlanRepo('PRO')
    const request = makeRequestWithGroup()
    const reply = makeReply()
    const result = await canUseFeature(request, reply, planRepo, 'EXPORT_PDF')

    expect(result).toBe(true)
    expect(reply._code).toBeUndefined()
  })

  it('returns false with 402 for a PRO feature when plan is FREE', async () => {
    const planRepo = makePlanRepo('FREE')
    const request = makeRequestWithGroup()
    const reply = makeReply()
    const result = await canUseFeature(request, reply, planRepo, 'EXPORT_PDF')

    expect(result).toBe(false)
    expect(reply._code).toBe(402)
    expect((reply._payload as any).error).toBe('Payment Required')
    expect((reply._payload as any).upgradeUrl).toBe('/settings/plan')
  })

  it('returns false with 402 for CALENDAR_SYNC on FREE plan', async () => {
    const planRepo = makePlanRepo('FREE')
    const request = makeRequestWithGroup()
    const reply = makeReply()
    const result = await canUseFeature(request, reply, planRepo, 'CALENDAR_SYNC')

    expect(result).toBe(false)
    expect(reply._code).toBe(402)
  })

  it('returns false with 403 when group is not found', async () => {
    const planRepo = makePlanRepo('FREE')
    const request = {
      tenant: { groupId: 'nonexistent-group' },
      log: { error: jest.fn() },
    } as unknown as FastifyRequest
    const reply = makeReply()
    const result = await canUseFeature(request, reply, planRepo, 'EXPORT_PDF')

    expect(result).toBe(false)
    expect(reply._code).toBe(403)
  })

  it('returns false with 500 when plan repo throws', async () => {
    const planRepo = makePlanRepo('FREE', true)
    const request = makeRequestWithGroup()
    const reply = makeReply()
    const result = await canUseFeature(request, reply, planRepo, 'EXPORT_PDF')

    expect(result).toBe(false)
    expect(reply._code).toBe(500)
  })
})

// ---------------------------------------------------------------------------

describe('Security: cross-tenant isolation', () => {
  it('prevents user from accessing a group they are not a member of', async () => {
    const repo = makeMembershipRepo()
    // USER_LEAD is a member of GROUP_ID but NOT of 'group-other'
    const request = makeRequest({ userId: USER_LEAD, groupId: 'group-other-malicious' })
    const { reply } = await runMiddleware(request, repo)

    expect(reply._code).toBe(403)
    expect(request.tenant).toBeUndefined()
  })

  it('does not reveal group existence in 403 message', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: USER_NON_MEMBER })
    const { reply } = await runMiddleware(request, repo)

    const message = (reply._payload as any).message as string
    expect(message).not.toMatch(/not found/i)
    expect(message).not.toMatch(/does not exist/i)
    expect(message).not.toMatch(/invalid group/i)
  })

  it('an OBSERVER in group A cannot act as LEAD even by role escalation', async () => {
    // Simulate a request that correctly resolves tenant but tries to use a LEAD-only route
    const repo = makeMembershipRepo()
    // First pass middleware with OBSERVER default — succeeds
    const request = makeRequest({ userId: USER_OBSERVER })
    await runMiddleware(request, repo, Role.OBSERVER)
    expect(request.tenant?.role).toBe(Role.OBSERVER)

    // Now simulate a LEAD-only handler check
    const reply = makeReply()
    const result = requireRole(request, reply, Role.LEAD)
    expect(result).toBe(false)
    expect(reply._code).toBe(403)
  })
})

// ---------------------------------------------------------------------------

describe('Middleware does not mutate request on error paths', () => {
  it('does not set request.tenant on 401', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: undefined }) as any
    delete request.tenant
    await runMiddleware(request, repo)
    expect(request.tenant).toBeUndefined()
  })

  it('does not set request.tenant on 403 (non-member)', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: USER_NON_MEMBER }) as any
    delete request.tenant
    await runMiddleware(request, repo)
    expect(request.tenant).toBeUndefined()
  })

  it('does not set request.tenant on 400 (missing groupId)', async () => {
    const repo = makeMembershipRepo()
    const request = makeRequest({ userId: USER_LEAD, groupIdIn: 'none' }) as any
    delete request.tenant
    await runMiddleware(request, repo)
    expect(request.tenant).toBeUndefined()
  })
})
