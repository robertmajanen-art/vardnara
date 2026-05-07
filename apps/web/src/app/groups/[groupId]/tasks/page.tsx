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
const LEFT_X = CX - R - 30   // 120 — right edge of left cards / line endpoint
const RIGHT_X = CX + R + 30  // 380 — left edge of right cards / line endpoint
const V_MARGIN = 28

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

function CardY(idx: number, total: number): number {
  const slot = (SVG_H - V_MARGIN * 2) / Math.max(total, 1)
  return V_MARGIN + slot * idx + slot / 2 - CARD_H / 2
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ClockView({ tasks }: { tasks: Task[] }) {
  const now = new Date()
  const key = todayKey()

  const todayTasks = tasks
    .filter((t) => {
      if (!t.dueDate) return false
      const d = new Date(t.dueDate)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === key
    })
    .map((t) => ({ task: t, θ: taskAngle(t.dueDate!) }))

  const right = todayTasks.filter(({ θ }) => Math.sin(θ) >= 0).sort((a, b) => a.θ - b.θ)
  const left  = todayTasks.filter(({ θ }) => Math.sin(θ) <  0).sort((a, b) => b.θ - a.θ)

  // Current time hand angles
  const nowH = ((now.getHours() % 12 + now.getMinutes() / 60) / 12) * Math.PI * 2
  const nowM = (now.getMinutes() / 60) * Math.PI * 2

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" aria-label="Uppgifter idag">

      {/* "Idag" label */}
      <text x={CX} y={14} textAnchor="middle" fontSize={12} fontWeight={700}
        fill="#8b5e9e" letterSpacing={1}>IDAG</text>

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

      {/* Hour hand */}
      <line x1={CX} y1={CY}
        x2={CX + 58 * Math.sin(nowH)} y2={CY - 58 * Math.cos(nowH)}
        stroke="#d4b8e0" strokeWidth={4} strokeLinecap="round" />

      {/* Minute hand */}
      <line x1={CX} y1={CY}
        x2={CX + 82 * Math.sin(nowM)} y2={CY - 82 * Math.cos(nowM)}
        stroke="#b07cc6" strokeWidth={2.5} strokeLinecap="round" />

      {/* Centre dot */}
      <circle cx={CX} cy={CY} r={4} fill="#d4b8e0" />

      {/* Right-side task cards */}
      {right.map(({ task, θ }, i) => {
        const [px, py] = clockEdge(θ)
        const cy2 = CardY(i, right.length)
        const mid = cy2 + CARD_H / 2
        const fill = cardColor(task, now)
        const label = task.title.length > 14 ? task.title.slice(0, 13) + '…' : task.title
        return (
          <g key={task.id}>
            <line x1={px} y1={py} x2={RIGHT_X} y2={mid} stroke={fill} strokeWidth={1.2} opacity={0.55} />
            <rect x={RIGHT_X} y={cy2} width={CARD_W} height={CARD_H} rx={6} fill={fill} />
            <text x={RIGHT_X + 7} y={cy2 + CARD_H / 2} dominantBaseline="central"
              fontSize={11} fill="white" fontWeight={600}>{label}</text>
          </g>
        )
      })}

      {/* Left-side task cards */}
      {left.map(({ task, θ }, i) => {
        const [px, py] = clockEdge(θ)
        const cy2 = CardY(i, left.length)
        const mid = cy2 + CARD_H / 2
        const fill = cardColor(task, now)
        const label = task.title.length > 14 ? task.title.slice(0, 13) + '…' : task.title
        return (
          <g key={task.id}>
            <line x1={px} y1={py} x2={LEFT_X} y2={mid} stroke={fill} strokeWidth={1.2} opacity={0.55} />
            <rect x={LEFT_X - CARD_W} y={cy2} width={CARD_W} height={CARD_H} rx={6} fill={fill} />
            <text x={LEFT_X - 7} y={cy2 + CARD_H / 2} dominantBaseline="central"
              fontSize={11} fill="white" fontWeight={600} textAnchor="end">{label}</text>
          </g>
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
          <ClockView tasks={allTasks} />
        </div>
      </div>
    </div>
  )
}
