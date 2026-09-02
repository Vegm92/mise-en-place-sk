---
tags: [mep, features]
related: "[[CONTEXT]]"
---

# Albaranes · revisión

Fuentes de diseño de la pantalla `/invoices` rehecha como **bandeja de revisión**:
tres estados (**Por revisar · Confirmado · Incidencia**) sobre las **categorías de
proveedor que la app ya usa**. Cada `.dc.html` es una lámina (artboard) y
`canvas.json` las coloca en el lienzo.

## Qué hay

| Fichero | Qué es |
|---|---|
| `Main.dc.html` | La lista: pestañas por bandeja, marcar y corregir la categoría desde la propia fila, selección múltiple y deshacer (1440×900) |
| `Grafica.dc.html` | La misma página en la pestaña «Gráfica»: columnas por semana con métrica intercambiable, reparto por categoría y tamaño del albarán por proveedor (1440×900) |
| `Estados.dc.html` | Los tres estados, el recorrido, las categorías de siempre y lo que implica en la base de datos |

Las dos primeras son interactivas: cambiar de bandeja, seleccionar filas, marcar,
corregir categorías, deshacer, y cambiar qué mide la columna de la gráfica.
Los datos son de ejemplo —16 albaranes de una semana dentro de un periodo de 10
semanas— y cuadran entre las tres láminas.

## Aquí no se paga

Se revisa que el albarán cuadre y se dice a qué partida va. No hay estado de
pago, ni vencimientos, ni importes pendientes: eso se cayó del diseño a
propósito. En la fila, el hueco que ocupaba el estado de pago lo ocupa ahora el
**número de líneas**, que es lo que te dice si un albarán son dos cajas o la
compra de la semana.

## Lo que hay que decidir antes de tocar código

1. **No hay ninguna columna nueva.** Sin pagos sobran `paid` y todo lo que cuelga
   de `due_date`: quedan tres valores y caben en el `invoices.status` de hoy. Y la
   categoría ya existe en `suppliers.category`, con su filtro en la lista
   (`src/lib/invoice-filters.ts`) y su endpoint en
   `src/routes/(app)/api/supplier-category/+server.ts`. Esto es renombrar y
   quitar, no migrar.

   *Actualización (issue #879):* esto ya no es del todo cierto. Dentro de
   «Incidencia» hace falta un segundo eje — no es lo mismo un fallo de lectura
   (el IVA sumado dos veces, el envío fuera del total) que un problema real
   del documento (falta una línea, la cantidad no cuadra): la acción del
   usuario es distinta en cada caso (revisar el escaneo vs. avisar al
   proveedor), así que sí hay una columna nueva —
   `invoices.incidence_kind` (`lectura | documento`, nulo fuera de
   incidencia) — documentada en `docs/03_features/invoice_management.md` y
   en el `## Code notes` de `src/lib/status.ts`
   (`docs/04_engineering/coding_conventions.md`). Los tres estados de
   `invoices.review_state` siguen siendo los tres de siempre; el eje nuevo
   vive aparte, no dentro de `review_state`.
2. **La categoría es del proveedor, no del albarán.** Corregirla desde una fila
   afecta a todos los albaranes de ese proveedor — el menú lo avisa y en la
   lámina se ve en marcha. Donde se rompe es con los proveedores que venden de
   todo: se quedan en «Sin categoría» y en los datos de ejemplo son casi una
   cuarta parte del gasto. Si eso molesta, la salida es clasificar por línea —el
   producto ya tiene categoría propia— y no por albarán.
3. **El nombre «confirmado»** ya significa otra cosa en el pipeline de
   extracción (`batch_items → confirmed`, «los datos extraídos están bien»).
   El estado nuevo dice «la entrega cuadra».

## Las partidas de cocina se descartaron

Se dibujaron en una versión anterior (cocina caliente, fría, pastelería,
economato, bar) y se quitaron: ese eje pertenece a los escandallos, no a los
albaranes. Queda en el historial de git por si hace falta para esa pantalla.

## Colores

Los chips de estado reutilizan los tokens que ya existen (`--mep-warn`,
`--mep-pos`, `--mep-neg`), y los de categoría los `--mep-cat-*` de siempre. Las gráficas **no** usan esos mismos valores: los tres
del badge (`#a85300 · #14694a · #b03a3a`) no se distinguen como manchas grandes
—verde y rojo se confunden con daltonismo protán, ΔE 4,8—. Los pasos de gráfica
(`#0f7a52 · #bd8206 · #c73f31`, en ese orden de apilado) mantienen el tono y
pasan las comprobaciones de contraste y de visión del color.

Lo mismo con las categorías, y por eso el reparto por categoría son barras de un
solo tono con el color de la categoría como punto al lado del nombre: los 17
`--mep-cat-*` están hechos para ser texto sobre su propio tinte y como manchas
grandes no se separan —Pescados y Mariscos contra «Sin categoría» quedan a
ΔE 7,1 incluso con visión normal—. Como punto junto a una etiqueta funcionan;
como relleno de barra, no.

## Dónde vive el código de hoy

| Pieza | Fichero |
|---|---|
| Pantalla de listado | `src/routes/(app)/invoices/+page.svelte` |
| Filtros (parseo, URL, contador) | `src/lib/invoice-filters.ts` |
| Estados y clases de badge | `src/lib/status.ts` |
| Categorías (`VALID_CATEGORIES`) | `src/lib/constants.ts` |
| Plantilla común de listado | `src/lib/components/mep/ListPageTemplate.svelte` |
| Categoría del proveedor | `src/routes/(app)/api/supplier-category/+server.ts` |
| Listado en móvil | `src/lib/components/mobile/MobileInvoiceList.svelte` |
