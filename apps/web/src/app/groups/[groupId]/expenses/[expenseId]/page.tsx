'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import detailStyles from '../../detail.module.css'
import expStyles from '../expenses.module.css'

type Expense = {
  id: string
  amount: number
  category: string
  description: string
  expenseDate: string
  receiptKey?: string | null
  createdBy: { id: string; email: string }
}

const CAT_LABELS: Record<string, string> = {
  MEDICATION: '💊 Medicin',
  FOOD:       '🍽️ Mat & dryck',
  TRANSPORT:  '🚗 Transport',
  EQUIPMENT:  '🛠️ Utrustning & hjälpmedel',
  SERVICES:   '🩺 Vård & tjänster',
  INSURANCE:  '🛡️ Försäkring',
  OTHER:      '✨ Övrigt',
}

function formatSEK(ore: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(ore / 100)
}

const fmtDate = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long' })

export default function ExpenseDetailPage({ params }: { params: { groupId: string; expenseId: string } }) {
  const router = useRouter()
  const [expense, setExpense]   = useState<Expense | null>(null)
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    api
      .get<Expense>(`/api/groups/${params.groupId}/expenses/${params.expenseId}`)
      .then(setExpense)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Kunde inte ladda utgift.'))
      .finally(() => setLoading(false))
  }, [params.groupId, params.expenseId])

  async function handleDelete() {
    if (!window.confirm('Ta bort utgiften permanent?')) return
    setDeleting(true)
    try {
      await api.delete(`/api/groups/${params.groupId}/expenses/${params.expenseId}`)
      router.push(`/groups/${params.groupId}/expenses` as never)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Något gick fel.')
      setDeleting(false)
    }
  }

  if (loading) return <div className={detailStyles.loading}>Laddar...</div>
  if (!expense) return <div className={detailStyles.loading}>{error || 'Utgift hittades inte.'}</div>

  return (
    <div className={detailStyles.page}>
      <div className={detailStyles.header}>
        <a href={`/groups/${params.groupId}/expenses`} className={detailStyles.back}>← Tillbaka</a>
        <h1>{expense.description}</h1>
      </div>

      <div className={detailStyles.card}>
        <div className={detailStyles.field}>
          <span className={detailStyles.fieldLabel}>Belopp</span>
          <span className={detailStyles.amount}>{formatSEK(expense.amount)}</span>
        </div>

        <div className={detailStyles.field}>
          <span className={detailStyles.fieldLabel}>Kategori</span>
          <span>
            <span className={detailStyles.badge} style={{ background: '#e7f1ff', color: '#0d6efd' }}>
              {CAT_LABELS[expense.category] ?? expense.category}
            </span>
          </span>
        </div>

        <div className={detailStyles.field}>
          <span className={detailStyles.fieldLabel}>Datum</span>
          <span className={detailStyles.fieldValue}>
            {fmtDate.format(new Date(expense.expenseDate))}
          </span>
        </div>

        {expense.receiptKey && (
          <div className={detailStyles.field}>
            <span className={detailStyles.fieldLabel}>Kvitto</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={expense.receiptKey} alt="Kvitto" className={expStyles.receiptImage} />
          </div>
        )}

        <hr className={detailStyles.divider} />

        <div className={detailStyles.field}>
          <span className={detailStyles.fieldLabel}>Registrerad av</span>
          <span className={detailStyles.fieldValue}>{expense.createdBy.email}</span>
        </div>

        <div className={detailStyles.actions}>
          <a href={`/groups/${params.groupId}/expenses/${params.expenseId}/edit`}
            className={detailStyles.btnSecondary}>
            ✏️ Redigera
          </a>
          <button className={detailStyles.btnDanger} onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Tar bort...' : '🗑 Ta bort'}
          </button>
        </div>

        {error && <p className={detailStyles.error}>{error}</p>}
      </div>
    </div>
  )
}
