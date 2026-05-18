-- Add recurrence fields to Appointment
ALTER TABLE "Appointment" ADD COLUMN "recurrence" "RecurrencePattern" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Appointment" ADD COLUMN "recurrenceCron" TEXT;
