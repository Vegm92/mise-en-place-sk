# Incidencias encontradas al auditar el Paso 1 (2026-08-20)

**Por qué existe este documento:** durante esta sesión se auditó a fondo el código de captura y extracción OCR (Paso 1 de `PROPUESTA_MVP.md`), que ya existía en `main` antes de crear la rama `mvp-modular-limpio`. Se encontraron varias incidencias reales, algunas corregidas en esta rama y otras dejadas como decisiones conscientes sin tocar.

**Importante — alcance de este documento:** las correcciones de este documento están aplicadas **solo en `mvp-modular-limpio`**, no en `main`. Si en algún momento se fusiona esta rama con `main`, o se retoma trabajo directamente en `main`, hay que saber que **estas incidencias siguen sin resolver ahí** hasta que se haga esa fusión. Este documento sirve como lista de comprobación para ese momento: qué correcciones hay que asegurarse de llevar, y qué decisiones ya se tomaron y por qué (para no tener que volver a discutirlas desde cero).

Cada incidencia indica: en qué archivo(s) está, si está corregida o dejada así a propósito, y el commit donde se corrigió (si aplica).

---

## 1. El IVA no se extraía por línea, solo un resumen global del documento

**Dónde:** `src/lib/server/extract.ts` (prompt de la IA), `src/lib/server/schema/core.ts` (columna `tax_rate` en `invoice_line_items`, existía pero siempre vacía).

**Qué pasaba:** la columna de base de datos y el campo del formulario para el IVA por línea ya existían, pero la IA nunca los rellenaba — el prompt solo le pedía un resumen global del documento (`tax_breakdown`, con base/cuota por cada tipo de IVA encontrado), sin asociar ningún tipo de IVA a cada línea concreta. Además, ese campo estaba oculto en el formulario de revisión, así que aunque hubiera tenido datos, no se veían.

**Riesgo:** en documentos con varios tipos de IVA a la vez (ej. 10% en comida + 21% en algo no alimentario), no había forma de comprobar visualmente que el IVA de cada artículo se había leído bien.

**Estado:** ✅ **Corregido.** Commit `6b8884a`.

---

## 2. El precio de línea podía venir con o sin IVA incluido, sin ninguna regla que lo evitara

**Dónde:** `src/lib/server/extract.ts` (prompt de la IA).

**Qué pasaba:** ni el prompt de la IA ni ningún otro sitio del código decían explícitamente si `unit_price`/`total_price` por línea debían ser el precio **con** o **sin** IVA. Si un proveedor imprimía el precio unitario ya con el IVA incluido (frecuente en algunos albaranes/facturas-albarán), la IA podía copiarlo tal cual.

**Cómo se descubrió que era un problema real y no solo teórico:** la pantalla de revisión del albarán (`src/routes/(app)/batch/[id]/+page.svelte`) **ya calculaba internamente** el total esperado como "suma de las líneas + impuestos" para compararlo con el total del documento y avisar si no cuadraba — es decir, ya asumía en silencio que las líneas eran importes sin IVA, sin que nadie se lo hubiera pedido nunca a la IA de forma explícita. Esto significa que, antes de esta corrección, cualquier albarán donde la IA hubiera copiado precios con IVA incluido podía estar generando avisos de "no cuadra" falsos, sin que quedara registrado en ningún sitio por qué.

**Riesgo:** un coste de materia prima erróneo (con IVA incluido) alimentando directamente los escandallos del Paso 3 más adelante.

**Estado:** ✅ **Corregido.** Se le exige a la IA devolver siempre la base imponible por línea, calculándola ella misma si el documento solo imprime el precio con impuestos, bajando la confianza de esa línea cuando tiene que hacer ese cálculo. Commit `f8099d8`.

**Limitación que queda, sin resolver:** si un **impuesto especial** (ej. en bebidas alcohólicas) va mezclado en el precio sin desglosar en el documento, no hay forma de separarlo de la base imponible — no existe un campo específico para impuestos especiales en ningún sitio del sistema. Se decidió aceptarlo como limitación conocida (marcando esa línea con confianza más baja) en vez de construir un campo nuevo para un caso que, con proveedores de alimentación normales, debería ser poco frecuente. Se revisará si aparece en la práctica.

---

## 3. "Pendiente de tarificación" no existe como estado real, es una etiqueta calculada al mostrar la pantalla

**Dónde:** `src/lib/server/schema/core.ts` (tabla `invoice_line_items`, sin columna de estado), pantallas de detalle (`src/routes/(app)/invoice/[id]/+page.svelte`, `src/lib/components/mobile/MobileInvoiceDetail.svelte`).

**Qué pasaba:** el sistema sí permitía (y sigue permitiendo) guardar un albarán con líneas sin precio, sin bloquear nada. Pero no había ninguna forma visual de distinguir "esta línea está pendiente de que llegue el precio" de "la IA no pudo leer el precio por un fallo" o "el artículo cuesta 0€ de verdad" — las tres se veían igual (importe vacío).

**Estado:** ✅ **Resolución retroactiva construida.** Se añadió una etiqueta visible "Pendiente de tarificación" en las pantallas de detalle (commit `fec4692`) y, en esta sesión, el mecanismo de resolución: al guardar una factura, `saveReviewedInvoice()` busca un albarán del mismo proveedor, con fecha cercana (±21 días) y al menos una línea sin precio (`findPendingAlbaranCandidate`). Si lo encuentra, bloquea el guardado con un modal de confirmación ("¿Es la factura de esa entrega?", análogo a `new_supplier_ack`/`low_confidence_ack`) — si se confirma, los precios de la factura se copian sobre las líneas del albarán ya guardado (`mergeLinesIntoAlbaran`, matching por descripción normalizada; una línea de la factura sin correspondencia se añade como línea nueva) y **no se crea un segundo documento** — el albarán pasa a `document_type = 'factura'` con el número fiscal. Si el usuario indica que no es la misma entrega, se guarda como documento aparte, normal. Esto resuelve a la vez esta incidencia y la 8 (duplicado albarán/factura): ya no hace falta el aviso de "posible duplicado" para este caso porque nunca llega a duplicarse.

**Seguía sin ser un estado real en BD** (se sigue calculando "pendiente" como "precio nulo"), pero ahora sí existe la resolución automática que faltaba. Tests: `tests/invoice-save-merge-pending-albaran.test.ts`.

---

## 4. La confianza baja del OCR solo bloqueaba el guardado a nivel de cabecera, nunca por línea

**Dónde:** `src/lib/server/invoice-save.ts`, función `saveReviewedInvoice` (variable `HEADER_FIELDS`).

**Qué pasaba:** el bloqueo de guardado por confianza inferior al 85% solo comprobaba 5 campos de cabecera (proveedor, número, fechas, importe total). Una línea individual (cantidad, precio) con muy poca confianza se resaltaba en naranja en la pantalla de revisión, pero **no impedía guardar** — se podía confirmar sin corregirla si no se prestaba atención. Además, esa confianza de línea no se guarda en ningún sitio: una vez guardado el albarán, se pierde para siempre.

**Estado:** ⚠️ **No corregido — decisión consciente de dejarlo así.** Se preguntó explícitamente si extender el bloqueo también a nivel de línea, y se decidió que no, que el resaltado visual ya es aviso suficiente y no conviene añadir más fricción al guardado en esta fase. Documentado aquí para que quede constancia de que se evaluó y se descartó a propósito, no por omisión.

---

## 5. No hay ninguna validación de calidad de imagen antes de llamar a la IA

**Dónde:** no existe en ningún sitio del proyecto (se comprobó que no hay ninguna librería de procesado de imágenes entre las dependencias).

**Qué pasaba:** ninguna foto se filtra por nitidez, resolución o iluminación antes de mandarla a la IA (Gemini). Solo se valida tamaño de archivo (máx. 20MB) y tipo (jpg/png/pdf). La única protección es posterior: si la IA devuelve poca confianza, se bloquea el guardado (ver incidencia 4).

**Estado:** ⚠️ **No corregido — decisión consciente de dejarlo así.** Se decidió que la detección posterior por confianza es suficiente para este MVP; no hace falta rechazo automático en el momento de la foto.

---

## 6. La vinculación de un artículo dudoso se hacía sola, y solo avisaba después

**Dónde:** `src/lib/server/products.ts` (función `resolveOne`), `src/lib/server/invoice-save.ts`, `src/routes/(app)/api/product-aliases/+server.ts`, `src/routes/(app)/reminders/+page.svelte`.

**Qué pasaba:** cuando el nombre de un artículo del albarán se parecía (por similitud de texto), pero no coincidía exactamente, con un ingrediente ya existente, el sistema **lo vinculaba automáticamente de inmediato** y solo después mandaba una notificación de "sugerencia" que se podía revisar y deshacer. Es decir: vinculaba primero, preguntaba después — al revés de lo que pedía la especificación original ("si es dudosa, se pregunta").

Curiosamente, el segundo nivel de comprobación (una IA que revisa en segundo plano los artículos que no encontraron ningún parecido por texto) **sí** seguía el patrón correcto: solo sugiere, nunca fusiona sola.

**Estado:** ✅ **Corregido.** Ahora una coincidencia dudosa nunca se vincula sola: la línea se guarda como su propio artículo nuevo, y solo se fusiona con el candidato si el usuario confirma la sugerencia — igual que ya hacía el nivel de IA. Se retiró `rejectProductAlias` y la acción `"reject"` de la API (`/api/product-aliases`) porque dejaron de tener sentido: ya no existe el estado de "vinculado por error, sin confirmar" que esa función corregía. Commit `36df2a8`.

**Tests actualizados como parte de esta corrección:** `tests/product-catalog.test.ts`, `tests/backfill.test.ts` (asumían el vínculo automático antiguo).

---

## 7. El tachón manual — correcciones a bolígrafo no tenían prioridad sobre el número impreso

**Dónde:** `src/lib/server/extract.ts` (prompt de la IA).

**Qué pasaba:** en la recepción del albarán es habitual que el repartidor tache a mano una cantidad impresa (llega menos género del pedido, se retira una pieza defectuosa) y escriba la corrección al lado. La IA puede ver ambos números en la foto, pero no había ninguna instrucción sobre cuál de los dos debía usar.

**Riesgo:** que la IA lea el número impreso original en vez de la corrección manuscrita, descuadrando cantidades y, más adelante, costes.

**Estado:** ✅ **Corregido.** Se le exige a la IA que la corrección manuscrita gane siempre sobre el número impreso tachado, bajando la confianza de ese campo en vez de caer al valor impreso por ser más fácil de leer. Commit `20bc135`.

---

## 8. Choque albarán/factura — el aviso de posible duplicado tiene un punto ciego justo en el caso más común

**Dónde:** `src/lib/server/alerts.ts`, función `runPossibleDuplicatePurchase`.

**Qué pasaba:** sí existe un mecanismo pensado para esto — cuando se guarda una factura, busca albaranes del mismo proveedor con fecha cercana (±21 días) e importe parecido (±10%), y viceversa, avisando si parecen la misma entrega. Pero la búsqueda **exige que ambos documentos tengan un importe** (`totalAmount IS NOT NULL`). Si el albarán se guardó sin precio (el caso típico de "Pendiente de tarificación", ver incidencia 3), queda excluido para siempre de la comparación — cuando llega la factura después con el precio real, el sistema no lo detecta como el mismo documento.

Incluso cuando sí detecta la coincidencia, es solo una notificación de texto posterior (ambos documentos ya están guardados y ya cuentan en el histórico de precios y el gasto) — no bloquea nada, no fusiona nada, y no lleva un enlace directo al documento con el que coincide.

**Riesgo:** el gasto y el histórico de precios de ese proveedor pueden quedar duplicados, sin ningún aviso, en el caso más habitual (fresco que llega sin precio y se tarifica con la factura).

**Estado:** ✅ **Corregido**, junto con la incidencia 3 (mismo mecanismo, ver más abajo).

---

## 9. Proveedor nuevo se crea siempre solo, sin preguntar

**Dónde:** `src/lib/server/supplier.ts:13-39` (`getOrCreateSupplierId()`), llamada desde `src/lib/server/invoice-save.ts:413` (guardado normal) y `src/routes/(app)/invoice/[id]/edit/+page.server.ts:118` (edición).

**Qué pasaba:** cuando el nombre de proveedor leído por la IA no coincide con ninguno existente, se hace un `INSERT ... ON CONFLICT DO UPDATE` directo, sin ninguna pantalla de confirmación. Es el mismo patrón que ya se corrigió para artículos (incidencia 6), pero aquí sigue sin corregir. El texto `'confirm.stage.supplier'` en `src/lib/i18n.ts:499` es solo la etiqueta de una barra de progreso durante el OCR, no un diálogo real.

**Riesgo:** proveedores duplicados o mal escritos entrando en la base de datos sin que nadie se dé cuenta.

**Estado:** ✅ **Corregido.** Antes de guardar el albarán/factura, si el proveedor escrito no coincide (ni por CIF ni por nombre, ver incidencia 10) con ninguno ya existente, el guardado se bloquea con un modal de confirmación ("Proveedor nuevo: ¿confirmas que quieres crear este proveedor?") — mismo patrón ya usado para la baja confianza (`new_supplier_ack`, análogo a `low_confidence_ack`). Alcance: solo cubre el guardado inicial desde el Paso 1 (`saveReviewedInvoice` / pantalla de revisión del batch); la edición posterior de una factura ya guardada (`invoice/[id]/edit`) sigue creando el proveedor sin preguntar, decisión consciente de no ampliar el alcance por ahora. Commit pendiente de esta sesión.

---

## 10. Proveedores se identifican solo por nombre, nunca por CIF

**Dónde:** `src/lib/server/schema/core.ts:35` (columna `cif` existe pero no se usa para buscar), `:41` (restricción única `uq_suppliers_rid_name` solo sobre `lower(name)`), `src/lib/server/normalize.ts:39-45` (`isSameSupplierName()`, comparación puramente textual), `src/lib/server/invoice-save.ts:351-358` (el CIF leído por la IA solo rellena el dato de contacto si ya hubo match por nombre).

**Qué pasaba:** el CIF se guarda pero nunca se usa para decidir si un proveedor ya existe. Si el mismo proveedor factura una vez como "Distribuciones Pérez S.L." y otra como "Dist. Perez SL", el sistema crea dos proveedores distintos aunque tengan el mismo CIF real.

**Riesgo:** el histórico de precios de un proveedor se parte en dos en silencio si cambia ligeramente cómo se escribe su nombre (o su razón social).

**Estado:** ✅ **Corregido.** `getOrCreateSupplierId()` ahora busca primero por CIF (si la IA lo leyó) antes que por nombre; si encuentra un proveedor con ese CIF, reutiliza ese registro (rellenando datos de contacto que falten) en vez de crear uno nuevo, aunque el nombre no coincida exactamente. Se añadió también `findSupplierMatch()` (misma prioridad CIF → nombre) para la comprobación de "proveedor nuevo" de la incidencia 9. Commit pendiente de esta sesión.

---

## 11. Notas de abono / devoluciones no existen en el sistema

**Dónde:** `src/lib/server/extract.ts:38` y `:141` (`document_type` solo admite `'factura' | 'albaran' | null`), tabla `invoices` en `src/lib/server/schema/core.ts:44-81` (sin campo `isCredit`/`isReturn`), `src/lib/server/trend.ts:101` (`SUM(COALESCE(total_amount, 0))`, siempre en positivo).

**Qué pasaba:** no hay ningún concepto de nota de abono. Si llegara una devolución, se guardaría como una compra normal más, sumando al histórico de gasto en vez de restar.

**Riesgo:** el gasto y el histórico de precios quedarían inflados en cuanto aparezca una devolución real.

**Estado:** 📌 **Aparcado para más adelante.** Es funcionalidad nueva (no un ajuste), se revisará cuando aparezcan devoluciones reales con los primeros albaranes de prueba.

---

## 12. Portes y envases (cascos) no se distinguen de artículos reales

**Dónde:** tabla `invoice_line_items` en `src/lib/server/schema/core.ts:83-105` (sin ningún campo de tipo/categoría de línea). Búsqueda de "porte", "envase", "casco", "depósito", "transporte" en todo `src/`: cero resultados. El propio prompt de la IA reconoce la misma limitación para impuestos especiales en `src/lib/server/extract.ts:87-90` (ver también incidencia 2).

**Qué pasaba:** cada línea de un albarán se trata igual. No hay forma de marcar "esto es transporte" o "esto es una fianza de envase" en vez de "esto es materia prima".

**Riesgo:** el catálogo de materia prima se contamina con conceptos que no son comida, inflando el coste real de los ingredientes en los escandallos del Paso 3.

**Estado:** 📌 **Aparcado para más adelante.** Es funcionalidad nueva, se revisará el impacto real con albaranes de proveedores concretos.

---

## 13. Descuentos globales (rappels, pronto pago) no se prorratean por línea

**Dónde:** ni `invoices` ni `invoice_line_items` (`src/lib/server/schema/core.ts:44-105`) tienen columna de descuento/rappel. Búsqueda de "discount"/"descuento"/"rappel"/"pronto pago" en `src/`: el único resultado real (`src/lib/server/billing.ts:314`) es el cupón de Stripe de la propia suscripción del SaaS, no un descuento de proveedor.

**Qué pasaba:** no existe ningún campo para un descuento del total del documento. Si un proveedor aplica un rappel y el total del documento no cuadra con la suma de líneas, hoy eso se interpretaría como un error de lectura del OCR, no como un descuento legítimo.

**Riesgo:** el precio unitario guardado de cada ingrediente queda inflado (no refleja el descuento real aplicado).

**Estado:** 📌 **Aparcado para más adelante.** Es funcionalidad nueva, se revisará con casos reales de descuentos de proveedores.

---

## 14. Trazabilidad de correcciones asimétrica: la revisión post-OCR no guarda quién corrigió

**Dónde:** tabla `extraction_corrections` en `src/lib/server/schema/extensions.ts:88-98` (campos `fieldName`, `originalValue`, `correctedValue`, `lineItemIndex`, `correctedAt` — **sin columna `userId`**), rellenada desde `src/lib/server/invoice-save.ts:61-122` (`logExtractionCorrections`). Comparar con la tabla `invoice_audit_log` en `src/lib/server/schema/extensions.ts:7-19` (campos `action`, `userId`, `reason`, `snapshot`, `createdAt` — sí tiene `userId`), rellenada desde `src/routes/(app)/invoice/[id]/edit/+page.server.ts:180-186`.

**Qué pasaba:** hay dos mecanismos de trazabilidad distintos y asimétricos. La revisión justo tras el OCR sabe *qué* campo cambió y *a qué valor*, pero no *quién* lo cambió. La edición posterior sabe *quién* y *cuándo*, pero solo guarda una foto general del "antes" (snapshot), no el detalle campo a campo.

**Riesgo:** si en el futuro trabaja más de una persona con la app, no se podría saber quién corrigió un dato mal leído por la IA en el momento de la revisión inicial.

**Estado:** ✅ **Corregido.** Se añadió la columna `user_id` a `extraction_corrections` (migración `drizzle/0040_add_user_id_to_extraction_corrections.sql`), y `saveReviewedInvoice()` recibe ahora el usuario autenticado (`locals.user.id` desde la ruta del batch) y lo guarda en cada fila de corrección. Commit pendiente de esta sesión.

---

## 15. Avisos de diseño pendientes de revisar (detectados durante la limpieza factura/albarán)

**Dónde:** `src/routes/(app)/+layout.svelte:177`, `src/lib/components/desktop/DesktopSupplierDetail.svelte:211` y `:587`.

**Qué pasaba:** al corregir el vocabulario factura/albarán y ocultar el seguimiento automático de pagos (ver `PROPUESTA_MVP.md` y el trabajo de esta sesión), el revisor automático de diseño (`impeccable`) señaló 3 detalles preexistentes, ninguno introducido en esta sesión:
1. La animación del menú lateral al colapsarlo/expandirlo podría ir más suave técnicamente (`+layout.svelte:177`).
2. ✅ **Corregido.** La tarjeta de aviso "¿eliminar este proveedor?" tenía una rayita roja pegada al borde izquierdo — se cambió por el mismo tratamiento de aviso (fondo tintado + texto en color) que ya usa el resto de la app (`DesktopSupplierDetail.svelte`, clases `bg-neg-soft`/`border-neg`/`text-neg`).
3. ✅ **Descartado — falso positivo.** La animación al pasar el ratón sobre el gráfico circular de productos anima `stroke-width` de un SVG, no una propiedad de layout CSS (ancho/alto/margen) — no causa el problema de rendimiento que busca esa regla. Ignorado explícitamente en la config del detector.

**Riesgo:** ninguno funcional — son detalles visuales/de pulido, no errores que afecten a los datos.

**Estado:** ⚠️ **Queda 1 de 3 pendiente y sin decidir — punto 1 (animación del menú lateral).** Arreglarlo bien significa cambiar cómo se colapsa el panel lateral (de animar `width` a animar `transform`), lo que toca el esqueleto de toda la app — se preguntó explícitamente si abordarlo ahora o dejarlo para otra sesión, **sin respuesta todavía**. Retomar preguntando directamente antes de tocarlo.

---

## 16. Las tarjetas numéricas de arriba (Albaranes, Proveedores) no seguían ningún criterio claro

**Dónde:** `src/routes/(app)/invoices/+page.svelte` (+ `.server.ts`), `src/lib/components/desktop/DesktopSuppliersList.svelte` (+ `suppliers/+page.server.ts`).

**Qué pasaba:** las tarjetas de arriba de cada pantalla mezclaban totales sin criterio de periodo, y con etiquetas que no decían a qué periodo correspondían — en algunos casos, al revés de lo que parecía:
- En **Albaranes**, la tarjeta "Albaranes" era el total histórico (no de este mes, como podría parecer).
- En **Proveedores**, la tarjeta decía "Gasto total" pero en realidad solo sumaba **el mes en curso** — justo el problema contrario.
- Un número suelto sin comparación (¿es mucho? ¿es normal?) no ayuda a decidir nada — sea cual sea el periodo.

**Decisión tomada:** rediseñar estas pantallas (y Productos, más adelante) bajo un criterio único:
1. **Selector de periodo arriba de todo**, igual para todas: Histórico / Último año / Último mes / Último día.
2. **Segunda línea**: estadísticas comparativas (p. ej. gasto vs. periodo anterior) y avisos relevantes del periodo (nuevos albaranes, proveedores nuevos por verificar, líneas a revisar/rectificar) — no números sueltos.
3. **Tabla dinámica filtrable** debajo, donde al hacer clic en una fila se abre el detalle correspondiente (un albarán abre su foto + tabla editable; un proveedor abre su ficha).

**Estado:** ✅ **Aplicado en Albaranes, Proveedores y Productos.** Se creó `src/lib/server/period.ts` (helper compartido: calcula el periodo actual y el periodo anterior equivalente, para no reinventar el cálculo en cada pantalla). Detalle por pantalla:
- **Albaranes:** selector Día/Mes/Año/Total + 4 tarjetas (`KpiCard`): Albaranes (con variación), Importe total (con variación), Por revisar (confianza baja o líneas sin precio — mismo criterio que ya usa Avisos, enlaza allí), Con comentarios.
- **Proveedores:** mismo selector, mismas 4 tarjetas ahora con `KpiCard` en vez de HTML suelto (antes no soportaban variación): Proveedores activos, Gasto (con variación), Albaranes (con variación), Sin asignar.
- **Productos:** sin selector de periodo (un catálogo no tiene periodo real, forzarlo habría sido decorativo) pero sí la misma fila de `KpiCard`: Catálogo, Sin conversión, Sugerencias pendientes.
- Reliability score de proveedor: ver incidencia 17. Etiqueta "Favorito": ver incidencia 18.

**Nota — por qué Analíticas no usa el mismo selector:** Analíticas (Compras →
Analíticas) ya tenía su propio selector de periodo (30 d / 90 d / 6 m / Todo)
antes de esta pasada. Se decidió **no** forzarlo al mismo Día/Mes/Año/Total de
las pantallas de lista: Analíticas dibuja gráficas de tendencia y necesita
esa granularidad más fina (un filtro de "día" no sirve para ver una curva de
6 meses). El criterio que sí se mantiene igual en todas partes es el
**mecanismo** (pastillas, `?period=` en la URL, sin JS) — solo las opciones
concretas cambian cuando el contenido lo pide de verdad. Etiquetas elegidas
para las pantallas de lista: **Día / Mes / Año / Total** (no "Histórico" —
más claro).

---

## 17. Puntuación de fiabilidad del proveedor incluía "puntualidad de pago" — dependía de vencimientos que ya no se piden

**Dónde:** `src/lib/server/supplier-reliability.ts`, `DesktopSupplierDetail.svelte`, `suppliers/[id]/+page.svelte`.

**Qué pasaba:** la puntuación (sobre 100) se calculaba como Precio (33) + Regularidad (33) + Puntualidad de pago (34). Al dejar de pedir fecha de vencimiento en el formulario de edición (incidencia 16), ese tercio del cálculo se iba a quedar cada vez más vacío o desactualizado, aunque la puntuación total lo siguiera sumando como válido.

**Decisión tomada (a petición explícita):** se quitó la puntualidad de pago del cálculo. La puntuación pasa a ser Precio (50) + Regularidad (50), reescalados proporcionalmente. La columna `timeliness_score` se mantiene en la base de datos por compatibilidad, pero siempre a 0 y fuera de la suma.

**Estado:** ✅ **Corregido.**

---

## 18. Etiqueta "Favorito" para proveedores recurrentes (a petición explícita)

**Dónde:** `suppliers/+page.server.ts`, `DesktopSuppliersList.svelte`, `MobileSuppliersList.svelte`.

**Qué pasaba/pedido:** en vez de (o además de) la puntualidad de pago quitada en la incidencia 17, se pidió poder identificar qué proveedores "traen más" — los recurrentes/favoritos.

**Decisión tomada:** se marca como "Favorito" (etiqueta junto al nombre en la lista de Proveedores) al ~20% de proveedores con más gasto acumulado histórico, exigiendo al menos 2 albaranes para evitar que una compra puntual grande cuente como favorito.

**Estado:** ✅ **Corregido.**

---

## 19. Umbral de alerta de presupuesto en Ajustes, huérfano (Presupuestos no está en el menú)

**Dónde:** `settings/+page.svelte`, `settings/+page.server.ts`.

**Qué pasaba:** Ajustes → Alertas tenía un control para el umbral de aviso de presupuesto por categoría, pero Presupuestos no está en el menú de esta fase del MVP (pospuesto) — no había ningún sitio donde configurar un presupuesto real, así que el control ajustaba algo invisible.

**Estado:** ✅ **Corregido — quitado.** Solo queda el umbral de alerta de precio, que sí tiene dónde aplicarse.

---

## 20. Tour guiado recorría pantallas que ya no existen en el menú

**Dónde:** `src/lib/tour-gating.ts`, `src/lib/stores/tutorial.ts`, `src/routes/(app)/+layout.svelte`.

**Qué pasaba:** el tour (`TOUR_PAGES`) señalaba 5 paradas (Avisos, Albaranes, Proveedores, Analíticas, Ajustes) heredadas del menú antiguo. El texto de otros pasos (`tour.step7`-`step10` en `i18n.ts`) hablaba de Presupuestos, Recordatorios de pago, Resumen periódico y Chat — contenido nunca mostrado porque esas rutas ya no están en `TOUR_PAGES`, pero seguía ahí como texto muerto.

**Estado:** ✅ **Corregido.** El tour ahora recorre las 8 paradas reales en el orden del menú actual: Avisos → Albaranes → Analíticas → Productos → Proveedores → Escandallos → Facturación → Ajustes. Se añadieron anclas (`data-coach`) a Productos, Escandallos y Facturación, que no las tenían. Probado paso a paso en el navegador.

---

## 21. El logo de "Mise en Place" estaba invertido respecto al favicon real

**Dónde:** 9 archivos (`+layout.svelte`, login/signup/onboarding/waitlist/pending, `AuthShell.svelte`, panel admin, plantilla de email) — todos con la misma marca SVG de 3 barras.

**Qué pasaba:** las 3 barras del logo colgaban del mismo borde superior (alturas 17/13/9 desde `y=3.5`), sin compartir línea de base — al revés que `static/favicon.svg`, donde las 3 barras sí comparten la misma línea de base inferior (crecen hacia arriba, como una barra de progreso). El logo dentro de la app no coincidía con el favicon real.

**Estado:** ✅ **Corregido.** Las 3 barras ahora comparten línea de base (`y=3.5/7.5/11.5`, mismas alturas), igual que el favicon, en los 9 sitios.

---

## 22. Lista de categorías con solapes reales — DECIDIDO: modelo de dos niveles (tipo + etiquetas)

**Dónde:** `src/lib/constants.ts` (`VALID_CATEGORIES`, `CATEGORY_COLORS`), compartida entre `suppliers.category` y `products.category`.

**Qué pasaba:** la lista tiene 13 categorías + "Other", y un proveedor/producto solo puede llevar UNA. Tres de ellas se pisaban entre sí sin criterio claro: **"Bebidas"**, **"Vinos y Cavas"** y **"Café y Bebidas Calientes"**. Detectado primero al revisar Productos, y confirmado con datos reales el 2026-08-22: al probar con el proveedor real Viñals Gourmet (carnes, pero con una línea de queso Edam), quedó claro que forzar una única categoría por proveedor es un error de fondo, no solo un problema de lista mal afinada — un proveedor de verdad casi nunca vende una sola cosa.

**Decisión tomada el 2026-08-22 (con la usuaria, a raíz de la prueba con datos reales):** separar "categoría" en dos niveles, uno obligatorio y excluyente, otro opcional e informativo.

1. **Tipo** (obligatorio, es el filtro real de las pantallas — **ajustado el 2026-08-22**: de "elige una entre 4" a "marca una o varias entre 3"): `Bebidas` · `Comida` · `Artículos`. Un proveedor que trae bebida y comida a la vez simplemente lleva las dos marcas — se descartó la 4ª opción "Ambas" por ser un cajón de sastre que además solo cubría el caso bebida+comida (¿y bebida+artículos?). Con marcado múltiple no hace falta un valor especial para "las dos a la vez", y filtrar es más simple, no más complicado: "quién trae Bebidas" busca directamente quién tiene esa marca, sin tener que acordarse también de incluir a los "Ambas". Responde a la pregunta que de verdad importa para organizar Compras: "¿a quién le compro qué clase de cosa?".
2. **Etiquetas** (opcionales, se pueden poner varias a la vez, NUNCA sustituyen al tipo): `Carnes`, `Pescado`, `Lácteos`, `Frutas y Verduras`, `Panadería`, `Aceites y Conservas`, `Especias`, `Congelados`, `Embutidos`, `Limpieza`, `Vinos y Cavas`, `Café`, `Refrescos`. Sirven solo para buscar/encontrar ("¿quién me trae queso?"), nunca para filtrar de entrada — por eso ya no importa que se solapen entre sí ni que un proveedor lleve varias a la vez (Viñals Gourmet: tipo `Comida`, etiquetas `Carnes` + `Lácteos`).

**Alcance de esta decisión:** solo **proveedores** (`suppliers`) por ahora — es donde se detectó el problema real (filtrar/buscar proveedores). **Productos (`products`) se quedan con su categoría única de siempre, sin tocar**, para no ampliar el alcance de golpe; se revisará si hace falta el mismo modelo ahí más adelante.

**Mapeo de migración (categoría única de hoy → tipo + etiqueta sugerida de mañana), para cuando se construya:**

| Categoría actual | Tipo nuevo | Etiqueta sugerida |
|---|---|---|
| Frutas y Verduras | Comida | Frutas y Verduras |
| Carnes y Derivados | Comida | Carnes |
| Pescados y Mariscos | Comida | Pescado |
| Lácteos | Comida | Lácteos |
| Aceites y Conservas | Comida | Aceites y Conservas |
| Bebidas | Bebidas | Refrescos |
| Panadería y Bollería | Comida | Panadería |
| Especias y Condimentos | Comida | Especias |
| Productos de Limpieza | Artículos | Limpieza |
| Congelados | Comida | Congelados |
| Embutidos y Charcutería | Comida | Embutidos |
| Vinos y Cavas | Bebidas | Vinos y Cavas |
| Café y Bebidas Calientes | Bebidas | Café |
| Other | *(sin tipo — revisar a mano)* | *(sin etiqueta — revisar a mano)* |

**Lo que falta construir cuando se aborde (no hecho todavía, solo decidido):**
- Columna `type` en `suppliers` que guarde **una o varias** de las 3 marcas (lista, no un valor único) + una forma de guardar varias etiquetas por proveedor (columna de lista, o tabla aparte `supplier_tags`) — mismo patrón de datos para ambas cosas, solo que `type` tiene una lista corta y cerrada (3 opciones) y las etiquetas una lista abierta.
- Migración de datos: aplicar la tabla de arriba a los proveedores ya existentes.
- Las pantallas de Compras (Proveedores, y el selector "Categoría: Todas" que hoy comparten Proveedores/Productos/Analíticas) pasan a filtrar por `Tipo`; las etiquetas se muestran como información/búsqueda, no como filtro principal.
- Actualizar el buscador de Proveedores para que también encuentre por etiqueta (no solo por nombre).

**Estado:** ✅ **Decidido — pendiente de construir.** No es urgente ni bloquea nada de hoy; se aborda como su propio bloque de trabajo cuando toque, sin volver a discutir el diseño.

---

## 23. `invoice-save.ts` y `alerts.ts` tienen una reorganización de código en `main` sin traer — revisar antes de fusionar con `main`

**Dónde:** `src/lib/server/invoice-save.ts` y `src/lib/server/alerts.ts`.

**Qué pasó:** el 2026-08-22 se trajeron a esta rama los commits de `main` de pagos/facturación (portal Stripe, cancelación, reconciliación) y de WhatsApp (control de plan de pago para poder seguir mandando fotos), más el botón de "Avisos" clicable — todo lo demás de `main` se dejó fuera a propósito (limpieza de código, menú lateral, modo oscuro, catálogo Gemini). Ver `SEGUIR_SESION.md` sección 8 para el detalle completo de qué se trajo y qué no.

En `main`, esos mismos dos ficheros pasaron además por una reorganización interna ("SonarCloud": reducir complejidad, extraer funciones) que se dejó fuera aquí a propósito porque no cambia nada de cara al usuario. El problema es que **algunos arreglos posteriores de `main` daban por hecho que esa reorganización ya estaba aplicada**:
- Un arreglo de un fallo real en el cálculo de alertas de cambio de precio (`determinePriceComparison` usaba `0` en vez del precio real de la línea) no se pudo traer tal cual porque esa función solo existe en la versión reorganizada de `alerts.ts`. **Se comprobó a mano: esta rama nunca tuvo ese fallo** (su versión, escrita de otra forma, ya usa el precio correcto) — no hizo falta arreglar nada, pero queda anotado por si al fusionar con `main` alguien ve el commit del arreglo y se pregunta por qué no está aquí.
- Dos arreglos del control de plan de pago por WhatsApp (`b70f9e1`, `cf0e010` en `main`) tampoco se trajeron por el mismo motivo: corrigen un problema que la propia reorganización de `main` había creado, y que aquí nunca existió.

**Riesgo real, para cuando se junte esta rama con `main`:** ambas ramas modificaron `invoice-save.ts` por separado desde el mismo punto de partida (una con reglas de negocio nuevas del MVP, la otra solo reordenando el código) — habrá que revisar ese fichero con calma en ese momento, comparando que ninguna lógica se pierda por el camino.

**Estado:** 📌 No es un fallo activo hoy — es una nota para el día que esta rama y `main` se junten de verdad.

---

## 24. El IVA se guarda con dos unidades distintas según si es de cabecera o de línea

**Dónde:** `src/lib/server/extract.ts` (prompt de la IA que define ambos campos).

**Qué pasa:** el desglose de IVA a nivel de todo el documento (`tax_breakdown[].rate`) se guarda como fracción (0.10, 0.21...), pero el IVA de cada línea (`tax_rate`) se guarda como número entero de porcentaje (10, 21...) — mismo concepto, dos unidades distintas según en qué campo esté. La pantalla de detalle de albarán (`fmtTaxRate`) simplemente le añade el símbolo "%" al número guardado, así que si algún día alguien alimenta ese campo con la unidad equivocada (una fracción en vez de un entero), se ve mal en pantalla sin que salte ningún aviso — un "10%" real se vería como "0.1%".

**Cómo se encontró:** al simular a mano dos albaranes reales para probar la pantalla con datos (ver `SEGUIR_SESION.md` sección 9), me equivoqué yo mismo usando la fracción en el campo de línea — el fallo era del dato de prueba, no de la app, pero puso de manifiesto que la app no protege contra ese error si algún día ocurre de verdad (por ejemplo, si se cambia el prompt de la IA sin darse cuenta de la diferencia entre los dos campos).

**Riesgo:** bajo mientras nadie toque el prompt de extracción de IA. Si en el futuro se retoca `extract.ts`, conviene unificar ambos campos a la misma unidad, o al menos dejarlo documentado con un comentario en el propio código.

**Estado:** 📌 Detectado, no corregido — es una inconsistencia menor y preexistente, no introducida hoy. Sin decisión de la usuaria sobre si unificarlo.

---

## Resumen para quien retome esto en `main`

| # | Incidencia | Estado en `mvp-modular-limpio` | Estado en `main` |
|---|---|---|---|
| 1 | IVA no se extraía por línea | ✅ Corregido | ❌ Sigue sin corregir |
| 2 | Precio de línea podía incluir IVA sin querer | ✅ Corregido (con límite en impuestos especiales) | ❌ Sigue sin corregir |
| 3 | "Pendiente de tarificación" no es un estado real en BD | ✅ Etiqueta + resolución retroactiva (fusión con factura) construidas | ❌ Ni etiqueta ni resolución |
| 4 | Confianza baja no bloquea por línea | Decisión consciente: dejar así | (igual, sin decisión documentada) |
| 5 | Sin validación de calidad de imagen | Decisión consciente: dejar así | (igual, sin decisión documentada) |
| 6 | Vinculación dudosa se hacía sola | ✅ Corregido | ❌ Sigue sin corregir |
| 7 | Tachón manual no tenía prioridad sobre lo impreso | ✅ Corregido | ❌ Sigue sin corregir |
| 8 | Duplicado albarán/factura no se detecta si el albarán no tiene precio | ✅ Corregido (fusión en vez de duplicado, ver incidencia 3) | ❌ Sigue sin corregir |
| 9 | Proveedor nuevo se crea siempre solo, sin preguntar | ✅ Corregido | ❌ Sigue sin corregir |
| 10 | Proveedores solo por nombre, nunca por CIF | ✅ Corregido | ❌ Sigue sin corregir |
| 11 | Notas de abono / devoluciones no existen | 📌 Aparcado para más adelante | ❌ Sin documentar |
| 12 | Portes y envases (cascos) no se distinguen de artículos | 📌 Aparcado para más adelante | ❌ Sin documentar |
| 13 | Descuentos globales no se prorratean por línea | 📌 Aparcado para más adelante | ❌ Sin documentar |
| 14 | Revisión post-OCR no guarda quién corrigió cada campo | ✅ Corregido | ❌ Sigue sin corregir |
