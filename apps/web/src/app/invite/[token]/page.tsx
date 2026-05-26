'use client'

import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'

// ── Types ────────────────────────────────────────────────────────────────────

type InviteInfo = {
  id: string
  role: string
  email?: string | null
  group: {
    id: string
    name: string
    recipientName: string
    careType: string
  }
  invitedBy: { email: string }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  LEAD:      '👑 Samordnare',
  SUPPORTER: '🤝 Medvårdare',
  OBSERVER:  '👁 Observatör',
  EXTERNAL:  '🏥 Extern',
}

const CARE_TYPE_LABELS: Record<string, string> = {
  DEMENTIA: 'Demens',
  NPF:      'NPF (autism, ADHD m.fl.)',
  OTHER:    'Annat',
}

// ── Styles (inline — simple standalone page) ──────────────────────────────────

const page: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem 1rem',
  background: 'var(--color-surface, #f5f0fa)',
}

const card: React.CSSProperties = {
  background: 'var(--color-bg, white)',
  border: '1px solid var(--color-border, #e5e7eb)',
  borderRadius: 16,
  padding: '2.5rem 2rem',
  maxWidth: 440,
  width: '100%',
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InvitePage({ params }: { params: { token: string } }) {
  const [info, setInfo]         = useState<InviteInfo | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [groupId, setGroupId]   = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    // Check if the user has a token in localStorage
    const accessToken = localStorage.getItem('accessToken')
    setIsLoggedIn(!!accessToken)

    // Fetch invite info (public endpoint — no auth needed)
    const BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'
    fetch(`${BASE}/api/invite/${params.token}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { message?: string }).message ?? 'Inbjudan hittades inte eller har löpt ut.')
        }
        return res.json() as Promise<InviteInfo>
      })
      .then(setInfo)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Inbjudan är inte giltig.'))
      .finally(() => setLoading(false))
  }, [params.token])

  async function handleAccept() {
    setAccepting(true)
    try {
      const result = await api.post<{ groupId: string; role: string }>(
        `/api/invite/${params.token}/accept`, {}
      )
      setGroupId(result.groupId)
      setAccepted(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Något gick fel.')
      setAccepting(false)
    }
  }

  function handleLogin() {
    const returnUrl = encodeURIComponent(window.location.pathname)
    window.location.href = `/login?returnTo=${returnUrl}`
  }

  // ── Loading ──
  if (loading) {
    return (
      <div style={page}>
        <div style={card}>
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Laddar inbjudan…</p>
        </div>
      </div>
    )
  }

  // ── Error ──
  if (error && !info) {
    return (
      <div style={page}>
        <div style={card}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>⚠️</div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Ogiltig inbjudan</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem', lineHeight: 1.55 }}>
              {error}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Accepted ──
  if (accepted) {
    return (
      <div style={page}>
        <div style={card}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Välkommen till teamet!
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem', marginBottom: '1.5rem' }}>
              Du är nu med i gruppen <strong>{info?.group.name}</strong>.
            </p>
            <a
              href={`/groups/${groupId}/feed`}
              style={{
                display: 'inline-block',
                padding: '0.75rem 1.5rem',
                background: 'var(--color-primary)',
                color: 'white',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: '1rem',
                textDecoration: 'none',
              }}>
              Gå till gruppen →
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (!info) return null

  // ── Main invite view ──
  return (
    <div style={page}>
      <div style={card}>
        {/* Logo / header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>💜</div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text)' }}>
            VårdNära
          </h1>
        </div>

        {/* Invite details */}
        <div style={{
          background: 'var(--color-surface, #f5f0fa)',
          borderRadius: 10,
          padding: '1.25rem',
          marginBottom: '1.5rem',
        }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
            <strong>{info.invitedBy.email}</strong> bjuder in dig till:
          </p>

          <p style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            {info.group.name}
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
            Omsorgstagare: {info.group.recipientName} ·{' '}
            {CARE_TYPE_LABELS[info.group.careType] ?? info.group.careType}
          </p>

          <div style={{
            display: 'inline-block',
            padding: '0.25rem 0.75rem',
            background: '#f0e8ff',
            color: 'var(--color-primary)',
            borderRadius: 999,
            fontSize: '0.875rem',
            fontWeight: 600,
          }}>
            Din roll: {ROLE_LABELS[info.role] ?? info.role}
          </div>
        </div>

        {/* Error from accept attempt */}
        {error && (
          <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>
        )}

        {/* CTA */}
        {isLoggedIn ? (
          <button
            onClick={handleAccept}
            disabled={accepting}
            style={{
              width: '100%',
              padding: '0.875rem',
              background: 'var(--color-primary)',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              fontSize: '1.0625rem',
              fontWeight: 700,
              cursor: accepting ? 'not-allowed' : 'pointer',
              opacity: accepting ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}>
            {accepting ? 'Ansluter…' : '✓ Acceptera inbjudan'}
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              Du behöver logga in eller skapa ett konto för att acceptera.
            </p>
            <button
              onClick={handleLogin}
              style={{
                width: '100%',
                padding: '0.875rem',
                background: 'var(--color-primary)',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                fontSize: '1.0625rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}>
              Logga in och acceptera
            </button>
            <a
              href={`/register?returnTo=${encodeURIComponent(window.location.pathname)}`}
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '0.875rem',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                fontSize: '1rem',
                fontWeight: 500,
                color: 'var(--color-text)',
                textDecoration: 'none',
                background: 'var(--color-bg)',
              }}>
              Skapa konto
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
