'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import { isPdfDataUrl, processReceiptFile } from '../_receiptUtils'
import loginStyles from '../../../../login/login.module.css'
import expStyles from '../expenses.module.css'
import pageStyles from './new.module.css'

// Must match the ExpenseCategory enum in the backend schema
const CATEGORIES = [
  'MEDICATION', 'FOOD', 'TRANSPORT', 'EQUIPMENT', 'SERVICES', 'INSURANCE', 'OTHER',
] as const

const CATEGORY_LABELS: Record<string, string> = {
  MEDICATION: '💊 Medicin',
  FOOD:       '🍽️ Mat & dryck',
  TRANSPORT:  '🚗 Transport',
  EQUIPMENT:  '🛠️ Utrustning & hjälpmedel',
  SERVICES:   '🩺 Vård & tjänster',
  INSURANCE:  '🛡️ Försäkring',
  OTHER:      '✨ Övrigt',
}

export default function NewExpensePage({ params }: { params: { groupId: string } }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [amountStr, setAmountStr]     = useState('')
  const [category, setCategory]       = useState<string>('OTHER')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [receiptData, setReceiptData] = useState<string | null>(null)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setReceiptData(await processReceiptFile(file))
    } catch {
      setError('Kunde inte läsa filen.')
    }
  }

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
        // Backend requires full ISO datetime; UTC noon avoids timezone off-by-one
        expenseDate: expenseDate + 'T12:00:00.000Z',
        ...(receiptData ? { receiptData } : {}),
      })
      router.push(`/groups/${params.groupId}/expenses` as never)
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

      <form onSubmit={handleSubmit} className={loginStyles.form}>
        <label className={loginStyles.label}>
          Belopp (SEK)
          <input type="text" inputMode="decimal" value={amountStr}
            onChange={e => setAmountStr(e.target.value)}
            className={loginStyles.input} required placeholder="0,00" />
        </label>

        <label className={loginStyles.label}>
          Kategori
          <select value={category} onChange={e => setCategory(e.target.value)} className={loginStyles.input}>
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>

        <label className={loginStyles.label}>
          Beskrivning
          <input type="text" value={description}
            onChange={e => setDescription(e.target.value)}
            className={loginStyles.input} required placeholder="Kort beskrivning..." />
        </label>

        <label className={loginStyles.label}>
          Datum
          <input type="date" value={expenseDate}
            onChange={e => setExpenseDate(e.target.value)}
            className={loginStyles.input} required />
        </label>

        {/* Receipt upload */}
        <div>
          <span className={loginStyles.label} style={{ display: 'block', marginBottom: '0.5rem' }}>
            Kvitto (valfritt)
          </span>
          <div className={expStyles.uploadArea} onClick={() => fileRef.current?.click()}>
            {receiptData ? (
              <>
                {isPdfDataUrl(receiptData) ? (
                  <span className={expStyles.uploadHint}>📄 PDF bifogad</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={receiptData} alt="Kvitto förhandsgranskning" className={expStyles.uploadPreview} />
                )}
                <button type="button" className={expStyles.removeBtn}
                  onClick={ev => { ev.stopPropagation(); setReceiptData(null); if (fileRef.current) fileRef.current.value = '' }}>
                  Ta bort bilaga
                </button>
              </>
            ) : (
              <span className={expStyles.uploadHint}>📎 Tryck för att bifoga kvitto (bild eller PDF)</span>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf"
            style={{ display: 'none' }} onChange={handleFileChange} />
        </div>

        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>}

        <button type="submit" className={loginStyles.button} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara utgift'}
        </button>
      </form>
    </div>
  )
}
