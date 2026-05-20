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

// ── Clock face view ─────────────────────────────────────────────────────────

const SVG_W = 500
const SVG_H = 360
const CX = 250
const CY = 190
const R = 100
const CARD_W = 110
const CARD_H = 30
const CARD_GAP = 5
const LEFT_X = CX - R - 30
const RIGHT_X = CX + R + 30

function taskAngle(h: number, m: number): number {
  return (((h % 12) + m / 60) / 12) * Math.PI * 2
}

function clockEdge(θ: number): [number, number] {
  return [CX + R * Math.sin(θ), CY - R * Math.cos(θ)]
}

function cardColor(task: Task, now: Date): string {
  if (task.status === 'DONE') return '#198754'
  if (task.dueDate && new Date(task.dueDate) < now) return '#d97706'
  return '#8b5e9e'
}

function placeLabels(idealCenterY: number[]): number[] {
  const n = idealCenterY.length
  if (n === 0) return []
  const step = CARD_H + CARD_GAP
  let pos = idealCenterY.map(y => y - CARD_H / 2)
  for (let iter = 0; iter < 30; iter++) {
    for (let i = 0; i < n; i++) {
      const ideal = idealCenterY[i] - CARD_H / 2
      pos[i] += (ideal - pos[i]) * 0.4
    }
    for (let i = 1; i < n; i++) {
      if (pos[i] < pos[i - 1] + step) pos[i] = pos[i - 1] + step
    }
    for (let i = n - 2; i >= 0; i--) {
      if (pos[i] > pos[i + 1] - step) pos[i] = pos[i + 1] - step
    }
  }
  return pos
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatViewLabel(d: Date): string {
  const today = new Date()
  if (dateKey(d) === dateKey(today)) return 'Idag'
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (dateKey(d) === dateKey(tomorrow)) return 'Imorgon'
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (dateKey(d) === dateKey(yesterday)) return 'Igår'
  const days = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`
}

function ClockView({ tasks, groupId, viewDate, onShiftDay }: {
  tasks: Task[]
  groupId: string
  viewDate: Date
  onShiftDay: (delta: number) => void
}) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const isToday = dateKey(viewDate) === dateKey(new Date())

  const dayTasks = tasks
    .filter(t => taskOccursOnDate(t, viewDate))
    .map(t => {
      const { h, m } = taskScheduledHourMinute(t)
      const θ = taskAngle(h, m)
      const [px, py] = clockEdge(θ)
      return { task: t, θ, px, py }
    })

  const right = dayTasks.filter(({ θ }) => Math.sin(θ) >= 0).sort((a, b) => a.py - b.py)
  const left  = dayTasks.filter(({ θ }) => Math.sin(θ) <  0).sort((a, b) => a.py - b.py)

  const rightTops = placeLabels(right.map(r => r.py))
  const leftTops  = placeLabels(left.map(l => l.py))

  const nowH = now ? ((now.getHours() % 12 + now.getMinutes() / 60) / 12) * Math.PI * 2 : null
  const nowM = now ? (now.getMinutes() / 60) * Math.PI * 2 : null
  const showHands = isToday && nowH !== null && nowM !== null
  const effectiveNow = now ?? new Date()

  return (
    <div>
      <div className={styles.clockNav}>
        <button className={styles.clockNavBtn} onClick={() => onShiftDay(-1)}>←</button>
        <span className={styles.clockNavLabel}>{formatViewLabel(viewDate)}</span>
        <button className={styles.clockNavBtn} onClick={() => onShiftDay(1)}>→</button>
      </div>

      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" overflow="visible" aria-label="Uppgifter">
        <circle cx={CX} cy={CY} r={R} fill="#2d1040" />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#8b5e9e" strokeWidth={2.5} />

        {Array.from({ length: 12 }, (_, i) => {
          const θ = (i / 12) * Math.PI * 2
          return (
            <line key={i}
              x1={CX + (R - 10) * Math.sin(θ)} y1={CY - (R - 10) * Math.cos(θ)}
              x2={CX + R * Math.sin(θ)}         y2={CY - R * Math.cos(θ)}
              stroke="#8b5e9e" strokeWidth={1.5} />
          )
        })}

        {Array.from({ length: 12 }, (_, i) => {
          const h = i + 1
          const θ = (h / 12) * Math.PI * 2
          return (
            <text key={h} x={CX + 78 * Math.sin(θ)} y={CY - 78 * Math.cos(θ)}
              textAnchor="middle" dominantBaseline="central" fontSize={13} fill="#c8aad8" fontWeight={500}>
              {h}
            </text>
          )
        })}

        {showHands && (
          <>
            <line x1={CX} y1={CY} x2={CX + 58 * Math.sin(nowH!)} y2={CY - 58 * Math.cos(nowH!)}
              stroke="#d4b8e0" strokeWidth={4} strokeLinecap="round" />
            <line x1={CX} y1={CY} x2={CX + 82 * Math.sin(nowM!)} y2={CY - 82 * Math.cos(nowM!)}
              stroke="#b07cc6" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={CX} cy={CY} r={4} fill="#d4b8e0" />
          </>
        )}

        {right.map(({ task, px, py }, i) => {
          const cy2 = rightTops[i]
          const mid = cy2 + CARD_H / 2
          const fill = cardColor(task, effectiveNow)
          const label = task.title.length > 14 ? task.title.slice(0, 13) + '…' : task.title
          return (
            <a key={task.id} href={`/groups/${groupId}/tasks/${task.id}`} style={{ cursor: 'pointer' }}>
              <path d={`M ${px},${py} L ${RIGHT_X},${py} L ${RIGHT_X},${mid}`}
                stroke={fill} strokeWidth={1.2} opacity={0.55} fill="none" />
              <rect x={RIGHT_X} y={cy2} width={CARD_W} height={CARD_H} rx={6} fill={fill} />
              <text x={RIGHT_X + CARD_W / 2} y={mid} textAnchor="middle" dominantBaseline="central"
                fontSize={11} fill="white" fontWeight={600}>{label}</text>
            </a>
          )
        })}

        {left.map(({ task, px, py }, i) => {
          const cy2 = leftTops[i]
          const mid = cy2 + CARD_H / 2
          const fill = cardColor(task, effectiveNow)
          const label = task.title.length > 14 ? task.title.slice(0, 13) + '…' : task.title
          return (
            <a key={task.id} href={`/groups/${groupId}/tasks/${task.id}`} style={{ cursor: 'pointer' }}>
              <path d={`M ${px},${py} L ${LEFT_X},${py} L ${LEFT_X},${mid}`}
                stroke={fill} strokeWidth={1.2} opacity={0.55} fill="none" />
              <rect x={LEFT_X - CARD_W} y={cy2} width={CARD_W} height={CARD_H} rx={6} fill={fill} />
              <text x={LEFT_X - CARD_W / 2} y={mid} textAnchor="middle" dominantBaseline="central"
                fontSize={11} fill="white" fontWeight={600}>{label}</text>
            </a>
          )
        })}

        {[
          { fill: '#198754', label: 'Utförd' },
          { fill: '#d97706', label: 'Passerad' },
          { fill: '#8b5e9e', label: 'Kommande' },
        ].map(({ fill, label }, i) => (
          <g key={label} transform={`translate(${10 + i * 105}, ${SVG_H - 14})`}>
            <rect width={10} height={10} rx={2} fill={fill} y={-5} />
            <text x={14} fontSize={10} fill="#8b7a9e" dominantBaseline="central">{label}</text>
          </g>
        ))}
      </svg>
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
    // If the task occurs on the currently displayed clock date, skip that date.
    // Otherwise fall back to the next occurrence from today.
    const skipDate = taskOccursOnDate(task, viewDate)
      ? dateKey(viewDate)
      : (nextOccurrenceDate(task, new Date()) ?? dateKey(new Date()))
    setDeleteDialog({ taskId: task.id, skipDate })
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
                    <a href={`/groups/${params.groupId}/tasks/${task.id}`} className={styles.itemMain}
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

        {/* ── Clock view ── */}
        <div className={styles.clockSection}>
          <ClockView tasks={allTasks} groupId={params.groupId} viewDate={viewDate} onShiftDay={shiftDay} />
        </div>
      </div>
    </div>
  )
}
