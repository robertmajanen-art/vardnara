'use client'

import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

type Group = {
  id: string
  name: string
  recipientName: string
  careType: string
  role: string
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<Group[]>('/api/groups').then(setGroups).finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ padding: '2rem' }}>Laddar...</p>

  if (groups.length === 0) {
    return (
      <div style={{ padding: '2rem', maxWidth: 480 }}>
        <h1 style={{ marginBottom: '1rem' }}>Mina omsorgsgrupper</h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
          Du tillhör inte någon omsorgsgrupp ännu.
        </p>
        <a
          href="/groups/new"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            background: 'var(--color-primary)',
            color: 'white',
            borderRadius: 6,
            fontWeight: 500,
          }}
        >
          Skapa ny grupp
        </a>
      </div>
    )
  }

  if (groups.length === 1 && groups[0]) {
    window.location.href = `/groups/${groups[0].id}/calendar`
    return null
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 600 }}>
      <h1 style={{ marginBottom: '1.5rem' }}>Mina omsorgsgrupper</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {groups.map((g) => (
          <a
            key={g.id}
            href={`/groups/${g.id}/calendar`}
            style={{
              display: 'block',
              padding: '1rem 1.25rem',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              background: 'var(--color-bg)',
            }}
          >
            <div style={{ fontWeight: 600 }}>{g.name}</div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              {g.recipientName} · {g.role}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
