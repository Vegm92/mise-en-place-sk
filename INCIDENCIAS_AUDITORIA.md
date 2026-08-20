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
