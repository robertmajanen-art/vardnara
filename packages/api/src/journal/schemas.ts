import { z } from 'zod'

export const CreateJournalBody = z.object({
  entryType: z.enum(['NOTE', 'OBSERVATION', 'INCIDENT', 'MOOD', 'HEALTH_UPDATE']),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  tags: z.array(z.string()).default([]),
  voiceTranscript: z.string().optional(),
})

export const UpdateJournalBody = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  entryType: z.enum(['NOTE', 'OBSERVATION', 'INCIDENT', 'MOOD', 'HEALTH_UPDATE']).optional(),
})
