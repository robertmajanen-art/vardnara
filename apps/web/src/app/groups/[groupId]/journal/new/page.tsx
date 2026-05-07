'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import { audioToWavBase64 } from '../../../../../lib/encodeWav'
import styles from '../../../../login/login.module.css'
import pageStyles from './new.module.css'

const ENTRY_TYPES = ['NOTE', 'OBSERVATION', 'INCIDENT', 'MOOD', 'HEALTH_UPDATE'] as const
const ENTRY_TYPE_LABELS: Record<string, string> = {
  NOTE: '📝 Anteckning',
  OBSERVATION: '👁️ Observation',
  INCIDENT: '⚠️ Händelse',
  MOOD: '🌸 Mående',
  HEALTH_UPDATE: '💜 Hälsouppdatering',
}

type AppointmentHint = {
  type?: string
  title?: string
  startTime?: string | null
  endTime?: string | null
  location?: string | null
  notes?: string | null
}

type ParsedJournal = {
  formType: string
  entryType?: string
  title?: string
  body?: string
  tags?: string[]
  rawText?: string
  appointment?: AppointmentHint | null
}

function buildCalendarUrl(groupId: string, apt: AppointmentHint): string {
  const p = new URLSearchParams()
  if (apt.title) p.set('title', apt.title)
  if (apt.type) p.set('type', apt.type)
  if (apt.startTime) p.set('startTime', apt.startTime.slice(0, 16))
  if (apt.endTime) p.set('endTime', apt.endTime.slice(0, 16))
  if (apt.location) p.set('location', apt.location)
  if (apt.notes) p.set('notes', apt.notes)
  return `/groups/${groupId}/calendar/new?${p.toString()}`
}

export default function NewJournalPage({ params }: { params: { groupId: string } }) {
  const router = useRouter()
  const [entryType, setEntryType] = useState<string>('NOTE')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [parsed, setParsed] = useState<ParsedJournal | null>(null)
  const [pendingAppointment, setPendingAppointment] = useState<AppointmentHint | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  async function startVoice() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        setProcessing(true)
        try {
          const blob = new Blob(chunksRef.current, { type: mimeType })
          const base64 = await audioToWavBase64(blob)
          const { transcript } = await api.post<{ transcript: string }>('/api/voice/transcribe', { audio: base64, mimeType: 'audio/wav' })
          const result = await api.post<ParsedJournal>('/api/voice/parse-form', { transcript })
          setParsed(result)
          if (result.formType === 'journal' && result.title && result.body) {
            if (result.entryType && ENTRY_TYPES.includes(result.entryType as never)) setEntryType(result.entryType)
            setTitle(result.title)
            setBody(result.body)
            if (result.tags?.length) setTagsInput(result.tags.join(', '))
          } else {
            setEntryType('NOTE')
            setTitle('Röstanteckning')
            setBody(result.rawText ?? transcript)
          }
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Röstparsning misslyckades.')
        } finally {
          setProcessing(false)
        }
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setSeconds(0)
      setRecording(true)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setError('Mikrofonåtkomst nekad. Kontrollera webbläsarens behörigheter.')
    }
  }

  function stopVoice() {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)

      // Run journal save and appointment detection concurrently
      const detectPromise: Promise<ParsedJournal | null> = parsed?.appointment !== undefined
        ? Promise.resolve(parsed)
        : api.post<ParsedJournal>('/api/voice/parse-form', { transcript: `${title}\n\n${body}` }).catch(() => null)

      const [, detectResult] = await Promise.all([
        api.post(`/api/groups/${params.groupId}/journal`, { entryType, title, body, tags }),
        detectPromise,
      ])

      const apt = parsed?.appointment ?? detectResult?.appointment
      if (apt?.startTime) {
        setPendingAppointment(apt)
        setSaving(false)
      } else {
        router.push(`/groups/${params.groupId}/journal` as never)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel.')
      setSaving(false)
    }
  }

  // Show appointment prompt after save
  if (pendingAppointment) {
    return (
      <div className={pageStyles.page}>
        <div className={pageStyles.header}>
          <h1>Post sparad</h1>
        </div>
        <div className={pageStyles.appointmentPrompt}>
          <p className={pageStyles.promptText}>
            📅 Vi hittade ett framtida besök i din anteckning. Vill du skapa ett kalenderhändelse?
          </p>
          {pendingAppointment.title && (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
              <strong>{pendingAppointment.title}</strong>
              {pendingAppointment.startTime && ` — ${new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(pendingAppointment.startTime))}`}
            </p>
          )}
          <div className={pageStyles.promptActions}>
            <a
              href={buildCalendarUrl(params.groupId, pendingAppointment)}
              className={pageStyles.promptYes}
            >
              Ja, skapa besök
            </a>
            <button
              className={pageStyles.promptNo}
              onClick={() => router.push(`/groups/${params.groupId}/journal` as never)}
            >
              Nej tack
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.header}>
        <a href={`/groups/${params.groupId}/journal`} className={pageStyles.back}>← Tillbaka</a>
        <h1>Ny dagbokspost</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* Voice recording block */}
        <div className={pageStyles.voiceBlock}>
          {!recording && !processing && (
            <button type="button" className={pageStyles.recordBtn} onClick={startVoice}>
              🎤 Spela in med röst
            </button>
          )}
          {recording && (
            <div className={pageStyles.recordingRow}>
              <span className={pageStyles.recDot} />
              <span className={pageStyles.timer}>{formatTime(seconds)}</span>
              <button type="button" className={pageStyles.stopRecBtn} onClick={stopVoice}>Klar</button>
            </div>
          )}
          {processing && (
            <div className={pageStyles.processingRow}>
              <span className={pageStyles.spinner} />
              <span>Bearbetar...</span>
            </div>
          )}
        </div>

        <label className={styles.label}>
          Typ
          <select value={entryType} onChange={(e) => setEntryType(e.target.value)} className={styles.input}>
            {ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>{ENTRY_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>

        <label className={styles.label}>
          Rubrik
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={styles.input} required placeholder="Kort rubrik..." />
        </label>

        <label className={styles.label}>
          Innehåll
          <textarea value={body} onChange={(e) => setBody(e.target.value)} className={styles.input} required rows={6} placeholder="Beskriv händelsen eller observationen..." style={{ resize: 'vertical' }} />
        </label>

        <label className={styles.label}>
          Taggar (kommaseparerade)
          <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className={styles.input} placeholder="t.ex. läkare, medicin, humör" />
        </label>

        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>}

        <button type="submit" className={styles.button} disabled={saving || recording || processing}>
          {saving ? 'Sparar...' : 'Spara post'}
        </button>
      </form>
    </div>
  )
}
