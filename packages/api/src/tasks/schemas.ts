import { z } from 'zod'

const TaskStatusEnum = z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'OVERDUE'])
const RecurrenceEnum = z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'])

export const CreateTaskBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
  recurrence: RecurrenceEnum.default('NONE'),
  recurrenceCron: z.string().max(100).optional(),
})

export const UpdateTaskBody = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  status: TaskStatusEnum.optional(),
  recurrence: RecurrenceEnum.optional(),
  recurrenceCron: z.string().max(100).nullable().optional(),
})

export const AssignTaskBody = z.object({
  assigneeId: z.string().uuid().nullable(),
})

export const CompleteTaskBody = z.object({
  note: z.string().max(1000).optional(),
})
