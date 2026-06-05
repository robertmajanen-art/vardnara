'use client'

import { useEffect, useState } from 'react'
import { api } from '../../../../lib/api'
import formStyles from '../../../login/login.module.css'
import s from './settings.module.css'

// ── Types ────────────────────────────────────────────────────────────────────

type Group = {
  id: string
  name: string
  recipientName: string
  careType: string
  plan: string
  myRole: string
}

type Member = {
  userId: string
  role: string
  joinedAt: string
  user: { id: string; email: string }
}

type Invite = {
  id: string
  token: string
  email?: string | null
  role: string
  status: string
  expiresAt: string
  createdAt: string
}

type DisplayToken = {
  id: string
  token: string
  label: string
  lookaheadHours: number
  isActive: boolean
  lastSeenAt?: string | null
  createdAt: string
}

type EmailConfig = {
  provider: 'gmail' | 'office365' | 'custom'
  host: string
  port: number
  secure: boolean
  username: string
  fromName: string
  hasPassword: boolean
}

const EMAIL_PROVIDERS: Array<{
  value: EmailConfig['provider']
  label: string
  defaults: Partial<EmailConfig>
  hint?: string
}> = [
  {
    value: 'gmail',
    label: 'Gmail',
    defaults: { host: 'smtp.gmail.com', port: 587, secure: false },
    hint: 'Gmail kräver ett App-lösenord. Aktivera tvåfaktorsautentisering i ditt Google-konto och skapa sedan ett App-lösenord under Säkerhet → App-lösenord.',
  },
  {
    value: 'office365',
    label: 'Office 365 / Outlook',
    defaults: { host: 'smtp.office365.com', port: 587, secure: false },
  },
  {
    value: 'custom',
    label: 'Anpassad SMTP',
    defaults: { port: 587, secure: false },
  },
]

// ── Constants ────────────────────────────────────────────────────────────────

const CARE_TYPE_LABELS: Record<string, string> = {
  DEMENTIA: 'Demens',
  NPF: 'NPF (autism, ADHD m.fl.)',
  OTHER: 'Annat',
}
const CARE_TYPES = ['DEMENTIA', 'NPF', 'OTHER']

const ROLE_LABELS: Record<string, string> = {
  LEAD:      '👑 Samordnare',
  SUPPORTER: '🤝 Medvårdare',
  OBSERVER:  '👁 Observatör',
  EXTERNAL:  '🏥 Extern',
}

const INVITE_ROLES: Array<{ value: string; label: string; desc: string }> = [
  { value: 'LEAD',      label: '👑 Samordnare', desc: 'Kan allt — bjuda in, redigera, ta bort' },
  { value: 'SUPPORTER', label: '🤝 Medvårdare', desc: 'Kan lägga till och redigera innehåll' },
  { value: 'OBSERVER',  label: '👁 Observatör',  desc: 'Kan bara läsa, inte ändra' },
  { value: 'EXTERNAL',  label: '🏥 Extern',      desc: 'Begränsad åtkomst för utomstående' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function inviteUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/invite/${token}`
}

function displayUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/display/${token}`
}

async function copyText(text: string, setCopied: (v: boolean) => void) {
  try {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  } catch {
    window.prompt('Kopiera länken:', text)
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button className={s.copyBtn} onClick={() => copyText(text, setCopied)} type="button">
      {copied ? '✓ Kopierad!' : '📋 Kopiera länk'}
    </button>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage({ params }: { params: { groupId: string } }) {
  const isLead = (group: Group | null) => group?.myRole === 'LEAD'

  // ── Current user ──
  const [currentUserId, setCurrentUserId] = useState('')

  useEffect(() => {
    try {
      const token = localStorage.getItem('accessToken')
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]!)) as { sub?: string }
        setCurrentUserId(payload.sub ?? '')
      }
    } catch { /* ignore */ }
  }, [])

  // ── Group info ──
  const [group, setGroup]               = useState<Group | null>(null)
  const [editing, setEditing]           = useState(false)
  const [name, setName]                 = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [careType, setCareType]         = useState('DEMENTIA')
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)

  // ── Members ──
  const [members, setMembers]           = useState<Member[]>([])
  const [removingId, setRemovingId]     = useState<string | null>(null)

  // ── Invites ──
  const [invites, setInvites]           = useState<Invite[]>([])
  const [inviteEmail, setInviteEmail]   = useState('')
  const [inviteRole, setInviteRole]     = useState('SUPPORTER')
  const [inviting, setInviting]         = useState(false)
  const [inviteError, setInviteError]   = useState('')
  const [newInvite, setNewInvite]       = useState<Invite | null>(null)
  const [revokingId, setRevokingId]     = useState<string | null>(null)

  // ── Display tokens ──
  const [displayTokens, setDisplayTokens]     = useState<DisplayToken[]>([])
  const [displayLabel, setDisplayLabel]       = useState('Hemskärm')
  const [creatingDisplay, setCreatingDisplay] = useState(false)
  const [displayError, setDisplayError]       = useState('')
  const [revokingDisplayId, setRevokingDisplayId] = useState<string | null>(null)

  // ── Email / calendar config ──
  const [emailCfg, setEmailCfg]           = useState<EmailConfig>({
    provider: 'gmail', host: 'smtp.gmail.com', port: 587, secure: false,
    username: '', fromName: 'VårdNära', hasPassword: false,
  })
  const [emailPassword, setEmailPassword] = useState('')
  const [emailLoaded, setEmailLoaded]     = useState(false)
  const [emailSaving, setEmailSaving]     = useState(false)
  const [emailSaved, setEmailSaved]       = useState(false)
  const [emailError, setEmailError]       = useState('')
  const [emailTesting, setEmailTesting]   = useState(false)
  const [emailTestMsg, setEmailTestMsg]   = useState('')
  const [emailTestOk, setEmailTestOk]     = useState<boolean | null>(null)

  // ── Fetch everything ──────────────────────────────────────────────────────
  useEffect(() => {
    api.get<Group>(`/api/groups/${params.groupId}`).then((g) => {
      setGroup(g)
      setName(g.name)
      setRecipientName(g.recipientName)
      setCareType(g.careType)
    })
    api.get<Member[]>(`/api/groups/${params.groupId}/members`).then(setMembers)
  }, [params.groupId])

  useEffect(() => {
    if (!isLead(group)) return
    api.get<Invite[]>(`/api/groups/${params.groupId}/invites`).then(setInvites).catch(() => {})
    api.get<DisplayToken[]>(`/api/groups/${params.groupId}/display-tokens`).then(setDisplayTokens).catch(() => {})
    // Load email config
    api.get<EmailConfig | null>(`/api/groups/${params.groupId}/email-config`)
      .then(cfg => {
        if (cfg) setEmailCfg(cfg)
        setEmailLoaded(true)
      })
      .catch(() => setEmailLoaded(true))
  }, [group, params.groupId])

  // ── Group save ────────────────────────────────────────────────────────────
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

  // ── Remove member ─────────────────────────────────────────────────────────
  async function handleRemoveMember(userId: string) {
    if (!window.confirm('Ta bort denna person från gruppen?')) return
    setRemovingId(userId)
    try {
      await api.delete(`/api/groups/${params.groupId}/members/${userId}`)
      setMembers(prev => prev.filter(m => m.userId !== userId))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Kunde inte ta bort medlemmen.')
    } finally {
      setRemovingId(null)
    }
  }

  // ── Send invite ───────────────────────────────────────────────────────────
  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteError('')
    setNewInvite(null)
    setInviting(true)
    try {
      const body: Record<string, string> = { role: inviteRole }
      if (inviteEmail.trim()) body.email = inviteEmail.trim()
      const invite = await api.post<Invite>(`/api/groups/${params.groupId}/invites`, body)
      setNewInvite(invite)
      setInvites(prev => [invite, ...prev])
      setInviteEmail('')
    } catch (e: unknown) {
      setInviteError(e instanceof Error ? e.message : 'Något gick fel.')
    } finally {
      setInviting(false)
    }
  }

  // ── Revoke invite ─────────────────────────────────────────────────────────
  async function handleRevokeInvite(inviteId: string) {
    setRevokingId(inviteId)
    try {
      await api.delete(`/api/groups/${params.groupId}/invites/${inviteId}`)
      setInvites(prev => prev.filter(i => i.id !== inviteId))
      if (newInvite?.id === inviteId) setNewInvite(null)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Kunde inte återkalla inbjudan.')
    } finally {
      setRevokingId(null)
    }
  }

  // ── Create display token ──────────────────────────────────────────────────
  async function handleCreateDisplay(e: React.FormEvent) {
    e.preventDefault()
    setDisplayError('')
    setCreatingDisplay(true)
    try {
      const token = await api.post<DisplayToken>(`/api/groups/${params.groupId}/display-tokens`, {
        label: displayLabel.trim() || 'Hemskärm',
        lookaheadHours: 24,
        volume: 60,
      })
      setDisplayTokens(prev => [...prev, token])
      setDisplayLabel('Hemskärm')
    } catch (e: unknown) {
      setDisplayError(e instanceof Error ? e.message : 'Något gick fel.')
    } finally {
      setCreatingDisplay(false)
    }
  }

  // ── Revoke display token ──────────────────────────────────────────────────
  async function handleRevokeDisplay(tokenId: string) {
    if (!window.confirm('Inaktivera denna skärmlänk?')) return
    setRevokingDisplayId(tokenId)
    try {
      await api.delete(`/api/groups/${params.groupId}/display-tokens/${tokenId}`)
      setDisplayTokens(prev => prev.filter(t => t.id !== tokenId))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Kunde inte inaktivera skärmlänken.')
    } finally {
      setRevokingDisplayId(null)
    }
  }

  // ── Email config save ─────────────────────────────────────────────────────
  async function handleEmailSave(e: React.FormEvent) {
    e.preventDefault()
    setEmailError('')
    setEmailSaved(false)
    setEmailTestMsg('')
    setEmailSaving(true)
    try {
      const body: Record<string, unknown> = {
        provider: emailCfg.provider,
        host: emailCfg.host,
        port: emailCfg.port,
        secure: emailCfg.secure,
        username: emailCfg.username,
        fromName: emailCfg.fromName,
      }
      if (emailPassword.trim()) body.password = emailPassword.trim()
      const updated = await api.put<EmailConfig>(
        `/api/groups/${params.groupId}/email-config`, body,
      )
      setEmailCfg(updated)
      setEmailPassword('')
      setEmailSaved(true)
      setTimeout(() => setEmailSaved(false), 4000)
    } catch (e: unknown) {
      setEmailError(e instanceof Error ? e.message : 'Något gick fel vid sparande.')
    } finally {
      setEmailSaving(false)
    }
  }

  async function handleEmailTest() {
    setEmailTestMsg('')
    setEmailTestOk(null)
    setEmailTesting(true)
    try {
      const res = await api.post<{ ok: boolean; message?: string }>(
        `/api/groups/${params.groupId}/email-config/test`, {},
      )
      setEmailTestOk(res.ok)
      setEmailTestMsg(res.message ?? (res.ok ? 'Testmail skickat!' : 'Misslyckades'))
    } catch (e: unknown) {
      setEmailTestOk(false)
      setEmailTestMsg(e instanceof Error ? e.message : 'Anslutning misslyckades')
    } finally {
      setEmailTesting(false)
    }
  }

  function applyProviderDefaults(provider: EmailConfig['provider']) {
    const p = EMAIL_PROVIDERS.find(x => x.value === provider)
    if (!p) return
    setEmailCfg(prev => ({ ...prev, provider, ...p.defaults }))
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (!group) return <div style={{ padding: '2rem' }}>Laddar...</div>

  const pendingInvites = invites.filter(i => i.status === 'PENDING')

  return (
    <div className={s.page}>
      <h1 className={s.pageTitle}>Inställningar</h1>

      {/* ── Group info ─────────────────────────────────────────── */}
      <section className={s.section}>
        <div className={s.sectionHeader}>
          <h2>Gruppinformation</h2>
          {!editing && isLead(group) && (
            <button className={s.editBtn} onClick={() => setEditing(true)}>Redigera</button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSave} className={formStyles.form}>
            <label className={formStyles.label}>
              Gruppens namn
              <input type="text" value={name} onChange={e => setName(e.target.value)} className={formStyles.input} required />
            </label>
            <label className={formStyles.label}>
              Omsorgstagare
              <input type="text" value={recipientName} onChange={e => setRecipientName(e.target.value)} className={formStyles.input} required />
            </label>
            <label className={formStyles.label}>
              Typ av omsorg
              <select value={careType} onChange={e => setCareType(e.target.value)} className={formStyles.input}>
                {CARE_TYPES.map(t => <option key={t} value={t}>{CARE_TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="submit" className={formStyles.button} disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Sparar...' : 'Spara'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className={s.cancelBtn}>Avbryt</button>
            </div>
          </form>
        ) : (
          <dl className={s.dl}>
            <div className={s.row}><dt>Namn</dt><dd>{group.name}</dd></div>
            <div className={s.row}><dt>Omsorgstagare</dt><dd>{group.recipientName}</dd></div>
            <div className={s.row}><dt>Typ</dt><dd>{CARE_TYPE_LABELS[group.careType] ?? group.careType}</dd></div>
            <div className={s.row}><dt>Plan</dt><dd>{group.plan}</dd></div>
            <div className={s.row}><dt>Din roll</dt><dd>{ROLE_LABELS[group.myRole] ?? group.myRole}</dd></div>
          </dl>
        )}
        {saved && <p className={s.successMsg}>Ändringar sparade.</p>}
      </section>

      {/* ── Members ────────────────────────────────────────────── */}
      <section className={s.section}>
        <div className={s.sectionHeader}>
          <h2>Teammedlemmar</h2>
          <span className={s.memberCount}>{members.length} person{members.length !== 1 ? 'er' : ''}</span>
        </div>
        <ul className={s.memberList}>
          {members.map(m => (
            <li key={m.userId} className={s.memberRow}>
              <div className={s.memberInfo}>
                <span className={s.memberEmail}>{m.user.email}</span>
                <span className={s.roleBadge}>{ROLE_LABELS[m.role] ?? m.role}</span>
              </div>
              {isLead(group) && m.userId !== currentUserId && (
                <button
                  className={s.removeBtn}
                  onClick={() => handleRemoveMember(m.userId)}
                  disabled={removingId === m.userId}
                  title="Ta bort från gruppen">
                  {removingId === m.userId ? '…' : '✕'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Invites (LEAD only) ────────────────────────────────── */}
      {isLead(group) && (
        <section className={s.section}>
          <div className={s.sectionHeader}>
            <h2>Bjud in ny medvårdare</h2>
          </div>

          <form onSubmit={handleInvite} className={s.inviteForm}>
            <div className={s.roleGrid}>
              {INVITE_ROLES.map(r => (
                <label key={r.value} className={`${s.roleCard} ${inviteRole === r.value ? s.roleCardActive : ''}`}>
                  <input type="radio" name="role" value={r.value}
                    checked={inviteRole === r.value}
                    onChange={() => setInviteRole(r.value)}
                    className={s.radioHidden} />
                  <span className={s.roleCardLabel}>{r.label}</span>
                  <span className={s.roleCardDesc}>{r.desc}</span>
                </label>
              ))}
            </div>

            <label className={s.emailLabel}>
              E-postadress <span className={s.optional}>(valfritt — skickar välkomstmail)</span>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                className={s.emailInput}
                placeholder="medvardare@exempel.se"
              />
            </label>

            {inviteError && <p className={s.errorMsg}>{inviteError}</p>}

            <button type="submit" className={s.inviteBtn} disabled={inviting}>
              {inviting ? 'Skapar länk...' : '🔗 Skapa inbjudningslänk'}
            </button>
          </form>

          {/* Newly created invite */}
          {newInvite && (
            <div className={s.newInviteBox}>
              <p className={s.newInviteTitle}>✅ Inbjudningslänk skapad!</p>
              <p className={s.newInviteRole}>Roll: {ROLE_LABELS[newInvite.role] ?? newInvite.role}</p>
              <div className={s.linkRow}>
                <input readOnly value={inviteUrl(newInvite.token)} className={s.linkInput} />
                <CopyBtn text={inviteUrl(newInvite.token)} />
              </div>
              <p className={s.newInviteNote}>
                Länken är giltig i 7 dagar. Dela den med personen du vill bjuda in.
              </p>
            </div>
          )}

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div className={s.pendingSection}>
              <p className={s.pendingTitle}>Väntande inbjudningar ({pendingInvites.length})</p>
              <ul className={s.pendingList}>
                {pendingInvites.map(inv => (
                  <li key={inv.id} className={s.pendingRow}>
                    <div className={s.pendingInfo}>
                      <span className={s.roleBadge}>{ROLE_LABELS[inv.role] ?? inv.role}</span>
                      {inv.email && <span className={s.pendingEmail}>{inv.email}</span>}
                      <span className={s.pendingExpiry}>
                        Giltig till {new Date(inv.expiresAt).toLocaleDateString('sv-SE')}
                      </span>
                    </div>
                    <div className={s.pendingActions}>
                      <CopyBtn text={inviteUrl(inv.token)} />
                      <button className={s.revokeBtn}
                        onClick={() => handleRevokeInvite(inv.id)}
                        disabled={revokingId === inv.id}>
                        {revokingId === inv.id ? '…' : 'Återkalla'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Display tokens / ambient link (LEAD only) ──────────── */}
      {isLead(group) && (
        <section className={s.section}>
          <div className={s.sectionHeader}>
            <h2>Skärmlänk (ambientskärm)</h2>
          </div>
          <p className={s.sectionDesc}>
            Skapa en länk som visar en klock- och schemavy för en surfplatta eller TV i hemmet —
            ingen inloggning krävs.
          </p>

          {displayTokens.length > 0 && (
            <ul className={s.displayList}>
              {displayTokens.map(dt => (
                <li key={dt.id} className={s.displayRow}>
                  <div className={s.displayInfo}>
                    <span className={s.displayLabel}>{dt.label}</span>
                    {dt.lastSeenAt && (
                      <span className={s.displayLastSeen}>
                        Senast sedd: {new Date(dt.lastSeenAt).toLocaleString('sv-SE')}
                      </span>
                    )}
                  </div>
                  <div className={s.pendingActions}>
                    <CopyBtn text={displayUrl(dt.token)} />
                    <button className={s.revokeBtn}
                      onClick={() => handleRevokeDisplay(dt.id)}
                      disabled={revokingDisplayId === dt.id}>
                      {revokingDisplayId === dt.id ? '…' : 'Inaktivera'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleCreateDisplay} className={s.displayForm}>
            <label className={s.emailLabel}>
              Namn på skärmen
              <input
                type="text"
                value={displayLabel}
                onChange={e => setDisplayLabel(e.target.value)}
                className={s.emailInput}
                placeholder="t.ex. Hemskärm, TV i vardagsrum"
              />
            </label>
            {displayError && <p className={s.errorMsg}>{displayError}</p>}
            <button type="submit" className={s.inviteBtn} disabled={creatingDisplay}>
              {creatingDisplay ? 'Skapar...' : '📺 Skapa ny skärmlänk'}
            </button>
          </form>
        </section>
      )}

      {/* ── E-post & Kalenderinbjudningar (LEAD only) ──────────── */}
      {isLead(group) && emailLoaded && (
        <section className={s.section}>
          <div className={s.sectionHeader}>
            <h2>E-post &amp; Kalenderinbjudningar</h2>
          </div>
          <p className={s.sectionDesc}>
            Konfigurera e-post för att automatiskt skicka kalenderinbjudningar till alla
            samordnare, medvårdare och observatörer när ett besök skapas, ändras eller tas bort.
            Inbjudningarna är kompatibla med Outlook, Gmail och Apple Calendar.
          </p>

          <form onSubmit={handleEmailSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Provider selector */}
            <label className={s.emailLabel}>
              E-postleverantör
              <select
                value={emailCfg.provider}
                onChange={e => applyProviderDefaults(e.target.value as EmailConfig['provider'])}
                className={s.emailInput}
              >
                {EMAIL_PROVIDERS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </label>

            {/* Provider-specific hint */}
            {EMAIL_PROVIDERS.find(p => p.value === emailCfg.provider)?.hint && (
              <p style={{ margin: 0, padding: '0.75rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.8125rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                ℹ️ {EMAIL_PROVIDERS.find(p => p.value === emailCfg.provider)?.hint}
              </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'end' }}>
              <label className={s.emailLabel} style={{ margin: 0 }}>
                SMTP-server
                <input
                  type="text"
                  value={emailCfg.host}
                  onChange={e => setEmailCfg(p => ({ ...p, host: e.target.value }))}
                  className={s.emailInput}
                  placeholder="smtp.example.com"
                  required
                />
              </label>
              <label className={s.emailLabel} style={{ margin: 0 }}>
                Port
                <input
                  type="number"
                  value={emailCfg.port}
                  onChange={e => setEmailCfg(p => ({ ...p, port: Number(e.target.value) }))}
                  className={s.emailInput}
                  style={{ width: '5rem' }}
                  min={1} max={65535}
                  required
                />
              </label>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={emailCfg.secure}
                onChange={e => setEmailCfg(p => ({ ...p, secure: e.target.checked }))}
              />
              SSL/TLS (port 465) — avmarkerat = STARTTLS (port 587)
            </label>

            <label className={s.emailLabel}>
              Användarnamn / e-postadress
              <input
                type="email"
                value={emailCfg.username}
                onChange={e => setEmailCfg(p => ({ ...p, username: e.target.value }))}
                className={s.emailInput}
                placeholder="ditt@foretag.se"
                required
              />
            </label>

            <label className={s.emailLabel}>
              Lösenord {emailCfg.hasPassword && <span className={s.optional}>(lämna tomt för att behålla befintligt)</span>}
              <input
                type="password"
                value={emailPassword}
                onChange={e => setEmailPassword(e.target.value)}
                className={s.emailInput}
                placeholder={emailCfg.hasPassword ? '••••••••' : 'Ange lösenord eller App-lösenord'}
                autoComplete="new-password"
              />
            </label>

            <label className={s.emailLabel}>
              Avsändarnamn
              <input
                type="text"
                value={emailCfg.fromName}
                onChange={e => setEmailCfg(p => ({ ...p, fromName: e.target.value }))}
                className={s.emailInput}
                placeholder="VårdNära"
              />
            </label>

            {emailError && <p className={s.errorMsg}>{emailError}</p>}
            {emailSaved && <p className={s.successMsg}>✅ E-postkonfiguration sparad.</p>}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="submit" className={s.inviteBtn} disabled={emailSaving} style={{ flex: 1 }}>
                {emailSaving ? 'Sparar...' : '💾 Spara e-postkonfiguration'}
              </button>
              <button
                type="button"
                className={s.editBtn}
                onClick={handleEmailTest}
                disabled={emailTesting}
                title="Testar anslutningen och skickar ett testmail till konfigurerad adress"
              >
                {emailTesting ? 'Testar...' : '📧 Testa anslutning'}
              </button>
            </div>

            {emailTestMsg && (
              <p style={{ margin: 0, fontSize: '0.875rem', color: emailTestOk ? 'var(--color-success, #198754)' : 'var(--color-danger, #dc3545)' }}>
                {emailTestOk ? '✅' : '❌'} {emailTestMsg}
              </p>
            )}
          </form>
        </section>
      )}
    </div>
  )
}
