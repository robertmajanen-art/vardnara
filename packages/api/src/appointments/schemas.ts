import { z } from 'zod'

const AppointmentType = z.enum(['HEALTHCARE', 'SCHOOL', 'SOCIAL', 'THERAPY', 'FAMILY', 'OTHER'])
const RecurrenceEnum = z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'])

export const CreateAppointmentBody = z.object({
  type: AppointmentType,
  title: z.string().min(1).max(200),
  location: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }).optional(),
  assigneeId: z.string().uuid().optional(),
  reminderMinutes: z.array(z.number().int().positive()).max(5).optional(),
  recurrence: RecurrenceEnum.default('NONE'),
  recurrenceCron: z.string().max(120).optional(),
})

export const UpdateAppointmentBody = z.object({
  type: AppointmentType.optional(),
  title: z.string().min(1).max(200).optional(),
  location: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  startTime: z.string().datetime({ offset: true }).optional(),
  endTime: z.string().datetime({ offset: true }).nullable().optional(),
  recurrence: RecurrenceEnum.optional(),
  recurrenceCron: z.string().max(120).nullable().optional(),
})

export const AssignAppointmentBody = z.object({
  assigneeId: z.string().uuid().nullable(),
})

export const RespondAppointmentBody = z.object({
  accepted: z.boolean(),
  note: z.string().max(500).optional(),
})

export const OutcomeBody = z.object({
  outcomeNotes: z.string().min(1).max(4000),
})
