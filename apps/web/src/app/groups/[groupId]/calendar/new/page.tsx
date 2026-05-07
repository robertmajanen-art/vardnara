'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import styles from '../../../../login/login.module.css'
import pageStyles from './new.module.css'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '10', '20', '30', '40', '50']

/** Split a local datetime string "YYYY-MM-DDTHH:MM" into parts */
function splitDt(dt: string) {
  const [date = '', time = '09:00'] = dt.split('T')
  const [hour = '09', minute = '00'] = time.split(':')
  return { date, hour, minute }
}

function DateTimePicker({ value, onChange, inputClass }: {
  value: string
  onChange: (v: string) => void
  inputClass: string
}) {
  const { date, hour, minute } = splitDt(value)
  const emit = (d: string, h: string, m: string) => onChange(`${d}T${h}:${m}`)
  return (
    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
      <input
        type="date"
        value={date}
        onChange={(e) => emit(e.target.value, hour, minute)}
        className={inputClass}
        style={{ flex: '1 1 140px', minWidth: 0 }}
        required
      />
      <select
        value={hour}
        onChange={(e) => emit(date, e.target.value, minute)}
        className={inputClass}
        style={{ flex: '0 0 auto' }}
      >
        {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <select
        value={minute}
        onChange={(e) => emit(date, hour, e.target.value)}
        className={inputClass}
        style={{ flex: '0 0 auto' }}
      >
        {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  )
}

const TYPES = ['HEALTHCARE', 'SCHOOL', 'SOCIAL', 'THERAPY', 'FAMILY', 'OTHER'] as const
const TYPE_LABELS: Record<string, string> = {
  HEALTHCARE: 'Sjukvård',
  SCHOOL: 'Skola',
  SOCIAL: 'Socialt',
  THERAPY: 'Terapi',
  FAMILY: 'Familj',
  OTHER: 'Övrigt',
}

/** Format a Date as a local datetime-local string (YYYY-MM-DDTHH:MM) */
function localStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Round up to nearest 10 minutes using local time */
function roundedLocalStr(offsetMs: number): string {
  const tenMin = 10 * 60 * 1000
  return localStr(new Date(Math.ceil((Date.now() + offsetMs) / tenMin) * tenMin))
}

/** Add minutes to a local datetime-local string, return local string */
function addMinsLocal(localDt: string, mins: number): string {
  const [datePart, timePart] = localDt.split('T')
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)
  return localStr(new Date(y, mo - 1, d, h, mi + mins))
}

/** Round minute component to nearest 10 in a local datetime-local string */
function roundTo10Min(localDt: string): string {
  const [datePart, timePart] = localDt.split('T')
  if (!timePart) return localDt
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)
  return localStr(new Date(y, mo - 1, d, h, Math.round(mi / 10) * 10))
}

export default function NewAppointmentPage({ params }: { params: { groupId: string } }) {
  const router = useRouter()

  const startDefault = roundedLocalStr(60 * 60 * 1000)    // 1 hour from now, rounded
  const endDefault = addMinsLocal(startDefault, 30)        // 30 min after start

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
      setEndTime(p.get('endTime') ?? addMinsLocal(s, 30))
    }
    if (p.get('location')) setLocation(p.get('location')!)
    if (p.get('notes')) setNotes(p.get('notes')!)
  }, [])

  function handleStartChange(val: string) {
    const rounded = roundTo10Min(val)
    setStartTime(rounded)
    setEndTime(addMinsLocal(rounded, 30))
  }

  function handleEndChange(val: string) {
    setEndTime(roundTo10Min(val))
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
          <DateTimePicker value={startTime} onChange={handleStartChange} inputClass={styles.input} />
        </label>

        <label className={styles.label}>
          Sluttid (valfritt)
          <DateTimePicker value={endTime} onChange={handleEndChange} inputClass={styles.input} />
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
