import type { PrismaClient } from '@prisma/client'

interface PushPayload {
  titleSv: string
  bodySv: string
  deepLink?: string
}

export async function sendPush(db: PrismaClient, userIds: string[], payload: PushPayload) {
  const tokens = await db.pushToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true },
  })
  if (tokens.length === 0) return

  const messages = tokens.map((t) => ({
    to: t.token,
    title: payload.titleSv,
    body: payload.bodySv,
    data: payload.deepLink ? { deepLink: payload.deepLink } : undefined,
    sound: 'default',
  }))

  // Fire-and-forget — log errors but don't throw
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    })
  } catch (err) {
    console.error('[push] Failed to send Expo push notifications', err)
  }
}
