import { z } from 'zod'

const CATEGORIES = ['MEDICATION', 'FOOD', 'TRANSPORT', 'EQUIPMENT', 'SERVICES', 'INSURANCE', 'OTHER'] as const

export const CreateExpenseBody = z.object({
  amount: z.number().int().positive(), // öre
  category: z.enum(CATEGORIES),
  description: z.string().min(1).max(500),
  expenseDate: z.string().datetime({ offset: true }),
  receiptData: z.string().optional(), // base64 data-URL of receipt image
})

export const UpdateExpenseBody = z.object({
  amount: z.number().int().positive().optional(),
  category: z.enum(CATEGORIES).optional(),
  description: z.string().min(1).max(500).optional(),
  expenseDate: z.string().datetime({ offset: true }).optional(),
  receiptData: z.string().nullable().optional(), // null = remove existing receipt
})
