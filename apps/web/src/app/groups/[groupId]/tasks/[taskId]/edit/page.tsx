'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../../lib/api'
import styles from '../../new/new.module.css'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '10', '20', '30', '40', '50']

const WEEK_DAYS = [
  { label: 'Mån', cron: 1 }, { label: 'Tis', cron: 2 }, { label: 'Ons', cron: 3 },
  { label: 'Tor', cron: 4 }, { label: 'Fre', cron: 5 }, { label: 'Lör', cron: 6 }, { label: 'Sön', cron: 0 },
]

type RecType = 'NONE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'

type ExistingTask = {
  title: string
  description?: string | null
  dueDate?: string | null
  recurrence: string
  recurrenceCron?: string | null
}

function buildCron(type: RecType, h: string, m: string, days: number[], monthDay: number): string {
  if (type === 'DAILY')    return `${m} ${h} * * *`
  if (type === 'WEEKLY')   return `${m} ${h} * * ${[...days].sort().join(',')}`
  if (type === 'BIWEEKLY') return `BIWEEKLY ${m} ${h} * * ${[...days].sort().join(',') || '1'}`
  if (type === 'MONTHLY')  return `${m} ${h} ${monthDay} * *`
  return ''
}

function dateTimeISO(date: string, h: string, m: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(y, mo - 1, d, Number(h), Number(m)).toISOString()
}

function parseCron(cron: string): { mm: string; HH: string; monthDay: number; weekDays: Set<number> } {
  const actualCron = cron.startsWith('BIWEEKLY ') ? cron.slice('BIWEEKLY '.length) : cron
  const p = actualCron.split(' ')
  return {
    mm: p[0] ?? '00',
    HH: p[1] ?? '09',
    monthDay: p[2] && p[2] !== '*' ? Number(p[2]) : 1,
    weekDays: p[4] && p[4] !== '*' ? new Set(p[4].split(',').map(Number)) : new Set<number>(),
  }
}

function localDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function localHour(iso: string): string { return String(new Date(iso).getHours()).padStart(2, '0') }
function localMinute(iso: string): string {
  const m = new Date(iso).getMinutes()
  const snapped = MINUTES.reduce((a, b) => Math.abs(Number(b) - m) < Math.abs(Number(a) - m) ? b : a)
  return snapped
}
function todayDate(): string { return localDate(new Date().toISOString()) }

export default function EditTaskPage({ params }: { params: { groupId: string; taskId: string } }) {
  const router = useRouter()

  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [recType, setRecType]         = useState<RecType>('NONE')
  const [hour, setHour]               = useState('09')
  const [minute, setMinute]           = useState('00')
  const [dueDate, setDueDate]         = useState(todayDate())
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set())
  const [monthDay, setMonthDay]       = useState(1)
  const [startDate, setStartDate]     = useState(todayDate())
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    api.get<ExistingTask>(`/api/groups/${params.groupId}/tasks/${params.taskId}`)
      .then(task => {
        setTitle(task.title)
        setDescription(task.description ?? '')
        // Detect BIWEEKLY: stored as CUSTOM recurrence with BIWEEKLY cron prefix
        const isBiweekly = task.recurrence === 'CUSTOM' && task.recurrenceCron?.startsWith('BIWEEKLY ')
        setRecType(isBiweekly ? 'BIWEEKLY' : (task.recurrence as RecType) ?? 'NONE')

        if (task.dueDate) {
          setDueDate(localDate(task.dueDate))
          setStartDate(localDate(task.dueDate))
          setHour(localHour(task.dueDate))
          setMinute(localMinute(task.dueDate))
        }

        if (task.recurrenceCron) {
          const { mm, HH, monthDay: md, weekDays } = parseCron(task.recurrenceCron)
          setHour(HH)
          setMinute(mm)
          setMonthDay(md)
          setSelectedDays(weekDays)
        }
      })
      .catch(() => setError('Kunde inte ladda uppgift.'))
      .finally(() => setLoading(false))
  }, [params.groupId, params.taskId])

  function toggleDay(cron: number) {
    setSelectedDays(prev => { const n = new Set(prev); n.has(cron) ? n.delete(cron) : n.add(cron); return n })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if ((recType === 'WEEKLY' || recType === 'BIWEEKLY') && selectedDays.size === 0) {
      setError('Välj minst en dag för veckovis återkommande.')
      return
    }
    setSaving(true)
    try {
      const dueDateISO = recType === 'NONE'
        ? dateTimeISO(dueDate, hour, minute)
        : dateTimeISO(startDate, hour, minute)
      const cron = recType !== 'NONE'
        ? buildCron(recType, hour, minute, [...selectedDays], monthDay)
        : undefined
      const recurrence = recType === 'BIWEEKLY' ? 'CUSTOM' : recType

      await api.patch(`/api/groups/${params.groupId}/tasks/${params.taskId}`, {
        title,
        ...(description ? { description } : {}),
        dueDate: dueDateISO,
        recurrence,
        ...(cron ? { recurrenceCron: cron } : {}),
      })
      router.push(`/groups/${params.groupId}/tasks/${params.taskId}` as never)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel.')
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Laddar...</div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <a href={`/groups/${params.groupId}/tasks/${params.taskId}`} className={styles.back}>← Tillbaka</a>
        <h1>Redigera uppgift</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.field}>
          Titel
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            className={styles.input} required placeholder="Vad ska göras?" />
        </label>

        <label className={styles.field}>
          Beskrivning (valfritt)
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            className={styles.input} rows={3} placeholder="Mer detaljer..." style={{ resize: 'vertical' }} />
        </label>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Uppgiftstid</div>
          {recType === 'NONE' && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Datum</span>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className={styles.inputSm} required />
            </div>
          )}
          <div className={styles.row}>
            <span className={styles.rowLabel}>Tid</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <select value={hour} onChange={e => setHour(e.target.value)} className={styles.inputSm}>
                {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <span style={{ fontWeight: 700, color: 'var(--color-text-muted)' }}>:</span>
              <select value={minute} onChange={e => setMinute(e.target.value)} className={styles.inputSm}>
                {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Återkommande mönster</div>
          <div className={styles.radioGroup}>
            {(['NONE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const).map(type => (
              <label key={type} className={styles.radioRow}>
                <input type="radio" name="recurrence" value={type}
                  checked={recType === type} onChange={() => setRecType(type)} />
                <span className={styles.radioLabel}>
                  {type === 'NONE' ? 'Aldrig'
                    : type === 'DAILY' ? 'Dagligen'
                    : type === 'WEEKLY' ? 'Varje vecka'
                    : type === 'BIWEEKLY' ? 'Varannan vecka'
                    : 'Månadsvis'}
                </span>
                {recType === type && (type === 'WEEKLY' || type === 'BIWEEKLY') && (
                  <div className={styles.dayGrid}>
                    {WEEK_DAYS.map(({ label, cron }) => (
                      <button key={cron} type="button"
                        className={`${styles.dayBtn} ${selectedDays.has(cron) ? styles.dayBtnActive : ''}`}
                        onClick={() => toggleDay(cron)}>{label}</button>
                    ))}
                  </div>
                )}
                {recType === type && type === 'MONTHLY' && (
                  <div className={styles.inlineDetail}>
                    Dag
                    <input type="number" min={1} max={31} value={monthDay}
                      onChange={e => setMonthDay(Number(e.target.value))} className={styles.numInput} />
                    i varje månad
                  </div>
                )}
              </label>
            ))}
          </div>
        </div>

        {recType !== 'NONE' && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Startdatum</div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Start</span>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className={styles.inputSm} required />
            </div>
          </div>
        )}

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{error}</p>}

        <button type="submit" className={styles.submitBtn} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara ändringar'}
        </button>
      </form>
    </div>
  )
}
