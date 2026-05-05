import { schedule } from 'node-cron'
import type { PrismaClient } from '@prisma/client'
import type { Server } from 'socket.io'
import { sendPush } from '../services/push'

export function startAlarmCron(db: PrismaClient, io: Server) {
  // Every minute — check for overdue tasks and missed recurring activities
  schedule('* * * * *', async () => {
    await Promise.allSettled([
      markOverdueTasks(db),
      sendMissedActivityAlerts(db, io),
      sendAppointmentReminders(db),
    ])
  })
}

async function markOverdueTasks(db: PrismaClient) {
  await db.task.updateMany({
    where: {
      status: { in: ['OPEN', 'IN_PROGRESS'] },
      dueDate: { lt: new Date() },
    },
    data: { status: 'OVERDUE' },
  })
}

async function sendMissedActivityAlerts(db: PrismaClient, io: Server) {
  const now = new Date()

  // Find recurring tasks where we expect a log today
  const recurringTasks = await db.recurringTask.findMany({
    where: { isActive: true, alarmEnabled: true },
    select: {
      id: true,
      groupId: true,
      title: true,
      scheduledTime: true,
      recurrenceDays: true,
      missedThreshold: true,
    },
  })

  for (const task of recurringTasks) {
    const [hours, minutes] = task.scheduledTime.split(':').map(Number)
    const scheduledFor = new Date(now)
    scheduledFor.setHours(hours!, minutes!, 0, 0)

    // Only if scheduled time has passed + threshold
    const thresholdMs = task.missedThreshold * 60 * 1000
    if (now.getTime() < scheduledFor.getTime() + thresholdMs) continue

    // Only on correct days
    const isoDay = now.getDay() === 0 ? 7 : now.getDay()
    if (task.recurrenceDays.length > 0 && !task.recurrenceDays.includes(isoDay)) continue

    // Check if log exists for today
    const existing = await db.recurringTaskLog.findUnique({
      where: {
        recurringTaskId_scheduledFor: {
          recurringTaskId: task.id,
          scheduledFor,
        },
      },
    })

    if (!existing) {
      // Create a missed log
      await db.recurringTaskLog.create({
        data: {
          recurringTaskId: task.id,
          groupId: task.groupId,
          scheduledFor,
          missedAlertSent: true,
          missedAlertSentAt: now,
        },
      })
    } else if (existing.confirmedAt || existing.missedAlertSent) {
      continue
    } else {
      await db.recurringTaskLog.update({
        where: { id: existing.id },
        data: { missedAlertSent: true, missedAlertSentAt: now },
      })
    }

    // Get all members to notify
    const memberships = await db.membership.findMany({
      where: { groupId: task.groupId },
      select: { userId: true },
    })
    const userIds = memberships.map((m) => m.userId)

    await sendPush(db, userIds, {
      titleSv: 'Aktivitet missad',
      bodySv: `"${task.title}" har inte bekräftats`,
      deepLink: `/groups/${task.groupId}/recurring-tasks/${task.id}`,
    })

    io.to(`room:${task.groupId}`).emit('activity:missed', { recurringTaskId: task.id, scheduledFor })
  }
}

async function sendAppointmentReminders(db: PrismaClient) {
  const now = new Date()

  const pendingReminders = await db.reminder.findMany({
    where: { sentAt: null },
    include: {
      appointment: {
        select: { id: true, groupId: true, title: true, startTime: true, assigneeId: true },
      },
    },
  })

  for (const reminder of pendingReminders) {
    const fireAt = new Date(reminder.appointment.startTime.getTime() - reminder.minutesBefore * 60 * 1000)
    if (now < fireAt) continue

    const targetUserIds: string[] = []
    if (reminder.appointment.assigneeId) {
      targetUserIds.push(reminder.appointment.assigneeId)
    } else {
      const members = await db.membership.findMany({
        where: { groupId: reminder.appointment.groupId, role: 'LEAD' },
        select: { userId: true },
      })
      targetUserIds.push(...members.map((m) => m.userId))
    }

    await sendPush(db, targetUserIds, {
      titleSv: 'Påminnelse om besök',
      bodySv: reminder.minutesBefore >= 60
        ? `${reminder.appointment.title} om ${Math.round(reminder.minutesBefore / 60)} timme(r)`
        : `${reminder.appointment.title} om ${reminder.minutesBefore} minuter`,
      deepLink: `/groups/${reminder.appointment.groupId}/appointments/${reminder.appointment.id}`,
    })

    await db.reminder.update({
      where: { id: reminder.id },
      data: { sentAt: now },
    })
  }
}
