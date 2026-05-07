'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, saveTokens } from '../../lib/api'
import styles from './login.module.css'

export default function LoginPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post<{ accessToken: string; refreshToken: string; user: { id: string } }>(
        '/api/auth/login',
        { email, password },
      )
      saveTokens(res.accessToken, res.refreshToken)
      window.location.href = '/groups'
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Inloggning misslyckades'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>💜 VårdNära</h1>
        <p className={styles.subtitle}>Logga in på ditt konto</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            E-postadress
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              required
              autoFocus
            />
          </label>
          <label className={styles.label}>
            Lösenord
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              required
            />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? 'Loggar in...' : 'Logga in'}
          </button>
        </form>
        <p className={styles.footer}>
          Inget konto? <a href="/register">Registrera dig</a>
        </p>
      </div>
    </div>
  )
}
