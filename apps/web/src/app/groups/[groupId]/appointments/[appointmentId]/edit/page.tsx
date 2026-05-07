'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../../lib/api'
import detailStyles from '../../../detail.module.css'
import formStyles from '../../../../../login/login.module.css'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '10', '20', '30', '40', '50']
const TYPES = ['HEALTHCARE', 'SCHOOL', 'SOCIAL', 'THERAPY', 'FAMILY', 'OTHER'] as const
const TYPE_LABELS: Record<string, string> = {
  HEALTHCARE: '🩺 Sjukvård', SCHOOL: '🎒 Skola', SOCIAL: '🤝 Socialt',
  THERAPY: '🌿 Terapi', FAMILY: '💜 Familj', OTHER: '✨ Övrigt',
}

type ExistingAppointment = {
  type: string
  title: string
  location?: string | null
  notes?: string | null
  startTime: string
  endTime?: string | null
}

function localStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function splitDt(dt: string) {
  const [date = '', time = '09:00'] = dt.split('T')
  const [hour = '09', minute = '00'] = time.split(':')
  return { date, hour, minute }
}

function DateTimePicker({ value, onChange, inputClass }: {
  value: string; onChange: (v: string) => void; inputClass: string
}) {
  const { date, hour, minute } = splitDt(value)
  const [localDate, setLocalDate] = useState(date)
  useEffect(() => { setLocalDate(splitDt(value).date) }, [value])
  const emit = (d: string, h: string, m: string) => { if (d.length === 10) onChange(`${d}T${h}:${m}`) }
  return (
    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
      <input type="date" value={localDate}
        onChange={e => { setLocalDate(e.target.value); emit(e.target.value, hour, minute) }}
        className={inputClass} style={{ flex: '1 1 140px', minWidth: 0 }} required />
      <select value={hour} onChange={e => emit(localDate, e.target.value, minute)} className={inputClass} style={{ flex: '0 0 auto' }}>
        {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <select value={minute} onChange={e => emit(localDate, hour, e.target.value)} className={inputClass} style={{ flex: '0 0 auto' }}>
        {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  )
}

function addMinsLocal(localDt: string, mins: number): string {
  const [datePart, timePart] = localDt.split('T')
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)
  return localStr(new Date(y, mo - 1, d, h, mi + mins))
}

export default function EditAppointmentPage({ params }: { params: { groupId: string; appointmentId: string } }) {
  const router = useRouter()
  const [type, setType]         = useState('HEALTHCARE')
  const [title, setTitle]       = useState('')
  const [location, setLocation] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime]   = useState('')
  const [notes, setNotes]       = useState('')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    api.get<ExistingAppointment>(`/api/groups/${params.groupId}/appointments/${params.appointmentId}`)
      .then(apt => {
        setType(apt.type)
        setTitle(apt.title)
        setLocation(apt.location ?? '')
        setNotes(apt.notes ?? '')
        setStartTime(localStr(new Date(apt.startTime)))
        setEndTime(apt.endTime ? localStr(new Date(apt.endTime)) : '')
      })
      .catch(() => setError('Kunde inte ladda besök.'))
      .finally(() => setLoading(false))
  }, [params.groupId, params.appointmentId])

  function handleStartChange(val: string) {
    setStartTime(val)
    if (!endTime) setEndTime(addMinsLocal(val, 30))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (endTime && endTime <= startTime) { setError('Sluttiden måste vara efter starttiden.'); return }
    setSaving(true)
    try {
      await api.patch(`/api/groups/${params.groupId}/appointments/${params.appointmentId}`, {
        type, title,
        ...(location ? { location } : {}),
        startTime: new Date(startTime).toISOString(),
        ...(endTime ? { endTime: new Date(endTime).toISOString() } : {}),
        ...(notes ? { notes } : {}),
      })
      router.push(`/groups/${params.groupId}/appointments/${params.appointmentId}` as never)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel.')
      setSaving(false)
    }
  }

  if (loading) return <div className={detailStyles.loading}>Laddar...</div>

  return (
    <div className={detailStyles.page}>
      <div className={detailStyles.header}>
        <a href={`/groups/${params.groupId}/appointments/${params.appointmentId}`} className={detailStyles.back}>
          ← Tillbaka
        </a>
        <h1>Redigera besök</h1>
      </div>

      <form onSubmit={handleSubmit} className={formStyles.form}>
        <label className={formStyles.label}>
          Typ av besök
          <select value={type} onChange={e => setType(e.target.value)} className={formStyles.input}>
            {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </label>

        <label className={formStyles.label}>
          Titel
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            className={formStyles.input} required placeholder="t.ex. Läkarbesök på vårdcentralen" />
        </label>

        <label className={formStyles.label}>
          Plats (valfritt)
          <input type="text" value={location} onChange={e => setLocation(e.target.value)}
            className={formStyles.input} placeholder="t.ex. Capio Vårdcentral" />
        </label>

        <label className={formStyles.label}>
          Starttid
          <DateTimePicker value={startTime} onChange={handleStartChange} inputClass={formStyles.input} />
        </label>

        <label className={formStyles.label}>
          Sluttid (valfritt)
          <DateTimePicker value={endTime} onChange={setEndTime} inputClass={formStyles.input} />
        </label>

        <label className={formStyles.label}>
          Anteckningar (valfritt)
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            className={formStyles.input} rows={4} placeholder="Förberedelser, vad som ska tas upp..."
            style={{ resize: 'vertical' }} />
        </label>

        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>}

        <button type="submit" className={formStyles.button} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara ändringar'}
        </button>
      </form>
    </div>
  )
}
