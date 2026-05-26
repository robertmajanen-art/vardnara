'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '../../../../../lib/api'
import styles from '../../detail.module.css'

type Task = {
  id: string
  title: string
  description?: string | null
  status: string
  dueDate?: string | null
  recurrence?: string
  recurrenceCron?: string | null
  exceptionDates?: string | null  // comma-separated YYYY-MM-DD dates of skipped occurrences
  completedDates?: string | null  // comma-separated YYYY-MM-DD dates of completed occurrences
  assignee?: { id: string; email: string } | null
  createdBy: { id: string; email: string }
  feedItems?: Array<{ id: string }>
}

type Comment = {
  id: string
  body: string
  authorId: string
  authorEmail?: string | null
  createdAt: string
}

type Member = { userId: string; role: string; user: { id: string; email: string } }

const fmtShort = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' })

function CommentsSection({ groupId, feedItemId }: { groupId: string; feedItemId: string }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [commentError, setCommentError] = useState('')

  useEffect(() => {
    api.get<Comment[]>(`/api/groups/${groupId}/feed/${feedItemId}/comments`)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoadingComments(false))
  }, [groupId, feedItemId])

  async function submitComment(e: React.FormEvent) {
    e.preventDefault()
    if (!newComment.trim()) return
    setPosting(true)
    setCommentError('')
    try {
      const comment = await api.post<Comment>(
        `/api/groups/${groupId}/feed/${feedItemId}/comments`,
        { body: newComment.trim() },
      )
      setComments(prev => [...prev, comment])
      setNewComment('')
    } catch (err: unknown) {
      setCommentError(err instanceof Error ? err.message : 'Kunde inte skicka kommentaren.')
    } finally {
      setPosting(false)
    }
  }

  // Import detail.module.css styles are from parent — use inline styles here
  return (
    <div style={{ marginTop: 0 }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Kommentarer</h3>
      {loadingComments ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Laddar kommentarer...</p>
      ) : comments.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Inga kommentarer än. Var först!</p>
      ) : (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1rem' }}>
          {comments.map(c => (
            <li key={c.id} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                {c.authorEmail ?? c.authorId} · {fmtShort.format(new Date(c.createdAt))}
              </div>
              <div style={{ fontSize: '0.9375rem', lineHeight: 1.5 }}>{c.body}</div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submitComment} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder="Skriv en kommentar..."
          style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.9375rem', fontFamily: 'inherit', outline: 'none' }}
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={posting || !newComment.trim()}
          style={{ padding: '0.5rem 1rem', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.9375rem', fontWeight: 500, cursor: 'pointer', opacity: (posting || !newComment.trim()) ? 0.65 : 1 }}
        >
          {posting ? '...' : 'Skicka'}
        </button>
      </form>
      {commentError && <p style={{ color: 'var(--color-error, #dc2626)', fontSize: '0.875rem', marginTop: '0.5rem' }}>{commentError}</p>}
    </div>
  )
}

const DAY_MAP: Record<number, string> = {
  0: 'Sön', 1: 'Mån', 2: 'Tis', 3: 'Ons', 4: 'Tor', 5: 'Fre', 6: 'Lör',
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseCronInterval(cron: string): { interval: number; parts: string[] } {
  const base = cron.replace(/ UNTIL:\d{4}-\d{2}-\d{2}$/, '')
  if (base.startsWith('BIWEEKLY ')) return { interval: 2, parts: base.slice('BIWEEKLY '.length).split(' ') }
  const m = base.match(/^WEEKLY_(\d+) (.+)$/)
  if (m) return { interval: Number(m[1]), parts: m[2].split(' ') }
  return { interval: 1, parts: base.split(' ') }
}

/** Returns the YYYY-MM-DD string of the next occurrence on or after `from`. */
function nextOccurrenceDate(task: Task, from: Date): string | null {
  if (!task.dueDate) return null
  const startDay = new Date(task.dueDate); startDay.setHours(0, 0, 0, 0)
  const exceptions = new Set((task.exceptionDates ?? '').split(',').filter(Boolean))
  const cursor = new Date(from); cursor.setHours(0, 0, 0, 0)
  const cron = task.recurrenceCron ?? ''
  const { interval, parts } = parseCronInterval(cron)

  for (let i = 0; i < 400; i++) {
    if (cursor >= startDay) {
      const k = dateKey(cursor)
      if (!exceptions.has(k)) {
        let occurs = false
        if (task.recurrence === 'DAILY') {
          occurs = true
        } else if (task.recurrence === 'WEEKLY') {
          const dayPart = parts[4] ?? '*'
          occurs = dayPart === '*' || dayPart.split(',').map(Number).includes(cursor.getDay())
        } else if (task.recurrence === 'CUSTOM' && interval > 1) {
          const dayPart = parts[4] ?? '*'
          const days = dayPart !== '*' ? dayPart.split(',').map(Number) : [0,1,2,3,4,5,6]
          if (days.includes(cursor.getDay())) {
            const weekDiff = Math.round((cursor.getTime() - startDay.getTime()) / (7 * 86400000))
            occurs = weekDiff % interval === 0
          }
        } else if (task.recurrence === 'MONTHLY') {
          const dayOfMonth = parts[2] && parts[2] !== '*' ? Number(parts[2]) : startDay.getDate()
          occurs = cursor.getDate() === dayOfMonth
        }
        if (occurs) return k
      }
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return null
}

function formatRecurrence(task: Task): string | null {
  if (!task.recurrence || task.recurrence === 'NONE') return null
  const cron = task.recurrenceCron ?? ''
  const parts = cron.split(' ')
  const mm = parts[0] ?? '00'
  const HH = parts[1] ?? '00'
  const timeStr = ` kl ${HH.padStart(2, '0')}:${mm.padStart(2, '0')}`
  if (task.recurrence === 'DAILY') return `🔄 Dagligen${timeStr}`
  if (task.recurrence === 'WEEKLY') {
    const days = (parts[4] ?? '').split(',').map(d => DAY_MAP[Number(d)] ?? d).join(', ')
    return `🔄 Veckovis: ${days}${timeStr}`
  }
  if (task.recurrence === 'MONTHLY') return `🔄 Månadsvis dag ${parts[2]}${timeStr}`
  return `🔄 ${task.recurrence}`
}

const fmtDate = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long', timeStyle: 'short' })

export default function TaskDetailPage({ params }: { params: { groupId: string; taskId: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // If the user arrived here from the clock face, this holds the date they were looking at.
  // Use it as the skip date so "skip this occurrence" skips the right one.
  const clockDate = searchParams.get('occurrenceDate') // YYYY-MM-DD or null
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [skipDate, setSkipDate] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<string | null>(null)

  // Decode JWT to get current user ID
  useEffect(() => {
    try {
      const raw = localStorage.getItem('accessToken')
      if (raw) {
        const payload = JSON.parse(atob(raw.split('.')[1]!)) as { sub: string }
        setCurrentUserId(payload.sub)
      }
    } catch {}
  }, [])

  // Get current user's role in this group
  useEffect(() => {
    if (!currentUserId) return
    api.get<Member[]>(`/api/groups/${params.groupId}/members`)
      .then(members => {
        const me = members.find(m => m.userId === currentUserId)
        if (me) setMyRole(me.role)
      })
      .catch(() => {})
  }, [currentUserId, params.groupId])

  useEffect(() => {
    api
      .get<Task>(`/api/groups/${params.groupId}/tasks/${params.taskId}`)
      .then(setTask)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Kunde inte ladda uppgift.'))
      .finally(() => setLoading(false))
  }, [params.groupId, params.taskId])

  async function handleComplete() {
    setCompleting(true)
    try {
      if (task?.recurrence && task.recurrence !== 'NONE') {
        // Recurring task: mark only this occurrence as done via completedDates (stays visible in green)
        const dateToComplete = clockDate ?? dateKey(new Date())
        const updated = await api.patch<Task>(
          `/api/groups/${params.groupId}/tasks/${params.taskId}/complete-occurrence`,
          { date: dateToComplete }
        )
        setTask(t => t ? { ...t, completedDates: updated.completedDates } : t)
        router.push(`/groups/${params.groupId}/tasks` as never)
      } else {
        // Non-recurring: mark the whole task done
        await api.patch(`/api/groups/${params.groupId}/tasks/${params.taskId}/complete`, {})
        setTask(t => (t ? { ...t, status: 'DONE' } : t))
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Något gick fel.')
    } finally {
      setCompleting(false)
    }
  }

  function requestDelete() {
    if (task?.recurrence && task.recurrence !== 'NONE') {
      // Prefer the date the user was viewing on the clock face when they navigated here.
      // Fall back to the next upcoming occurrence if no clock date was passed.
      const dateToSkip = clockDate ?? nextOccurrenceDate(task, new Date())
      setSkipDate(dateToSkip)
      setDeleteDialog(true)
    } else {
      if (!window.confirm('Ta bort uppgiften permanent?')) return
      void handleDelete()
    }
  }

  async function handleSkipOccurrence() {
    if (!skipDate) return
    setDeleteDialog(false)
    try {
      const updated = await api.patch<Task>(
        `/api/groups/${params.groupId}/tasks/${params.taskId}/skip`,
        { date: skipDate }
      )
      setTask(t => t ? { ...t, exceptionDates: updated.exceptionDates } : t)
      setSkipDate(nextOccurrenceDate({ ...task!, exceptionDates: updated.exceptionDates }, new Date()))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunde inte hoppa över tillfälle.')
    }
  }

  async function handleDelete() {
    setDeleteDialog(false)
    setDeleting(true)
    try {
      await api.delete(`/api/groups/${params.groupId}/tasks/${params.taskId}`)
      router.push(`/groups/${params.groupId}/tasks` as never)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Något gick fel.')
      setDeleting(false)
    }
  }

  if (loading) return <div className={styles.loading}>Laddar...</div>
  if (!task) return <div className={styles.loading}>{error || 'Uppgift hittades inte.'}</div>

  const active = task.status !== 'DONE'
  const rec = formatRecurrence(task)
  const canEditDelete = myRole === 'LEAD' || myRole === 'SUPPORTER'
  const feedItemId = task.feedItems?.[0]?.id

  return (
    <div className={styles.page}>
      {deleteDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setDeleteDialog(false)}>
          <div style={{ background: 'var(--color-bg)', borderRadius: 12, padding: '1.5rem', maxWidth: 340, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 700, marginBottom: '0.375rem' }}>Ta bort återkommande uppgift</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Vill du hoppa över nästa tillfälle{skipDate ? ` (${skipDate})` : ''} eller ta bort hela serien permanent?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {skipDate && (
                <button onClick={() => handleSkipOccurrence()}
                  style={{ padding: '0.625rem', borderRadius: 8, background: 'var(--color-primary)', color: 'white', border: 'none', fontWeight: 500, cursor: 'pointer' }}>
                  Hoppa över detta tillfälle
                </button>
              )}
              <button onClick={() => handleDelete()}
                style={{ padding: '0.625rem', borderRadius: 8, background: '#dc2626', color: 'white', border: 'none', fontWeight: 500, cursor: 'pointer' }}>
                Ta bort hela serien
              </button>
              <button onClick={() => setDeleteDialog(false)}
                style={{ padding: '0.625rem', borderRadius: 8, background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', cursor: 'pointer' }}>
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <a href={`/groups/${params.groupId}/tasks`} className={styles.back}>← Tillbaka</a>
        <h1>{task.title}</h1>
      </div>

      <div className={styles.card}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <span>
            <span className={styles.badge}
              style={active
                ? { background: '#f0e8ff', color: '#8b5e9e' }
                : { background: '#d1e7dd', color: '#0a3622' }}>
              {active ? 'Aktiv' : 'Inaktiv'}
            </span>
          </span>
        </div>

        {rec && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Återkommande</span>
            <span className={styles.fieldValue}>{rec}</span>
          </div>
        )}

        {task.description && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Beskrivning</span>
            <p className={styles.body}>{task.description}</p>
          </div>
        )}

        {task.dueDate && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              {task.recurrence && task.recurrence !== 'NONE' ? 'Starttid' : 'Förfallotid'}
            </span>
            <span className={styles.fieldValue}>{fmtDate.format(new Date(task.dueDate))}</span>
          </div>
        )}

        {task.exceptionDates && task.exceptionDates.split(',').filter(Boolean).length > 0 && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Överhoppade tillfällen</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.125rem' }}>
              {task.exceptionDates
                .split(',')
                .filter(Boolean)
                .sort()
                .map(d => {
                  const [y, m, day] = d.split('-').map(Number)
                  const date = new Date(y!, m! - 1, day!)
                  return (
                    <span key={d} style={{
                      fontSize: '0.8125rem', padding: '0.125rem 0.5rem', borderRadius: 999,
                      background: '#f5f0fa', color: '#8b5e9e', border: '1px solid #e0d0f0',
                      textDecoration: 'line-through',
                    }}>
                      {new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)}
                    </span>
                  )
                })
              }
            </div>
          </div>
        )}

        {task.assignee && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Ansvarig</span>
            <span className={styles.fieldValue}>{task.assignee.email}</span>
          </div>
        )}

        <hr className={styles.divider} />

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Skapad av</span>
          <span className={styles.fieldValue}>{task.createdBy.email}</span>
        </div>

        <div className={styles.actions}>
          {active && canEditDelete && (
            <button className={styles.btnPrimary} onClick={handleComplete} disabled={completing}>
              {completing
                ? 'Markerar...'
                : (task.recurrence && task.recurrence !== 'NONE')
                  ? `✓ Markera klar${clockDate ? ` (${clockDate})` : ' – detta tillfälle'}`
                  : '✓ Markera som klar'}
            </button>
          )}
          {canEditDelete && (
            <>
              <a href={`/groups/${params.groupId}/tasks/${params.taskId}/edit`} className={styles.btnSecondary}>
                ✏️ Redigera
              </a>
              <button className={styles.btnDanger} onClick={requestDelete} disabled={deleting}>
                {deleting ? 'Tar bort...' : '🗑 Ta bort'}
              </button>
            </>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </div>

      {/* Comments — visible to all members */}
      <div className={styles.card} style={{ marginTop: '1rem' }}>
        {feedItemId
          ? <CommentsSection groupId={params.groupId} feedItemId={feedItemId} />
          : <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Kommentarer är inte tillgängliga för den här uppgiften.</p>
        }
      </div>
    </div>
  )
}
