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
  assignee?: { id: string; email: string } | null
  createdBy: { id: string; email: string }
}

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

  async function handleDelete() {
    if (!window.confirm('Ta bort uppgiften permanent?')) return
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
          <button className={styles.btnDanger} onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Tar bort...' : '🗑 Ta bort'}
          </button>
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  )
}
