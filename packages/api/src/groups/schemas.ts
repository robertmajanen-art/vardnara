import { z } from 'zod'

export const CreateGroupBody = z.object({
  name: z.string().min(1).max(100),
  recipientName: z.string().min(1).max(100),
  recipientDob: z.string().datetime({ offset: true }).optional(),
  careType: z.enum(['DEMENTIA', 'NPF', 'OTHER']),
})

export const UpdateGroupBody = z.object({
  name: z.string().min(1).max(100).optional(),
  recipientName: z.string().min(1).max(100).optional(),
  recipientDob: z.string().datetime({ offset: true }).nullable().optional(),
  careType: z.enum(['DEMENTIA', 'NPF', 'OTHER']).optional(),
})

export const CreateInviteBody = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(8).optional(),
    role: z.enum(['SUPPORTER', 'OBSERVER', 'EXTERNAL']),
  })
  .refine((d) => d.email ?? d.phone, {
    message: 'E-postadress eller telefonnummer krävs',
  })

export const UpdateMemberRoleBody = z.object({
  role: z.enum(['SUPPORTER', 'OBSERVER', 'EXTERNAL']),
})
