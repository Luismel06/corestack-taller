# Demo del taller y traslado a Supabase

Actualización: 2026-09-07. El proyecto completo de `Taller.txt` sigue en desarrollo.

## Estado de este cambio

- Se conserva un máximo de **5 usuarios activos por empresa**, incluyendo al administrador y todos los roles operativos. Las cuentas de soporte de plataforma no consumen cupos del taller. Desactivar un empleado libera un cupo; reactivar exige disponibilidad. No se borran usuarios históricos ni se desactivan automáticamente.
- La API comprueba el cupo dentro del bloqueo transaccional de empresa, también para altas simultáneas. La pantalla Empleados muestra ocupación real consultada al servidor.
- La base sigue en `localhost:5432/corestack_taller`. No se ha trasladado a Supabase: falta confirmar la conexión del proyecto exclusivo de demo.
- Se creó respaldo local antes de agregar muestras: `.tmp/workshop-pre-demo-20260907-014120.dump`. Contiene datos internos; no subir a GitHub ni compartir públicamente.

## Contenido añadido

El cargador agrega 6 clientes ficticios, 7 vehículos con sus órdenes, 3 citas, 4 repuestos y 3 servicios. Distribuye las órdenes en recepción (2), diagnóstico (2), autorización pendiente (1), reparación (1) y lista para entrega (1).

Usa los servicios del sistema para registrar recepción, inspección, presupuesto, autorización, consumo y calidad. Todas las muestras se identifican como demo. No cambia usuarios, contraseñas, documentos fiscales, facturas ni datos existentes; no envía correo ni consume rangos. La carga completa es transaccional. Una segunda ejecución detecta la marca de carga y no duplica ni reinicia las muestras.

Conservar los datos anteriores puede mantener ejemplos heredados de la plantilla. No se han borrado ni presentado como datos reales de C&R. La marca visual X sigue siendo provisional y configurable.

```powershell
# Revisar qué se agregaría (sin escribir)
pnpm db:seed:workshop --tenant=x-workshop
# Aplicar únicamente a la base local de demostración
pnpm db:seed:workshop --tenant=x-workshop --apply
```

Requiere una empresa existente, administrador activo y mecánico activo. No crea usuarios nuevos ni ofrece contraseñas por defecto. Rechaza un destino remoto o `NODE_ENV=production`. **No usar `pnpm db:seed`**: es el seed heredado destructivo, no este cargador.

## Migración pendiente

1. Crear un proyecto Supabase separado de los clientes anteriores. Guardar su URL PostgreSQL **Session pooler, puerto 5432** en `.env` como `SUPABASE_DEMO_DATABASE_URL`; nunca pegar la contraseña en un chat o commit. La [guía oficial de migración](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres) recomienda modo sesión para `pg_dump`/restauración.
2. Mantener `DATABASE_URL` y `DIRECT_URL` apuntando a la base local hasta verificar la copia. Revisar identidad, permisos y contenido del destino antes de escribir: si tiene tablas del negocio o datos ajenos, detenerse; no limpiar ni sobrescribir.
3. Detener temporalmente escrituras de la demo y tomar un respaldo nuevo del esquema de negocio `public`, incluyendo datos e historial `_prisma_migrations`. El respaldo previo a las muestras no contiene las muestras recién agregadas.
4. Restaurar sin propietarios/privilegios heredados y sin tocar los esquemas internos `auth`/`storage` de Supabase. Asegurar RLS/privilegios de tablas para impedir lectura desde las APIs públicas; el acceso operativo sigue siendo NestJS → Prisma, nunca acceso del navegador a tablas. Ver [Prisma y Supabase](https://supabase.com/docs/guides/database/prisma).
5. Comparar tablas, conteos y migraciones, verificar login, aislamiento, cupo de usuarios, recepción, inventario y cobro. No considerar la copia terminada por el simple éxito de `pg_restore`.
6. Solo entonces cambiar conexiones de la API al proyecto de demo y reiniciar. Guardar `WORKSHOP_TEST_DATABASE_URL` local: las pruebas de integración no deben usar la demo remota. Las claves de DB/Resend permanecen exclusivamente en backend. Actualizar Vercel requiere un paso de despliegue separado.

Mover PostgreSQL no migra automáticamente el login a Supabase Auth ni configura Storage. Esos requisitos de `Taller.txt`, junto a la integración/certificación real DGII, permanecen pendientes y no se simulan como completados.
