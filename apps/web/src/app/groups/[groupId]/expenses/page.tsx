'use client'

import { useEffect, useState } from 'react'
import { api } from '../../../../lib/api'
import styles from '../tasks/tasks.module.css'
import expStyles from './expenses.module.css'

type Expense = {
  id: string
  amount: number
  category: string
  description: string
  expenseDate: string
  createdBy: { id: string; email: string }
}

type Summary = { totals: Record<string, number>; grandTotal: number }

const CAT_LABELS: Record<string, string> = {
  MEDICATION: '💊 Medicin',
  FOOD: '🍽️ Mat',
  TRANSPORT: '🚗 Transport',
  EQUIPMENT: '🦽 Hjälpmedel',
  SERVICES: '🤲 Tjänster',
  INSURANCE: '🛡️ Försäkring',
  OTHER: '✨ Övrigt',
}

function formatSEK(ore: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(ore / 100)
}

export default function ExpensesPage({ params }: { params: { groupId: string } }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    const qs = filter ? `?category=${filter}` : ''
    Promise.all([
      api.get<{ items: Expense[] }>(`/api/groups/${params.groupId}/expenses${qs}`),
      api.get<Summary>(`/api/groups/${params.groupId}/expenses/summary`),
    ]).then(([res, sum]) => {
      setExpenses(res.items)
      setSummary(sum)
    }).finally(() => setLoading(false))
  }, [params.groupId, filter])

  const filters = [
    { value: '', label: 'Alla' },
    ...Object.entries(CAT_LABELS).map(([v, l]) => ({ value: v, label: l })),
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Utgifter</h1>
        <a href={`/groups/${params.groupId}/expenses/new`} className={styles.addBtn}>+ Ny utgift</a>
      </header>

      {summary && summary.grandTotal > 0 && (
        <div className={expStyles.summaryBar}>
          <div className={expStyles.summaryTotal}>
            <span>Totalt</span>
            <strong>{formatSEK(summary.grandTotal)}</strong>
          </div>
          {Object.entries(summary.totals).map(([cat, amount]) => (
            <div key={cat} className={expStyles.summaryItem}>
              <span>{CAT_LABELS[cat] ?? cat}</span>
              <span>{formatSEK(amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.filters}>
        {filters.map((f) => (
          <button key={f.value} className={`${styles.filterBtn} ${filter === f.value ? styles.activeFilter : ''}`} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className={styles.empty}>Laddar...</p>
      ) : expenses.length === 0 ? (
        <p className={styles.empty}>Inga utgifter hittades.</p>
      ) : (
        <ul className={styles.list}>
          {expenses.map((e) => (
            <a key={e.id} href={`/groups/${params.groupId}/expenses/${e.id}`} className={styles.item} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className={styles.itemMain}>
                <div className={styles.itemMeta}>
                  <span className={styles.statusBadge} style={{ background: '#e7f1ff', color: '#0d6efd' }}>
                    {CAT_LABELS[e.category] ?? e.category}
                  </span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
                    {new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short' }).format(new Date(e.expenseDate))}
                  </span>
                  <span className={styles.assignee} style={{ '--before': '' } as React.CSSProperties}>{e.createdBy.email}</span>
                </div>
                <div className={styles.itemTitle}>{e.description}</div>
              </div>
              <div className={expStyles.amount}>{formatSEK(e.amount)}</div>
            </a>
          ))}
        </ul>
      )}
    </div>
  )
}
