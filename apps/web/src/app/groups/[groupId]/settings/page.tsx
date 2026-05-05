'use client'

import { useEffect, useState } from 'react'
import { api } from '../../../../lib/api'
import styles from '../../../login/login.module.css'
import pageStyles from './settings.module.css'

type Group = {
  id: string
  name: string
  recipientName: string
  careType: string
  plan: string
  myRole: string
}

const CARE_TYPE_LABELS: Record<string, string> = {
  DEMENTIA: 'Demens',
  NPF: 'NPF (autism, ADHD m.fl.)',
  OTHER: 'Annat',
}

const CARE_TYPES = ['DEMENTIA', 'NPF', 'OTHER']

export default function SettingsPage({ params }: { params: { groupId: string } }) {
  const [group, setGroup] = useState<Group | null>(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [careType, setCareType] = useState('DEMENTIA')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get<Group>(`/api/groups/${params.groupId}`).then((g) => {
      setGroup(g)
      setName(g.name)
      setRecipientName(g.recipientName)
      setCareType(g.careType)
    })
  }, [params.groupId])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const updated = await api.patch<Group>(`/api/groups/${params.groupId}`, { name, recipientName, careType })
      setGroup({ ...updated, myRole: group?.myRole ?? 'SUPPORTER' })
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  if (!group) return <div style={{ padding: '2rem' }}>Laddar...</div>

  return (
    <div className={pageStyles.page}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Inställningar</h1>

      <div className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <h2>Grupppinformation</h2>
          {!editing && group.myRole === 'LEAD' && (
            <button className={pageStyles.editBtn} onClick={() => setEditing(true)}>Redigera</button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSave} className={styles.form}>
            <label className={styles.label}>
              Gruppens namn
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={styles.input} required />
            </label>
            <label className={styles.label}>
              Omsorgstagare
              <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className={styles.input} required />
            </label>
            <label className={styles.label}>
              Typ av omsorg
              <select value={careType} onChange={(e) => setCareType(e.target.value)} className={styles.input}>
                {CARE_TYPES.map((t) => (
                  <option key={t} value={t}>{CARE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="submit" className={styles.button} disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Sparar...' : 'Spara'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className={pageStyles.cancelBtn}>Avbryt</button>
            </div>
          </form>
        ) : (
          <dl className={pageStyles.dl}>
            <div className={pageStyles.row}>
              <dt>Namn</dt><dd>{group.name}</dd>
            </div>
            <div className={pageStyles.row}>
              <dt>Omsorgstagare</dt><dd>{group.recipientName}</dd>
            </div>
            <div className={pageStyles.row}>
              <dt>Typ</dt><dd>{CARE_TYPE_LABELS[group.careType] ?? group.careType}</dd>
            </div>
            <div className={pageStyles.row}>
              <dt>Plan</dt><dd>{group.plan}</dd>
            </div>
            <div className={pageStyles.row}>
              <dt>Din roll</dt><dd>{group.myRole}</dd>
            </div>
          </dl>
        )}
        {saved && <p style={{ color: 'var(--color-success)', marginTop: '0.75rem', fontSize: '0.875rem' }}>Ändringar sparade.</p>}
      </div>
    </div>
  )
}
