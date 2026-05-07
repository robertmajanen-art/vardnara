'use client'

import styles from '../tasks/tasks.module.css'

const CAT_LABELS: Record<string, string> = {
  MEDICAL: '🩺 Medicinsk',
  LEGAL: '⚖️ Juridisk',
  SCHOOL: '🎒 Skola',
  FINANCIAL: '💜 Ekonomi',
  INSURANCE: '🛡️ Försäkring',
  OTHER: '✨ Övrigt',
}

export default function DocumentsPage({ params }: { params: { groupId: string } }) {
  void params
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Dokument</h1>
      </header>
      <div style={{ padding: '2rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, maxWidth: 500 }}>
        <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Filuppladdning</p>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem', lineHeight: 1.6 }}>
          Dokumentlagring kräver konfiguration av S3-kompatibel fillagring (AWS S3 eller Supabase Storage).
          Konfigurera miljövariablerna <code>AWS_ACCESS_KEY_ID</code>, <code>AWS_SECRET_ACCESS_KEY</code>,{' '}
          <code>AWS_BUCKET_NAME</code> och <code>AWS_REGION</code> på servern för att aktivera uppladdning.
        </p>
        <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {Object.entries(CAT_LABELS).map(([, label]) => (
            <span key={label} style={{ fontSize: '0.8125rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 999, padding: '0.25rem 0.75rem' }}>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
