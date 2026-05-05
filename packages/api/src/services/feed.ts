import type { PrismaClient } from '@prisma/client'
import type { Server } from 'socket.io'

interface FeedRefs {
  appointmentId?: string
  taskId?: string
  journalEntryId?: string
  expenseId?: string
  documentId?: string
}

export async function createFeedItem(
  db: PrismaClient,
  io: Server,
  groupId: string,
  actorId: string | null,
  itemType: string,
  refs: FeedRefs,
  bodyText: string,
) {
  const item = await db.feedItem.create({
    data: { groupId, actorId, itemType, bodyText, ...refs },
  })
  io.to(`room:${groupId}`).emit('feed:new', item)
  return item
}
