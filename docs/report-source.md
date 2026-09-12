# Descubrimiento funcional — CoreStack Taller

**Audiencia:** dirección de producto y operación de Taller X  
**Fecha:** 4 de septiembre de 2026  
**Alcance:** priorizar las funciones que convierten la base ERP/POS actual en un sistema de taller mecánico, preservar la facturación dominicana existente y evaluar los módulos heredados antes de retirarlos.

## Respuesta ejecutiva

El centro del producto debe ser una **orden de reparación (OT)**, no una venta aislada. Cada OT debe enlazar cliente, vehículo, recepción, diagnóstico, presupuesto, autorización, técnicos, repuestos, mano de obra, cobro y factura. La base ya contiene clientes, productos, inventario, compras, caja, facturas y secuencias fiscales; por tanto, el trabajo correcto es conectar esos módulos a la OT en vez de crear subsistemas paralelos.

La versión entregada del módulo **Taller** ya resuelve el ciclo operativo inicial: vehículos vinculados al cliente, tickets por estado, asignación de técnicos y tareas, líneas de mano de obra/repuesto/otros, presupuesto congelado al aprobar, reserva de repuestos y puente controlado OT → Caja → factura. Las siguientes prioridades son citas, inspección documentada, historial/mantenimiento y analítica de taller.

## Evidencia externa y límites

- La DGII reconoce B01/E31 para transacciones con crédito fiscal y B02/E32 para consumidor final; los e-NCF llevan serie `E`, tipo y diez dígitos secuenciales. El flujo fiscal existente debe mantenerse, con la factura emitida al finalizar una OT. [DGII: tipos y estructura de e-CF](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/TipoyEstructurae-CF.aspx) y [DGII: tipos de NCF](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscales/Paginas/tiposComprobantes.aspx)
- La DGII mantiene XSD y documentación técnica específica para E31 y E32. El correo actual es una copia comercial, no sustituye XML firmado, certificación ni respuesta DGII. [Documentación técnica e-CF de DGII](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobreE-CF.aspx)
- En sistemas de taller actuales, la cadena recurrente es agenda/recepción → inspección → estimado → autorización → reparación → factura/pago → seguimiento. Las fuentes de producto consultadas coinciden en unir órdenes, técnicos, piezas, inspecciones, aprobaciones y comunicación. Esto es evidencia de patrón de operación, no una obligación normativa. [Shop-Ware: flujo de trabajo](https://shop-ware.com/features/digital-workflow/), [Shopmonkey: agenda y flujo](https://www.shopmonkey.io/demo-scheduling) y [Shopmonkey: estimados abiertos](https://support.shopmonkey.io/hc/en-us/articles/44630090139284-All-Estimates-Report)

**Límite del análisis UX:** se revisó la estructura de las pantallas y rutas del proyecto, pero en este entorno no hay un navegador controlable que permita capturar las pantallas del flujo real. Por eso este documento no presenta una auditoría visual ni afirma accesibilidad completa; la siguiente revisión visual debe hacerse con capturas del flujo operativo real.

## Inventario actual comprobado

| Capacidad existente                                   | Estado para Taller           | Decisión                                                                |
| ----------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| Clientes y documentos RNC/Cédula                      | Ya existe                    | Conservar; añadir vista de historial de vehículos y OTs.                |
| Productos, existencias, mínimos, compras y suplidores | Ya existe                    | Conservar; orientar categorías a repuestos, consumibles y servicios.    |
| Caja POS, pagos, crédito, cuentas por cobrar          | Ya existe                    | Conservar; el POS debe cobrar una OT aprobada/lista, no reconstruirla.  |
| Facturas B01/B02/E31/E32, secuencias y correo e-CF    | Ya existe                    | Conservar; emitir desde la OT y conservar la trazabilidad OT → factura. |
| Taller: vehículos, tickets, asignación y estados      | Primera base creada          | Evolucionar a orden de reparación central.                              |
| Toma de órdenes y cotizaciones de venta               | Solapa el concepto de OT     | Adaptar antes de eliminar; no borrar todavía.                           |
| Código de barras                                      | Útil para repuestos          | Conservar.                                                              |
| Devoluciones                                          | Útil para repuestos/facturas | Conservar, con referencia futura a OT cuando aplique.                   |
| Almacén B2B separado                                  | Ya unificado con inventario  | No reintroducir para Taller sin un caso operativo distinto.             |

## Funciones prioritarias

### Fase 1 — operación diaria imprescindible

1. **Tablero de taller visible desde el inicio**
   - Hacer `Taller` el acceso principal junto a Panel y Caja.
   - Kanban/cola por etapa: recibido, diagnóstico, esperando autorización, aprobado, en proceso, listo y entregado.
   - Mostrar placa, cliente, vehículo, promesa de entrega, prioridad, técnico y monto estimado.
   - Alertas de atraso cuando la fecha prometida vence y alertas de OT detenidas esperando aprobación o repuestos.

2. **Recepción completa del vehículo**
   - Cliente y vehículo reutilizable: placa, marca, modelo, año, VIN/chasis, kilometraje.
   - Motivo de visita, kilometraje de entrada, combustible, accesorios/estado físico, observaciones del cliente y fecha prometida.
   - Evidencia fotográfica y checklist de recepción en una fase posterior inmediata. No debe depender de un campo de notas suelto.

3. **Diagnóstico, presupuesto y autorización**
   - Líneas separadas de mano de obra, repuestos, consumibles y descuentos/impuestos.
   - El técnico propone; el asesor/administrador presenta y registra `pendiente`, `aprobado`, `parcialmente aprobado` o `rechazado`, además de fecha, canal y observación.
   - Congelar una versión del presupuesto aprobada. Los trabajos adicionales deben generar una revisión para no cobrar cambios no aprobados.

4. **Asignación y ejecución por mecánico**
   - Varias tareas por OT, con técnico responsable, estado y horas estimadas/reales.
   - Vista “Mis trabajos” para el rol mecánico: solo sus tareas, diagnóstico, checklist y opción de iniciar/pausar/finalizar.
   - No usar únicamente una lista de mecánicos asignados: eso no responde quién ejecutó qué ni cuánto tiempo tomó.

5. **Repuestos e inventario ligados a la OT**
   - Seleccionar productos reales del catálogo para cada línea de repuesto.
   - Reservar existencia al aprobar y descontarla al registrar como consumido/entregado, con reversión controlada si se cancela.
   - Poder crear una solicitud u orden de compra desde un repuesto faltante y vincularla a la OT; la compra sigue usando el módulo existente.

6. **Entrega, cobro y factura**
   - Desde `Listo para entrega`, enviar la OT a Caja con sus líneas aprobadas, cliente y correo e-CF.
   - Caja conserva la elección de B01/B02 o E31/E32 y las validaciones actuales, pero no permite facturar líneas no aprobadas sin autorización explícita.
   - Guardar vínculo permanente entre factura, pago y OT; después de pago, avanzar la OT a entregada.

### Fase 2 — alto valor tras estabilizar el ciclo principal

1. **Citas y capacidad del taller:** agenda por bahía/técnico, recordatorios, reprogramación y conversión de cita a OT.
2. **Inspección digital:** checklist por tipo de servicio, fotos/videos/notas y hallazgos con recomendación; compartir presupuesto con el cliente.
3. **Historial del vehículo y mantenimiento:** servicios realizados, kilometraje, garantías, próximas recomendaciones y recordatorios por tiempo/kilometraje.
4. **Indicadores propios de taller:** OTs abiertas y vencidas, tiempo de ciclo, horas presupuestadas vs. reales, productividad por técnico, margen de mano de obra/repuestos, estimados pendientes y ticket promedio.
5. **Mensajería al cliente:** confirmación de recepción, petición de aprobación, aviso de listo y copia de factura. Debe usar el canal ya configurado para correo; SMS/WhatsApp requiere decidir proveedor y consentimiento.

## Flujo objetivo y módulos que participan

```text
Cita opcional
   ↓
Recepción (cliente + vehículo) ───────► Historial del vehículo
   ↓
Diagnóstico / inspección
   ↓
Presupuesto versionado ──► aprobación del cliente
   ↓                                 ↓
Asignación de tareas ◄────────── inventario / compras de repuestos
   ↓
Trabajo terminado y control de calidad
   ↓
Caja POS + B01/B02/E31/E32 + pago
   ↓
Entrega, factura y seguimiento
```

## Propuesta de navegación para dar notoriedad

Sin borrar módulos todavía, la navegación debe poner el flujo operativo antes de los módulos ERP de apoyo:

1. **Panel de Taller** — resumen de OTs y alertas operativas.
2. **Órdenes de reparación** — tablero y recepción.
3. **Agenda** — cuando se habilite Fase 2.
4. **Clientes y vehículos** — clientes existente con vehículos/historial como pestaña.
5. **Repuestos y servicios** — catálogo existente de Productos, renombrado en la interfaz.
6. **Inventario** — existencias y movimientos.
7. **Caja y facturas** — cobro y documentación fiscal.

Compras, suplidores, cuentas, empleados, registros y configuración siguen disponibles como soporte administrativo, agrupados para que no compitan visualmente con el taller.

## Módulos a evaluar antes de retirar o reconvertir

| Módulo heredado                              | Recomendación                                                                                              | Impacto si se retira                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Toma de órdenes                              | **Reconducir** a la recepción/OT y ocultar cuando la OT pueda facturarse en Caja.                          | Alto: hoy puede contener el paso previo a Caja. No eliminar aún.  |
| Cotizaciones                                 | **Fusionar conceptualmente** con presupuesto de OT; conservar documentos existentes durante la transición. | Alto: se perdería historial comercial y posiblemente impresión.   |
| Caja POS                                     | **Conservar**, limitar cobro normal a una OT entregable o a venta directa de repuestos.                    | Alto: es el punto de pago e impuestos.                            |
| Productos                                    | **Renombrar** como Repuestos y servicios; añadir tipo/costo de mano de obra si hace falta.                 | Alto: es la fuente de inventario y facturación.                   |
| Código de barras                             | **Conservar** para repuestos físicos.                                                                      | Bajo, pero útil.                                                  |
| Devoluciones                                 | **Conservar**; adaptar después para referenciar OT.                                                        | Medio: una corrección fiscal o devolución sigue siendo necesaria. |
| Aprobaciones de crédito / cuentas por cobrar | **Conservar** si el taller venderá a crédito o a flotillas/empresas.                                       | Medio; confirmar modelo comercial del cliente.                    |

No se recomienda borrar ninguno de estos módulos ahora. Primero se debe completar el vínculo OT → Caja/Factura y migrar los usos de Toma de órdenes/Cotizaciones hacia la OT.

## Integraciones evaluadas

- **Google Calendar:** está disponible como integración opcional, pero no está instalada ni conectada. Puede aportar sincronización de citas más adelante; no es necesaria para construir una agenda propia y no debe bloquear la Fase 1.
- **Correo:** el envío existente (Resend) es suficiente para la primera versión de avisos y copia e-CF. La facturación oficial e-CF continúa requiriendo los requisitos técnicos, autorización y certificación de DGII.

## Recomendación de implementación inmediata

Implementar primero el tablero de Órdenes de reparación con detalle de OT, presupuesto/aprobación, tareas por mecánico y consumo de repuestos, seguido por el puente controlado a Caja/Facturas. Luego se decide si `Toma de órdenes` se renombra y redirige a la OT, una vez que el flujo nuevo esté probado.

## Registro de afirmaciones y fuentes

| Afirmación                                                                                              | Fuente                                                                                                                                                    | Fecha/acceso          | Nota                                      |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------- |
| E31/E32 y la estructura de 13 posiciones de e-NCF                                                       | [DGII: Tipos y estructura e-CF](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/TipoyEstructurae-CF.aspx) | Consultado 2026-09-04 | Fuente oficial.                           |
| B01/B02 son crédito fiscal/consumo y su uso                                                             | [DGII: Tipos de comprobantes](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscales/Paginas/tiposComprobantes.aspx)                     | Consultado 2026-09-04 | Fuente oficial.                           |
| XML, XSD y certificación no se sustituyen con email                                                     | [DGII: Documentación e-CF](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobreE-CF.aspx)   | Consultado 2026-09-04 | Fuente oficial.                           |
| El patrón comercial integra agenda, inspección, estimado, aprobación, reparación, factura y seguimiento | [Shop-Ware](https://shop-ware.com/features/digital-workflow/); [Shopmonkey](https://www.shopmonkey.io/demo-scheduling)                                    | Consultado 2026-09-04 | Evidencia de mercado, no requisito legal. |
