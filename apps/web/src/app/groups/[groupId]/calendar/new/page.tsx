'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import styles from '../../../../login/login.module.css'
import pageStyles from './new.module.css'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '10', '20', '30', '40', '50']

const WEEK_DAYS = [
  { label: 'Mån', cron: 1 }, { label: 'Tis', cron: 2 }, { label: 'Ons', cron: 3 },
  { label: 'Tor', cron: 4 }, { label: 'Fre', cron: 5 }, { label: 'Lör', cron: 6 }, { label: 'Sön', cron: 0 },
]

type RecType = 'NONE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'

function buildRecCron(type: RecType, days: number[], monthDay: number, h: string, m: string): string {
  if (type === 'DAILY')    return `${m} ${h} * * *`
  if (type === 'WEEKLY')   return `${m} ${h} * * ${[...days].sort().join(',')}`
  if (type === 'BIWEEKLY') return `BIWEEKLY ${m} ${h} * * ${[...days].sort().join(',') || '1'}`
  if (type === 'MONTHLY')  return `${m} ${h} ${monthDay} * *`
  return ''
}

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
  const [localDate, setLocalDate] = useState(date)
  useEffect(() => { setLocalDate(splitDt(value).date) }, [value])

  const emit = (d: string, h: string, m: string) => {
    if (d.length === 10) onChange(`${d}T${h}:${m}`)
  }

  return (
    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
      <input
        type="date"
        value={localDate}
        onChange={(e) => { setLocalDate(e.target.value); emit(e.target.value, hour, minute) }}
        className={inputClass}
        style={{ flex: '1 1 140px', minWidth: 0 }}
        required
      />
      <select value={hour} onChange={(e) => emit(localDate, e.target.value, minute)} className={inputClass} style={{ flex: '0 0 auto' }}>
        {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <select value={minute} onChange={(e) => emit(localDate, hour, e.target.value)} className={inputClass} style={{ flex: '0 0 auto' }}>
        {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  )
}

const TYPES = ['HEALTHCARE', 'SCHOOL', 'SOCIAL', 'THERAPY', 'FAMILY', 'OTHER'] as const
const TYPE_LABELS: Record<string, string> = {
  HEALTHCARE: '🩺 Sjukvård',
  SCHOOL: '🎒 Skola',
  SOCIAL: '🤝 Socialt',
  THERAPY: '🌿 Terapi',
  FAMILY: '💜 Familj',
  OTHER: '✨ Övrigt',
}

function localStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function roundedLocalStr(offsetMs: number): string {
  const tenMin = 10 * 60 * 1000
  return localStr(new Date(Math.ceil((Date.now() + offsetMs) / tenMin) * tenMin))
}

function addMinsLocal(localDt: string, mins: number): string {
  const [datePart, timePart] = localDt.split('T')
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)
  return localStr(new Date(y, mo - 1, d, h, mi + mins))
}

function roundTo10Min(localDt: string): string {
  const [datePart, timePart] = localDt.split('T')
  if (!timePart) return localDt
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)
  return localStr(new Date(y, mo - 1, d, h, Math.round(mi / 10) * 10))
}

export default function NewAppointmentPage({ params }: { params: { groupId: string } }) {
  const router = useRouter()

  const startDefault = roundedLocalStr(60 * 60 * 1000)
  const endDefault = addMinsLocal(startDefault, 30)

  const [type, setType] = useState('HEALTHCARE')
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [startTime, setStartTime] = useState(startDefault)
  const [endTime, setEndTime] = useState(endDefault)
  const [notes, setNotes] = useState('')

  // Recurrence
  const [recType, setRecType] = useState<RecType>('NONE')
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set())
  const [monthDay, setMonthDay] = useState(1)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

  function toggleDay(cron: number) {
    setSelectedDays(prev => { const n = new Set(prev); n.has(cron) ? n.delete(cron) : n.add(cron); return n })
  }

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
    if ((recType === 'WEEKLY' || recType === 'BIWEEKLY') && selectedDays.size === 0) {
      setError('Välj minst en dag för veckovis återkommande.')
      return
    }
    setSaving(true)
    try {
      const { hour, minute } = splitDt(startTime)
      const cron = recType !== 'NONE'
        ? buildRecCron(recType, [...selectedDays], monthDay, hour, minute)
        : undefined
      const recurrence = recType === 'BIWEEKLY' ? 'CUSTOM' : recType

      await api.post(`/api/groups/${params.groupId}/appointments`, {
        type,
        title,
        ...(location ? { location } : {}),
        startTime: new Date(startTime).toISOString(),
        ...(endTime ? { endTime: new Date(endTime).toISOString() } : {}),
        ...(notes ? { notes } : {}),
        recurrence,
        ...(cron ? { recurrenceCron: cron } : {}),
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

        {/* ── Recurrence ── */}
        <div className={pageStyles.section}>
          <div className={pageStyles.sectionTitle}>Återkommande mönster</div>
          <div className={pageStyles.radioGroup}>
            {(['NONE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const).map((rt) => (
              <label key={rt} className={pageStyles.radioRow}>
                <input
                  type="radio"
                  name="recurrence"
                  value={rt}
                  checked={recType === rt}
                  onChange={() => setRecType(rt)}
                />
                <span className={pageStyles.radioLabel}>
                  {rt === 'NONE' ? 'Aldrig'
                    : rt === 'DAILY' ? 'Dagligen'
                    : rt === 'WEEKLY' ? 'Varje vecka'
                    : rt === 'BIWEEKLY' ? 'Varannan vecka'
                    : 'Månadsvis'}
                </span>
                {recType === rt && (rt === 'WEEKLY' || rt === 'BIWEEKLY') && (
                  <div className={pageStyles.dayGrid}>
                    {WEEK_DAYS.map(({ label, cron }) => (
                      <button key={cron} type="button"
                        className={`${pageStyles.dayBtn} ${selectedDays.has(cron) ? pageStyles.dayBtnActive : ''}`}
                        onClick={() => toggleDay(cron)}>{label}</button>
                    ))}
                  </div>
                )}
                {recType === rt && rt === 'MONTHLY' && (
                  <div className={pageStyles.inlineDetail}>
                    Dag
                    <input type="number" min={1} max={31} value={monthDay}
                      onChange={e => setMonthDay(Number(e.target.value))}
                      className={pageStyles.numInput} />
                    i varje månad
                  </div>
                )}
              </label>
            ))}
          </div>
        </div>

        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>}

        <button type="submit" className={styles.button} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara besök'}
        </button>
      </form>
    </div>
  )
}
