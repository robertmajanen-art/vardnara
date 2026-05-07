'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import styles from './new.module.css'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '10', '20', '30', '40', '50']

const WEEK_DAYS = [
  { label: 'Mån', cron: 1 },
  { label: 'Tis', cron: 2 },
  { label: 'Ons', cron: 3 },
  { label: 'Tor', cron: 4 },
  { label: 'Fre', cron: 5 },
  { label: 'Lör', cron: 6 },
  { label: 'Sön', cron: 0 },
]

type RecType = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'
type EndType = 'never' | 'on' | 'after'

function buildCron(type: RecType, h: string, m: string, days: number[], monthDay: number): string {
  if (type === 'DAILY')   return `${m} ${h} * * *`
  if (type === 'WEEKLY')  return `${m} ${h} * * ${[...days].sort().join(',')}`
  if (type === 'MONTHLY') return `${m} ${h} ${monthDay} * *`
  return ''
}

function todayDate(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function dateTimeISO(date: string, h: string, m: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(y, mo - 1, d, Number(h), Number(m)).toISOString()
}

export default function NewTaskPage({ params }: { params: { groupId: string } }) {
  const router = useRouter()

  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [recType, setRecType]         = useState<RecType>('NONE')

  // Time
  const [hour, setHour]     = useState('09')
  const [minute, setMinute] = useState('00')

  // One-time date
  const [dueDate, setDueDate] = useState(todayDate())

  // Weekly
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set())

  // Monthly
  const [monthDay, setMonthDay] = useState(1)

  // Range (for recurring)
  const [startDate, setStartDate] = useState(todayDate())
  const [endType, setEndType]     = useState<EndType>('never')
  const [endDate, setEndDate]     = useState('')
  const [endAfter, setEndAfter]   = useState(10)

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function toggleDay(cron: number) {
    setSelectedDays(prev => {
      const next = new Set(prev)
      next.has(cron) ? next.delete(cron) : next.add(cron)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (recType === 'WEEKLY' && selectedDays.size === 0) {
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

      await api.post(`/api/groups/${params.groupId}/tasks`, {
        title,
        ...(description ? { description } : {}),
        dueDate: dueDateISO,
        recurrence: recType,
        ...(cron ? { recurrenceCron: cron } : {}),
      })
      router.push(`/groups/${params.groupId}/tasks` as never)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel.')
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <a href={`/groups/${params.groupId}/tasks`} className={styles.back}>← Tillbaka</a>
        <h1>Ny uppgift</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>

        {/* ── Basic fields ── */}
        <label className={styles.field}>
          Titel
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={styles.input}
            required
            placeholder="Vad ska göras?"
          />
        </label>

        <label className={styles.field}>
          Beskrivning (valfritt)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={styles.input}
            rows={3}
            placeholder="Mer detaljer..."
            style={{ resize: 'vertical' }}
          />
        </label>

        {/* ── Uppgiftstid ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Uppgiftstid</div>

          {recType === 'NONE' && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Datum</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={styles.inputSm}
                required
              />
            </div>
          )}

          <div className={styles.row}>
            <span className={styles.rowLabel}>Tid</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <select value={hour} onChange={(e) => setHour(e.target.value)} className={styles.inputSm}>
                {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <span style={{ fontWeight: 700, color: 'var(--color-text-muted)' }}>:</span>
              <select value={minute} onChange={(e) => setMinute(e.target.value)} className={styles.inputSm}>
                {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Återkommande mönster ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Återkommande mönster</div>

          <div className={styles.radioGroup}>
            {(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const).map((type) => (
              <label key={type} className={styles.radioRow}>
                <input
                  type="radio"
                  name="recurrence"
                  value={type}
                  checked={recType === type}
                  onChange={() => setRecType(type)}
                />
                <span className={styles.radioLabel}>
                  {type === 'NONE' ? 'Aldrig' : type === 'DAILY' ? 'Dagligen' : type === 'WEEKLY' ? 'Veckovis' : 'Månadsvis'}
                </span>

                {recType === type && type === 'WEEKLY' && (
                  <div className={styles.dayGrid}>
                    {WEEK_DAYS.map(({ label, cron }) => (
                      <button
                        key={cron}
                        type="button"
                        className={`${styles.dayBtn} ${selectedDays.has(cron) ? styles.dayBtnActive : ''}`}
                        onClick={() => toggleDay(cron)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {recType === type && type === 'MONTHLY' && (
                  <div className={styles.inlineDetail}>
                    Dag
                    <input
                      type="number"
                      min={1} max={31}
                      value={monthDay}
                      onChange={(e) => setMonthDay(Number(e.target.value))}
                      className={styles.numInput}
                    />
                    i varje månad
                  </div>
                )}
              </label>
            ))}
          </div>
        </div>

        {/* ── Intervall (only for recurring) ── */}
        {recType !== 'NONE' && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Intervall för återkommande</div>

            <div className={styles.row}>
              <span className={styles.rowLabel}>Start</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={styles.inputSm}
                required
              />
            </div>

            <div className={styles.radioGroup} style={{ marginTop: '0.625rem' }}>
              <label className={styles.radioRow}>
                <input type="radio" name="endType" value="never" checked={endType === 'never'} onChange={() => setEndType('never')} />
                <span className={styles.radioLabel}>Inget slutdatum</span>
              </label>

              <label className={styles.radioRow}>
                <input type="radio" name="endType" value="on" checked={endType === 'on'} onChange={() => setEndType('on')} />
                <span className={styles.radioLabel}>Slutar</span>
                {endType === 'on' && (
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={styles.inputSm}
                  />
                )}
              </label>

              <label className={styles.radioRow}>
                <input type="radio" name="endType" value="after" checked={endType === 'after'} onChange={() => setEndType('after')} />
                <span className={styles.radioLabel}>Slutar efter</span>
                {endType === 'after' && (
                  <>
                    <input
                      type="number"
                      min={1} max={999}
                      value={endAfter}
                      onChange={(e) => setEndAfter(Number(e.target.value))}
                      className={styles.numInput}
                    />
                    <span style={{ fontSize: '0.875rem' }}>tillfällen</span>
                  </>
                )}
              </label>
            </div>
          </div>
        )}

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{error}</p>}

        <button type="submit" className={styles.submitBtn} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara uppgift'}
        </button>
      </form>
    </div>
  )
}
