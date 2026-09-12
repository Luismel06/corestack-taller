// Punto único de personalización para cada instalación de la plantilla de taller.
export const brand = {
  name: 'Soluciones Automotriz C&R',
  shortName: 'Automotriz C&R',
  tagline: 'Gestión de taller',
  descriptor: 'Servicio, diagnóstico y control operativo',
  logoPath: '/brand/logo-taller.png',
  faviconPath: '/brand/logo-taller-32.png',
  appleTouchIconPath: '/brand/logo-taller-180.png',
  pwaIconPath: '/brand/logo-taller-192.png',
  pwaLargeIconPath: '/brand/logo-taller-512.png',
  loginEmailPlaceholder: 'usuario@x.local',
  businessType: 'Taller automotriz',
} as const;

export const platform = {
  name: 'CoreStack',
  logoPath: '/brand/corestack-logo.jpeg',
  description: 'Tecnología empresarial creada por CoreStack',
} as const;

export const brandCopy = {
  operationalDescription: `Operación diaria de ${brand.name}.`,
  catalogDescription: `Catálogo, precios e inventario de ${brand.name}.`,
} as const;
