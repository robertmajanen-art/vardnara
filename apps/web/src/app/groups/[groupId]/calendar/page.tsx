'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../../../lib/api'
import styles from './calendar.module.css'

type Appointment = {
  id: string
  title: string
  type: string
  startTime: string
  endTime?: string | null
  location?: string | null
  notes?: string | null
  assignee?: { id: string; email: string } | null
  assigneeAccepted?: boolean | null
}

const TYPE_COLORS: Record<string, string> = {
  HEALTHCARE: '#0d6efd',
  SCHOOL: '#198754',
  SOCIAL: '#fd7e14',
  THERAPY: '#6f42c1',
  FAMILY: '#d63384',
  OTHER: '#6c757d',
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDayLabel(d: Date): string {
  const s = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const fmtTime = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' })

export default function CalendarPage({ params }: { params: { groupId: string } }) {
  const { t } = useTranslation()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const todayRef = useRef<HTMLElement>(null)

  const { fromStr, toStr, todayStr } = useMemo(() => {
    const now = new Date()
    const f = new Date(now); f.setDate(f.getDate() - 30); f.setHours(0, 0, 0, 0)
    const t = new Date(now); t.setDate(t.getDate() + 90); t.setHours(23, 59, 59, 999)
    return { fromStr: f.toISOString(), toStr: t.toISOString(), todayStr: dayKey(now) }
  }, [])

  useEffect(() => {
    api
      .get<Appointment[]>(`/api/groups/${params.groupId}/appointments?from=${fromStr}&to=${toStr}`)
      .then(setAppointments)
      .finally(() => setLoading(false))
  }, [params.groupId, fromStr, toStr])

  useEffect(() => {
    if (!loading) {
      requestAnimationFrame(() => {
        todayRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' })
      })
    }
  }, [loading])

  const aptMap = useMemo(() => {
    const m = new Map<string, Appointment[]>()
    for (const apt of appointments) {
      const k = dayKey(new Date(apt.startTime))
      m.set(k, [...(m.get(k) ?? []), apt])
    }
    return m
  }, [appointments])

  const days = useMemo(() => {
    const list: Date[] = []
    const cur = new Date(fromStr); cur.setHours(0, 0, 0, 0)
    const end = new Date(toStr)
    while (cur <= end) { list.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
    return list
  }, [fromStr, toStr])

  if (loading) return <div className={styles.loading}>Laddar...</div>

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('nav.calendar')}</h1>
        <a href={`/groups/${params.groupId}/calendar/new`} className={styles.addBtn}>+ Nytt besök</a>
      </header>

      <div className={styles.timeline}>
        {days.map((day) => {
          const k = dayKey(day)
          const dayApts = aptMap.get(k) ?? []
          const isToday = k === todayStr

          if (dayApts.length === 0) return null

          return (
            <section key={k} ref={isToday ? todayRef : undefined} className={styles.daySection}>
              <h2 className={`${styles.dayHeader} ${isToday ? styles.todayHeader : ''}`}>
                {formatDayLabel(day)}
                {isToday && <span className={styles.todayBadge}>Idag</span>}
              </h2>

              <ul className={styles.aptList}>
                  {dayApts.map((apt) => {
                    const start = new Date(apt.startTime)
                    const end = apt.endTime ? new Date(apt.endTime) : null
                    const color = TYPE_COLORS[apt.type] ?? '#6c757d'
                    const timeStr = fmtTime.format(start) + (end ? `–${fmtTime.format(end)}` : '')

                    return (
                      <li key={apt.id}>
                        <a
                          href={`/groups/${params.groupId}/appointments/${apt.id}`}
                          className={styles.aptCard}
                          style={{ borderLeftColor: color }}
                        >
                          <div className={styles.aptTime} style={{ color }}>{timeStr}</div>
                          <div className={styles.aptTitle}>{apt.title}</div>
                          {apt.location && <div className={styles.aptMeta}>📍 {apt.location}</div>}
                          {apt.notes && <div className={styles.aptNotes}>{apt.notes}</div>}
                        </a>
                      </li>
                    )
                  })}
                </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
