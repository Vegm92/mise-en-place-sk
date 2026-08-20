# Seguir sesión — punto de continuación

**Rama:** `mvp-modular-limpio`
**Fecha:** 2026-08-20
**Para qué sirve este documento:** es el punto de entrada rápido para retomar el trabajo. Resume la propuesta acordada, todo lo que se ha encontrado mal (corregido o no), y qué queda por hacer, en un solo sitio. El detalle línea por línea de cada corrección está en `PROPUESTA_MVP.md` (explicación completa del Paso 1) y `INCIDENCIAS_AUDITORIA.md` (registro de incidencias pensado para si esta rama se fusiona con `main`).

---

## 1. La propuesta — ancla definitiva

**Objetivo:** validar con el mínimo desarrollo posible si una app que fotografía un albarán, extrae sus datos por IA y calcula el coste real de las recetas (escandallos) aporta valor a un restaurante independiente español — con **cero fricción**, para poder decidir después el diseño (UX) que compita en eficiencia por ser una app de nicho.

**El flujo tiene 5 pasos:**

### Paso 0 — Alta de proveedores y catálogo
Registrar de dónde viene la mercancía y qué artículos se compran.
- Proveedor nuevo: ¿se da de alta solo, o el sistema pregunta antes de crear basura en la base de datos?
- Cambios de razón social: si un proveedor cambia de CIF o se fusiona, el histórico de precios no debe partirse en dos sin darse cuenta.

### Paso 1 — Recepción del papel y validación física ("la puerta")
Formatos que pueden llegar: albarán puro (sin precios), albarán valorado (con precios, sin validez fiscal), factura-albarán (documento mixto con IVA), factura pura (llega después o mezclada).

Trampas a vigilar:
- **El tachón a bolígrafo** — cantidad corregida a mano en la puerta porque llega menos género.
- **IVA mezclado** — productos a distinto tipo de IVA en el mismo papel.
- **Notas de abono / devoluciones** — llegan en negativo, deben restar del histórico, no sumar.
- **Portes y envases (cascos)** — costes o fianzas que no son producto; si se reparten como si fueran comida, el escandallo se infla.
- **Descuentos globales** — rappels o pronto pago que afectan al total; si no se prorratean por línea, el precio unitario del ingrediente queda falso.

### Paso 2 — Ingesta de datos e historial de precios ("la oficina / la app")
Registrar los costes y actualizar precios.

Trampas a vigilar:
- **Duplicidad albarán vs. factura** — subir el albarán y, días después, su factura, sin que el sistema detecte que es la misma entrega.
- **Líneas sin precio ("Pendientes de tarificación")** — género fresco que se tarifica al pesar; debe quedar aparcado sin romper los escandallos hasta que llegue el precio real.
- **Lío de unidades** — proveedor en cajas, papel en bultos, receta en gramos; sin equivalencia clara, todo colapsa.
- **Precio pactado vs. mercado** — un acuerdo anual de precio fijo no debe disparar alarmas falsas si sube el precio de mercado.
- **Trazabilidad de correcciones** — si alguien corrige a mano un dato mal leído, debe quedar registrado quién y cuándo.

### Paso 3 — Recetas, mermas y escandallos ("la cocina teórica")
Cruzar precios de ingredientes con cantidades de receta, descontando la merma. *(Nota: el escandallo es una foto teórica; cerrar el círculo del todo requeriría stock final, que queda fuera de este MVP.)*

Trampas a vigilar:
- **Mermas variables** — el desecho de un producto fresco cambia según temporada/proveedor; un cálculo fijo estricto descuadra el coste.
- **Sub-recetas en cadena** — platos hechos con preparaciones previas (caldos, salsas); si la estructura de datos es plana, no se puede recalcular el coste final cuando sube un ingrediente base.

### Paso 4 — Actualización en cadena ("el impacto")
Trasladar automáticamente los cambios de precio a los platos afectados, y guardar el histórico del propio escandallo (para saber cuánto costaba un plato hace meses).

Trampas a vigilar:
- **Baile por proveedores alternativos** — el mismo producto comprado a distintos proveedores con precios distintos; sin un criterio claro de qué precio histórico aplica, el coste del plato fluctúa sin lógica.
- **Saturación de avisos (UX)** — alertas molestas o bloqueantes cada vez que cambia un precio interrumpen al cocinero; debe resolverse con un indicador visual discreto (ámbar) que se consulta solo cuando se quiere.

**Regla de fondo:** fases estrictamente secuenciales, nada de construir por adelantado, ante la duda se elige lo más simple, y lo que ya funcione bien en `main` se trae/pule aquí en vez de reinventarlo.

---

## 2. Fallos detectados

### Corregidos en esta sesión (Paso 1)
| # | Fallo | Commit |
|---|---|---|
| 1 | El IVA no se extraía por línea, solo un resumen global del documento | `6b8884a` |
| 2 | El precio de línea podía venir con IVA incluido sin que nadie lo pidiera excluir | `f8099d8` |
| 3 | El tachón a bolígrafo no tenía prioridad sobre el número impreso | `20bc135` |
| 4 | Una coincidencia dudosa de artículo se vinculaba sola y avisaba después, en vez de preguntar antes | `36df2a8` |
| 5 | El plan de prueba limitaba a 20 albaranes/mes | `6b8884a` |
| 6 (parcial) | Las líneas sin precio no tenían ninguna etiqueta visible ("Pendiente de tarificación") | `fec4692` |

### Decisiones conscientes de no tocar (evaluadas y descartadas a propósito)
- El bloqueo por confianza baja (<85%) solo mira los 5 campos de cabecera, nunca cada línea individual — se decidió que el resaltado visual ya es aviso suficiente.
- No hay validación de calidad de imagen antes de mandar la foto a la IA — se decidió que la detección posterior por confianza es suficiente.

### Documentados, sin corregir, con plan
- **Impuestos especiales** (ej. alcohol) mezclados en el precio sin desglosar en el documento: no hay forma de separarlos, no existe un campo para ello. Limitación aceptada, se revisará si aparece con proveedores reales.
- **"Pendiente de tarificación" no es un estado real en la base de datos**, es una etiqueta calculada al mostrar la pantalla. Falta construir la resolución automática cuando llega el precio real (pertenece al Paso 2).
- **Duplicidad albarán/factura**: existe un aviso (`possible_duplicate_purchase`) que compara documentos por proveedor+fecha+importe parecido, pero **exige que ambos tengan importe** — si el albarán se guardó sin precio (el caso más común), nunca se compara. Decisión: no parchear suelto, se resuelve junto con la resolución retroactiva de "Pendiente de tarificación" de arriba, porque es el mismo problema visto desde otro ángulo.

### Nuevos — encontrados al verificar el ancla de 5 pasos, confirmados en código y con decisión ya tomada (ver detalle e incidencia # en `INCIDENCIAS_AUDITORIA.md`)
| # | Fallo | Paso | Decisión | Incidencia |
|---|---|---|---|---|
| A | Un proveedor nuevo se crea siempre solo, sin preguntar nunca (mismo patrón que ya se corrigió para artículos, pero aquí no) | Paso 0 | ✅ Corregido | #9 |
| B | Los proveedores se identifican solo por nombre exacto, nunca por CIF (que sí se guarda, pero no se usa) — si cambia la razón social, el histórico de precios se parte en dos en silencio | Paso 0 | ✅ Corregido | #10 |
| C | Las notas de abono/devoluciones no se distinguen de una compra normal — sumarían al histórico en vez de restar | Paso 1 | 📌 Aparcar | #11 |
| D | Portes y envases/cascos no se distinguen de artículos reales — contaminarían el catálogo de materia prima | Paso 1 | 📌 Aparcar | #12 |
| E | Descuentos globales (rappels, pronto pago) no se prorratean por línea — el precio unitario guardado queda inflado | Paso 1 | 📌 Aparcar | #13 |
| F | Trazabilidad de correcciones incompleta: al revisar justo tras el OCR se guarda **qué y cuándo** pero no **quién**; al editar después se guarda **quién y cuándo** pero no desglosado campo a campo | Paso 2 | ✅ Corregido | #14 |

**Cómo quedó A:** al guardar un albarán/factura, si el proveedor escrito no coincide con ninguno existente (ni por CIF ni por nombre), aparece un aviso "Proveedor nuevo — ¿confirmas?" antes de crearlo. Solo cubre el guardado inicial del Paso 1; la edición posterior de una factura ya guardada sigue sin preguntar (alcance reducido a propósito).

**Cómo quedó F:** cada corrección hecha justo tras el OCR ahora guarda también qué usuario la hizo (columna `user_id` nueva en `extraction_corrections`).

### No aplica (verificado, no es un problema con el diseño actual)
- **Precio pactado vs. mercado**: el sistema nunca compara contra un precio de mercado externo (no existe esa fuente de datos en ningún sitio) — solo contra el propio histórico de compras. Un precio fijo pactado no puede disparar una alarma falsa con el diseño actual.

### Pendiente de verificar (Paso 3 y 4 no existen todavía, son requisitos de diseño a tener en cuenta cuando se construyan, no fallos de algo que ya funcione)
- Mermas variables por temporada/proveedor.
- Sub-recetas en cadena (recetas dentro de recetas).
- Criterio de qué precio histórico aplicar cuando hay varios proveedores del mismo producto.
- Evitar saturar con avisos bloqueantes cuando cambia un precio (indicador discreto, no interrupción).

---

## 3. Siguientes pasos a ejecutar

**Propuesta de orden (a confirmar contigo, no decidido todavía):**

1. ~~Decidir prioridad de los hallazgos A–F~~ ✅ Decidido el 2026-08-20: **A, B y F se corrigen ya**; **C, D y E se aparcan** para más adelante. Detalle en `INCIDENCIAS_AUDITORIA.md` (incidencias #9–#14).
2. ~~Implementar A, B y F~~ ✅ Hecho el 2026-08-20 (proveedor nuevo pregunta antes de crear; matching de proveedor por CIF antes que por nombre; guardar quién corrige en la revisión post-OCR).
3. **Probar el Paso 1 con un albarán real** en la app funcionando (nunca se ha visto en pantalla, solo verificado por código y tests) — sigue pendiente, aún no hay albaranes de prueba disponibles.
4. ~~Construir la resolución retroactiva de "Pendiente de tarificación"~~ ✅ Hecho el 2026-08-20 (resuelve a la vez la incidencia 3 y la 8 — ver `INCIDENCIAS_AUDITORIA.md`). Al guardar una factura, si hay un albarán del mismo proveedor cerca en fecha con líneas sin precio, se ofrece fusionar los precios ahí en vez de crear un documento duplicado; el usuario confirma siempre antes. 1093/1093 tests en verde (nuevo archivo `tests/invoice-save-merge-pending-albaran.test.ts`).
5. **Empezar el Paso 3 (recetas y escandallos)** desde cero, una vez cerrado el Paso 1 y con Paso 2 lo bastante sólido — teniendo en cuenta desde el diseño las mermas variables y las sub-recetas en cadena, para no tener que rehacer la estructura de datos después.
6. Cuando llegue el momento del Paso 4, diseñar el criterio de "qué precio aplica con varios proveedores" y el sistema de avisos no intrusivos, antes de construir el recálculo en cadena.

**Cómo quedó la fusión (paso 4 de esta lista):** solo se activa cuando el documento nuevo es una factura (nunca un albarán) y el proveedor ya existe. Si hay un albarán candidato, el guardado se bloquea con un aviso "¿Es la factura de esa entrega?" con tres opciones: fusionar, guardar aparte (es otra compra), o volver a revisar. Al fusionar, las líneas se emparejan por descripción; una línea de la factura sin correspondencia en el albarán se añade como línea nueva. El PDF/foto de la factura no se guarda como documento aparte — solo queda el albarán, actualizado.

7. **Trabajar la interfaz (UI/UX)** — arrancado el 2026-08-20, en curso. Ver sección 4 más abajo.

---

## 4. Interfaz (UI/UX) — sesión en curso, sin cerrar

**Punto de partida (sesión 1):** se arrancó el servidor local para verla en el navegador por primera vez. Primera impresión: **"de momento es un desastre"**. Al retomar, se descubrió que el servidor llevaba corriendo desde muchas sesiones anteriores sin reiniciarse — eso corrompió su estado interno y hacía fallar la pantalla "Subir factura" con un error genérico. Se reinició limpio (`corepack pnpm dev`) y desapareció; no era un fallo de diseño ni de código.

**Restructuración del menú (sesión 2, 2026-08-20 continuada):** antes de pulir visualmente (herramienta "impeccable"), se restructuró qué pestañas tiene la app, porque mezclaba lo que sí es del MVP con lo que ya estaba pospuesto (Presupuestos, Chat, Resumen semanal). Menú nuevo, decidido por la usuaria:

- **Subir factura** — botón fijo arriba, no es pestaña (ya era así).
- **Avisos** — pestaña nueva, sustituye a "Resumen" como pantalla de entrada. Bandeja de "lo que necesita tu atención hoy", con las 4 señales que el sistema sí sabe detectar hoy: posibles duplicados, cambios de precio >15%, albaranes guardados con confianza baja, y líneas "pendiente de tarificación". **Importante:** tachones, notas de abono y cascos/portes (hallazgos C y D, aparcados) NO están aquí porque el sistema todavía no los detecta — cuando se construyan, se añaden a esta bandeja.
- **Albaranes** — la antigua "Facturas", renombrada solo en el menú y el título de la página. **Pendiente:** el contenido interno de esa pantalla (cabeceras, botones, "Sin facturas todavía") sigue diciendo "factura" por dentro — no se ha tocado, es un cambio más grande y se decidió no mezclarlo con la restructuración del menú.
- **Compras** — agrupa Analíticas (antes "Análisis de gasto", vista por defecto), Productos y Proveedores en un solo apartado con sub-pestañas.
- **Escandallos** — pestaña nueva, de momento solo dice "Todavía no está construido" (Paso 3 no existe aún).

Las 4 pestañas (Avisos, Albaranes, Compras, Escandallos) están **siempre visibles**, incluso antes de completar el tutorial inicial — a petición explícita, ya no se ocultan hasta terminar el onboarding como pasaba antes con Proveedores/Productos/Análisis.

**Se dejaron aparcadas sin quitar del código** (siguen accesibles por URL directa, ya no aparecen en el menú): Resumen (`/dashboard`), Presupuestos, Recordatorios de pago, Resumen semanal (Digest), Chat con IA.

**Detectado pero sin resolver — para decidir en otra sesión:** la campanita de notificaciones arriba a la derecha (🔔) sigue mostrando "Alertas" con un contenido parecido pero no idéntico al de la nueva pantalla "Avisos" (esa campanita también avisa de proveedores sin categorizar, presupuesto superado, etc.). Puede que convenga fusionarlas o quitar la campanita ahora que existe Avisos como pantalla propia — pendiente de decidir contigo.

**Siguiente paso al retomar:**
1. Releer este documento y `PROPUESTA_MVP.md`.
2. Abrir `http://localhost:5173/avisos` y recorrer el menú nuevo con la usuaria, pantalla a pantalla, anotando cualquier cosa que no encaje.
3. Decidir qué hacer con la campanita de notificaciones (ver arriba) y con el renombrado interno de "Albaranes".
4. Cuando el menú esté validado, ahí sí invocar la herramienta de diseño ("impeccable") para pulir visualmente.

*(Este documento se debe releer al empezar cualquier sesión nueva sobre esta rama, junto con `PROPUESTA_MVP.md` para el detalle del Paso 1.)*
