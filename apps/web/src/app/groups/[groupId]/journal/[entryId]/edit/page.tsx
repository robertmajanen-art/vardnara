'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../../lib/api'
import detailStyles from '../../../detail.module.css'
import formStyles from '../../../../login/login.module.css'

const ENTRY_TYPES = ['NOTE', 'OBSERVATION', 'INCIDENT', 'MOOD', 'HEALTH_UPDATE'] as const
const ENTRY_TYPE_LABELS: Record<string, string> = {
  NOTE: '📝 Anteckning', OBSERVATION: '👁️ Observation', INCIDENT: '⚠️ Händelse',
  MOOD: '🌸 Mående', HEALTH_UPDATE: '💜 Hälsouppdatering',
}

type ExistingEntry = {
  entryType: string
  title: string
  body: string
  tags: string[]
}

export default function EditJournalPage({ params }: { params: { groupId: string; entryId: string } }) {
  const router = useRouter()
  const [entryType, setEntryType] = useState('NOTE')
  const [title, setTitle]         = useState('')
  const [body, setBody]           = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    api.get<ExistingEntry>(`/api/groups/${params.groupId}/journal/${params.entryId}`)
      .then(entry => {
        setEntryType(entry.entryType)
        setTitle(entry.title)
        setBody(entry.body)
        setTagsInput(entry.tags.join(', '))
      })
      .catch(() => setError('Kunde inte ladda post.'))
      .finally(() => setLoading(false))
  }, [params.groupId, params.entryId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
      await api.patch(`/api/groups/${params.groupId}/journal/${params.entryId}`, {
        entryType, title, body, tags,
      })
      router.push(`/groups/${params.groupId}/journal/${params.entryId}` as never)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel.')
      setSaving(false)
    }
  }

  if (loading) return <div className={detailStyles.loading}>Laddar...</div>

  return (
    <div className={detailStyles.page}>
      <div className={detailStyles.header}>
        <a href={`/groups/${params.groupId}/journal/${params.entryId}`} className={detailStyles.back}>
          ← Tillbaka
        </a>
        <h1>Redigera dagbokspost</h1>
      </div>

      <form onSubmit={handleSubmit} className={formStyles.form}>
        <label className={formStyles.label}>
          Typ
          <select value={entryType} onChange={e => setEntryType(e.target.value)} className={formStyles.input}>
            {ENTRY_TYPES.map(t => <option key={t} value={t}>{ENTRY_TYPE_LABELS[t]}</option>)}
          </select>
        </label>

        <label className={formStyles.label}>
          Rubrik
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            className={formStyles.input} required placeholder="Kort rubrik..." />
        </label>

        <label className={formStyles.label}>
          Innehåll
          <textarea value={body} onChange={e => setBody(e.target.value)}
            className={formStyles.input} required rows={6}
            placeholder="Beskriv händelsen eller observationen..." style={{ resize: 'vertical' }} />
        </label>

        <label className={formStyles.label}>
          Taggar (kommaseparerade)
          <input type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)}
            className={formStyles.input} placeholder="t.ex. läkare, medicin, humör" />
        </label>

        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>}

        <button type="submit" className={formStyles.button} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara ändringar'}
        </button>
      </form>
    </div>
  )
}
