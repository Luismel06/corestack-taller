# Taller: implementación y verificación

Actualización solicitada el 2026-09-08: eliminado el módulo independiente de Códigos de barras (navegación, página `/barcodes` y generador). Se conservan los códigos, etiquetas de productos y lectura del POS; no se modifican productos ni datos históricos.

Especificación: `Taller.txt`. Fecha de revisión: 2026-09-06. El objetivo completo sigue en desarrollo; este documento registra evidencia y pendientes, no redefine el alcance.

## Flujo de autorización y caja implementado

Recepción → diagnóstico e inspección → presupuesto enviado → respuesta del cliente por versión y por línea → reparación y entrega de repuestos al técnico → control de calidad → lista para entrega → enviar a Caja → factura y pago → entrega física.

- El presupuesto enviado no admite cambios de líneas. Tras un rechazo, la siguiente solicitud produce otra versión conservando el snapshot original.
- La respuesta exige versión, nombre de quien respondió y medio (presencial, teléfono, WhatsApp, correo o documento digital); el servidor registra usuario interno y fecha.
- Aprobar parcialmente reserva únicamente las líneas aceptadas. Las rechazadas permanecen identificadas en la OT y no se incluyen en la orden de cobro.
- Una solicitud adicional conserva sus líneas separadas. Solo la aprobación las agrega a la OT; falta de stock revierte toda la operación. Después de aceptar un extra es obligatorio repetir control de calidad.
- Una solicitud adicional pendiente impide cerrar calidad, preparar la entrega y cobrar. Rechazarla mantiene el historial sin agregar cargos.
- Las operaciones de autorización, estados, tareas, calidad, envío a Caja y entrega toman un bloqueo de la OT dentro de una transacción. Las recepciones y cambios administrativos de bahías bloquean la bahía correspondiente.
- Caja recibe una única orden por OT. Una vez enviada, la OT no admite cambios operativos. La entrega física requiere factura con estado comercial `PAID`, saldo cero y calidad aprobada.
- El mecánico solo registra avance de sus tareas. Asignaciones y cambios de alcance corresponden a los roles de gestión.

La política de entrega a crédito/override no está implementada para OT: actualmente se exige pago completo. Los abonos y sus anulaciones ya tienen pruebas aisladas, pero falta el E2E completo de una reparación financiada y su política de entrega.

## Seguimiento visible de Caja en la OT (2026-09-06)

- El detalle de la OT y el panel lateral de recepción muestran **Facturación y cobro**: estado, total de factura, pagado registrado y saldo. Los importes facturados provienen del documento guardado, no del presupuesto editado.
- Estados diferenciados: reparación aún abierta, lista para preparar cobro, pendiente en Caja, en atención por cajero, saldo pendiente, pagada, entregada y revisión de documentos anulados/inconsistentes. Una factura emitida no aparece como pagada por el simple hecho de existir.
- **Enviar a Caja** se ofrece tras calidad y preparación operativa. Su auditoría ahora participa en la misma transacción: fallar el registro revierte la orden de cobro. Esta acción no crea pagos, facturas ni consume secuencias.
- El acceso `/pos?order=<id>` consulta la orden específica, incluso si no está entre las primeras 150 de la cola. Abrir el enlace no toma ni cobra la orden: requiere sesión abierta y confirmación del cajero. Una orden ya facturada remite al comprobante.
- La cola muestra vehículo/placa y permite buscar por esos datos, cliente y OT. Se actualiza cada veinte segundos con la pestaña activa y muestra errores de consulta sin confundirlos con una cola vacía.
- La consulta del taller actualiza el estado de cobro sin sobrescribir el formulario operativo abierto. La entrega puede registrarse desde el detalle de la OT, solo con pago completo, saldo cero, calidad aprobada y permiso de entrega; el servidor revalida todo.
- Conserva el POS directo y el mismo motor fiscal local/electrónico. No introduce anticipos ni cambia el transporte/certificación DGII. Anticipos de OT, entrega a crédito y excepciones siguen pendientes.

## Base de permisos y protección de empleados

Migración `20260906020000_workshop_rbac` aplicada únicamente en `localhost:5432/corestack_taller` (49 migraciones). Agrega roles de taller y excepciones de permisos por membresía; conserva usuarios y datos existentes.

- Catálogo compartido `@qorvex/permissions`, políticas por operación en el controlador de taller y compatibilidad con permisos heredados. Preparar cobro, cobrar en POS, aprobar calidad y entregar son autorizaciones separadas. Denegar cobro impide completar una venta o tomar una orden incluso con rol Cajero.
- Login/JWT incorporan permisos efectivos; las membresías inactivas no habilitan acceso. Administración de empleados vuelve a leer el actor dentro del bloqueo transaccional de empresa.
- Por instrucción del usuario, se conserva el límite de cinco usuarios activos por empresa (incluido administrador), comprobado dentro de la transacción al crear o reactivar; no hay contraseña demo implícita. Dar de alta un correo global existente no puede modificar la identidad de otra empresa. Al cambiar de rol se reinician permisos heredados/excepciones; no se heredan privilegios administrativos.
- No se puede eliminar el último administrador capaz de gestionar usuarios. Operaciones concurrentes sobre administradores se serializan y revalidan el acceso del actor.

La UI de empleados ya ofrece los nueve roles del taller y excepciones por empleado (heredar, permitir y denegar), agrupadas por módulo. Cambiar de rol restablece su base; no modifica accesos de otros empleados. El formulario conserva el documento del empleado al editar.

- La navegación del núcleo del taller consulta los permisos efectivos y elige una página inicial accesible por rol. Una cuenta sin módulos habilitados llega a `/access`, sin un bucle de redirecciones.
- Formularios de taller, calidad, entrega, repuestos, asignaciones, catálogo, clientes y productos respetan sus permisos; los controladores también los comprueban. Registrar un cliente no habilita configurar crédito ni desactivarlo. Gestionar productos sin ajuste no permite sobrescribir stock, ni siquiera enviando una existencia aparentemente igual.
- `/auth/me` refresca acceso en la interfaz cada veinte segundos con la pestaña activa. Cada petición JWT vuelve a consultar membresía, usuario y empresa: revocar cobro bloquea el mismo token en la API. Una empresa suspendida o membresía inactiva pierde acceso. La respuesta de actualización solo incluye identidad pública, rol y permisos.
- La lectura de facturas y la reimpresión tienen políticas separadas. Contabilidad puede consultar sin poder editar. Denegar consulta de caja se respeta también para administradores.
- El endpoint genérico de facturas solo admite borradores: no puede crear una factura pagada, marcarla cobrada ni cambiar un comprobante emitido. Emisión y cobro pasan por POS. Esto no implementa aún el flujo completo de cancelaciones/notas de crédito.

### Permisos de ERP y movimientos monetarios

- Proveedores, compras, facturas de suplidores, recepciones, cuentas por pagar/cobrar, aprobaciones de crédito, devoluciones y auditoría usan permisos por operación. La navegación y sus controles de edición/cobro consultan el mismo catálogo; una denegación explícita prevalece también sobre gerencia y administración.
- Inventario puede preparar compras y capturar/recibir mercancía, pero no aprobar compras ni pagar proveedores por defecto. Contabilidad puede consultar y capturar facturas; cobrar abonos o pagar suplidores requiere habilitación explícita. Se conserva la compatibilidad del rol contable anterior.
- Capturar una factura, confirmar una entrada, modificar precios, pagar y anular pagos son permisos separados. Recibir mercancía no concede cambiar precios: se comprueba el payload y, al confirmar un borrador, se vuelven a validar sus decisiones persistidas bajo bloqueo transaccional.
- Quien solo consulta cuentas por pagar dispone de un endpoint de lectura propio, sin necesidad de habilitar edición de facturas de suplidores. Los formularios de abonos/reembolsos consultan únicamente identificadores y nombres de cajas abiertas, sin conceder acceso a saldos, arqueos o movimientos.
- Cuentas por cobrar comprueba el permiso de cobro y exige caja abierta. El mismo abono reintentado no se duplica; la anulación exige su propio permiso y conserva el registro original. Esta prueba prepara una factura de crédito en DB: no sustituye el E2E completo de aprobación y venta a crédito.
- El cajero puede solicitar devoluciones, no aprobarlas. Una segunda aprobación se rechaza sin otro reintegro ni salida de caja. La visibilidad de solicitudes propias/todas es independiente de aprobar. Retiros, depósitos y ajustes manuales de caja tienen permisos distintos; exceder el límite de crédito requiere otro permiso explícito.
- Las pruebas de compras recorren solicitud → emisión autorizada → captura → recepción → pago a proveedor → anulación del pago. No usan dinero externo. Los pagos a proveedores conservan el ledger heredado separado de Caja; falta implementar/verificar su integración de efectivo, gastos y servicios externos.

RBAC global sigue pendiente: faltan descuentos, cancelación/anulación fiscal, importaciones, configuración y revisión del resto de rutas/datos auxiliares del ERP. Los controles heredados de cancelación/anulación/descuento no se presentan como opciones nuevas verificadas en el editor. Falta QA de navegador y Supabase Auth. No se afirma que todos los módulos o todas las combinaciones de permisos estén ya validados.

## Repuestos y cobro de la reparación

Migración `20260905040000_workshop_parts_consumption` aplicada en la base local `corestack_taller` (46 migraciones en total). Agrega cantidades consumidas/liberadas por línea, consumo previo en la orden de cobro y movimientos vinculados a la línea de OT con clave idempotente.

- Desde el detalle de una OT aprobada/en reparación, el panel **Repuestos de la reparación** permite entregar al mecánico, devolver sin usar y liberar unidades no utilizadas. El mecánico consulta; gestión registra movimientos.
- Cotizar no mueve inventario. Aprobar crea reserva y movimiento de reserva sin cambiar existencia física.
- Entregar al mecánico reduce existencia y reserva dentro de la misma transacción; devolver sin usar restaura ambas y exige otra revisión de calidad.
- Liberar unidades pendientes exige motivo, conserva el presupuesto y reduce el importe operativo. Esas piezas quedan disponibles para otras órdenes y no se cobran. Si vuelven a necesitarse, se solicita un adicional; no se reabre silenciosamente la autorización anterior.
- Antes de preparar la entrega deben estar resueltas todas las unidades aprobadas (entregadas o liberadas). Caja recibe servicios aprobados y cantidades netas de repuestos consumidos; omite las líneas con cero consumo y no admite un cobro vacío.
- El POS central reconoce el consumo previo y enlaza sus movimientos a la factura. Las ventas tradicionales siguen descontando al cobrar. No se duplica la salida de inventario.
- La cancelación operativa exige devolver antes las piezas entregadas. La orden de cobro de una OT no se cancela como una venta de mostrador; sí puede liberarse la toma del cajero. La reversión posterior de documentos sigue pendiente de integración fiscal/comercial completa.
- Los ajustes manuales y la edición de existencia bloquean el producto, respetan reservas y generan ledger con valores actuales. No se permite inventar movimientos de OT mediante el endpoint de ajustes ni desactivar su control de inventario mientras tiene reservas/consumos en reparaciones abiertas.
- Reintentos del mismo movimiento usan una clave estable y no duplican la salida, devolución o liberación. No se modificaron los usuarios ni se ejecutó seed.

Los registros anteriores conservan consumo previo cero. Las órdenes ya enviadas a Caja mantienen el descuento heredado al cobrar; una OT antigua lista pero no enviada puede volver a reparación para registrar entrega/liberación real, sin inventar movimientos históricos.

## POS directo, pagos combinados y cierre de caja

Migración `20260905050000_pos_checkout_idempotency` aplicada únicamente en `localhost:5432/corestack_taller` (47 migraciones). Agrega clave y huella del cobro a la factura, más referencia por pago. No borra registros ni vuelve a ejecutar seed.

- **Cuándo cobrar una reparación:** después del control de calidad y de resolver los repuestos aprobados, marcar la OT lista para entrega y elegir **Enviar a Caja**. Esta acción prepara una única orden de cobro: todavía no registra un pago.
- **Dónde cobrar:** en **POS y Caja**, un empleado habilitado abre su sesión (se admite fondo inicial cero), toma la orden, revisa el comprobante y registra el dinero recibido. **Facturar e imprimir** guarda factura y pagos en la misma transacción. Después, el responsable del taller registra la entrega física; se exige saldo cero.
- El POS también vende productos y servicios rápidos sin una OT. Usa el mismo motor central de facturación, secuencias y cobro. El catálogo/buscador y lector están disponibles para empleados habilitados; una orden de taller cargada permanece de solo lectura.
- **Combinar medios / cheque / otro** permite distribuir el importe entre efectivo, tarjeta, transferencia, cheque u otro medio. La suma aplicada debe coincidir exactamente con el importe requerido. Solo el efectivo admite devuelta; cheque/otro exige referencia. Crédito es saldo pendiente, no un ingreso de dinero.
- Se registra un `Payment` y un movimiento por cada medio. El recibo muestra el desglose; los reportes de sesiones incluyen cheque y otros. El cierre calcula efectivo esperado a partir de movimientos en efectivo, sin incluir tarjeta/transferencia/cheque/otros.
- La clave de cobro se conserva al reintentar una solicitud. La combinación empresa/clave es única: un reintento idéntico devuelve la factura ya creada, incluso después de cerrar caja; reutilizar la clave con otro contenido o usuario se rechaza. No se vuelve a descontar stock, consumir secuencia ni disparar otro envío de copia.
- Apertura, cierre y movimientos manuales bloquean la sesión/recursos pertinentes. Dos aperturas o dos cierres simultáneos no producen sesiones o movimientos duplicados; una venta que compite con el cierre queda incluida en el arqueo o es rechazada.
- El mapper electrónico agrupa los pagos por código fiscal: efectivo 1, cheque/transferencia 2, tarjeta 3, crédito 4 y otro 8. Se contrastó con la tabla de formas de pago del [formato oficial e-CF v1.0 de DGII](https://www.dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20%28e-CF%29%20v1.0.pdf). Esto no constituye validación integral del XML, firma ni aceptación DGII.

Los permisos administrativos/cajero heredados se conservan: el administrador supervisa; cobra un empleado habilitado. Quedan pendientes anticipos de OT y la política de entrega a crédito/excepciones, junto al E2E completo de cuentas por cobrar. No se afirma que estos flujos estén resueltos por probar un plan de pago inicial.

## Tareas vinculadas al trabajo autorizado y control de tiempo

Migración `20260906010000_workshop_authorized_tasks` aplicada solo en `localhost:5432/corestack_taller` (48 migraciones). Agrega tipo de tarea, vínculo compuesto tarea/línea/OT, minutos pausados y evento de cancelación. No ejecuta seed ni elimina datos operativos.

- Las tareas nuevas se clasifican como **Diagnóstico** o **Reparación**. Diagnóstico se prepara en recepción y se ejecuta en diagnóstico; sus tareas pendientes deben resolverse antes de enviar el presupuesto. Registrar una tarea no genera cargos ni mueve stock.
- Cada tarea de reparación exige una línea aprobada de esa misma OT. El servidor comprueba autorización y fase operativa al crear y al iniciar/finalizar; la clave foránea compuesta impide cruzar líneas entre órdenes incluso mediante acceso directo a DB.
- Se admiten varias tareas y técnicos sobre una línea autorizada. Antes de aprobar calidad y preparar/enviar a Caja, cada servicio aprobado debe tener ejecución completada y no puede haber tareas pendientes. Los servicios adicionales aprobados siguen esta misma regla. Dos técnicos no generan dos cargos por el mismo servicio.
- El panel de tareas permite elegir trabajo, mecánico y minutos estimados, iniciar/pausar/reanudar/finalizar y cancelar con motivo. El mecánico opera únicamente sus tareas; la asignación y cancelación corresponden a gestión. El resto del editor queda de consulta para mecánicos.
- Una tarea iniciada conserva técnico, alcance y datos originales. Para reasignarla se cancela con motivo y se crea la tarea de reemplazo; cancelar no declara ejecutada la línea del presupuesto. Una tarea finalizada no se reescribe.
- Trabajo y pausas se calculan desde eventos persistidos y se guardan al cambiar de estado. La pantalla indica expresamente que son acumulados al último cambio, no un contador en vivo. Cancelar una OT detiene también sus tareas abiertas con evento y motivo, sin borrarlas.
- Crear/modificar tareas guarda auditoría dentro de la misma transacción. Los cambios incluyen valores anteriores/nuevos; un fallo de auditoría revierte tarea, eventos y el reinicio de calidad.
- Las tareas anteriores se migran como `LEGACY`, sin inferir una autorización. Las pendientes pueden clasificarse explícitamente; las iniciadas requieren cancelación y una nueva asignación antes de continuar. Los tiempos registrados sin historial de eventos se conservan al cancelar, sin inventar trabajo o pausas. Las completadas permanecen históricas: no sustituyen la evidencia de ejecución vinculada exigida a una OT aún no facturada.

Pendientes de este dominio: horarios/especialidades, capacidad por horas, utilización, eficiencia, capacidad multi-sucursal y QA de navegador. La migración no calcula retrospectivamente vínculos o pausas inexistentes. Una OT antigua lista pero sin facturar que carezca de esas evidencias puede volver a reparación para revisarlas; no se alteran facturas emitidas.

## Migración de autorización por línea

`20260905030000_workshop_line_authorization` agrega estado por línea y evidencia de respuesta. Las aprobaciones históricas completas se conservan como líneas aprobadas. No se infieren líneas aceptadas en aprobaciones parciales antiguas: requieren revisión, porque el modelo anterior no registraba la selección.

Para actualizar un entorno local:

```sh
pnpm --filter @qorvex/database build
pnpm install --offline
pnpm db:migrate:deploy
pnpm --filter @qorvex/api test:workshop
pnpm --filter @qorvex/web lint
```

En Windows, detener previamente el proceso de desarrollo de esta API si mantiene bloqueado el cliente Prisma. Reiniciar la API al terminar. No ejecutar seed para aplicar una migración.

## Pruebas reproducibles

`apps/api/test/workshop.integration.test.cjs` ejecuta los servicios reales y la auditoría contra PostgreSQL. Usa `WORKSHOP_TEST_DATABASE_URL` o `DATABASE_URL`, exige un host local, crea un esquema aleatorio `workshop_test_<uuid>`, aplica todas las migraciones y elimina exclusivamente ese esquema al terminar. No usa ni modifica clientes, productos o documentos del esquema `public`.

Casos cubiertos:

1. Impedir saltos del diagnóstico a aprobación/reparación sin respuesta del cliente.
2. Inmutabilidad del presupuesto enviado, versión obsoleta y líneas de otra OT.
3. Aprobación parcial, evidencia persistida, reserva selectiva y envío a Caja sin líneas rechazadas.
4. Rechazo total sin reservas ni cobro.
5. Aprobaciones simultáneas sin doble reserva.
6. Adicional rechazado conservado sin cargos.
7. Adicional aprobado simultáneamente sin duplicación y con nueva revisión de calidad.
8. Rollback del adicional cuando falta stock.
9. Doble envío a Caja y bloqueo de modificaciones posteriores.
10. Competencia entre dos recepciones por una bahía.
11. Entrega con saldo o factura cancelada bloqueada; entrega pagada registrada una sola vez.
12. Cancelación que libera reservas y conserva adicionales cancelados.
13. Permisos de mecánico y tiempo persistido sin eventos de inicio duplicados.
14. Aislamiento entre empresas al modificar OT o bahías.
15. Consumo concurrente idempotente, devolución, reintegro y cancelación con ledger.
16. Rechazo de consumos ajenos/no autorizados, exceso de reserva y cantidades inválidas.
17. Adicional después del consumo sin reservar nuevamente piezas ya entregadas.
18. Flujo real de servicios OT → repuesto → POS → factura B02/pago → entrega, incluyendo caja cerrada, pago insuficiente y rollback de secuencia.
19. Ajustes manuales y cambio de producto sin utilizar reservas ni crear movimientos de OT falsos.
20. Ajuste y consumo simultáneos sin pérdida de cambios en existencia.
21. Cantidades fraccionarias en las unidades permitidas.
22. Devolución/liberación con motivo, presupuesto original conservado y facturación solo de unidades netas consumidas.
23. Regresión de una orden tradicional sin consumo previo: descuento al cobrar en el POS.
24. Venta directa con efectivo/tarjeta/transferencia, devuelta, desglose persistido, arqueo solo en efectivo y reintento tras el cierre.
25. Cobro directo concurrente con la misma clave: una factura, una salida y una secuencia; rechazo de contenido diferente.
26. Rollback por pagos incompletos, excesivos, negativos, duplicación de efectivo, referencia ausente o mezcla ambigua de campos.
27. POS directo respetando reservas de OT, aislamiento entre empresas y permisos de empleado activo.
28. E32 de POS con desglose de formas de pago en XML y payload de copia dirigido al cliente; transporte de correo sustituido por un stub local.
29. Plan de pago inicial dividido, referencias de cheque/otro y cálculo independiente del saldo. Es una prueba de cálculo, no el E2E de cuentas por cobrar.
30. Dos cierres simultáneos producen un solo cierre y movimiento.
31. Venta concurrente con cierre incluida en el arqueo o rechazada; ningún pago posterior a sesión cerrada.
32. Apertura simultánea para una misma caja/usuario admite una sola sesión, incluyendo fondo inicial cero.
33. Tarea de reparación solo para línea aprobada de la misma OT/empresa, incluyendo constraints de DB y bloqueo de inicio fuera de reparación.
34. Tarea de diagnóstico anterior a autorización, sin cargos ni stock y con bloqueo del envío de presupuesto mientras esté abierta.
35. Calidad exige servicios realmente ejecutados; múltiples técnicos en un servicio producen un solo cargo en la factura B02, con pago real de POS y stock descontado una vez.
36. Cancelación con motivo y tiempo conservado, sin declarar ejecutado un servicio aprobado y sin doble evento en reintento.
37. Tareas históricas sin autorización inferida, clasificación explícita de pendientes e inmutabilidad de técnico/alcance/tiempos manuales tras el inicio.
38. Cancelar una OT cierra sus tareas activas y conserva el historial.
39. Cálculo determinista de tiempo activo/pausado con pausa abierta, finalización y cancelación.
40. Fallo de auditoría revierte creación/modificación de tarea, evento de tiempo y cambio de calidad; historial anterior/nuevo comprobado.
41. Minutos activos y pausados persistidos, recuperados desde PostgreSQL tras finalizar.
42. Mano de obra adicional pendiente no admite tarea; después de aprobación exige ejecución y nueva calidad.

43. Fallo de auditoría al preparar Caja revierte la orden; enviar correctamente no crea pagos/factura ni consume secuencia.
44. Políticas reales de rutas separan asesor, supervisor, mecánico y cajero, incluyendo denegación, usuario bloqueado y empresa ajena.
45. Denegación explícita bloquea cobro, toma de orden y cierre aunque el usuario tenga rol Cajero.
46. Máximo de cinco usuarios activos, roles nuevos y cambio de rol sin privilegios residuales.
47. Contraseña explícita, rechazo de rol de plataforma/permisos desconocidos y protección de identidad de otra empresa.
48. Último administrador protegido y revocación concurrente con revalidación del actor.
49. JWT real contra PostgreSQL: permisos revocados se reflejan con el mismo token, `/auth/me` no expone credenciales, membresía inactiva/empresa suspendida bloquean el acceso.
50. Recepción/asesor admiten alta de clientes sin crédito/borrado, y recepción no puede inyectar presupuestos ni asignaciones en el alta de OT.
51. Gestión de catálogo sin ajuste permite editar el nombre pero rechaza cualquier sobrescritura de stock y alta con existencias.
52. Lectura de factura/reimpresión separadas; contabilidad consulta caja y una denegación explícita también bloquea al administrador.
53. Asignación, avance y cancelación de tareas exigen permisos independientes.
54. Gestión genérica de borradores no emite/cobra ni altera documentos emitidos, pagos o inventario.
55. Compra y recepción real con roles separados, stock y saldo correctos, pago/reversión a proveedor y lectura exclusiva de cuentas por pagar.
56. Permiso de recepción no concede cambio de precios, incluso cuando la decisión persistida cambia después de la lectura preliminar del controlador (prueba de política con transacción sustituida).
57. Abono de cliente idempotente, anulación autorizada, saldo restaurado y selector de cajas sin acceso al ledger ni a otra empresa.
58. Venta POS B02 → solicitud de devolución → aprobación gerencial → un solo reintegro/reembolso; repetir la aprobación se rechaza.
59. Retiros de caja y autorización de exceso de crédito denegados a usuarios de consulta, incluyendo denegación explícita administrativa.
60. Altas simultáneas y reactivaciones no exceden cinco usuarios activos; se puede editar con cupo lleno y desactivar libera cupo.
61. Carga aditiva de demo mediante servicios reales, conservando usuarios, facturas y secuencias; repetirla no duplica ni reinicia datos.

Las 61 pruebas de API pasan; 56 usan PostgreSQL/servicios reales y cinco verifican cálculos o políticas de rutas. Once pruebas de lógica de UI (`pnpm --filter @qorvex/web test:workshop-ui`, Node con soporte de TypeScript nativo) verifican clasificación de pago/entrega, anulaciones, saldos inválidos, enlace específico a Caja y navegación/permisos por rol, incluidos accesos de ERP y denegaciones explícitas. Total: 72 pruebas. El caso 18 recorre facturación local B02 y pago mediante el POS; los rangos y registros existen únicamente en el esquema aislado de pruebas. Otros casos preparan estados de factura explícitamente para probar bloqueos. No se realizan llamadas a Resend/DGII ni se prueba aceptación fiscal externa. Compilaciones de API y web verificadas. Falta QA visual y E2E de navegador.

## Pendientes respecto a Taller.txt

| Requisitos         | Estado y siguiente evidencia necesaria                                                                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–5, 36–37, 40, 53 | Catálogo de permisos, UI de roles/excepciones, actualización de acceso y políticas del núcleo de taller presentes. Faltan RBAC de ERP heredado restante, Supabase Auth, configuración por sucursal y revisión global de aislamiento/configuración.                                |
| 4–6, 57, 61–63     | Tres vistas de taller presentes. Falta comparación visual desktop/mobile con referencias, navegación completa, paginación/filtros de servidor y métricas de capacidad verificadas.                                                                                                |
| 7–10               | Clientes, vehículos, agenda y recepción presentes. Faltan campos automotrices completos, flotillas, historial formal de kilometraje y archivos de recepción en Storage.                                                                                                           |
| 11–12              | Inspección y diagnóstico persistidos. Faltan checklist configurable, evidencia multimedia y diagnóstico estructurado/OBD.                                                                                                                                                         |
| 13–16, 20          | Servicios, presupuestos versionados, respuestas por línea y adicionales implementados parcialmente. Faltan descuentos/impuestos/costos completos en cotización, enlace seguro de aprobación y todos los estados operativos solicitados.                                           |
| 17–19              | Asignaciones, tareas vinculadas a líneas autorizadas, tiempo activo/pausado persistido, cancelación con historial y bahías presentes. Faltan horarios/especialidades, capacidad real por horas, eficiencia, utilización y QA de las pantallas.                                    |
| 21–25              | Ledger de reserva/consumo/devolución/liberación, traspaso OT → SalesOrder → POS y venta directa por el mismo motor verificados. Pendientes compatibilidad automotriz, atribución explícita de la pieza al técnico receptor y revisión global de ajustes/recepciones/devoluciones. |
| 26–29              | Pagos divididos, recibo desglosado, arqueo por efectivo y concurrencia de caja verificados. Faltan anticipos de OT, gastos, servicios externos y E2E de crédito/compras adaptados al taller.                                                                                      |
| 30–31              | Calidad y entrega con pago completo verificadas en los casos descritos. Faltan política de excepción autorizada, aceptación/firma y próxima visita enlazada.                                                                                                                      |
| 32–35              | Garantías/reclamos, mantenimiento, reportes operativos y rentabilidad pendientes. Auditoría existente requiere ampliar valores anteriores/nuevos en operaciones restantes.                                                                                                        |
| 38–52              | Motor fiscal heredado aún requiere auditoría contra documentación oficial: mapper, XSD, firma, transporte real, RFCE, E33/E34, representación impresa y estados. Faltan datos/certificado propios para validación externa. No afirmar aceptación DGII por envío de email.         |
| 54–55              | Concurrencia de autorización, consumo, pagos, apertura/cierre y reintentos de cobro cubierta en los casos anteriores. Falta ampliar pruebas de carga, secuencias multicliente y fallos de transporte externo. Conservación de documentos y reversión deben auditarse globalmente. |
| 56, 58–60          | Búsqueda global automotriz, notificaciones de taller, adapters de comunicación y seed coherente/separado requieren completar/revisar.                                                                                                                                             |
| 64–70              | Pruebas de integración añadidas. Pendientes los ocho E2E completos, pruebas fiscales, QA de navegador y actualización integral de documentación/despliegue.                                                                                                                       |
| 71–73              | Mantener prioridad P0 → P1 → P2 → P3 → P4 y el alcance total hasta demostrar el producto solicitado.                                                                                                                                                                              |

Siguiente bloque prioritario: completar la auditoría de accesos restantes, perfiles/capacidad de mecánicos y E2E integral de crédito; continuar después el flujo fiscal central y los demás pendientes P0/P1. Compras y abonos ya tienen los casos descritos, no una certificación global de ERP. Validar UI con navegador antes de declarar fidelidad a las capturas.
