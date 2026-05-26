'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../../lib/api'
import styles from '../../detail.module.css'

type JournalEntry = {
  id: string
  entryType: string
  title: string
  body: string
  tags: string[]
  createdAt: string
  author?: { id: string; email: string } | null
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

const TYPE_LABELS: Record<string, string> = {
  NOTE: '📝 Anteckning', OBSERVATION: '👁️ Observation', INCIDENT: '⚠️ Händelse',
  MOOD: '🌸 Mående', HEALTH_UPDATE: '💜 Hälsouppdatering',
  APPOINTMENT_OUTCOME: '🩺 Besöksutfall', ACTIVITY_CONFIRMED: '✅ Aktivitet bekräftad',
}

const TYPE_COLORS: Record<string, string> = {
  NOTE: '#e7f1ff', OBSERVATION: '#fff3cd', INCIDENT: '#f8d7da',
  MOOD: '#d1e7dd', HEALTH_UPDATE: '#cff4fc',
  APPOINTMENT_OUTCOME: '#e2d9f3', ACTIVITY_CONFIRMED: '#d1e7dd',
}

const fmt = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long', timeStyle: 'short' })
const fmtShort = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' })

// ── Comments section ─────────────────────────────────────────────────────────

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

  return (
    <div className={styles.commentsSection}>
      <h3 className={styles.commentsHeading}>Kommentarer</h3>
      {loadingComments ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Laddar kommentarer...</p>
      ) : comments.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Inga kommentarer än. Var först!</p>
      ) : (
        <ul className={styles.commentsList}>
          {comments.map(c => (
            <li key={c.id} className={styles.comment}>
              <div className={styles.commentMeta}>
                {c.authorEmail ?? c.authorId} · {fmtShort.format(new Date(c.createdAt))}
              </div>
              <div className={styles.commentBody}>{c.body}</div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submitComment} className={styles.commentForm}>
        <input
          type="text"
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder="Skriv en kommentar..."
          className={styles.commentInput}
          maxLength={2000}
        />
        <button
          type="submit"
          className={styles.commentSubmit}
          disabled={posting || !newComment.trim()}
        >
          {posting ? '...' : 'Skicka'}
        </button>
      </form>
      {commentError && <p className={styles.error} style={{ marginTop: '0.5rem' }}>{commentError}</p>}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function JournalEntryDetailPage({ params }: { params: { groupId: string; entryId: string } }) {
  const router = useRouter()
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
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
      .get<JournalEntry>(`/api/groups/${params.groupId}/journal/${params.entryId}`)
      .then(setEntry)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Kunde inte ladda post.'))
      .finally(() => setLoading(false))
  }, [params.groupId, params.entryId])

  async function handleDelete() {
    if (!window.confirm('Ta bort dagboksposten permanent?')) return
    setDeleting(true)
    try {
      await api.delete(`/api/groups/${params.groupId}/journal/${params.entryId}`)
      router.push(`/groups/${params.groupId}/journal` as never)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Något gick fel.')
      setDeleting(false)
    }
  }

  if (loading) return <div className={styles.loading}>Laddar...</div>
  if (!entry) return <div className={styles.loading}>{error || 'Post hittades inte.'}</div>

  const badgeBg = TYPE_COLORS[entry.entryType] ?? '#f0f0f0'
  const isAuthor = entry.author?.id === currentUserId
  const canEdit = myRole === 'LEAD' || (myRole === 'SUPPORTER' && isAuthor)
  const canDelete = myRole === 'LEAD' || myRole === 'SUPPORTER'
  const feedItemId = entry.feedItems?.[0]?.id

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <a href={`/groups/${params.groupId}/journal`} className={styles.back}>← Tillbaka</a>
        <h1>{entry.title}</h1>
      </div>

      <div className={styles.card}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Typ</span>
          <span>
            <span className={styles.badge} style={{ background: badgeBg, color: '#333' }}>
              {TYPE_LABELS[entry.entryType] ?? entry.entryType}
            </span>
          </span>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Innehåll</span>
          <p className={styles.body}>{entry.body}</p>
        </div>

        {entry.tags.length > 0 && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Taggar</span>
            <div className={styles.tags}>
              {entry.tags.map(tag => (
                <span key={tag} className={styles.tag}>{tag}</span>
              ))}
            </div>
          </div>
        )}

        <hr className={styles.divider} />

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Skriven av</span>
          <span className={styles.fieldValue}>{entry.author?.email ?? '—'}</span>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Datum</span>
          <span className={styles.fieldValue}>{fmt.format(new Date(entry.createdAt))}</span>
        </div>

        {(canEdit || canDelete) && (
          <div className={styles.actions}>
            {canEdit && (
              <a href={`/groups/${params.groupId}/journal/${params.entryId}/edit`} className={styles.btnSecondary}>
                ✏️ Redigera
              </a>
            )}
            {canDelete && (
              <button className={styles.btnDanger} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Tar bort...' : '🗑 Ta bort'}
              </button>
            )}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>

      {/* Comments — visible to all members, no role restriction */}
      <div className={styles.card} style={{ marginTop: '1rem' }}>
        {feedItemId
          ? <CommentsSection groupId={params.groupId} feedItemId={feedItemId} />
          : <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Kommentarer är inte tillgängliga för den här posten.</p>
        }
      </div>
    </div>
  )
}
