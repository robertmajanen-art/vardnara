'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type FeedItem } from '../../../../lib/api'
import styles from './feed.module.css'

export default function FeedPage({ params }: { params: { groupId: string } }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<FeedItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const loadFeed = useCallback(async (cursor?: string) => {
    const qs = cursor ? `?cursor=${cursor}&limit=20` : '?limit=20'
    const res = await api.get<{ items: FeedItem[]; nextCursor: string | null }>(
      `/api/groups/${params.groupId}/feed${qs}`,
    )
    return res
  }, [params.groupId])

  useEffect(() => {
    loadFeed().then((res) => {
      setItems(res.items)
      setNextCursor(res.nextCursor)
    }).finally(() => setLoading(false))
  }, [loadFeed])

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const res = await loadFeed(nextCursor)
      setItems((prev) => [...prev, ...res.items])
      setNextCursor(res.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  async function markRead(itemId: string) {
    await api.post(`/api/groups/${params.groupId}/feed/${itemId}/read`, {})
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, readBy: [{ readAt: new Date().toISOString() }] } : i))
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('nav.feed')}</h1>
      </header>

      {loading ? (
        <p className={styles.empty}>Laddar...</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>Inga händelser ännu.</p>
      ) : (
        <>
          <ul className={styles.list}>
            {items.map((item) => {
              const isRead = item.readBy.length > 0
              return (
                <a
                  key={item.id}
                  href={`/groups/${params.groupId}/feed/${item.id}`}
                  className={`${styles.item} ${!isRead ? styles.unread : ''}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                  onClick={() => !isRead && markRead(item.id)}
                >
                  <div className={styles.itemDot} />
                  <div className={styles.itemBody}>
                    <div className={styles.itemText}>{item.bodyText ?? item.itemType}</div>
                    <div className={styles.itemTime}>
                      {new Intl.DateTimeFormat('sv-SE', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(item.createdAt))}
                      {item._count.comments > 0 && (
                        <span className={styles.commentCount}>
                          {item._count.comments} kommentar{item._count.comments !== 1 ? 'er' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </a>
              )
            })}
          </ul>
          {nextCursor && (
            <button className={styles.loadMore} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Laddar...' : 'Ladda fler'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
