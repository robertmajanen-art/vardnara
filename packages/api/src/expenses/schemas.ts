import { z } from 'zod'

export const CreateExpenseBody = z.object({
  amount: z.number().int().positive(), // öre
  category: z.enum(['MEDICATION', 'FOOD', 'TRANSPORT', 'EQUIPMENT', 'SERVICES', 'INSURANCE', 'OTHER']),
  description: z.string().min(1).max(500),
  expenseDate: z.string().datetime({ offset: true }),
})

export const UpdateExpenseBody = z.object({
  amount: z.number().int().positive().optional(),
  category: z.enum(['MEDICATION', 'FOOD', 'TRANSPORT', 'EQUIPMENT', 'SERVICES', 'INSURANCE', 'OTHER']).optional(),
  description: z.string().min(1).max(500).optional(),
  expenseDate: z.string().datetime({ offset: true }).optional(),
})
