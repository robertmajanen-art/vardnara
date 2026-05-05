'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { clearTokens } from '../../../lib/api'
import styles from './group.module.css'

const NAV_ITEMS = [
  { href: 'calendar', labelKey: 'nav.calendar' },
  { href: 'tasks', labelKey: 'nav.tasks' },
  { href: 'feed', labelKey: 'nav.feed' },
  { href: 'journal', labelKey: 'nav.journal' },
  { href: 'expenses', labelKey: 'nav.expenses' },
  { href: 'documents', labelKey: 'nav.documents' },
  { href: 'settings', labelKey: 'nav.settings' },
]

export default function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { groupId: string }
}) {
  const { t } = useTranslation()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token) return
    try {
      const payload = JSON.parse(atob(token.split('.')[1]!))
      setEmail(payload.email ?? null)
    } catch {
      // ignore malformed token
    }
  }, [])

  function handleLogout() {
    fetch(`${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).finally(() => {
      clearTokens()
      window.location.href = '/login'
    })
  }

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar}>
        <a href="/groups" className={styles.logo}>Vardnära</a>
        <ul className={styles.navList}>
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <a
                href={`/groups/${params.groupId}/${item.href}`}
                className={styles.navItem}
              >
                {t(item.labelKey)}
              </a>
            </li>
          ))}
        </ul>
        <div className={styles.userSection}>
          {email && <span className={styles.userEmail}>{email}</span>}
          <button onClick={handleLogout} className={styles.logoutBtn}>Logga ut</button>
        </div>
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
