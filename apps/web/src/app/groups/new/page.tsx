'use client'

import { useState } from 'react'
import { api } from '../../../lib/api'
import { AppHeader } from '../../../components/AppHeader'
import styles from '../../login/login.module.css'
import pageStyles from './new.module.css'

const CARE_TYPES = [
  { value: 'DEMENTIA', label: 'Demens' },
  { value: 'NPF', label: 'NPF (autism, ADHD m.fl.)' },
  { value: 'OTHER', label: 'Annat' },
]

export default function NewGroupPage() {
  const [name, setName] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [careType, setCareType] = useState('DEMENTIA')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const group = await api.post<{ id: string }>('/api/groups', {
        name,
        recipientName,
        careType,
      })
      window.location.href = `/groups/${group.id}/calendar`
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <AppHeader />
      <div className={pageStyles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Ny omsorgsgrupp</h1>
          <p className={styles.subtitle}>Skapa en delad grupp för er familj</p>
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.label}>
              Gruppens namn
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={styles.input}
                placeholder="t.ex. Birgittas familj"
                required
                autoFocus
              />
            </label>
            <label className={styles.label}>
              Omsorgstagare (förnamn räcker)
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className={styles.input}
                placeholder="t.ex. Birgitta"
                required
              />
            </label>
            <label className={styles.label}>
              Typ av omsorg
              <select
                value={careType}
                onChange={(e) => setCareType(e.target.value)}
                className={styles.input}
              >
                {CARE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? 'Skapar grupp...' : 'Skapa grupp'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
