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

type Phase = 'idle' | 'listening' | 'parsing' | 'preview' | 'saving' | 'error'

export default function VoiceJournalPage({ params }: { params: { groupId: string } }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [parsed, setParsed] = useState<ParsedJournal | null>(null)
  const [entryType, setEntryType] = useState('NOTE')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const transcriptRef = useRef('')

  function startListening() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) { setErrorMsg('Din webbläsare stöder inte röstinmatning.'); setPhase('error'); return }
    const rec = new SR()
    rec.lang = 'sv-SE'
    rec.interimResults = true
    rec.maxAlternatives = 1
    recognitionRef.current = rec
    transcriptRef.current = ''
    setPhase('listening')
    setTranscript('')
    rec.start()
    rec.onresult = (e: { results: ArrayLike<{ [k: number]: { transcript: string } }> }) => {
      const interim = Array.from(e.results).map((r) => r[0]?.transcript ?? '').join('')
      transcriptRef.current = interim
      setTranscript(interim)
    }
    rec.onerror = () => { setPhase('error'); setErrorMsg('Röstinspelning misslyckades.') }
    rec.onend = () => finishListening()
  }

  async function finishListening() {
    recognitionRef.current?.stop()
    setPhase('parsing')
    const currentTranscript = transcriptRef.current
    try {
      const result = await api.post<ParsedJournal>('/api/voice/parse-form', { transcript: currentTranscript })
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
    } catch {
      setErrorMsg('Kunde inte tolka röstmeddelandet.')
      setPhase('error')
    }
  }

  function handleStop() {
    recognitionRef.current?.stop()
    finishListening()
  }

  async function handleSave() {
    setPhase('saving')
    try {
      await api.post(`/api/groups/${params.groupId}/journal`, {
        entryType,
        title,
        body,
        tags,
        voiceTranscript: transcriptRef.current,
      })
      router.push(`/groups/${params.groupId}/journal`)
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Sparning misslyckades.')
      setPhase('error')
    }
  }

  return (
    <div className={styles.page}>
      <a href={`/groups/${params.groupId}/journal`} className={styles.back}>← Tillbaka</a>

      {(phase === 'idle' || phase === 'error') && (
        <div className={styles.center}>
          <div className={styles.icon}>🎙️</div>
          <h1 className={styles.heading}>Röstdagbok</h1>
          <p className={styles.hint}>Tryck och berätta vad som hänt. Claude tolkar och skapar en dagbokspost åt dig.</p>
          {phase === 'error' && <p className={styles.error}>{errorMsg}</p>}
          <button className={styles.bigBtn} onClick={startListening}>Börja tala</button>
        </div>
      )}

      {phase === 'listening' && (
        <div className={styles.center}>
          <div className={`${styles.icon} ${styles.pulse}`}>🎤</div>
          <h1 className={styles.heading}>Lyssnar...</h1>
          {transcript && <p className={styles.transcript}>{transcript}</p>}
          <button className={styles.stopBtn} onClick={handleStop}>Klar</button>
        </div>
      )}

      {phase === 'parsing' && (
        <div className={styles.center}>
          <div className={styles.spinner} />
          <p className={styles.hint}>Claude tolkar ditt meddelande...</p>
          {transcript && <p className={styles.transcript}>{transcript}</p>}
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
            <input
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Innehåll</label>
            <textarea
              className={styles.input}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              style={{ resize: 'vertical' }}
            />
          </div>

          {tags.length > 0 && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Taggar</label>
              <div className={styles.tags}>
                {tags.map((tag) => (
                  <span key={tag} className={styles.tag}>{tag}</span>
                ))}
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <button className={styles.saveBtn} onClick={handleSave}>Spara post</button>
            <button className={styles.retryBtn} onClick={() => { setParsed(null); setTranscript(''); setPhase('idle') }}>
              Spela in igen
            </button>
          </div>
        </div>
      )}

      {phase === 'saving' && (
        <div className={styles.center}>
          <div className={styles.spinner} />
          <p className={styles.hint}>Sparar...</p>
        </div>
      )}
    </div>
  )
}
