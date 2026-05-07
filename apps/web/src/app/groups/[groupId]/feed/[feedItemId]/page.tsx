'use client'

import { useEffect, useState } from 'react'
import { api } from '../../../../../lib/api'
import styles from '../../detail.module.css'

type Comment = {
  id: string
  body: string
  createdAt: string
  author: { id: string; email: string }
}

type FeedItem = {
  id: string
  itemType: string
  bodyText?: string | null
  createdAt: string
  readBy: { readAt: string }[]
}

const fmt = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long', timeStyle: 'short' })

export default function FeedItemDetailPage({
  params,
}: {
  params: { groupId: string; feedItemId: string }
}) {
  const [item, setItem] = useState<FeedItem | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const itemReq = api
      .get<FeedItem>(`/api/groups/${params.groupId}/feed/${params.feedItemId}`)
      .then(setItem)
      .catch(() => null)

    const commentsReq = api
      .get<Comment[]>(`/api/groups/${params.groupId}/feed/${params.feedItemId}/comments`)
      .then(setComments)
      .catch(() => null)

    Promise.all([itemReq, commentsReq]).finally(() => setLoading(false))

    // Mark as read
    api.post(`/api/groups/${params.groupId}/feed/${params.feedItemId}/read`, {}).catch(() => null)
  }, [params.groupId, params.feedItemId])

  async function handleComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim()) return
    setPosting(true)
    try {
      const newComment = await api.post<Comment>(
        `/api/groups/${params.groupId}/feed/${params.feedItemId}/comments`,
        { body: commentText.trim() },
      )
      setComments((prev) => [...prev, newComment])
      setCommentText('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kunde inte skicka kommentar.')
    } finally {
      setPosting(false)
    }
  }

  if (loading) return <div className={styles.loading}>Laddar...</div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <a href={`/groups/${params.groupId}/feed`} className={styles.back}>
          ← Tillbaka
        </a>
        <h1>Händelse</h1>
      </div>

      <div className={styles.card}>
        {item ? (
          <>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Meddelande</span>
              <p className={styles.body}>{item.bodyText ?? item.itemType}</p>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Tidpunkt</span>
              <span className={styles.fieldValue}>{fmt.format(new Date(item.createdAt))}</span>
            </div>
          </>
        ) : (
          <p className={styles.body} style={{ color: 'var(--color-text-muted)' }}>
            Händelseinformation ej tillgänglig.
          </p>
        )}
      </div>

      <div className={styles.commentsSection}>
        <h2 className={styles.commentsHeading}>
          Kommentarer {comments.length > 0 && `(${comments.length})`}
        </h2>

        {comments.length > 0 ? (
          <ul className={styles.commentsList}>
            {comments.map((c) => (
              <li key={c.id} className={styles.comment}>
                <div className={styles.commentMeta}>
                  {c.author.email} · {fmt.format(new Date(c.createdAt))}
                </div>
                <div className={styles.commentBody}>{c.body}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Inga kommentarer ännu.
          </p>
        )}

        <form onSubmit={handleComment} className={styles.commentForm}>
          <input
            className={styles.commentInput}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Skriv en kommentar..."
          />
          <button type="submit" className={styles.commentSubmit} disabled={posting || !commentText.trim()}>
            {posting ? '...' : 'Skicka'}
          </button>
        </form>
        {error && <p className={styles.error} style={{ marginTop: '0.5rem' }}>{error}</p>}
      </div>
    </div>
  )
}
