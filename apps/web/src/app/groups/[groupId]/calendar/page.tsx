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
  recurrence?: string | null
  recurrenceCron?: string | null
  _virtual?: boolean // projected virtual occurrence (not from DB directly)
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

// ── Recurring appointment projection ─────────────────────────────────────────

function projectAppointments(appointments: Appointment[], from: Date, to: Date): Appointment[] {
  const result: Appointment[] = []
  for (const apt of appointments) {
    const rec = apt.recurrence
    if (!rec || rec === 'NONE') {
      result.push(apt)
      continue
    }

    const startDate = new Date(apt.startTime)
    const duration = apt.endTime
      ? new Date(apt.endTime).getTime() - startDate.getTime()
      : null

    const cron = apt.recurrenceCron ?? ''
    const isActuallyBiweekly = rec === 'CUSTOM' && cron.startsWith('BIWEEKLY ')
    const actualCron = isActuallyBiweekly ? cron.slice('BIWEEKLY '.length) : cron
    const parts = actualCron.split(' ')
    const cronMm = Number(parts[0] ?? 0)
    const cronHH = Number(parts[1] ?? 0)

    // Start from max(from, startDate), iterate day by day
    const anchorDay = new Date(startDate); anchorDay.setHours(0, 0, 0, 0)
    const cursor = new Date(Math.max(from.getTime(), startDate.getTime()))
    cursor.setHours(0, 0, 0, 0)
    const end = new Date(to); end.setHours(23, 59, 59, 999)

    while (cursor <= end) {
      let shouldInclude = false

      if (rec === 'DAILY') {
        shouldInclude = true
      } else if (rec === 'WEEKLY') {
        const dayPart = parts[4] ?? '*'
        if (dayPart === '*') shouldInclude = true
        else shouldInclude = dayPart.split(',').map(Number).includes(cursor.getDay())
      } else if (isActuallyBiweekly) {
        const dayPart = parts[4] ?? '*'
        const days = dayPart !== '*' ? dayPart.split(',').map(Number) : [0, 1, 2, 3, 4, 5, 6]
        if (days.includes(cursor.getDay())) {
          const msPerWeek = 7 * 24 * 60 * 60 * 1000
          const weekDiff = Math.round((cursor.getTime() - anchorDay.getTime()) / msPerWeek)
          shouldInclude = weekDiff % 2 === 0
        }
      } else if (rec === 'MONTHLY') {
        const dayOfMonth = parts[2] && parts[2] !== '*' ? Number(parts[2]) : startDate.getDate()
        shouldInclude = cursor.getDate() === dayOfMonth
      }

      if (shouldInclude) {
        const occDate = new Date(cursor)
        occDate.setHours(cronHH, cronMm, 0, 0)
        const isBase = dayKey(occDate) === dayKey(startDate)
        result.push({
          ...apt,
          startTime: occDate.toISOString(),
          endTime: duration ? new Date(occDate.getTime() + duration).toISOString() : apt.endTime,
          _virtual: !isBase,
        })
      }

      cursor.setDate(cursor.getDate() + 1)
    }
  }
  return result
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CalendarPage({ params }: { params: { groupId: string } }) {
  const { t } = useTranslation()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [clientNow, setClientNow] = useState<Date | null>(null)
  const todayRef = useRef<HTMLElement>(null)

  useEffect(() => { setClientNow(new Date()) }, [])

  async function handleDelete(aptId: string) {
    if (!window.confirm('Ta bort besöket permanent? (Alla förekomster tas bort)')) return
    const snapshot = appointments
    setAppointments(prev => prev.filter(a => a.id !== aptId))
    try {
      await api.delete(`/api/groups/${params.groupId}/appointments/${aptId}`)
    } catch (e: unknown) {
      setAppointments(snapshot)
      alert(e instanceof Error ? e.message : 'Kunde inte ta bort besöket.')
    }
  }

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
    const projected = projectAppointments(appointments, new Date(fromStr), new Date(toStr))
    for (const apt of projected) {
      const k = dayKey(new Date(apt.startTime))
      m.set(k, [...(m.get(k) ?? []), apt])
    }
    return m
  }, [appointments, fromStr, toStr])

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
                {dayApts.map((apt, idx) => {
                  const start = new Date(apt.startTime)
                  const end = apt.endTime ? new Date(apt.endTime) : null
                  const color = TYPE_COLORS[apt.type] ?? '#6c757d'
                  const timeStr = fmtTime.format(start) + (end ? `–${fmtTime.format(end)}` : '')
                  const isPast = clientNow && (end ? end < clientNow : start < clientNow)
                  const isRecurring = apt.recurrence && apt.recurrence !== 'NONE'

                  return (
                    <li key={`${apt.id}-${idx}`}
                      style={{ display: 'flex', alignItems: 'stretch', gap: '0.5rem' }}
                      className={isPast ? styles.aptPast : undefined}>
                      <a
                        href={`/groups/${params.groupId}/appointments/${apt.id}`}
                        className={styles.aptCard}
                        style={{ borderLeftColor: color, flex: 1 }}
                      >
                        <div className={styles.aptTime} style={{ color }}>{timeStr}</div>
                        <div className={styles.aptTitle}>{apt.title}</div>
                        {apt.location && <div className={styles.aptMeta}>📍 {apt.location}</div>}
                        {apt.notes && <div className={styles.aptNotes}>{apt.notes}</div>}
                        {isRecurring && (
                          <div className={styles.aptRecurringBadge}>🔄 Återkommande</div>
                        )}
                      </a>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flexShrink: 0 }}>
                        <a href={`/groups/${params.groupId}/appointments/${apt.id}/edit`}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2rem', height: '2rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-muted)', fontSize: '0.8125rem', textDecoration: 'none' }}
                          title="Redigera">✏️</a>
                        <button
                          onClick={() => handleDelete(apt.id)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2rem', height: '2rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-muted)', fontSize: '0.8125rem', cursor: 'pointer' }}
                          title="Ta bort">🗑</button>
                      </div>
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
