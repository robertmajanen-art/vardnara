'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Appointment } from '../../../../lib/api'
import { formatTime, formatRelativeDate } from '@vardnara/utils'
import styles from './calendar.module.css'

const APPOINTMENT_TYPE_KEYS: Record<string, string> = {
  HEALTHCARE: 'appointment.type.healthcare',
  SCHOOL: 'appointment.type.school',
  SOCIAL: 'appointment.type.social',
  THERAPY: 'appointment.type.therapy',
  FAMILY: 'appointment.type.family',
  OTHER: 'appointment.type.other',
}

export default function CalendarPage({ params }: { params: { groupId: string } }) {
  const { t } = useTranslation()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const from = new Date().toISOString()
    const to = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    api
      .get<Appointment[]>(`/api/groups/${params.groupId}/appointments?from=${from}&to=${to}`)
      .then(setAppointments)
      .finally(() => setLoading(false))
  }, [params.groupId])

  if (loading) return <div className={styles.loading}>Laddar...</div>

  const grouped = groupByDate(appointments)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('nav.calendar')}</h1>
        <a href={`/groups/${params.groupId}/calendar/new`} className={styles.addBtn}>
          + Nytt besök
        </a>
      </header>

      {appointments.length === 0 ? (
        <p className={styles.empty}>{t('display.no_appointments')}</p>
      ) : (
        <div className={styles.list}>
          {Array.from(grouped.entries()).map(([dateKey, items]) => (
            <section key={dateKey} className={styles.daySection}>
              <h2 className={styles.dayHeader}>{dateKey}</h2>
              {items.map((apt) => (
                <AppointmentCard key={apt.id} appointment={apt} groupId={params.groupId} t={t} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function AppointmentCard({
  appointment: apt,
  groupId,
  t,
}: {
  appointment: Appointment
  groupId: string
  t: (key: string) => string
}) {
  const typeLabel = t(APPOINTMENT_TYPE_KEYS[apt.type] ?? 'appointment.type.other')
  const start = new Date(apt.startTime)

  return (
    <a href={`/groups/${groupId}/appointments/${apt.id}`} className={styles.card}>
      <div className={styles.cardTime}>{formatTime(start)}</div>
      <div className={styles.cardBody}>
        <div className={styles.cardTitle}>{apt.title}</div>
        <div className={styles.cardMeta}>
          <span className={styles.typeBadge}>{typeLabel}</span>
          {apt.location && <span className={styles.location}>{apt.location}</span>}
          {apt.assignee && (
            <span className={styles.assignee}>{apt.assignee.email}</span>
          )}
        </div>
      </div>
      {apt.assigneeAccepted === false && (
        <div className={styles.declinedBadge}>Avböjt</div>
      )}
    </a>
  )
}

function groupByDate(appointments: Appointment[]): Map<string, Appointment[]> {
  const map = new Map<string, Appointment[]>()
  for (const apt of appointments) {
    const key = formatRelativeDate(new Date(apt.startTime))
    const existing = map.get(key) ?? []
    existing.push(apt)
    map.set(key, existing)
  }
  return map
}
