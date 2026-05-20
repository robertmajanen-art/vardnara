'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../../lib/api'
import styles from './expenses.module.css'

type Expense = {
  id: string
  amount: number
  category: string
  description: string
  expenseDate: string
  hasReceipt: boolean
  createdBy: { id: string; email: string }
}

const CAT_LABELS: Record<string, string> = {
  MEDICATION: '💊 Medicin',
  FOOD:       '🍽️ Mat',
  TRANSPORT:  '🚗 Transport',
  EQUIPMENT:  '🦽 Hjälpmedel',
  SERVICES:   '🤲 Tjänster',
  INSURANCE:  '🛡️ Försäkring',
  OTHER:      '✨ Övrigt',
}

function formatSEK(ore: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(ore / 100)
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthKey(isoDate: string): string {
  // isoDate = ISO datetime string; extract YYYY-MM
  return isoDate.slice(0, 7)
}

function monthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  const s = new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric' }).format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const fmtDay = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' })

export default function ExpensesPage({ params }: { params: { groupId: string } }) {
  const now = new Date()

  // ── filter state ──────────────────────────────────────────────────────────
  const [catFilter, setCatFilter] = useState('')
  const [fromDate, setFromDate] = useState<string>(() => {
    // Default: first day of current month
    return toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1))
  })
  const [toDate, setToDate] = useState<string>(() => toLocalDateStr(now))

  // ── data ──────────────────────────────────────────────────────────────────
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (catFilter) qs.set('category', catFilter)
    // Always send date range so the backend returns all items in range (no pagination)
    qs.set('from', fromDate + 'T00:00:00.000Z')
    qs.set('to',   toDate   + 'T23:59:59.999Z')
    api
      .get<{ items: Expense[] }>(`/api/groups/${params.groupId}/expenses?${qs}`)
      .then(res => setExpenses(res.items))
      .finally(() => setLoading(false))
  }, [params.groupId, catFilter, fromDate, toDate])

  // ── quick-range helpers ───────────────────────────────────────────────────
  function setRange(from: Date, to: Date) {
    setFromDate(toLocalDateStr(from))
    setToDate(toLocalDateStr(to))
  }

  function quickThisMonth() {
    setRange(new Date(now.getFullYear(), now.getMonth(), 1), now)
  }
  function quickLastMonth() {
    const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1
    setRange(new Date(y, m, 1), new Date(y, m + 1, 0))
  }
  function quickThisYear() {
    setRange(new Date(now.getFullYear(), 0, 1), now)
  }

  // ── delete ────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!window.confirm('Ta bort utgiften permanent?')) return
    setDeleting(id)
    const snapshot = expenses
    setExpenses(prev => prev.filter(e => e.id !== id))
    try {
      await api.delete(`/api/groups/${params.groupId}/expenses/${id}`)
    } catch (err: unknown) {
      setExpenses(snapshot)
      alert(err instanceof Error ? err.message : 'Kunde inte ta bort utgiften.')
    } finally {
      setDeleting(null)
    }
  }

  // ── group by month ────────────────────────────────────────────────────────
  const monthGroups = useMemo(() => {
    const map = new Map<string, Expense[]>()
    for (const e of expenses) {
      const k = monthKey(e.expenseDate)
      map.set(k, [...(map.get(k) ?? []), e])
    }
    // Sort months descending
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [expenses])

  const grandTotal = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses])

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Utgifter</h1>
        <a href={`/groups/${params.groupId}/expenses/new`} className={styles.addBtn}>+ Ny utgift</a>
      </header>

      {/* ── Date range ── */}
      <div className={styles.rangeBar}>
        <div className={styles.rangeInputs}>
          <label className={styles.rangeLabel}>
            Från
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={styles.rangeInput} />
          </label>
          <span className={styles.rangeSep}>–</span>
          <label className={styles.rangeLabel}>
            Till
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={styles.rangeInput} />
          </label>
        </div>
        <div className={styles.quickBtns}>
          <button className={styles.quickBtn} onClick={quickThisMonth}>Den här månaden</button>
          <button className={styles.quickBtn} onClick={quickLastMonth}>Förra månaden</button>
          <button className={styles.quickBtn} onClick={quickThisYear}>I år</button>
        </div>
      </div>

      {/* ── Category filter ── */}
      <div className={styles.filters}>
        {[{ value: '', label: 'Alla kategorier' }, ...Object.entries(CAT_LABELS).map(([v, l]) => ({ value: v, label: l }))].map(f => (
          <button key={f.value}
            className={`${styles.filterBtn} ${catFilter === f.value ? styles.activeFilter : ''}`}
            onClick={() => setCatFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className={styles.empty}>Laddar...</p>
      ) : expenses.length === 0 ? (
        <p className={styles.empty}>Inga utgifter hittades för vald period.</p>
      ) : (
        <>
          {/* Grand total for the selected period */}
          <div className={styles.periodTotal}>
            <span>Totalt {fromDate} – {toDate}</span>
            <strong>{formatSEK(grandTotal)}</strong>
          </div>

          {/* Month groups */}
          {monthGroups.map(([month, items]) => {
            const monthTotal = items.reduce((s, e) => s + e.amount, 0)
            return (
              <section key={month} className={styles.monthGroup}>
                <div className={styles.monthHeader}>
                  <span className={styles.monthLabel}>{monthLabel(month)}</span>
                  <span className={styles.monthTotal}>{formatSEK(monthTotal)}</span>
                </div>
                <ul className={styles.list}>
                  {items.map(e => (
                    <li key={e.id} className={styles.item}>
                      <a href={`/groups/${params.groupId}/expenses/${e.id}`} className={styles.itemMain}>
                        <div className={styles.itemTop}>
                          <span className={styles.catBadge}>{CAT_LABELS[e.category] ?? e.category}</span>
                          <span className={styles.itemDate}>
                            {fmtDay.format(new Date(e.expenseDate))}
                          </span>
                        </div>
                        <div className={styles.itemDesc}>
                          {e.description}
                          {e.hasReceipt && <span className={styles.clipBadge} title="Kvitto bifogat">📎</span>}
                        </div>
                        <div className={styles.itemBy}>{e.createdBy.email}</div>
                      </a>
                      <div className={styles.itemRight}>
                        <span className={styles.amount}>{formatSEK(e.amount)}</span>
                        <div className={styles.itemActions}>
                          <a href={`/groups/${params.groupId}/expenses/${e.id}/edit`}
                            className={styles.iconBtn} title="Redigera">✏️</a>
                          <button
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                            onClick={() => handleDelete(e.id)}
                            disabled={deleting === e.id}
                            title="Ta bort">🗑</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
