'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import { audioToWavBase64 } from '../../../../../lib/encodeWav'
import styles from '../../../../login/login.module.css'
import pageStyles from './new.module.css'

const ENTRY_TYPES = ['NOTE', 'OBSERVATION', 'INCIDENT', 'MOOD', 'HEALTH_UPDATE'] as const
const ENTRY_TYPE_LABELS: Record<string, string> = {
  NOTE: 'Anteckning',
  OBSERVATION: 'Observation',
  INCIDENT: 'Händelse',
  MOOD: 'Mående',
  HEALTH_UPDATE: 'Hälsouppdatering',
}

type ParsedJournal = {
  formType: string
  entryType?: string
  title?: string
  body?: string
  tags?: string[]
  rawText?: string
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
          const parsed = await api.post<ParsedJournal>('/api/voice/parse-form', { transcript })
          if (parsed.formType === 'journal' && parsed.title && parsed.body) {
            if (parsed.entryType && ENTRY_TYPES.includes(parsed.entryType as never)) setEntryType(parsed.entryType)
            setTitle(parsed.title)
            setBody(parsed.body)
            if (parsed.tags?.length) setTagsInput(parsed.tags.join(', '))
          } else {
            // Fall back to raw transcript — never reject
            setEntryType('NOTE')
            setTitle('Röstanteckning')
            setBody(parsed.rawText ?? transcript)
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
      await api.post(`/api/groups/${params.groupId}/journal`, { entryType, title, body, tags })
      router.push(`/groups/${params.groupId}/journal`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel.')
      setSaving(false)
    }
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
