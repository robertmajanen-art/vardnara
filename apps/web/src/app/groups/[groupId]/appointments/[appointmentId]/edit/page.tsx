'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../../lib/api'
import detailStyles from '../../../detail.module.css'
import formStyles from '../../../../../login/login.module.css'
import recStyles from '../../../calendar/new/new.module.css'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '10', '20', '30', '40', '50']
const TYPES = ['HEALTHCARE', 'SCHOOL', 'SOCIAL', 'THERAPY', 'FAMILY', 'OTHER'] as const
const TYPE_LABELS: Record<string, string> = {
  HEALTHCARE: '🩺 Sjukvård', SCHOOL: '🎒 Skola', SOCIAL: '🤝 Socialt',
  THERAPY: '🌿 Terapi', FAMILY: '💜 Familj', OTHER: '✨ Övrigt',
}

const WEEK_DAYS = [
  { label: 'Mån', cron: 1 }, { label: 'Tis', cron: 2 }, { label: 'Ons', cron: 3 },
  { label: 'Tor', cron: 4 }, { label: 'Fre', cron: 5 }, { label: 'Lör', cron: 6 }, { label: 'Sön', cron: 0 },
]

type RecType = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'
type EndType = 'never' | 'on' | 'after'

type ExistingAppointment = {
  type: string
  title: string
  location?: string | null
  notes?: string | null
  startTime: string
  endTime?: string | null
  recurrence?: string | null
  recurrenceCron?: string | null
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

function parseCron(cron: string): { mm: string; HH: string; monthDay: number; weekDays: Set<number>; weeklyInterval: number; untilDate: string | null } {
  const untilMatch = cron.match(/ UNTIL:(\d{4}-\d{2}-\d{2})$/)
  const untilDate = untilMatch ? untilMatch[1] : null
  const base = untilDate ? cron.slice(0, cron.length - untilMatch![0].length) : cron

  let actualCron = base
  let weeklyInterval = 1
  if (base.startsWith('BIWEEKLY ')) {
    actualCron = base.slice('BIWEEKLY '.length)
    weeklyInterval = 2
  } else {
    const match = base.match(/^WEEKLY_(\d+) (.+)$/)
    if (match) { weeklyInterval = Number(match[1]); actualCron = match[2] }
  }
  const p = actualCron.split(' ')
  return {
    mm: p[0] ?? '00',
    HH: p[1] ?? '09',
    monthDay: p[2] && p[2] !== '*' ? Number(p[2]) : 1,
    weekDays: p[4] && p[4] !== '*' ? new Set(p[4].split(',').map(Number)) : new Set<number>(),
    weeklyInterval,
    untilDate,
  }
}

function buildRecCron(type: RecType, days: number[], monthDay: number, h: string, m: string, weeklyInterval: number, untilDate?: string): string {
  const suffix = untilDate ? ` UNTIL:${untilDate}` : ''
  if (type === 'DAILY')   return `${m} ${h} * * *${suffix}`
  if (type === 'WEEKLY') {
    const dayCron = [...days].sort().join(',')
    if (weeklyInterval > 1) return `WEEKLY_${weeklyInterval} ${m} ${h} * * ${dayCron}${suffix}`
    return `${m} ${h} * * ${dayCron}${suffix}`
  }
  if (type === 'MONTHLY') return `${m} ${h} ${monthDay} * *${suffix}`
  return ''
}

function nthOccurrenceDate(recType: RecType, days: Set<number>, monthDay: number, weeklyInterval: number, startDate: Date, n: number): string | null {
  if (n <= 0) return null
  let count = 0
  const cursor = new Date(startDate); cursor.setHours(0, 0, 0, 0)
  const anchorDay = new Date(cursor)
  for (let i = 0; i < 1500; i++) {
    let occurs = false
    if (recType === 'DAILY') {
      occurs = true
    } else if (recType === 'WEEKLY') {
      if (days.has(cursor.getDay())) {
        const msPerWeek = 7 * 24 * 60 * 60 * 1000
        const wDiff = Math.round((cursor.getTime() - anchorDay.getTime()) / msPerWeek)
        occurs = wDiff % weeklyInterval === 0
      }
    } else if (recType === 'MONTHLY') {
      occurs = cursor.getDate() === monthDay
    }
    if (occurs && ++count === n) {
      const p = (x: number) => String(x).padStart(2, '0')
      return `${cursor.getFullYear()}-${p(cursor.getMonth() + 1)}-${p(cursor.getDate())}`
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return null
}

export default function EditAppointmentPage({ params }: { params: { groupId: string; appointmentId: string } }) {
  const router = useRouter()
  const [type, setType]           = useState('HEALTHCARE')
  const [title, setTitle]         = useState('')
  const [location, setLocation]   = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime]     = useState('')
  const [notes, setNotes]         = useState('')
  const [recType, setRecType]     = useState<RecType>('NONE')
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set())
  const [weeklyInterval, setWeeklyInterval] = useState(1)
  const [monthDay, setMonthDay]   = useState(1)
  const [endType, setEndType]     = useState<EndType>('never')
  const [endDate, setEndDate]     = useState('')
  const [endAfter, setEndAfter]   = useState(10)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    api.get<ExistingAppointment>(`/api/groups/${params.groupId}/appointments/${params.appointmentId}`)
      .then(apt => {
        setType(apt.type)
        setTitle(apt.title)
        setLocation(apt.location ?? '')
        setNotes(apt.notes ?? '')
        setStartTime(localStr(new Date(apt.startTime)))
        setEndTime(apt.endTime ? localStr(new Date(apt.endTime)) : '')

        const isWeeklyInterval = apt.recurrence === 'CUSTOM' &&
          (apt.recurrenceCron?.startsWith('BIWEEKLY ') || !!apt.recurrenceCron?.match(/^WEEKLY_\d+ /))
        setRecType(isWeeklyInterval ? 'WEEKLY' : (apt.recurrence as RecType) ?? 'NONE')

        if (apt.recurrenceCron) {
          const { mm, HH, monthDay: md, weekDays, weeklyInterval: wi, untilDate } = parseCron(apt.recurrenceCron)
          setMonthDay(md)
          setSelectedDays(weekDays)
          setWeeklyInterval(wi)
          if (untilDate) {
            setEndType('on')
            setEndDate(untilDate)
          }
          // Adjust startTime hour/minute from cron for clarity
          if (apt.recurrence && apt.recurrence !== 'NONE') {
            const { date } = splitDt(localStr(new Date(apt.startTime)))
            setStartTime(`${date}T${HH.padStart(2, '0')}:${mm.padStart(2, '0')}`)
          }
        }
      })
      .catch(() => setError('Kunde inte ladda besök.'))
      .finally(() => setLoading(false))
  }, [params.groupId, params.appointmentId])

  function toggleDay(cron: number) {
    setSelectedDays(prev => { const n = new Set(prev); n.has(cron) ? n.delete(cron) : n.add(cron); return n })
  }

  function handleStartChange(val: string) {
    setStartTime(val)
    if (!endTime) setEndTime(addMinsLocal(val, 30))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (endTime && endTime <= startTime) { setError('Sluttiden måste vara efter starttiden.'); return }
    if (recType === 'WEEKLY' && selectedDays.size === 0) {
      setError('Välj minst en dag för veckovis återkommande.')
      return
    }
    setSaving(true)
    try {
      const { hour, minute } = splitDt(startTime)

      let untilDate: string | undefined
      if (recType !== 'NONE') {
        if (endType === 'on' && endDate) {
          untilDate = endDate
        } else if (endType === 'after' && endAfter > 0) {
          const start = new Date(startTime)
          untilDate = nthOccurrenceDate(recType, selectedDays, monthDay, weeklyInterval, start, endAfter) ?? undefined
        }
      }

      const cron = recType !== 'NONE'
        ? buildRecCron(recType, [...selectedDays], monthDay, hour, minute, weeklyInterval, untilDate)
        : null
      const recurrence = (recType === 'WEEKLY' && weeklyInterval > 1) ? 'CUSTOM' : recType

      await api.patch(`/api/groups/${params.groupId}/appointments/${params.appointmentId}`, {
        type, title,
        ...(location ? { location } : { location: null }),
        startTime: new Date(startTime).toISOString(),
        ...(endTime ? { endTime: new Date(endTime).toISOString() } : { endTime: null }),
        ...(notes ? { notes } : { notes: null }),
        recurrence,
        recurrenceCron: cron,
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

        {/* ── Recurrence ── */}
        <div className={recStyles.section}>
          <div className={recStyles.sectionTitle}>Återkommande mönster</div>
          <div className={recStyles.radioGroup}>
            {(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const).map((rt) => (
              <label key={rt} className={recStyles.radioRow}>
                <input type="radio" name="recurrence" value={rt}
                  checked={recType === rt} onChange={() => setRecType(rt)} />
                <span className={recStyles.radioLabel}>
                  {rt === 'NONE' ? 'Aldrig' : rt === 'DAILY' ? 'Dagligen' : rt === 'WEEKLY' ? 'Veckovis' : 'Månadsvis'}
                </span>
                {recType === rt && rt === 'WEEKLY' && (
                  <>
                    <div className={recStyles.inlineDetail}>
                      Var
                      <input type="number" min={1} max={52} value={weeklyInterval}
                        onChange={e => setWeeklyInterval(Math.max(1, Number(e.target.value)))}
                        className={recStyles.numInput} />
                      vecka(r) på:
                    </div>
                    <div className={recStyles.dayGrid}>
                      {WEEK_DAYS.map(({ label, cron }) => (
                        <button key={cron} type="button"
                          className={`${recStyles.dayBtn} ${selectedDays.has(cron) ? recStyles.dayBtnActive : ''}`}
                          onClick={() => toggleDay(cron)}>{label}</button>
                      ))}
                    </div>
                  </>
                )}
                {recType === rt && rt === 'MONTHLY' && (
                  <div className={recStyles.inlineDetail}>
                    Dag
                    <input type="number" min={1} max={31} value={monthDay}
                      onChange={e => setMonthDay(Number(e.target.value))}
                      className={recStyles.numInput} />
                    i varje månad
                  </div>
                )}
              </label>
            ))}
          </div>
        </div>

        {recType !== 'NONE' && (
          <div className={recStyles.section}>
            <div className={recStyles.sectionTitle}>Slutdatum för återkommande</div>
            <div className={recStyles.radioGroup}>
              <label className={recStyles.radioRow}>
                <input type="radio" name="endType" value="never" checked={endType === 'never'} onChange={() => setEndType('never')} />
                <span className={recStyles.radioLabel}>Inget slutdatum</span>
              </label>
              <label className={recStyles.radioRow}>
                <input type="radio" name="endType" value="on" checked={endType === 'on'} onChange={() => setEndType('on')} />
                <span className={recStyles.radioLabel}>Slutar</span>
                {endType === 'on' && (
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={recStyles.inputSm} />
                )}
              </label>
              <label className={recStyles.radioRow}>
                <input type="radio" name="endType" value="after" checked={endType === 'after'} onChange={() => setEndType('after')} />
                <span className={recStyles.radioLabel}>Slutar efter</span>
                {endType === 'after' && (
                  <>
                    <input type="number" min={1} max={999} value={endAfter}
                      onChange={e => setEndAfter(Number(e.target.value))} className={recStyles.numInput} />
                    <span style={{ fontSize: '0.875rem' }}>tillfällen</span>
                  </>
                )}
              </label>
            </div>
          </div>
        )}

        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>}

        <button type="submit" className={formStyles.button} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara ändringar'}
        </button>
      </form>
    </div>
  )
}
