import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';
import { brand } from '@/lib/brand';

export const metadata: Metadata = {
  title: {
    default: brand.name,
    template: `%s | ${brand.name}`,
  },
  applicationName: brand.name,
  description: `${brand.descriptor}. Operación, facturación e inventario.`,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: brand.faviconPath, type: 'image/png', sizes: '32x32' },
      { url: brand.pwaIconPath, type: 'image/png', sizes: '192x192' },
    ],
    shortcut: brand.faviconPath,
    apple: [{ url: brand.appleTouchIconPath, type: 'image/png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: brand.shortName,
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#020617',
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
