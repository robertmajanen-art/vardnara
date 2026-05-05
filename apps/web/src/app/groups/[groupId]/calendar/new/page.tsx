'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import styles from '../../../../login/login.module.css'
import pageStyles from './new.module.css'

const TYPES = ['HEALTHCARE', 'SCHOOL', 'SOCIAL', 'THERAPY', 'FAMILY', 'OTHER'] as const
const TYPE_LABELS: Record<string, string> = {
  HEALTHCARE: 'Sjukvård',
  SCHOOL: 'Skola',
  SOCIAL: 'Socialt',
  THERAPY: 'Terapi',
  FAMILY: 'Familj',
  OTHER: 'Övrigt',
}

function localDatetimeDefault(offsetHours = 1) {
  const d = new Date(Date.now() + offsetHours * 60 * 60 * 1000)
  d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16)
}

export default function NewAppointmentPage({ params }: { params: { groupId: string } }) {
  const router = useRouter()
  const [type, setType] = useState('HEALTHCARE')
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [startTime, setStartTime] = useState(localDatetimeDefault(1))
  const [endTime, setEndTime] = useState(localDatetimeDefault(2))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (endTime && endTime <= startTime) { setError('Sluttiden måste vara efter starttiden.'); return }
    setSaving(true)
    try {
      await api.post(`/api/groups/${params.groupId}/appointments`, {
        type,
        title,
        location: location || null,
        startTime: new Date(startTime).toISOString(),
        endTime: endTime ? new Date(endTime).toISOString() : null,
        notes: notes || null,
      })
      router.push(`/groups/${params.groupId}/calendar`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel.')
      setSaving(false)
    }
  }

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.header}>
        <a href={`/groups/${params.groupId}/calendar`} className={pageStyles.back}>← Tillbaka</a>
        <h1>Nytt besök</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          Typ av besök
          <select value={type} onChange={(e) => setType(e.target.value)} className={styles.input}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>

        <label className={styles.label}>
          Titel
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={styles.input}
            required
            placeholder="t.ex. Läkarbesök på vårdcentralen"
          />
        </label>

        <label className={styles.label}>
          Plats (valfritt)
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={styles.input}
            placeholder="t.ex. Capio Vårdcentral, rum 12"
          />
        </label>

        <label className={styles.label}>
          Starttid
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={styles.input}
            required
          />
        </label>

        <label className={styles.label}>
          Sluttid (valfritt)
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className={styles.input}
          />
        </label>

        <label className={styles.label}>
          Anteckningar (valfritt)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={styles.input}
            rows={4}
            placeholder="Förberedelser, vad som ska tas upp..."
            style={{ resize: 'vertical' }}
          />
        </label>

        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>}

        <button type="submit" className={styles.button} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara besök'}
        </button>
      </form>
    </div>
  )
}
