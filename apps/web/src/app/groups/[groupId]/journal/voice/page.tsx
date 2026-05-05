'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import styles from './voice.module.css'

type ParsedJournal = {
  formType: string
  entryType?: string
  title?: string
  body?: string
  tags?: string[]
}

const ENTRY_TYPES = ['NOTE', 'OBSERVATION', 'INCIDENT', 'MOOD', 'HEALTH_UPDATE']
const ENTRY_TYPE_LABELS: Record<string, string> = {
  NOTE: 'Anteckning',
  OBSERVATION: 'Observation',
  INCIDENT: 'Händelse',
  MOOD: 'Mående',
  HEALTH_UPDATE: 'Hälsouppdatering',
}

type Phase = 'idle' | 'recording' | 'transcribing' | 'parsing' | 'preview' | 'saving' | 'error'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]!)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default function VoiceJournalPage({ params }: { params: { groupId: string } }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [parsed, setParsed] = useState<ParsedJournal | null>(null)
  const [entryType, setEntryType] = useState('NOTE')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [seconds, setSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        await processRecording(mimeType)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setSeconds(0)
      setPhase('recording')
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setErrorMsg('Mikrofonåtkomst nekad. Kontrollera webbläsarens behörigheter.')
      setPhase('error')
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
  }

  async function processRecording(mimeType: string) {
    setPhase('transcribing')
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const base64 = await blobToBase64(blob)
      const { transcript } = await api.post<{ transcript: string }>('/api/voice/transcribe', { audio: base64, mimeType })

      setPhase('parsing')
      const result = await api.post<ParsedJournal>('/api/voice/parse-form', { transcript })
      if (result.formType === 'journal') {
        setParsed(result)
        setEntryType(result.entryType && ENTRY_TYPES.includes(result.entryType) ? result.entryType : 'NOTE')
        setTitle(result.title ?? '')
        setBody(result.body ?? '')
        setTags(result.tags ?? [])
        setPhase('preview')
      } else {
        setErrorMsg('Röstmeddelandet tolkades inte som en dagbokspost. Försök igen.')
        setPhase('error')
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Något gick fel.')
      setPhase('error')
    }
  }

  async function handleSave() {
    setPhase('saving')
    try {
      await api.post(`/api/groups/${params.groupId}/journal`, { entryType, title, body, tags })
      router.push(`/groups/${params.groupId}/journal`)
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Sparning misslyckades.')
      setPhase('error')
    }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className={styles.page}>
      <a href={`/groups/${params.groupId}/journal`} className={styles.back}>← Tillbaka</a>

      {(phase === 'idle' || phase === 'error') && (
        <div className={styles.center}>
          <div className={styles.icon}>🎙️</div>
          <h1 className={styles.heading}>Röstdagbok</h1>
          <p className={styles.hint}>Tryck och berätta vad som hänt. Claude tolkar och skapar en dagbokspost åt dig.</p>
          {phase === 'error' && <p className={styles.error}>{errorMsg}</p>}
          <button className={styles.bigBtn} onClick={startRecording}>Börja tala</button>
        </div>
      )}

      {phase === 'recording' && (
        <div className={styles.center}>
          <div className={`${styles.icon} ${styles.pulse}`}>🎤</div>
          <h1 className={styles.heading}>Spelar in...</h1>
          <p className={styles.timer}>{formatTime(seconds)}</p>
          <button className={styles.stopBtn} onClick={stopRecording}>Klar</button>
        </div>
      )}

      {(phase === 'transcribing' || phase === 'parsing' || phase === 'saving') && (
        <div className={styles.center}>
          <div className={styles.spinner} />
          <p className={styles.hint}>
            {phase === 'transcribing' && 'Transkriberar ljud...'}
            {phase === 'parsing' && 'Claude tolkar ditt meddelande...'}
            {phase === 'saving' && 'Sparar...'}
          </p>
        </div>
      )}

      {phase === 'preview' && parsed && (
        <div className={styles.preview}>
          <h1 className={styles.heading} style={{ marginBottom: '1.5rem' }}>Förhandsgranskning</h1>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Typ</label>
            <select value={entryType} onChange={(e) => setEntryType(e.target.value)} className={styles.select}>
              {ENTRY_TYPES.map((t) => (
                <option key={t} value={t}>{ENTRY_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Rubrik</label>
            <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Innehåll</label>
            <textarea className={styles.input} value={body} onChange={(e) => setBody(e.target.value)} rows={5} style={{ resize: 'vertical' }} />
          </div>
          {tags.length > 0 && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Taggar</label>
              <div className={styles.tags}>
                {tags.map((tag) => <span key={tag} className={styles.tag}>{tag}</span>)}
              </div>
            </div>
          )}
          <div className={styles.actions}>
            <button className={styles.saveBtn} onClick={handleSave}>Spara post</button>
            <button className={styles.retryBtn} onClick={() => { setParsed(null); setPhase('idle') }}>Spela in igen</button>
          </div>
        </div>
      )}
    </div>
  )
}
