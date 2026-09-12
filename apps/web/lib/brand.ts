// Punto único de personalización para cada instalación de la plantilla de taller.
export const brand = {
  name: 'X',
  tagline: 'Gestión de taller',
  descriptor: 'Servicio, diagnóstico y control operativo',
  logoPath: '/brand/x-logo.svg',
  faviconPath: '/brand/x-logo.svg',
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
