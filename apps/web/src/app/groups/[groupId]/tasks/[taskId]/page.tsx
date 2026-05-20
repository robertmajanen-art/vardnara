'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import styles from '../../detail.module.css'

type Task = {
  id: string
  title: string
  description?: string | null
  status: string
  dueDate?: string | null
  recurrence?: string
  recurrenceCron?: string | null
  exceptionDates?: string | null
  assignee?: { id: string; email: string } | null
  createdBy: { id: string; email: string }
}

const DAY_MAP: Record<number, string> = {
  0: 'Sön', 1: 'Mån', 2: 'Tis', 3: 'Ons', 4: 'Tor', 5: 'Fre', 6: 'Lör',
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseCronInterval(cron: string): { interval: number; parts: string[] } {
  const base = cron.replace(/ UNTIL:\d{4}-\d{2}-\d{2}$/, '')
  if (base.startsWith('BIWEEKLY ')) return { interval: 2, parts: base.slice('BIWEEKLY '.length).split(' ') }
  const m = base.match(/^WEEKLY_(\d+) (.+)$/)
  if (m) return { interval: Number(m[1]), parts: m[2].split(' ') }
  return { interval: 1, parts: base.split(' ') }
}

/** Returns the YYYY-MM-DD string of the next occurrence on or after `from`. */
function nextOccurrenceDate(task: Task, from: Date): string | null {
  if (!task.dueDate) return null
  const startDay = new Date(task.dueDate); startDay.setHours(0, 0, 0, 0)
  const exceptions = new Set((task.exceptionDates ?? '').split(',').filter(Boolean))
  const cursor = new Date(from); cursor.setHours(0, 0, 0, 0)
  const cron = task.recurrenceCron ?? ''
  const { interval, parts } = parseCronInterval(cron)

  for (let i = 0; i < 400; i++) {
    if (cursor >= startDay) {
      const k = dateKey(cursor)
      if (!exceptions.has(k)) {
        let occurs = false
        if (task.recurrence === 'DAILY') {
          occurs = true
        } else if (task.recurrence === 'WEEKLY') {
          const dayPart = parts[4] ?? '*'
          occurs = dayPart === '*' || dayPart.split(',').map(Number).includes(cursor.getDay())
        } else if (task.recurrence === 'CUSTOM' && interval > 1) {
          const dayPart = parts[4] ?? '*'
          const days = dayPart !== '*' ? dayPart.split(',').map(Number) : [0,1,2,3,4,5,6]
          if (days.includes(cursor.getDay())) {
            const weekDiff = Math.round((cursor.getTime() - startDay.getTime()) / (7 * 86400000))
            occurs = weekDiff % interval === 0
          }
        } else if (task.recurrence === 'MONTHLY') {
          const dayOfMonth = parts[2] && parts[2] !== '*' ? Number(parts[2]) : startDay.getDate()
          occurs = cursor.getDate() === dayOfMonth
        }
        if (occurs) return k
      }
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return null
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
    const days = (parts[4] ?? '').split(',').map(d => DAY_MAP[Number(d)] ?? d).join(', ')
    return `🔄 Veckovis: ${days}${timeStr}`
  }
  if (task.recurrence === 'MONTHLY') return `🔄 Månadsvis dag ${parts[2]}${timeStr}`
  return `🔄 ${task.recurrence}`
}

const fmtDate = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long', timeStyle: 'short' })

export default function TaskDetailPage({ params }: { params: { groupId: string; taskId: string } }) {
  const router = useRouter()
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [skipDate, setSkipDate] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<Task>(`/api/groups/${params.groupId}/tasks/${params.taskId}`)
      .then(setTask)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Kunde inte ladda uppgift.'))
      .finally(() => setLoading(false))
  }, [params.groupId, params.taskId])

  async function handleComplete() {
    setCompleting(true)
    try {
      await api.patch(`/api/groups/${params.groupId}/tasks/${params.taskId}/complete`, {})
      setTask(t => (t ? { ...t, status: 'DONE' } : t))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Något gick fel.')
    } finally {
      setCompleting(false)
    }
  }

  function requestDelete() {
    if (task?.recurrence && task.recurrence !== 'NONE') {
      setSkipDate(nextOccurrenceDate(task, new Date()))
      setDeleteDialog(true)
    } else {
      if (!window.confirm('Ta bort uppgiften permanent?')) return
      void handleDelete()
    }
  }

  async function handleSkipOccurrence() {
    if (!skipDate) return
    setDeleteDialog(false)
    try {
      const updated = await api.patch<Task>(
        `/api/groups/${params.groupId}/tasks/${params.taskId}/skip`,
        { date: skipDate }
      )
      setTask(t => t ? { ...t, exceptionDates: updated.exceptionDates } : t)
      setSkipDate(nextOccurrenceDate({ ...task!, exceptionDates: updated.exceptionDates }, new Date()))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunde inte hoppa över tillfälle.')
    }
  }

  async function handleDelete() {
    setDeleteDialog(false)
    setDeleting(true)
    try {
      await api.delete(`/api/groups/${params.groupId}/tasks/${params.taskId}`)
      router.push(`/groups/${params.groupId}/tasks` as never)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Något gick fel.')
      setDeleting(false)
    }
  }

  if (loading) return <div className={styles.loading}>Laddar...</div>
  if (!task) return <div className={styles.loading}>{error || 'Uppgift hittades inte.'}</div>

  const active = task.status !== 'DONE'
  const rec = formatRecurrence(task)

  return (
    <div className={styles.page}>
      {deleteDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setDeleteDialog(false)}>
          <div style={{ background: 'var(--color-bg)', borderRadius: 12, padding: '1.5rem', maxWidth: 340, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 700, marginBottom: '0.375rem' }}>Ta bort återkommande uppgift</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Vill du hoppa över nästa tillfälle{skipDate ? ` (${skipDate})` : ''} eller ta bort hela serien permanent?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {skipDate && (
                <button onClick={() => handleSkipOccurrence()}
                  style={{ padding: '0.625rem', borderRadius: 8, background: 'var(--color-primary)', color: 'white', border: 'none', fontWeight: 500, cursor: 'pointer' }}>
                  Hoppa över detta tillfälle
                </button>
              )}
              <button onClick={() => handleDelete()}
                style={{ padding: '0.625rem', borderRadius: 8, background: '#dc2626', color: 'white', border: 'none', fontWeight: 500, cursor: 'pointer' }}>
                Ta bort hela serien
              </button>
              <button onClick={() => setDeleteDialog(false)}
                style={{ padding: '0.625rem', borderRadius: 8, background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', cursor: 'pointer' }}>
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <a href={`/groups/${params.groupId}/tasks`} className={styles.back}>← Tillbaka</a>
        <h1>{task.title}</h1>
      </div>

      <div className={styles.card}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <span>
            <span className={styles.badge}
              style={active
                ? { background: '#f0e8ff', color: '#8b5e9e' }
                : { background: '#d1e7dd', color: '#0a3622' }}>
              {active ? 'Aktiv' : 'Inaktiv'}
            </span>
          </span>
        </div>

        {rec && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Återkommande</span>
            <span className={styles.fieldValue}>{rec}</span>
          </div>
        )}

        {task.description && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Beskrivning</span>
            <p className={styles.body}>{task.description}</p>
          </div>
        )}

        {task.dueDate && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              {task.recurrence && task.recurrence !== 'NONE' ? 'Starttid' : 'Förfallotid'}
            </span>
            <span className={styles.fieldValue}>{fmtDate.format(new Date(task.dueDate))}</span>
          </div>
        )}

        {task.assignee && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Ansvarig</span>
            <span className={styles.fieldValue}>{task.assignee.email}</span>
          </div>
        )}

        <hr className={styles.divider} />

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Skapad av</span>
          <span className={styles.fieldValue}>{task.createdBy.email}</span>
        </div>

        <div className={styles.actions}>
          {active && (
            <button className={styles.btnPrimary} onClick={handleComplete} disabled={completing}>
              {completing ? 'Markerar...' : '✓ Markera som klar'}
            </button>
          )}
          <a href={`/groups/${params.groupId}/tasks/${params.taskId}/edit`} className={styles.btnSecondary}>
            ✏️ Redigera
          </a>
          <button className={styles.btnDanger} onClick={requestDelete} disabled={deleting}>
            {deleting ? 'Tar bort...' : '🗑 Ta bort'}
          </button>
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  )
}
