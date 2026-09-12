import type { MetadataRoute } from 'next';
import { brand } from '@/lib/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: `${brand.descriptor}. Operación, facturación e inventario.`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f4f4f5',
    theme_color: '#020617',
    icons: [
      {
        src: brand.pwaIconPath,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: brand.pwaLargeIconPath,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
