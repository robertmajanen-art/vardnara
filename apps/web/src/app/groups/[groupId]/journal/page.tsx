'use client'

import { useEffect, useState } from 'react'
import { api } from '../../../../lib/api'
import styles from '../tasks/tasks.module.css'

type JournalEntry = {
  id: string
  entryType: string
  title: string
  body: string
  tags: string[]
  createdAt: string
}

const TYPE_LABELS: Record<string, string> = {
  NOTE: 'Anteckning',
  OBSERVATION: 'Observation',
  INCIDENT: 'Händelse',
  MOOD: 'Mående',
  HEALTH_UPDATE: 'Hälsouppdatering',
  APPOINTMENT_OUTCOME: 'Besöksutfall',
  ACTIVITY_CONFIRMED: 'Aktivitet bekräftad',
}

const TYPE_COLORS: Record<string, string> = {
  NOTE: '#e7f1ff',
  OBSERVATION: '#fff3cd',
  INCIDENT: '#f8d7da',
  MOOD: '#d1e7dd',
  HEALTH_UPDATE: '#cff4fc',
  APPOINTMENT_OUTCOME: '#e2d9f3',
  ACTIVITY_CONFIRMED: '#d1e7dd',
}

export default function JournalPage({ params }: { params: { groupId: string } }) {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    const qs = filter ? `?entryType=${filter}` : ''
    api
      .get<{ items: JournalEntry[]; nextCursor: string | null }>(`/api/groups/${params.groupId}/journal${qs}`)
      .then((res) => { setEntries(res.items); setNextCursor(res.nextCursor) })
      .finally(() => setLoading(false))
  }, [params.groupId, filter])

  const filters = [
    { value: '', label: 'Alla' },
    { value: 'NOTE', label: 'Anteckningar' },
    { value: 'OBSERVATION', label: 'Observationer' },
    { value: 'INCIDENT', label: 'Händelser' },
    { value: 'MOOD', label: 'Mående' },
    { value: 'HEALTH_UPDATE', label: 'Hälsa' },
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Dagbok</h1>
        <a href={`/groups/${params.groupId}/journal/new`} className={styles.addBtn}>+ Ny post</a>
      </header>

      <div className={styles.filters}>
        {filters.map((f) => (
          <button
            key={f.value}
            className={`${styles.filterBtn} ${filter === f.value ? styles.activeFilter : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className={styles.empty}>Laddar...</p>
      ) : entries.length === 0 ? (
        <p className={styles.empty}>Inga dagboksposter ännu.</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((e) => (
            <li key={e.id} className={styles.item}>
              <div className={styles.itemMain}>
                <div className={styles.itemMeta}>
                  <span className={styles.statusBadge} style={{ background: TYPE_COLORS[e.entryType] ?? '#f0f0f0', color: '#333' }}>
                    {TYPE_LABELS[e.entryType] ?? e.entryType}
                  </span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
                    {new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(e.createdAt))}
                  </span>
                </div>
                <div className={styles.itemTitle}>{e.title}</div>
                <p className={styles.description}>{e.body}</p>
                {e.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.375rem' }}>
                    {e.tags.map((tag) => (
                      <span key={tag} style={{ fontSize: '0.75rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 999, padding: '0.125rem 0.5rem' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {nextCursor && (
        <button className={styles.filterBtn} style={{ marginTop: '1rem' }}
          onClick={() => {
            api.get<{ items: JournalEntry[]; nextCursor: string | null }>(`/api/groups/${params.groupId}/journal?cursor=${nextCursor}`)
              .then((res) => { setEntries((p) => [...p, ...res.items]); setNextCursor(res.nextCursor) })
          }}>
          Ladda fler
        </button>
      )}
    </div>
  )
}
