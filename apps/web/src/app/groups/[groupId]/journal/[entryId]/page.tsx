'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import styles from '../../detail.module.css'

type JournalEntry = {
  id: string
  entryType: string
  title: string
  body: string
  tags: string[]
  createdAt: string
  author?: { id: string; email: string }
}

const TYPE_LABELS: Record<string, string> = {
  NOTE: '📝 Anteckning', OBSERVATION: '👁️ Observation', INCIDENT: '⚠️ Händelse',
  MOOD: '🌸 Mående', HEALTH_UPDATE: '💜 Hälsouppdatering',
  APPOINTMENT_OUTCOME: '🩺 Besöksutfall', ACTIVITY_CONFIRMED: '✅ Aktivitet bekräftad',
}

const TYPE_COLORS: Record<string, string> = {
  NOTE: '#e7f1ff', OBSERVATION: '#fff3cd', INCIDENT: '#f8d7da',
  MOOD: '#d1e7dd', HEALTH_UPDATE: '#cff4fc',
  APPOINTMENT_OUTCOME: '#e2d9f3', ACTIVITY_CONFIRMED: '#d1e7dd',
}

const fmt = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long', timeStyle: 'short' })

export default function JournalEntryDetailPage({ params }: { params: { groupId: string; entryId: string } }) {
  const router = useRouter()
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<JournalEntry>(`/api/groups/${params.groupId}/journal/${params.entryId}`)
      .then(setEntry)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Kunde inte ladda post.'))
      .finally(() => setLoading(false))
  }, [params.groupId, params.entryId])

  async function handleDelete() {
    if (!window.confirm('Ta bort dagboksposten permanent?')) return
    setDeleting(true)
    try {
      await api.delete(`/api/groups/${params.groupId}/journal/${params.entryId}`)
      router.push(`/groups/${params.groupId}/journal` as never)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Något gick fel.')
      setDeleting(false)
    }
  }

  if (loading) return <div className={styles.loading}>Laddar...</div>
  if (!entry) return <div className={styles.loading}>{error || 'Post hittades inte.'}</div>

  const badgeBg = TYPE_COLORS[entry.entryType] ?? '#f0f0f0'

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <a href={`/groups/${params.groupId}/journal`} className={styles.back}>← Tillbaka</a>
        <h1>{entry.title}</h1>
      </div>

      <div className={styles.card}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Typ</span>
          <span>
            <span className={styles.badge} style={{ background: badgeBg, color: '#333' }}>
              {TYPE_LABELS[entry.entryType] ?? entry.entryType}
            </span>
          </span>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Innehåll</span>
          <p className={styles.body}>{entry.body}</p>
        </div>

        {entry.tags.length > 0 && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Taggar</span>
            <div className={styles.tags}>
              {entry.tags.map(tag => (
                <span key={tag} className={styles.tag}>{tag}</span>
              ))}
            </div>
          </div>
        )}

        <hr className={styles.divider} />

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Skriven av</span>
          <span className={styles.fieldValue}>{entry.author?.email ?? '—'}</span>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Datum</span>
          <span className={styles.fieldValue}>{fmt.format(new Date(entry.createdAt))}</span>
        </div>

        <div className={styles.actions}>
          <a href={`/groups/${params.groupId}/journal/${params.entryId}/edit`} className={styles.btnSecondary}>
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
