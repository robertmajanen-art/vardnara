'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import styles from '../../detail.module.css'

type Appointment = {
  id: string
  title: string
  type: string
  startTime: string
  endTime?: string | null
  location?: string | null
  notes?: string | null
  assignee?: { id: string; email: string } | null
  assigneeAccepted?: boolean | null
  createdBy: { id: string; email: string }
}

const TYPE_LABELS: Record<string, string> = {
  HEALTHCARE: '🩺 Sjukvård', SCHOOL: '🎒 Skola', SOCIAL: '🤝 Socialt',
  THERAPY: '🌿 Terapi', FAMILY: '💜 Familj', OTHER: '✨ Övrigt',
}

const fmt = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long', timeStyle: 'short' })

export default function AppointmentDetailPage({ params }: { params: { groupId: string; appointmentId: string } }) {
  const router = useRouter()
  const [apt, setApt] = useState<Appointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<Appointment>(`/api/groups/${params.groupId}/appointments/${params.appointmentId}`)
      .then(setApt)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Kunde inte ladda besök.'))
      .finally(() => setLoading(false))
  }, [params.groupId, params.appointmentId])

  async function handleDelete() {
    if (!window.confirm('Ta bort besöket permanent?')) return
    setDeleting(true)
    try {
      await api.delete(`/api/groups/${params.groupId}/appointments/${params.appointmentId}`)
      router.push(`/groups/${params.groupId}/calendar` as never)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Något gick fel.')
      setDeleting(false)
    }
  }

  if (loading) return <div className={styles.loading}>Laddar...</div>
  if (!apt) return <div className={styles.loading}>{error || 'Besök hittades inte.'}</div>

  const acceptedLabel =
    apt.assigneeAccepted === true ? 'Accepterat'
    : apt.assigneeAccepted === false ? 'Avböjt'
    : 'Väntar på svar'

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <a href={`/groups/${params.groupId}/calendar`} className={styles.back}>← Tillbaka</a>
        <h1>{apt.title}</h1>
      </div>

      <div className={styles.card}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Typ av besök</span>
          <span>
            <span className={styles.badge} style={{ background: '#e7f1ff', color: '#0d6efd' }}>
              {TYPE_LABELS[apt.type] ?? apt.type}
            </span>
          </span>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Starttid</span>
          <span className={styles.fieldValue}>{fmt.format(new Date(apt.startTime))}</span>
        </div>

        {apt.endTime && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Sluttid</span>
            <span className={styles.fieldValue}>{fmt.format(new Date(apt.endTime))}</span>
          </div>
        )}

        {apt.location && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Plats</span>
            <span className={styles.fieldValue}>{apt.location}</span>
          </div>
        )}

        {apt.assignee && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Ansvarig</span>
            <span className={styles.fieldValue}>
              {apt.assignee.email}
              <span style={{ marginLeft: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                ({acceptedLabel})
              </span>
            </span>
          </div>
        )}

        {apt.notes && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Anteckningar</span>
            <p className={styles.body}>{apt.notes}</p>
          </div>
        )}

        <hr className={styles.divider} />

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Skapad av</span>
          <span className={styles.fieldValue}>{apt.createdBy.email}</span>
        </div>

        <div className={styles.actions}>
          <a href={`/groups/${params.groupId}/appointments/${params.appointmentId}/edit`} className={styles.btnSecondary}>
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
