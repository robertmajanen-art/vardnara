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

function formatRecurrence(task: Task): string | null {
  if (!task.recurrence || task.recurrence === 'NONE') return null
  const cron = task.recurrenceCron ?? ''
  const parts = cron.split(' ')
  const mm = parts[0] ?? '00'
  const HH = parts[1] ?? '00'
  const timeStr = ` kl ${HH.padStart(2, '0')}:${mm.padStart(2, '0')}`

  if (task.recurrence === 'DAILY') return `🔄 Dagligen${timeStr}`
  if (task.recurrence === 'WEEKLY') {
    const dayPart = parts[4] ?? ''
    const days = dayPart.split(',').map((d) => DAY_MAP[Number(d)] ?? d).join(', ')
    return `🔄 Veckovis: ${days}${timeStr}`
  }
  if (task.recurrence === 'MONTHLY') {
    return `🔄 Månadsvis dag ${parts[2]}${timeStr}`
  }
  return `🔄 ${task.recurrence}`
}

// ── Clock face view ─────────────────────────────────────────────────────────

const SVG_W = 500
const SVG_H = 360
const CX = 250
const CY = 190
const R = 100            // clock radius
const CARD_W = 110
const CARD_H = 30
const CARD_GAP = 5       // min gap between stacked cards
const LEFT_X = CX - R - 30   // 120 — right edge of left cards / line endpoint
const RIGHT_X = CX + R + 30  // 380 — left edge of right cards / line endpoint

function taskAngle(dueDate: string): number {
  const d = new Date(dueDate)
  const h = d.getHours() % 12
  const m = d.getMinutes()
  return ((h + m / 60) / 12) * Math.PI * 2
}

function clockEdge(θ: number): [number, number] {
  return [CX + R * Math.sin(θ), CY - R * Math.cos(θ)]
}

function cardColor(task: Task, now: Date): string {
  if (task.status === 'DONE') return '#198754'
  if (task.dueDate && new Date(task.dueDate) < now) return '#d97706'
  return '#8b5e9e'
}

/**
 * Place n labels as close as possible to their ideal Y (card center),
 * resolving overlaps while preserving order. Cards may go outside SVG
 * bounds — SVG uses overflow="visible".
 */
function placeLabels(idealCenterY: number[]): number[] {
  const n = idealCenterY.length
  if (n === 0) return []
  const step = CARD_H + CARD_GAP

  // Initial: card top = ideal center - half height
  let pos = idealCenterY.map(y => y - CARD_H / 2)

  for (let iter = 0; iter < 30; iter++) {
    // Pull toward ideal (damped)
    for (let i = 0; i < n; i++) {
      const ideal = idealCenterY[i] - CARD_H / 2
      pos[i] += (ideal - pos[i]) * 0.4
    }
    // Forward pass: push down to clear previous card
    for (let i = 1; i < n; i++) {
      if (pos[i] < pos[i - 1] + step) pos[i] = pos[i - 1] + step
    }
    // Backward pass: push up to clear next card
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

function ClockView({ tasks, groupId }: { tasks: Task[]; groupId: string }) {
  const [viewDate, setViewDate] = useState(() => new Date())
  // null until client hydrates — prevents server (UTC) time from showing on the hands
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const isToday = dateKey(viewDate) === dateKey(new Date())

  function shiftDay(delta: number) {
    setViewDate(prev => {
      const next = new Date(prev)
      next.setDate(next.getDate() + delta)
      return next
    })
  }

  const viewKey = dateKey(viewDate)
  const dayTasks = tasks
    .filter(t => t.dueDate && dateKey(new Date(t.dueDate)) === viewKey)
    .map(t => {
      const θ = taskAngle(t.dueDate!)
      const [px, py] = clockEdge(θ)
      return { task: t, θ, px, py }
    })

  // Both sides sorted by py ascending → same card order top-to-bottom → lines never cross
  const right = dayTasks.filter(({ θ }) => Math.sin(θ) >= 0).sort((a, b) => a.py - b.py)
  const left  = dayTasks.filter(({ θ }) => Math.sin(θ) <  0).sort((a, b) => a.py - b.py)

  const rightTops = placeLabels(right.map(r => r.py))
  const leftTops  = placeLabels(left.map(l => l.py))

  // Clock hand angles — only computed when now is known (client-side local time)
  const nowH = now ? ((now.getHours() % 12 + now.getMinutes() / 60) / 12) * Math.PI * 2 : null
  const nowM = now ? (now.getMinutes() / 60) * Math.PI * 2 : null
  const showHands = isToday && nowH !== null && nowM !== null

  const effectiveNow = now ?? new Date()

  return (
    <div>
      <div className={styles.clockNav}>
        <button className={styles.clockNavBtn} onClick={() => shiftDay(-1)}>←</button>
        <span className={styles.clockNavLabel}>{formatViewLabel(viewDate)}</span>
        <button className={styles.clockNavBtn} onClick={() => shiftDay(1)}>→</button>
      </div>

      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" overflow="visible" aria-label="Uppgifter">

        {/* Clock background */}
        <circle cx={CX} cy={CY} r={R} fill="#2d1040" />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#8b5e9e" strokeWidth={2.5} />

        {/* Tick marks */}
        {Array.from({ length: 12 }, (_, i) => {
          const θ = (i / 12) * Math.PI * 2
          return (
            <line key={i}
              x1={CX + (R - 10) * Math.sin(θ)} y1={CY - (R - 10) * Math.cos(θ)}
              x2={CX + R * Math.sin(θ)}         y2={CY - R * Math.cos(θ)}
              stroke="#8b5e9e" strokeWidth={1.5} />
          )
        })}

        {/* Hour numbers */}
        {Array.from({ length: 12 }, (_, i) => {
          const h = i + 1
          const θ = (h / 12) * Math.PI * 2
          return (
            <text key={h}
              x={CX + 78 * Math.sin(θ)} y={CY - 78 * Math.cos(θ)}
              textAnchor="middle" dominantBaseline="central"
              fontSize={13} fill="#c8aad8" fontWeight={500}>
              {h}
            </text>
          )
        })}

        {/* Clock hands — only for today, only after client hydration (local time) */}
        {showHands && (
          <>
            <line x1={CX} y1={CY}
              x2={CX + 58 * Math.sin(nowH!)} y2={CY - 58 * Math.cos(nowH!)}
              stroke="#d4b8e0" strokeWidth={4} strokeLinecap="round" />
            <line x1={CX} y1={CY}
              x2={CX + 82 * Math.sin(nowM!)} y2={CY - 82 * Math.cos(nowM!)}
              stroke="#b07cc6" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={CX} cy={CY} r={4} fill="#d4b8e0" />
          </>
        )}

        {/* Right-side task cards */}
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

        {/* Left-side task cards */}
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

        {/* Legend */}
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

// ── Status labels ───────────────────────────────────────────────────────────

const STATUS_KEYS: Record<string, string> = {
  OPEN: 'task.status.open',
  IN_PROGRESS: 'task.status.in_progress',
  DONE: 'task.status.done',
  OVERDUE: 'task.status.overdue',
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function TasksPage({ params }: { params: { groupId: string } }) {
  const { t } = useTranslation()
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('')
  const [completing, setCompleting] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Task[]>(`/api/groups/${params.groupId}/tasks`)
      .then(setAllTasks)
      .finally(() => setLoading(false))
  }, [params.groupId])

  const displayTasks = activeFilter
    ? allTasks.filter((t) => t.status === activeFilter)
    : allTasks

  async function handleComplete(taskId: string) {
    setCompleting(taskId)
    try {
      await api.patch(`/api/groups/${params.groupId}/tasks/${taskId}/complete`, {})
      setAllTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: 'DONE' } : t))
    } finally {
      setCompleting(null)
    }
  }

  const filters = [
    { value: '', label: 'Alla' },
    { value: 'OPEN', label: t('task.status.open') },
    { value: 'IN_PROGRESS', label: t('task.status.in_progress') },
    { value: 'OVERDUE', label: t('task.status.overdue') },
    { value: 'DONE', label: t('task.status.done') },
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('nav.tasks')}</h1>
        <a href={`/groups/${params.groupId}/tasks/new`} className={styles.addBtn}>+ Ny uppgift</a>
      </header>

      <div className={styles.content}>
        {/* ── Task list ── */}
        <div className={styles.listSection}>
          <div className={styles.filters}>
            {filters.map((f) => (
              <button
                key={f.value}
                className={`${styles.filterBtn} ${activeFilter === f.value ? styles.activeFilter : ''}`}
                onClick={() => setActiveFilter(f.value)}
              >
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
              {displayTasks.map((task) => {
                const rec = formatRecurrence(task)
                return (
                  <li key={task.id} className={`${styles.item} ${task.status === 'OVERDUE' ? styles.overdue : ''}`}>
                    <a
                      href={`/groups/${params.groupId}/tasks/${task.id}`}
                      className={styles.itemMain}
                      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                    >
                      <div className={styles.itemTitle}>{task.title}</div>
                      <div className={styles.itemMeta}>
                        <span className={`${styles.statusBadge} ${styles[`status_${task.status}`]}`}>
                          {t(STATUS_KEYS[task.status] ?? task.status)}
                        </span>
                        {task.dueDate && (
                          <span className={styles.dueDate}>
                            {formatRelativeDate(new Date(task.dueDate))}
                          </span>
                        )}
                        {task.assignee && (
                          <span className={styles.assignee}>{task.assignee.email}</span>
                        )}
                      </div>
                      {rec && <div className={styles.recurrence}>{rec}</div>}
                      {task.description && (
                        <p className={styles.description}>{task.description}</p>
                      )}
                    </a>
                    {task.status !== 'DONE' && (
                      <button
                        className={styles.completeBtn}
                        onClick={() => handleComplete(task.id)}
                        disabled={completing === task.id}
                        title={t('task.complete')}
                      >
                        {completing === task.id ? '...' : '✓'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* ── Clock view ── */}
        <div className={styles.clockSection}>
          <ClockView tasks={allTasks} groupId={params.groupId} />
        </div>
      </div>
    </div>
  )
}
