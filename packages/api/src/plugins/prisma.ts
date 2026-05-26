import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'
import type { FastifyPluginAsync } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

/** Run any schema changes not yet present in the DB (idempotent). */
async function applyPendingMigrations(prisma: PrismaClient) {
  try {
    // 20260518000001_appointment_recurrence — add recurrence columns to Appointment
    const rows = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Appointment'
        AND column_name = 'recurrence'
    `
    if (rows.length === 0) {
      console.log('[prisma] Applying migration: 20260518000001_appointment_recurrence')
      await prisma.$executeRaw`
        ALTER TABLE "Appointment"
          ADD COLUMN IF NOT EXISTS "recurrence" "RecurrencePattern" NOT NULL DEFAULT 'NONE',
          ADD COLUMN IF NOT EXISTS "recurrenceCron" TEXT
      `
      console.log('[prisma] Migration applied.')
    }

    // 20260520000001_exception_dates — add exceptionDates to Appointment and Task
    const exRows = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Appointment'
        AND column_name = 'exceptionDates'
    `
    if (exRows.length === 0) {
      console.log('[prisma] Applying migration: 20260520000001_exception_dates')
      await prisma.$executeRaw`ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "exceptionDates" TEXT DEFAULT ''`
      await prisma.$executeRaw`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "exceptionDates" TEXT DEFAULT ''`
      console.log('[prisma] Migration applied.')
    }

    // 20260526000001_transport_person — add transportPersonId + transportPersonName to Appointment
    const tpRows = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Appointment'
        AND column_name = 'transportPersonName'
    `
    if (tpRows.length === 0) {
      console.log('[prisma] Applying migration: 20260526000001_transport_person')
      await prisma.$executeRaw`
        ALTER TABLE "Appointment"
          ADD COLUMN IF NOT EXISTS "transportPersonId" TEXT,
          ADD COLUMN IF NOT EXISTS "transportPersonName" TEXT
      `
      console.log('[prisma] Migration applied.')
    }

    // 20260526000002_completed_dates — add completedDates to Task for per-occurrence completion
    const cdRows = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Task'
        AND column_name = 'completedDates'
    `
    if (cdRows.length === 0) {
      console.log('[prisma] Applying migration: 20260526000002_completed_dates')
      await prisma.$executeRaw`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "completedDates" TEXT DEFAULT ''`
      console.log('[prisma] Migration applied.')
    }
  } catch (err) {
    console.error('[prisma] Migration error (non-fatal):', err)
  }
}

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  const prisma = new PrismaClient({ log: ['error', 'warn'] })
  await prisma.$connect()
  await applyPendingMigrations(prisma)
  fastify.decorate('prisma', prisma)
  fastify.addHook('onClose', async () => prisma.$disconnect())
}

export default fp(prismaPlugin, { name: 'prisma' })
