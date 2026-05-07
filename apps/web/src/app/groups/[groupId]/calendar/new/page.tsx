'use client'

import { useEffect, useState } from 'react'
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

/** Round up to nearest 10 minutes, return datetime-local string (UTC-based, matches input format) */
function roundedDatetimeStr(offsetMs: number): string {
  const tenMin = 10 * 60 * 1000
  const d = new Date(Math.ceil((Date.now() + offsetMs) / tenMin) * tenMin)
  d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16)
}

function addMins(datetimeStr: string, mins: number): string {
  const d = new Date(datetimeStr)
  d.setMinutes(d.getMinutes() + mins)
  return d.toISOString().slice(0, 16)
}

export default function NewAppointmentPage({ params }: { params: { groupId: string } }) {
  const router = useRouter()

  const startDefault = roundedDatetimeStr(60 * 60 * 1000)   // 1 hour from now
  const endDefault = addMins(startDefault, 30)               // 30 min after start

  const [type, setType] = useState('HEALTHCARE')
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [startTime, setStartTime] = useState(startDefault)
  const [endTime, setEndTime] = useState(endDefault)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Pre-fill from URL search params (e.g. when arriving from journal appointment prompt)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('title')) setTitle(p.get('title')!)
    if (p.get('type') && TYPES.includes(p.get('type') as (typeof TYPES)[number])) {
      setType(p.get('type')!)
    }
    if (p.get('startTime')) {
      const s = p.get('startTime')!
      setStartTime(s)
      setEndTime(p.get('endTime') ?? addMins(s, 30))
    }
    if (p.get('location')) setLocation(p.get('location')!)
    if (p.get('notes')) setNotes(p.get('notes')!)
  }, [])

  function handleStartChange(val: string) {
    setStartTime(val)
    setEndTime(addMins(val, 30))
  }

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
      router.push(`/groups/${params.groupId}/calendar` as never)
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
            onChange={(e) => handleStartChange(e.target.value)}
            className={styles.input}
            step="600"
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
            step="600"
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
