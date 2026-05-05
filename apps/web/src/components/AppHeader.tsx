'use client'

import { useEffect, useState } from 'react'
import { clearTokens } from '../lib/api'
import styles from './AppHeader.module.css'

export function AppHeader() {
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
    <header className={styles.header}>
      <a href="/groups" className={styles.logo}>Vardnära</a>
      <div className={styles.right}>
        {email && <span className={styles.email}>{email}</span>}
        <button onClick={handleLogout} className={styles.logout}>Logga ut</button>
      </div>
    </header>
  )
}
