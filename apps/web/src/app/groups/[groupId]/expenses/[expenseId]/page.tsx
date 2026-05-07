'use client'

import { useEffect, useState } from 'react'
import { api } from '../../../../../lib/api'
import styles from '../../detail.module.css'

type Expense = {
  id: string
  amount: number
  category: string
  description: string
  expenseDate: string
  createdBy: { id: string; email: string }
}

const CAT_LABELS: Record<string, string> = {
  MEDICATION: 'Medicin',
  FOOD: 'Mat & dryck',
  TRANSPORT: 'Transport',
  MEDICAL: 'Vård & hälsa',
  EQUIPMENT: 'Hjälpmedel',
  SERVICES: 'Tjänster',
  INSURANCE: 'Försäkring',
  HOUSING: 'Boende & hem',
  CLOTHING: 'Kläder',
  PERSONAL_CARE: 'Personlig hygien',
  LEISURE: 'Fritid & nöje',
  OTHER: 'Övrigt',
}

function formatSEK(ore: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(ore / 100)
}

const fmtDate = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long' })

export default function ExpenseDetailPage({
  params,
}: {
  params: { groupId: string; expenseId: string }
}) {
  const [expense, setExpense] = useState<Expense | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<Expense>(`/api/groups/${params.groupId}/expenses/${params.expenseId}`)
      .then(setExpense)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Kunde inte ladda utgift.'))
      .finally(() => setLoading(false))
  }, [params.groupId, params.expenseId])

  if (loading) return <div className={styles.loading}>Laddar...</div>
  if (!expense) return <div className={styles.loading}>{error || 'Utgift hittades inte.'}</div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <a href={`/groups/${params.groupId}/expenses`} className={styles.back}>
          ← Tillbaka
        </a>
        <h1>{expense.description}</h1>
      </div>

      <div className={styles.card}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Belopp</span>
          <span className={styles.amount}>{formatSEK(expense.amount)}</span>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Kategori</span>
          <span>
            <span className={styles.badge} style={{ background: '#e7f1ff', color: '#0d6efd' }}>
              {CAT_LABELS[expense.category] ?? expense.category}
            </span>
          </span>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Datum</span>
          <span className={styles.fieldValue}>
            {fmtDate.format(new Date(expense.expenseDate))}
          </span>
        </div>

        <hr className={styles.divider} />

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Registrerad av</span>
          <span className={styles.fieldValue}>{expense.createdBy.email}</span>
        </div>
      </div>
    </div>
  )
}
