'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import styles from '../../../../login/login.module.css'
import pageStyles from './new.module.css'

const CATEGORIES = [
  'FOOD', 'TRANSPORT', 'MEDICAL', 'HOUSING', 'CLOTHING', 'PERSONAL_CARE', 'LEISURE', 'OTHER',
] as const

const CATEGORY_LABELS: Record<string, string> = {
  FOOD: 'Mat & dryck',
  TRANSPORT: 'Transport',
  MEDICAL: 'Vård & hälsa',
  HOUSING: 'Boende & hem',
  CLOTHING: 'Kläder',
  PERSONAL_CARE: 'Personlig hygien',
  LEISURE: 'Fritid & nöje',
  OTHER: 'Övrigt',
}

export default function NewExpensePage({ params }: { params: { groupId: string } }) {
  const router = useRouter()
  const [amountStr, setAmountStr] = useState('')
  const [category, setCategory] = useState<string>('OTHER')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const amountOre = Math.round(parseFloat(amountStr.replace(',', '.')) * 100)
    if (!amountOre || amountOre <= 0) { setError('Ange ett giltigt belopp.'); return }
    setSaving(true)
    try {
      await api.post(`/api/groups/${params.groupId}/expenses`, {
        amount: amountOre,
        category,
        description,
        expenseDate,
      })
      router.push(`/groups/${params.groupId}/expenses`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel.')
      setSaving(false)
    }
  }

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.header}>
        <a href={`/groups/${params.groupId}/expenses`} className={pageStyles.back}>← Tillbaka</a>
        <h1>Ny utgift</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          Belopp (SEK)
          <input
            type="text"
            inputMode="decimal"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className={styles.input}
            required
            placeholder="0,00"
          />
        </label>

        <label className={styles.label}>
          Kategori
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={styles.input}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </label>

        <label className={styles.label}>
          Beskrivning
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={styles.input}
            required
            placeholder="Kort beskrivning..."
          />
        </label>

        <label className={styles.label}>
          Datum
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className={styles.input}
            required
          />
        </label>

        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>}

        <button type="submit" className={styles.button} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara utgift'}
        </button>
      </form>
    </div>
  )
}
