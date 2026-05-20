-- Add recurrence fields to Appointment
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "recurrence" "RecurrencePattern" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "recurrenceCron" TEXT;
