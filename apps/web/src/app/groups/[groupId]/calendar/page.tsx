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

// Timeline constants — 1 px = 1 minute
const HOUR_PX = 60
const DAY_START = 6    // 06:00
const DAY_END = 22     // 22:00
const HOURS = DAY_END - DAY_START
const DAY_HEIGHT = HOURS * HOUR_PX  // 960 px

// 30-min marks from DAY_START to DAY_END
const TIME_MARKS = Array.from({ length: HOURS * 2 + 1 }, (_, i) => {
  const mins = i * 30
  const h = DAY_START + Math.floor(mins / 60)
  const m = mins % 60
  return {
    top: mins,   // 1 px per minute
    label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    isHour: m === 0,
  }
})

function timeToTop(d: Date): number {
  const totalMins = d.getHours() * 60 + d.getMinutes()
  return Math.max(0, Math.min(DAY_HEIGHT, totalMins - DAY_START * 60))
}

function durationPx(start: Date, end: Date | null): number {
  if (!end) return HOUR_PX
  return Math.max(28, (end.getTime() - start.getTime()) / 60000)
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
  const nowRef = useRef<HTMLDivElement>(null)

  // Stable date range computed once on mount
  const { fromStr, toStr, todayStr } = useMemo(() => {
    const now = new Date()
    const f = new Date(now); f.setDate(f.getDate() - 30); f.setHours(0, 0, 0, 0)
    const t = new Date(now); t.setDate(t.getDate() + 90); t.setHours(23, 59, 59, 999)
    return {
      fromStr: f.toISOString(),
      toStr: t.toISOString(),
      todayStr: dayKey(now),
    }
  }, [])

  useEffect(() => {
    api
      .get<Appointment[]>(`/api/groups/${params.groupId}/appointments?from=${fromStr}&to=${toStr}`)
      .then(setAppointments)
      .finally(() => setLoading(false))
  }, [params.groupId, fromStr, toStr])

  // Scroll "now" line to center after data loads
  useEffect(() => {
    if (!loading) {
      requestAnimationFrame(() => {
        nowRef.current?.scrollIntoView({ behavior: 'instant', block: 'center' })
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

  // All days in range
  const days = useMemo(() => {
    const list: Date[] = []
    const from = new Date(fromStr)
    const to = new Date(toStr)
    const cur = new Date(from)
    cur.setHours(0, 0, 0, 0)
    while (cur <= to) { list.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
    return list
  }, [fromStr, toStr])

  const now = new Date()
  const nowTop = timeToTop(now)

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
          const showFull = isToday || dayApts.length > 0

          if (!showFull) {
            return (
              <div key={k} className={styles.emptyDay}>
                <span className={styles.emptyDayLabel}>{formatDayLabel(day)}</span>
              </div>
            )
          }

          return (
            <section key={k} className={styles.daySection}>
              <h2 className={`${styles.dayHeader} ${isToday ? styles.todayHeader : ''}`}>
                {formatDayLabel(day)}
                {isToday && <span className={styles.todayBadge}>Idag</span>}
              </h2>

              <div className={styles.dayBody} style={{ height: DAY_HEIGHT }}>
                {/* 30-min tick marks */}
                {TIME_MARKS.map(({ top, label, isHour }) => (
                  <div
                    key={label}
                    className={isHour ? styles.hourMark : styles.halfHourMark}
                    style={{ top }}
                  >
                    <span className={styles.timeLabel}>{isHour ? label : ''}</span>
                    <span className={styles.markLine} />
                  </div>
                ))}

                {/* "Now" indicator — only in today's section */}
                {isToday && nowTop >= 0 && nowTop <= DAY_HEIGHT && (
                  <div ref={nowRef} className={styles.nowGroup} style={{ top: nowTop }}>
                    <div className={styles.nowDot} />
                    <div className={styles.nowLine} />
                  </div>
                )}

                {/* Appointment cards */}
                {dayApts.map((apt) => {
                  const start = new Date(apt.startTime)
                  const end = apt.endTime ? new Date(apt.endTime) : null
                  const top = timeToTop(start)
                  const height = durationPx(start, end)
                  const color = TYPE_COLORS[apt.type] ?? '#6c757d'
                  const timeStr = fmtTime.format(start) + (end ? `–${fmtTime.format(end)}` : '')

                  return (
                    <a
                      key={apt.id}
                      href={`/groups/${params.groupId}/appointments/${apt.id}`}
                      className={styles.aptCard}
                      style={{
                        top,
                        height,
                        background: `${color}18`,
                        borderLeftColor: color,
                      }}
                    >
                      <div className={styles.aptTime} style={{ color }}>{timeStr}</div>
                      <div className={styles.aptTitle}>{apt.title}</div>
                      {height >= 58 && apt.location && (
                        <div className={styles.aptMeta}>📍 {apt.location}</div>
                      )}
                      {height >= 82 && apt.notes && (
                        <div className={styles.aptNotes}>{apt.notes}</div>
                      )}
                    </a>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
