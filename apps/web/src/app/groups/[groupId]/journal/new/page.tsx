'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
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
}

export default function NewJournalPage({ params }: { params: { groupId: string } }) {
  const router = useRouter()
  const [entryType, setEntryType] = useState<string>('NOTE')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [parsing, setParsing] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const accumulatedRef = useRef('')

  function startVoice() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) { setError('Din webbläsare stöder inte röstinmatning.'); return }
    const rec = new SR()
    rec.lang = 'sv-SE'
    rec.continuous = true
    rec.interimResults = false
    rec.maxAlternatives = 1
    accumulatedRef.current = ''
    recognitionRef.current = rec
    setListening(true)
    setError('')
    rec.start()
    rec.onresult = (e: { results: ArrayLike<{ [k: number]: { transcript: string } }> }) => {
      accumulatedRef.current = Array.from(e.results).map((r) => r[0]?.transcript ?? '').join(' ')
    }
    rec.onerror = () => { setListening(false); setError('Röstinspelning misslyckades.') }
    rec.onend = async () => {
      setListening(false)
      const transcript = accumulatedRef.current.trim()
      if (!transcript) return
      setParsing(true)
      try {
        const parsed = await api.post<ParsedJournal>('/api/voice/parse-form', { transcript })
        if (parsed.formType === 'journal') {
          if (parsed.entryType && ENTRY_TYPES.includes(parsed.entryType as never)) setEntryType(parsed.entryType)
          if (parsed.title) setTitle(parsed.title)
          if (parsed.body) setBody(parsed.body)
          if (parsed.tags?.length) setTagsInput(parsed.tags.join(', '))
        } else {
          setError('Kunde inte tolka som dagbokspost. Försök igen.')
        }
      } catch {
        setError('Röstparsning misslyckades.')
      } finally {
        setParsing(false)
      }
    }
  }

  function stopVoice() {
    recognitionRef.current?.stop()
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
        <div className={pageStyles.voiceRow}>
          <span className={pageStyles.voiceHint}>Fyll i med röst</span>
          <button
            type="button"
            className={`${pageStyles.micBtn} ${listening ? pageStyles.micActive : ''}`}
            onClick={listening ? stopVoice : startVoice}
            disabled={parsing}
            title={listening ? 'Stoppa inspelning' : 'Spela in med röst'}
          >
            {listening ? '⏹ Stoppar...' : parsing ? '⏳ Tolkar...' : '🎤 Röst'}
          </button>
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
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={styles.input}
            required
            placeholder="Kort rubrik..."
          />
        </label>

        <label className={styles.label}>
          Innehåll
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={styles.input}
            required
            rows={6}
            placeholder="Beskriv händelsen eller observationen..."
            style={{ resize: 'vertical' }}
          />
        </label>

        <label className={styles.label}>
          Taggar (kommaseparerade)
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className={styles.input}
            placeholder="t.ex. läkare, medicin, humör"
          />
        </label>

        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>}

        <button type="submit" className={styles.button} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara post'}
        </button>
      </form>
    </div>
  )
}
