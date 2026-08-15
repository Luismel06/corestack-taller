export const brand = {
  name: 'ALLPA',
  tagline: 'Ama, vive y crea',
  descriptor: 'Exhibidores, empaques y tips',
  logoPath: '/brand/allpa-logo.png',
  faviconPath: '/icon.png',
  loginEmailPlaceholder: 'usuario@allpa.local',
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
