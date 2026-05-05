'use client'

import { useTranslation } from 'react-i18next'
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

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar}>
        <div className={styles.logo}>Vardnära</div>
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
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
