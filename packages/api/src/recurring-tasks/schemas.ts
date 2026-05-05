import { z } from 'zod'

export const CreateRecurringTaskBody = z.object({
  title: z.string().min(1).max(100),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format måste vara HH:MM'),
  recurrenceDays: z.array(z.number().int().min(1).max(7)).default([]),
  showOnDisplay: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
  alarmEnabled: z.boolean().default(true),
  volume: z.number().int().min(0).max(100).default(60),
  missedThreshold: z.number().int().min(1).max(240).default(30),
  snoozeInterval: z.number().int().min(1).max(60).default(15),
  maxSnoozes: z.number().int().min(0).max(10).default(3),
})

export const UpdateRecurringTaskBody = z.object({
  title: z.string().min(1).max(100).optional(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format måste vara HH:MM').optional(),
  recurrenceDays: z.array(z.number().int().min(1).max(7)).optional(),
  isActive: z.boolean().optional(),
  showOnDisplay: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  alarmEnabled: z.boolean().optional(),
  volume: z.number().int().min(0).max(100).optional(),
  missedThreshold: z.number().int().min(1).max(240).optional(),
  snoozeInterval: z.number().int().min(1).max(60).optional(),
  maxSnoozes: z.number().int().min(0).max(10).optional(),
})

export const ConfirmLogBody = z.object({
  confirmedOnDisplay: z.boolean().default(false),
})
