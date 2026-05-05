import type { Metadata } from 'next'
import { Providers } from '../components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Vardnära',
  description: 'Familjekoordinering för vård och omsorg',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
