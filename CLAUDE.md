# CLAUDE.md — Family Care Coordination App
> This file is the authoritative project brief. Read it fully at the start of every session.
> Spec version: 0.4 | Last updated from design session with human

---

## What this app is

A mobile + web app for Swedish families coordinating care around a family member who needs extensive support — primarily two use cases:

1. **Dementia** — adult children and spouse managing an aging parent, coordinating siblings (often in other cities), scheduling healthcare appointments, logging daily events
2. **NPF (autism, ADHD, etc.)** — parents (married or divorced) coordinating a child's care across school, healthcare, and social services

One family member acts as lead coordinator ("samordnare"). Others are supporters or observers. All coordination happens in one private, shared space called a **care group**.

There is also a **care recipient ambient display** — an always-on tablet or wall screen in the care recipient's home showing today's schedule and daily activities, with soft alarms and a single-tap confirm button.

---

## App names (to be decided by human)

| Name | Meaning | Domain |
|------|---------|--------|
| Närheten | "closeness/proximity" | narheten.app |
| Samla | "to gather" | samla.app |
| Stöttepelaren | "pillar of support" | stottepelaren.se |
| **Kretsen** | "the circle (of care)" | kretsen.app |
| **Vardnära** | "vård" + "nära" — care + closeness | vardnara.se ✓ recommended |

---

## Tech stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Mobile | React Native + Expo (managed workflow) | No native build config; Expo Push built in |
| Web | Next.js 14 (App Router) | Shares patterns with RN; ambient display is a Next.js route |
| API | Node.js + Fastify | Fast, TypeScript-first, low config |
| ORM | Prisma | Schema as single source of truth; strong TS types |
| Database | PostgreSQL | Row-level multi-tenancy; EU-hosted |
| Auth | JWT + bcrypt → BankID later | AuthProvider interface allows swap without route changes |
| Real-time | Socket.io | Feed updates + ambient display alarm triggers |
| File storage | S3-compatible (Supabase or AWS eu-west) | Documents, receipts, photos |
| Push | Expo Push / FCM / APNs | Swedish push notification text |
| PDF export | react-pdf | Journal and expense PDF exports |
| i18n | i18next + /locales/sv.json | All UI strings in Swedish |
| Monorepo | Turborepo | Clear workspace boundaries |
| Testing | Jest + Playwright | Unit + E2E |

### Monorepo structure

```
/apps/web            ← Next.js web app (includes ambient display route)
/apps/mobile         ← Expo React Native
/packages/api        ← Fastify API server
/packages/db         ← Prisma schema + migrations
/packages/types      ← Shared TypeScript types (see tenant.ts below)
/packages/ui         ← Shared component library
/packages/locales    ← sv.json and future locale files
/packages/utils      ← Shared utilities (date formatting, currency, etc.)
```

---

## Critical architecture decisions

### Multi-tenancy
- **Row-level isolation** — shared PostgreSQL database, every query scoped by `groupId`
- `CareGroup.id` is the tenant identifier (UUID, never user-facing)
- Every API route under `/api/groups/:groupId/*` runs the **tenant middleware** (see below)
- Users can belong to multiple care groups with different roles in each
- WebSocket rooms namespaced: `room:${groupId}`
- S3 keys prefixed: `tenants/{groupId}/documents/{fileId}`

### Auth provider abstraction
Implement an `AuthProvider` interface in Week 1 so BankID can be swapped in without touching route handlers:

```typescript
interface AuthProvider {
  register(email: string, password: string): Promise<User>
  login(credentials: unknown): Promise<{ accessToken: string; refreshToken: string }>
  verify(token: string): Promise<JwtPayload>
}
// EmailPasswordProvider implements AuthProvider (Week 1)
// BankIDProvider implements AuthProvider (Week 4)
```

### Money
- All amounts stored as **öre (integer)** — never Float. 1 SEK = 100 öre.
- Display layer converts: `amount / 100` formatted with `Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' })`

### Dates and locale
- All dates formatted with `Intl.DateTimeFormat('sv-SE')`
- 24-hour time always — never AM/PM
- Relative labels: "Idag", "Imorgon", "I övermorgon", then full Swedish date
- Week starts Monday
- Speech recognition always `lang: 'sv-SE'`; Whisper API `language: 'sv'`

---

## Roles and permissions

```
EXTERNAL < OBSERVER < SUPPORTER < LEAD
```

| Role | Swedish | Can do |
|------|---------|--------|
| LEAD | Samordnare | Everything — invite, assign, configure, delete, generate display token |
| SUPPORTER | Stödjare | Create/edit appointments, tasks, journal, expenses, documents |
| OBSERVER | Följare | Read-only feed, calendar, journal, expenses |
| EXTERNAL | Extern | Invited per event; limited read-only access |

---

## Already-built files (include in repo)

### `/packages/db/schema.prisma`
Complete Prisma schema already generated. Models:
`User`, `RefreshToken`, `CareGroup`, `Membership`, `Invite`, `DisplayToken`,
`Appointment`, `Task`, `RecurringTask`, `RecurringTaskLog`, `JournalEntry`,
`Expense`, `ExpenseComment`, `Document`, `FeedItem`, `FeedItemRead`,
`FeedComment`, `Notification`, `PushToken`, `Reminder`, `AuditLog`

Key details:
- `RecurringTask` has alarm fields: `alarmEnabled`, `volume`, `missedThreshold`, `snoozeInterval`, `maxSnoozes`, `showOnDisplay`
- `RecurringTaskLog` has `@@unique([recurringTaskId, scheduledFor])` — prevents duplicate alarm firing
- `FeedItem` uses optional FK columns (not polymorphic strings) for Prisma includes
- `DisplayToken` has `lookaheadHours`, `volume`, `isActive`, `revokedAt`

### `/packages/types/src/tenant.ts`
Complete TypeScript types: `Role`, `JwtPayload`, `Membership`, `TenantContext`,
`MembershipRepository`, `Feature`, `Plan`, `PlanRepository`, `roleAtLeast()`

### `/packages/api/src/middleware/tenant.ts`
Complete Fastify tenant isolation middleware:
- `tenantMiddleware(membershipRepo, minimumRole?)` — factory, use as `preHandler` hook
- `requireRole(request, reply, minimumRole)` — per-action check inside handlers
- `canUseFeature(request, reply, planRepo, feature)` — plan gate (FREE vs PRO)
- Extracts `groupId` from params → body → query (in that order)
- Returns 401 (no auth), 400 (no groupId), 403 (non-member or wrong role), 500 (DB error)
- Never leaks group existence in error messages

### `/packages/api/src/middleware/tenant.test.ts`
43 Jest tests, 100% coverage. Test groups:
- `roleAtLeast()` — all role combinations
- Authentication (missing JWT, missing sub)
- groupId extraction (params, body, query, missing)
- Membership check (non-member, wrong group, DB error, correct Prisma call shape)
- Role enforcement (all roles × all minimum role levels)
- TenantContext attachment
- `requireRole()` helper
- `canUseFeature()` helper (FREE/PRO, group not found, DB error)
- Security: cross-tenant isolation, no group existence leakage, role escalation prevention
- No request mutation on error paths

---

## Voice-first UX — critical implementation details

**Every form has a single large mic button (min 64dp).** Voice is the primary input method.

### LLM form-fill flow
1. User taps mic → Whisper API transcribes in real-time (sv-SE)
2. Auto-pause after 2.5s silence
3. POST `/api/voice/parse-form` with `{ transcript, formSchema, context: { today, groupMembers } }`
4. Claude API (claude-sonnet-4-20250514) extracts structured JSON matching the form schema
5. LLM-filled fields highlighted blue; unfilled required fields show Swedish inline prompt
6. User taps "Klart" / corrects by tapping individual field → tap its own mini-mic

### LLM system prompt template for voice form-fill
```
You are a form parser for a Swedish family care coordination app.
Extract structured data from the voice transcript and return ONLY valid JSON matching the provided schema.
Today is {date} ({dayOfWeek} in Swedish). Timezone: Europe/Stockholm.
Group members: {memberNames}.
Parse Swedish relative dates: "idag", "imorgon", "nästa {weekday}", "om {n} dagar".
Parse Swedish times: "klockan tio", "halv tre", "kvart i åtta".
Medical and NPF terminology should be preserved exactly as spoken.
Return { fields: Record<string, any>, confidence: Record<string, "high" | "low"> }.
Mark confidence "low" for any field you are uncertain about.
```

### Quick journal entry
- Floating action button → full-screen recording (no form)
- LLM auto-generates: title, entryType, tags, formatted body
- One-tap approve → saved to journal + feed

### Forms supporting voice-fill
`Appointment`, `Task`, `JournalEntry`, `Expense`, `AppointmentOutcome`, `UrgentAlert`

---

## Ambient display — `/display/:groupId?token=xxx`

A Next.js route, no login required, secured by read-only `DisplayToken`.

### Normal state
- Dark background (`#0d1b2e`), large clock, Swedish date
- "Kommande besök" section: appointments in next N hours (configurable per token)
- "Aktiviteter idag" section: recurring tasks with completion status
- Screen Wake Lock API enabled — never sleeps
- WebSocket subscribed to `room:${groupId}` for real-time updates
- Polling fallback every 60s

### Alarm state (when RecurringTask scheduled time is reached)
1. Server cron job (every minute) emits `ALARM_TRIGGER` WebSocket event to `room:${groupId}`
2. Client also runs local timer as fallback
3. Soft chime plays (Web Audio API, 440Hz sine wave, configurable volume)
4. Alarm overlay appears (non-blocking, rest of screen visible behind)
5. Overlay contains: activity name (large), "Klart!" button (min 80px height), "Påminn mig om 15 min" (small, subtle)

### Confirm flow
- Tap "Klart!" → POST `/api/display/:groupId/confirm/:taskId?token=xxx`
- "Bra gjort!" shown for 3 seconds, then back to normal
- `RecurringTaskLog` row created; WebSocket broadcast to family apps
- Journal entry auto-created: "{activity} bekräftad kl {time}"

### Missed activity flow
- Server job at `scheduledTime + missedThreshold` checks if `RecurringTaskLog.confirmedAt` is null
- If missed: push notification to lead caregiver only
- Swedish text: "Birgitta har inte bekräftat {activity} ({time}). Det har gått {n} minuter."
- `missedAlertSent` flag prevents duplicate notifications

### Display token setup (lead caregiver)
Settings → "Hemskärm" → generates QR code + URL → scan on tablet → no app install needed

---

## Swedish UI — all strings via i18next

```
/packages/locales/sv.json  ← single source of truth, no hardcoded Swedish in components
```

Key string examples:
```json
{
  "nav.calendar": "Kalender",
  "nav.tasks": "Uppgifter",
  "nav.journal": "Dagbok",
  "nav.expenses": "Utgifter",
  "nav.documents": "Dokument",
  "role.lead": "Samordnare",
  "role.supporter": "Stödjare",
  "role.observer": "Följare",
  "voice.listening": "Lyssnar...",
  "voice.tap_to_speak": "Tryck för att tala",
  "voice.processing": "Fyller i formulär...",
  "display.no_appointments": "Inga besök planerade idag",
  "alarm.confirm": "Klart!",
  "alarm.snooze": "Påminn mig om 15 min",
  "alarm.well_done": "Bra gjort!",
  "appointment.type.healthcare": "Sjukvård",
  "appointment.type.school": "Skola",
  "appointment.type.social": "Socialtjänst"
}
```

Rules:
- Zero hardcoded Swedish strings in components — always `t('key')`
- All push notification content in Swedish
- All LLM-generated text (tags, summaries) prompted to output Swedish
- Error messages and validation in Swedish

---

## User stories (reference — all 24)

| ID | Title | Role |
|----|-------|------|
| US-01 | Email + password registration | Any |
| US-02 | Stay logged in (refresh token) | Any |
| US-03 | Create a care group | Lead |
| US-04 | Invite family members | Lead |
| US-05 | View shared calendar | Any |
| US-06 | Assign responsible person to appointment | Lead/Supporter |
| US-07 | Add appointment outcome notes | Assignee |
| US-08 | Create and assign tasks | Lead/Supporter |
| US-09 | Complete task with note | Assignee |
| US-10 | Log journal entry | Any |
| US-11 | Export journal as PDF | Lead |
| US-12 | Log expense + upload receipt | Lead/Supporter |
| US-13 | View expense summary | Any |
| US-14 | Store documents securely | Lead |
| US-15 | View unified activity feed | Any |
| US-16 | Fill any form by speaking | Any |
| US-17 | Quick voice journal entry | Any |
| US-18 | Generate display link (QR) | Lead |
| US-19 | Ambient display — care recipient view | Display |
| US-20 | Full Swedish UI | Any |
| US-21 | Soft alarm for recurring activities | Display |
| US-22 | Single-tap confirm on display | Care recipient |
| US-23 | Missed activity notification to lead | System |
| US-24 | Configure alarm settings per activity | Lead |

---

## 4-week build plan

### Week 1 — Foundation, auth, i18n (Days 1–7)
- [ ] Turborepo monorepo setup
- [ ] `packages/db`: Prisma schema + first migration (`npx prisma migrate dev --name init`)
- [ ] `packages/types`: Copy tenant.ts (already written)
- [ ] `packages/api`: AuthProvider interface + EmailPasswordProvider (JWT + bcrypt)
- [ ] `packages/api`: Refresh token flow (30-day, httpOnly)
- [ ] `packages/api`: Email verification
- [ ] `packages/api`: 2FA TOTP (required for LEAD role)
- [ ] `packages/api`: Care group CRUD
- [ ] `packages/api`: Member invite flow (email + SMS)
- [ ] `packages/api`: Copy tenant middleware (already written + tested)
- [ ] `packages/locales`: i18next setup + sv.json base strings
- [ ] `packages/utils`: Swedish date/time utilities
- [ ] `packages/api`: Whisper API integration + voice recording endpoint

### Week 2 — Calendar, tasks, feed, voice forms (Days 8–14)
- [ ] Appointment API (CRUD, assignment, accept/decline)
- [ ] Task API (CRUD, recurrence, overdue detection)
- [ ] RecurringTask API (CRUD, alarm settings)
- [ ] Activity feed API (paginated, Socket.io real-time)
- [ ] Push notification service (Expo Push)
- [ ] `POST /api/voice/parse-form` — LLM form-fill endpoint
- [ ] Voice form UI component (React Native + web)
- [ ] Ambient display route (`/display/:groupId`)
- [ ] Ambient display alarm overlay + Web Audio chime
- [ ] DisplayToken generation (QR code)
- [ ] Alarm cron job (node-cron, every minute)
- [ ] Calendar UI (web + mobile)
- [ ] Task list UI

### Week 3 — Journal, expenses, documents (Days 15–21)
- [ ] Journal entry API (CRUD, tags, voice)
- [ ] Quick voice journal entry (free-form → LLM tag/title generation)
- [ ] Journal PDF export (react-pdf)
- [ ] Expense API (CRUD, S3 receipt upload)
- [ ] Expense summary dashboard
- [ ] Expense CSV + PDF export
- [ ] Document upload API (S3, access control)
- [ ] All voice-fill: journal, expense, outcome notes
- [ ] Ambient display config UI (lookahead, activity selection)
- [ ] "Visa på hemskärm" toggle per recurring task

### Week 4 — Polish, testing, BankID prep (Days 22–30)
- [ ] Google Calendar + Apple Calendar sync
- [ ] Notification preferences (per-user, per-type)
- [ ] BankIDProvider stub (implements AuthProvider, returns TODO)
- [ ] "Upgrade to BankID" banner in settings
- [ ] Screen Wake Lock + Android "stay awake" tip
- [ ] Accessibility audit (older users — large tap targets, high contrast)
- [ ] Voice UX QA with real Swedish speakers
- [ ] Playwright E2E tests (critical paths)
- [ ] Jest API integration tests
- [ ] GDPR data export endpoint
- [ ] Right to erasure endpoint
- [ ] Production deploy (Fly.io recommended — EU region)
- [ ] Full sv.json string review

---

## How to start each Claude Code session

**Always begin by saying:**
> "Read CLAUDE.md, then read packages/db/schema.prisma, then [your task]"

**For implementing a user story:**
> "Read CLAUDE.md and packages/db/schema.prisma. Implement US-06: appointment assignment with accept/decline. Acceptance criteria: [paste from spec]. Use existing Appointment and Membership models."

**For the voice form endpoint:**
> "Read CLAUDE.md. Implement POST /api/voice/parse-form in packages/api. Accept { transcript, formSchema, context }. Call claude-sonnet-4-20250514 with the system prompt from CLAUDE.md. Return { fields, confidence }."

**For the ambient display alarm:**
> "Read CLAUDE.md. Implement the alarm cron job in packages/api. Every minute, query RecurringTask rows where scheduledTime is within the last minute, alarmEnabled = true, and no RecurringTaskLog exists for today. Emit ALARM_TRIGGER via Socket.io to room:${groupId}. Add missed-activity check at scheduledTime + missedThreshold."

**One user story per session** — keeps context tight and diffs reviewable.

---

## Security rules (never violate)

1. Every data query includes `where: { groupId }` — never query without tenant scope
2. Tenant middleware runs before every handler under `/api/groups/:groupId/*`
3. 403 responses never reveal whether a group exists to non-members
4. Display tokens are read-only — they cannot trigger writes except `RecurringTaskLog` confirmation
5. File storage keys always prefixed `tenants/{groupId}/` — never bare filenames
6. Audit log every sensitive action: member removal, document access, display token generation
7. `missedAlertSent` flag prevents duplicate missed-activity notifications
8. BankID integration goes through `AuthProvider` interface — no direct BankID calls in routes

---

## Environment variables needed

```bash
DATABASE_URL=                  # PostgreSQL connection string (EU region)
JWT_SECRET=                    # Long random string
REFRESH_TOKEN_SECRET=          # Separate long random string
ANTHROPIC_API_KEY=             # For voice form-fill LLM calls
WHISPER_API_KEY=               # OpenAI Whisper for sv-SE transcription
AWS_ACCESS_KEY_ID=             # S3-compatible storage
AWS_SECRET_ACCESS_KEY=
AWS_BUCKET_NAME=
AWS_REGION=                    # eu-west or eu-north
SMTP_HOST=                     # For email verification + invites
SMTP_USER=
SMTP_PASS=
EXPO_ACCESS_TOKEN=             # For Expo push notifications
```
