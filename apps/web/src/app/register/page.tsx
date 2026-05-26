'use client'

import { useState } from 'react'
import { api, saveTokens } from '../../lib/api'
import styles from '../login/login.module.css'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Lösenorden matchar inte')
      return
    }
    setLoading(true)
    try {
      const res = await api.post<{ accessToken: string; refreshToken: string }>(
        '/api/auth/register',
        { email, password },
      )
      saveTokens(res.accessToken, res.refreshToken)
      const returnTo = new URLSearchParams(window.location.search).get('returnTo')
      window.location.href = returnTo ?? '/groups'
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registrering misslyckades'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Vardnära</h1>
        <p className={styles.subtitle}>Skapa ett nytt konto</p>
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
              minLength={8}
            />
          </label>
          <label className={styles.label}>
            Bekräfta lösenord
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              required
            />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? 'Skapar konto...' : 'Registrera dig'}
          </button>
        </form>
        <p className={styles.footer}>
          Har du redan ett konto? <a href="/login">Logga in</a>
        </p>
      </div>
    </div>
  )
}
