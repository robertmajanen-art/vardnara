'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../../lib/api'
import loginStyles from '../../../../../login/login.module.css'
import expStyles from '../../expenses.module.css'
import pageStyles from '../../new/new.module.css'

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

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const MAX = 1200
        const scale = img.width > MAX ? MAX / img.width : 1
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.78))
      }
      img.src = ev.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}

type Expense = {
  id: string; amount: number; category: string; description: string
  expenseDate: string; receiptKey?: string | null
}

export default function EditExpensePage({ params }: { params: { groupId: string; expenseId: string } }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading]         = useState(true)
  const [amountStr, setAmountStr]     = useState('')
  const [category, setCategory]       = useState('OTHER')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState('')
  // null = keep existing; string = new data URL; '' = remove existing
  const [receiptData, setReceiptData] = useState<string | null>(null)
  const [existingReceipt, setExistingReceipt] = useState<string | null>(null)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    api.get<Expense>(`/api/groups/${params.groupId}/expenses/${params.expenseId}`)
      .then(e => {
        setAmountStr((e.amount / 100).toFixed(2).replace('.', ','))
        setCategory(e.category)
        setDescription(e.description)
        // Parse the stored ISO date back to YYYY-MM-DD for the date input
        const d = new Date(e.expenseDate)
        setExpenseDate(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        )
        setExistingReceipt(e.receiptKey ?? null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Kunde inte ladda utgift.'))
      .finally(() => setLoading(false))
  }, [params.groupId, params.expenseId])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try { setReceiptData(await compressImage(file)) }
    catch { setError('Kunde inte läsa bilden.') }
  }

  const previewSrc = receiptData !== null ? (receiptData || null) : existingReceipt

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const amountOre = Math.round(parseFloat(amountStr.replace(',', '.')) * 100)
    if (!amountOre || amountOre <= 0) { setError('Ange ett giltigt belopp.'); return }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        amount: amountOre, category, description,
        expenseDate: expenseDate + 'T12:00:00.000Z',
      }
      if (receiptData !== null) {
        // receiptData = '' means remove; non-empty string = new image
        body.receiptData = receiptData || null
      }
      await api.patch(`/api/groups/${params.groupId}/expenses/${params.expenseId}`, body)
      router.push(`/groups/${params.groupId}/expenses/${params.expenseId}` as never)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel.')
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Laddar...</div>

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.header}>
        <a href={`/groups/${params.groupId}/expenses/${params.expenseId}`} className={pageStyles.back}>← Tillbaka</a>
        <h1>Redigera utgift</h1>
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

        {/* Receipt */}
        <div>
          <span className={loginStyles.label} style={{ display: 'block', marginBottom: '0.5rem' }}>
            Kvitto
          </span>
          <div className={expStyles.uploadArea} onClick={() => fileRef.current?.click()}>
            {previewSrc ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewSrc} alt="Kvitto" className={expStyles.uploadPreview} />
                <button type="button" className={expStyles.removeBtn}
                  onClick={ev => {
                    ev.stopPropagation()
                    setReceiptData('')   // '' signals "remove"
                    setExistingReceipt(null)
                    if (fileRef.current) fileRef.current.value = ''
                  }}>
                  Ta bort kvitto
                </button>
              </>
            ) : (
              <span className={expStyles.uploadHint}>📷 Tryck för att bifoga kvittobild</span>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }} onChange={handleFileChange} />
        </div>

        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>}

        <button type="submit" className={loginStyles.button} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara ändringar'}
        </button>
      </form>
    </div>
  )
}
