import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';
import { brand } from '@/lib/brand';

export const metadata: Metadata = {
  title: brand.name,
  description: `${brand.descriptor}. Operación, facturación e inventario.`,
  icons: {
    icon: [{ url: brand.faviconPath, type: 'image/svg+xml' }],
    shortcut: brand.faviconPath,
    apple: brand.faviconPath,
  },
};

// A per-request CSP nonce requires dynamic rendering so Next.js can attach the
// nonce to its generated scripts instead of permitting arbitrary inline code.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
