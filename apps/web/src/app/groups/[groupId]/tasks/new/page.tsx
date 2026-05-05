'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import styles from '../../../../login/login.module.css'
import pageStyles from './new.module.css'

export default function NewTaskPage({ params }: { params: { groupId: string } }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post(`/api/groups/${params.groupId}/tasks`, {
        title,
        description: description || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      })
      router.push(`/groups/${params.groupId}/tasks`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel.')
      setSaving(false)
    }
  }

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.header}>
        <a href={`/groups/${params.groupId}/tasks`} className={pageStyles.back}>← Tillbaka</a>
        <h1>Ny uppgift</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
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

        <label className={styles.label}>
          Beskrivning (valfritt)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={styles.input}
            rows={4}
            placeholder="Mer detaljer om uppgiften..."
            style={{ resize: 'vertical' }}
          />
        </label>

        <label className={styles.label}>
          Förfallodatum (valfritt)
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={styles.input}
          />
        </label>

        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>}

        <button type="submit" className={styles.button} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara uppgift'}
        </button>
      </form>
    </div>
  )
}
