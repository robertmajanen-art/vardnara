'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Task } from '../../../../lib/api'
import { formatRelativeDate } from '@vardnara/utils'
import styles from './tasks.module.css'

const STATUS_KEYS: Record<string, string> = {
  OPEN: 'task.status.open',
  IN_PROGRESS: 'task.status.in_progress',
  DONE: 'task.status.done',
  OVERDUE: 'task.status.overdue',
}

export default function TasksPage({ params }: { params: { groupId: string } }) {
  const { t } = useTranslation()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<string>('')
  const [completing, setCompleting] = useState<string | null>(null)

  useEffect(() => {
    const qs = activeFilter ? `?status=${activeFilter}` : ''
    api
      .get<Task[]>(`/api/groups/${params.groupId}/tasks${qs}`)
      .then(setTasks)
      .finally(() => setLoading(false))
  }, [params.groupId, activeFilter])

  async function handleComplete(taskId: string) {
    setCompleting(taskId)
    try {
      await api.patch(`/api/groups/${params.groupId}/tasks/${taskId}/complete`, {})
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'DONE' } : t)))
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
        <a href={`/groups/${params.groupId}/tasks/new`} className={styles.addBtn}>
          + Ny uppgift
        </a>
      </header>

      <div className={styles.filters}>
        {filters.map((f) => (
          <button
            key={f.value}
            className={`${styles.filterBtn} ${activeFilter === f.value ? styles.activeFilter : ''}`}
            onClick={() => { setLoading(true); setActiveFilter(f.value) }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className={styles.empty}>Laddar...</p>
      ) : tasks.length === 0 ? (
        <p className={styles.empty}>Inga uppgifter hittades.</p>
      ) : (
        <ul className={styles.list}>
          {tasks.map((task) => (
            <li key={task.id} className={`${styles.item} ${task.status === 'OVERDUE' ? styles.overdue : ''}`}>
              <a href={`/groups/${params.groupId}/tasks/${task.id}`} className={styles.itemMain} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
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
          ))}
        </ul>
      )}
    </div>
  )
}
