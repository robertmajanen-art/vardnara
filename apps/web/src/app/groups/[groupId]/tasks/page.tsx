'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Task } from '../../../../lib/api'
import { formatRelativeDate } from '@vardnara/utils'
import styles from './tasks.module.css'

// ── Recurrence helpers ──────────────────────────────────────────────────────

const DAY_MAP: Record<number, string> = {
  0: 'Sön', 1: 'Mån', 2: 'Tis', 3: 'Ons', 4: 'Tor', 5: 'Fre', 6: 'Lör',
}

// ── Weekly-interval cron helpers ─────────────────────────────────────────────
// Encoding: interval=1  → recurrence='WEEKLY',  cron='mm HH * * days[ UNTIL:date]'
//           interval>1  → recurrence='CUSTOM',  cron='WEEKLY_N mm HH * * days[ UNTIL:date]'
// End date: optional ' UNTIL:YYYY-MM-DD' suffix on any cron string
// Legacy:   BIWEEKLY prefix treated as WEEKLY_2

function parseWeeklyInterval(cron: string): { interval: number; parts: string[] } {
  // Strip UNTIL suffix before splitting
  const base = cron.replace(/ UNTIL:\d{4}-\d{2}-\d{2}$/, '')
  if (base.startsWith('BIWEEKLY ')) {
    return { interval: 2, parts: base.slice('BIWEEKLY '.length).split(' ') }
  }
  const m = base.match(/^WEEKLY_(\d+) (.+)$/)
  if (m) {
    return { interval: Number(m[1]), parts: m[2].split(' ') }
  }
  return { interval: 1, parts: base.split(' ') }
}

function parseEndDate(cron: string): Date | null {
  const m = cron.match(/UNTIL:(\d{4}-\d{2}-\d{2})/)
  if (!m) return null
  const d = new Date(m[1]!)
  d.setHours(23, 59, 59, 999)
  return d
}

function formatRecurrence(task: Task): string | null {
  if (!task.recurrence || task.recurrence === 'NONE') return null
  const cron = task.recurrenceCron ?? ''

  if (task.recurrence === 'CUSTOM') {
    const { interval, parts } = parseWeeklyInterval(cron)
    if (interval > 1) {
      const mm = parts[0] ?? '00'
      const HH = parts[1] ?? '00'
      const timeStr = ` kl ${HH.padStart(2, '0')}:${mm.padStart(2, '0')}`
      const dayPart = parts[4] ?? ''
      const days = dayPart ? dayPart.split(',').map((d) => DAY_MAP[Number(d)] ?? d).join(', ') : ''
      return `🔄 Var ${interval}:e vecka${days ? ': ' + days : ''}${timeStr}`
    }
  }

  const parts = cron.split(' ')
  const mm = parts[0] ?? '00'
  const HH = parts[1] ?? '00'
  const timeStr = ` kl ${HH.padStart(2, '0')}:${mm.padStart(2, '0')}`

  if (task.recurrence === 'DAILY') return `🔄 Dagligen${timeStr}`
  if (task.recurrence === 'WEEKLY') {
    const dayPart = parts[4] ?? ''
    const days = dayPart.split(',').map((d) => DAY_MAP[Number(d)] ?? d).join(', ')
    return `🔄 Varje vecka: ${days}${timeStr}`
  }
  if (task.recurrence === 'MONTHLY') return `🔄 Månadsvis dag ${parts[2]}${timeStr}`
  return `🔄 ${task.recurrence}`
}

// ── Recurring task helpers ────────────────────────────────────────────────────

function taskScheduledHourMinute(task: Task): { h: number; m: number } {
  if (task.recurrenceCron) {
    // parseWeeklyInterval strips any prefix and returns the underlying cron parts
    const { parts } = parseWeeklyInterval(task.recurrenceCron)
    return { m: Number(parts[0] ?? 0), h: Number(parts[1] ?? 0) }
  }
  if (task.dueDate) {
    const d = new Date(task.dueDate)
    return { h: d.getHours(), m: d.getMinutes() }
  }
  return { h: 9, m: 0 }
}

function taskOccursOnDate(task: Task, viewDate: Date): boolean {
  if (!task.dueDate) return false
  const startDate = new Date(task.dueDate)
  const viewDay = new Date(viewDate); viewDay.setHours(0, 0, 0, 0)
  const startDay = new Date(startDate); startDay.setHours(0, 0, 0, 0)

  if (!task.recurrence || task.recurrence === 'NONE') {
    return dateKey(startDate) === dateKey(viewDate)
  }

  if (viewDay < startDay) return false

  // Respect exception dates (individually skipped occurrences)
  if (task.exceptionDates) {
    const exceptions = task.exceptionDates.split(',').filter(Boolean)
    if (exceptions.includes(dateKey(viewDate))) return false
  }

  // Respect end date encoded in cron
  const cron = task.recurrenceCron ?? ''
  const endDate = parseEndDate(cron)
  if (endDate && viewDay > endDate) return false

  if (task.recurrence === 'DAILY') return true

  const { interval, parts } = parseWeeklyInterval(cron)

  if (task.recurrence === 'WEEKLY') {
    const dayPart = parts[4] ?? '*'
    if (dayPart === '*') return true
    return dayPart.split(',').map(Number).includes(viewDate.getDay())
  }

  if (task.recurrence === 'CUSTOM' && interval > 1) {
    const dayPart = parts[4] ?? '*'
    const days = dayPart !== '*' ? dayPart.split(',').map(Number) : [0, 1, 2, 3, 4, 5, 6]
    if (!days.includes(viewDate.getDay())) return false
    const msPerWeek = 7 * 24 * 60 * 60 * 1000
    const weekDiff = Math.round((viewDay.getTime() - startDay.getTime()) / msPerWeek)
    return weekDiff % interval === 0
  }

  if (task.recurrence === 'MONTHLY') {
    const dayOfMonth = parts[2] && parts[2] !== '*' ? Number(parts[2]) : startDate.getDate()
    return viewDate.getDate() === dayOfMonth
  }

  return false
}

/** Returns the date string of the next occurrence on or after `from`. */
function nextOccurrenceDate(task: Task, from: Date): string | null {
  const cursor = new Date(from); cursor.setHours(0, 0, 0, 0)
  for (let i = 0; i < 400; i++) {
    if (taskOccursOnDate(task, cursor)) return dateKey(cursor)
    cursor.setDate(cursor.getDate() + 1)
  }
  return null
}

function isActive(task: Task): boolean {
  return task.status !== 'DONE'
}

/** Parse a YYYY-MM-DD string as a local date (avoids UTC off-by-one). */
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

const fmtSkipDate = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

/** Returns sorted, human-readable Swedish date strings for the exception dates. */
function formatExceptionDates(exceptionDates: string | null | undefined): string[] {
  if (!exceptionDates) return []
  return exceptionDates
    .split(',')
    .filter(Boolean)
    .map(s => ({ raw: s, date: parseLocalDate(s) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map(({ date }) => fmtSkipDate.format(date))
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const FULL_DAY_FMT = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })

function formatViewLabel(d: Date): string {
  const today = new Date()
  if (dateKey(d) === dateKey(today)) {
    const s = FULL_DAY_FMT.format(d)
    return 'Idag — ' + s.charAt(0).toUpperCase() + s.slice(1)
  }
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (dateKey(d) === dateKey(tomorrow)) {
    const s = FULL_DAY_FMT.format(d)
    return 'Imorgon — ' + s.charAt(0).toUpperCase() + s.slice(1)
  }
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (dateKey(d) === dateKey(yesterday)) {
    const s = FULL_DAY_FMT.format(d)
    return 'Igår — ' + s.charAt(0).toUpperCase() + s.slice(1)
  }
  const s = FULL_DAY_FMT.format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Timeline view ────────────────────────────────────────────────────────────

function TimelineView({ tasks, groupId, viewDate, onShiftDay }: {
  tasks: Task[]
  groupId: string
  viewDate: Date
  onShiftDay: (delta: number) => void
}) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const isToday = dateKey(viewDate) === dateKey(new Date())
  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : -1

  // Tasks for this day sorted by scheduled time
  const dayTasks = tasks
    .filter(t => taskOccursOnDate(t, viewDate))
    .map(t => {
      const { h, m } = taskScheduledHourMinute(t)
      return { task: t, h, m, totalMinutes: h * 60 + m }
    })
    .sort((a, b) => a.totalMinutes - b.totalMinutes)

  // Where to insert the "now" divider — index of first future task
  const nowInsertBefore = isToday
    ? dayTasks.findIndex(({ totalMinutes }) => totalMinutes > nowMinutes)
    : -1

  return (
    <div className={styles.timelineWrap}>

      {/* ── Day navigation ── */}
      <div className={styles.tlNav}>
        <button className={styles.tlNavBtn} onClick={() => onShiftDay(-1)} aria-label="Föregående dag">‹</button>
        <span className={styles.tlNavLabel}>{formatViewLabel(viewDate)}</span>
        <button className={styles.tlNavBtn} onClick={() => onShiftDay(1)} aria-label="Nästa dag">›</button>
      </div>

      {/* ── Large digital clock (today only) ── */}
      {isToday && now && (
        <div className={styles.digitalClock}>
          <span className={styles.digitalTime}>
            {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
          </span>
          <span className={styles.digitalLabel}>Klockan nu</span>
        </div>
      )}

      {/* ── Timeline ── */}
      {dayTasks.length === 0 ? (
        <p className={styles.tlEmpty}>Inga uppgifter den här dagen</p>
      ) : (
        <ol className={styles.tlList}>
          {dayTasks.map(({ task, h, m, totalMinutes }, idx) => {
            const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
            const done    = task.status === 'DONE'
            const past    = isToday && !done && nowMinutes >= 0 && totalMinutes < nowMinutes
            const isNext  = isToday && !done && !past && nowInsertBefore === idx

            let stateClass = styles.tlFuture
            if (done)    stateClass = styles.tlDone
            else if (past) stateClass = styles.tlPast
            else if (isNext) stateClass = styles.tlNext

            return (
              <>
                {/* "Nu" divider before the first upcoming task */}
                {nowInsertBefore === idx && (
                  <li key={`now-${idx}`} className={styles.tlNowRow} aria-hidden="true">
                    <div className={styles.tlNowLine} />
                    <span className={styles.tlNowBadge}>▶ Nu</span>
                    <div className={styles.tlNowLine} />
                  </li>
                )}

                <li key={task.id}>
                  <a
                    href={`/groups/${groupId}/tasks/${task.id}?occurrenceDate=${dateKey(viewDate)}`}
                    className={`${styles.tlCard} ${stateClass}`}
                  >
                    {/* Time column */}
                    <div className={styles.tlTime}>{timeStr}</div>

                    {/* Content */}
                    <div className={styles.tlContent}>
                      <div className={styles.tlTitle}>{task.title}</div>
                      {task.description && (
                        <div className={styles.tlDesc}>{task.description}</div>
                      )}
                    </div>

                    {/* Status icon */}
                    <div className={styles.tlIcon}>
                      {done ? '✓' : past ? '!' : '→'}
                    </div>
                  </a>
                </li>
              </>
            )
          })}

          {/* "Nu" divider at end if all tasks are in the past */}
          {isToday && nowInsertBefore === -1 && dayTasks.length > 0 &&
           dayTasks[dayTasks.length - 1].totalMinutes <= nowMinutes && (
            <li className={styles.tlNowRow} aria-hidden="true">
              <div className={styles.tlNowLine} />
              <span className={styles.tlNowBadge}>▶ Nu</span>
              <div className={styles.tlNowLine} />
            </li>
          )}
        </ol>
      )}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function TasksPage({ params }: { params: { groupId: string } }) {
  const { t } = useTranslation()
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<'' | 'active' | 'inactive'>('')
  const [completing, setCompleting] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ taskId: string; skipDate: string } | null>(null)
  const [viewDate, setViewDate] = useState(() => new Date())

  function shiftDay(delta: number) {
    setViewDate(prev => { const next = new Date(prev); next.setDate(next.getDate() + delta); return next })
  }

  useEffect(() => {
    api
      .get<Task[]>(`/api/groups/${params.groupId}/tasks`)
      .then(setAllTasks)
      .finally(() => setLoading(false))
  }, [params.groupId])

  const displayTasks = activeFilter === 'active'
    ? allTasks.filter(isActive)
    : activeFilter === 'inactive'
    ? allTasks.filter(t => !isActive(t))
    : allTasks

  async function handleComplete(taskId: string) {
    setCompleting(taskId)
    try {
      await api.patch(`/api/groups/${params.groupId}/tasks/${taskId}/complete`, {})
      setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'DONE' } : t))
    } finally {
      setCompleting(null)
    }
  }

  function openDeleteDialog(task: Task) {
    const isRecurring = task.recurrence && task.recurrence !== 'NONE'
    if (!isRecurring) {
      if (!window.confirm('Ta bort uppgiften permanent?')) return
      void deleteAll(task.id)
      return
    }
    // Always skip the date currently shown on the clock face — that is exactly
    // the occurrence the user is looking at when they click delete.
    setDeleteDialog({ taskId: task.id, skipDate: dateKey(viewDate) })
  }

  async function skipOccurrence(taskId: string, date: string) {
    setDeleteDialog(null)
    try {
      const updated = await api.patch<Task>(`/api/groups/${params.groupId}/tasks/${taskId}/skip`, { date })
      setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, exceptionDates: updated.exceptionDates } : t))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Kunde inte hoppa över tillfälle.')
    }
  }

  async function deleteAll(taskId: string) {
    setDeleteDialog(null)
    const snapshot = allTasks
    setAllTasks(prev => prev.filter(t => t.id !== taskId))
    try {
      await api.delete(`/api/groups/${params.groupId}/tasks/${taskId}`)
    } catch (e: unknown) {
      setAllTasks(snapshot)
      alert(e instanceof Error ? e.message : 'Kunde inte ta bort uppgiften.')
    }
  }

  const filters = [
    { value: '' as const, label: 'Alla' },
    { value: 'active' as const, label: 'Aktiv' },
    { value: 'inactive' as const, label: 'Utförd' },
  ]

  return (
    <div className={styles.page}>
      {deleteDialog && (
        <div className={styles.dialogOverlay} onClick={() => setDeleteDialog(null)}>
          <div className={styles.dialog} onClick={e => e.stopPropagation()}>
            <p className={styles.dialogTitle}>Ta bort återkommande uppgift</p>
            <p className={styles.dialogText}>
              Vill du hoppa över tillfället {deleteDialog.skipDate} eller ta bort hela serien?
            </p>
            <div className={styles.dialogBtns}>
              <button className={`${styles.dialogBtn} ${styles.dialogBtnSkip}`}
                onClick={() => skipOccurrence(deleteDialog.taskId, deleteDialog.skipDate)}>
                Hoppa över detta tillfälle
              </button>
              <button className={`${styles.dialogBtn} ${styles.dialogBtnDanger}`}
                onClick={() => deleteAll(deleteDialog.taskId)}>
                Ta bort hela serien
              </button>
              <button className={`${styles.dialogBtn} ${styles.dialogBtnCancel}`}
                onClick={() => setDeleteDialog(null)}>
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}

      <header className={styles.header}>
        <h1>{t('nav.tasks')}</h1>
        <a href={`/groups/${params.groupId}/tasks/new`} className={styles.addBtn}>+ Ny uppgift</a>
      </header>

      <div className={styles.content}>
        {/* ── Task list ── */}
        <div className={styles.listSection}>
          <div className={styles.filters}>
            {filters.map(f => (
              <button key={f.value}
                className={`${styles.filterBtn} ${activeFilter === f.value ? styles.activeFilter : ''}`}
                onClick={() => setActiveFilter(f.value)}>
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className={styles.empty}>Laddar...</p>
          ) : displayTasks.length === 0 ? (
            <p className={styles.empty}>Inga uppgifter hittades.</p>
          ) : (
            <ul className={styles.list}>
              {displayTasks.map(task => {
                const rec = formatRecurrence(task)
                const active = isActive(task)
                return (
                  <li key={task.id} className={`${styles.item} ${task.status === 'OVERDUE' ? styles.overdue : ''}`}>
                    <a href={`/groups/${params.groupId}/tasks/${task.id}?occurrenceDate=${dateKey(viewDate)}`} className={styles.itemMain}
                      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                      <div className={styles.itemTitle}>{task.title}</div>
                      <div className={styles.itemMeta}>
                        <span className={`${styles.statusBadge} ${active ? styles.status_OPEN : styles.status_DONE}`}>
                          {active ? 'Aktiv' : 'Utförd'}
                        </span>
                        {task.dueDate && (
                          <span className={styles.dueDate}>{formatRelativeDate(new Date(task.dueDate))}</span>
                        )}
                        {task.assignee && (
                          <span className={styles.assignee}>{task.assignee.email}</span>
                        )}
                      </div>
                      {rec && <div className={styles.recurrence}>{rec}</div>}
                      {(() => {
                        const skipped = formatExceptionDates(task.exceptionDates)
                        return skipped.length > 0 ? (
                          <div className={styles.skippedDates}>
                            <span className={styles.skippedLabel}>⊘ Överhoppade:</span>
                            {skipped.map(d => (
                              <span key={d} className={styles.skippedChip}>{d}</span>
                            ))}
                          </div>
                        ) : null
                      })()}
                      {task.description && (
                        <p className={styles.description}>{task.description}</p>
                      )}
                      {task.createdBy && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          Skapad av: {task.createdBy.email}
                        </span>
                      )}
                    </a>
                    <div className={styles.itemActions}>
                      {active && (
                        <button className={styles.completeBtn}
                          onClick={() => handleComplete(task.id)}
                          disabled={completing === task.id}
                          title={t('task.complete')}>
                          {completing === task.id ? '…' : '✓'}
                        </button>
                      )}
                      <a href={`/groups/${params.groupId}/tasks/${task.id}/edit`}
                        className={styles.iconBtn} title="Redigera">✏️</a>
                      <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        onClick={() => openDeleteDialog(task)} title="Ta bort">🗑</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* ── Timeline view ── */}
        <div className={styles.clockSection}>
          <TimelineView tasks={allTasks} groupId={params.groupId} viewDate={viewDate} onShiftDay={shiftDay} />
        </div>
      </div>
    </div>
  )
}
