'use client'

import { useEffect, useState } from 'react'
import { api } from '../../../../../lib/api'
import styles from '../../detail.module.css'

type Task = {
  id: string
  title: string
  description?: string | null
  status: string
  dueDate?: string | null
  assignee?: { id: string; email: string } | null
  createdBy: { id: string; email: string }
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Öppen',
  IN_PROGRESS: 'Pågående',
  DONE: 'Klar',
  OVERDUE: 'Försenad',
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  OPEN: { bg: '#e7f1ff', fg: '#0d6efd' },
  IN_PROGRESS: { bg: '#fff3cd', fg: '#856404' },
  DONE: { bg: '#d1e7dd', fg: '#0a3622' },
  OVERDUE: { bg: '#f8d7da', fg: '#58151c' },
}

const fmtDate = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long' })

export default function TaskDetailPage({
  params,
}: {
  params: { groupId: string; taskId: string }
}) {
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
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
      setTask((t) => (t ? { ...t, status: 'DONE' } : t))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Något gick fel.')
    } finally {
      setCompleting(false)
    }
  }

  if (loading) return <div className={styles.loading}>Laddar...</div>
  if (!task) return <div className={styles.loading}>{error || 'Uppgift hittades inte.'}</div>

  const colors = STATUS_COLORS[task.status] ?? { bg: '#f0f0f0', fg: '#333' }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <a href={`/groups/${params.groupId}/tasks`} className={styles.back}>
          ← Tillbaka
        </a>
        <h1>{task.title}</h1>
      </div>

      <div className={styles.card}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <span>
            <span className={styles.badge} style={{ background: colors.bg, color: colors.fg }}>
              {STATUS_LABELS[task.status] ?? task.status}
            </span>
          </span>
        </div>

        {task.description && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Beskrivning</span>
            <p className={styles.body}>{task.description}</p>
          </div>
        )}

        {task.dueDate && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Förfallodatum</span>
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

        {task.status !== 'DONE' && (
          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={handleComplete} disabled={completing}>
              {completing ? 'Markerar...' : '✓ Markera som klar'}
            </button>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  )
}
