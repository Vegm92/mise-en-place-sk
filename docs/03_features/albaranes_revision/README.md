# Albaranes · revisión

Fuentes de diseño de la pantalla `/invoices` rehecha como **bandeja de revisión**:
tres estados (**Por revisar · Confirmado · Incidencia**) y una **partida de cocina**
por albarán. Cada `.dc.html` es una lámina (artboard) y `canvas.json` las coloca
en el lienzo.

## Qué hay

| Fichero | Qué es |
|---|---|
| `Main.dc.html` | La lista: pestañas por bandeja, marcar y asignar partida desde la propia fila, selección múltiple y deshacer (1440×900) |
| `Grafica.dc.html` | La misma página en la pestaña «Gráfica»: columnas por semana con métrica intercambiable, reparto por partida y tamaño del albarán por proveedor (1440×900) |
| `Estados.dc.html` | Los tres estados, el recorrido, las seis partidas y lo que implica en la base de datos |

Las dos primeras son interactivas: cambiar de bandeja, seleccionar filas, marcar,
asignar partida en lote, deshacer, y cambiar qué mide la columna de la gráfica.
Los datos son de ejemplo —16 albaranes de una semana dentro de un periodo de 10
semanas— y cuadran entre las tres láminas.

## Aquí no se paga

Se revisa que el albarán cuadre y se dice a qué partida va. No hay estado de
pago, ni vencimientos, ni importes pendientes: eso se cayó del diseño a
propósito. En la fila, el hueco que ocupaba el estado de pago lo ocupa ahora el
**número de líneas**, que es lo que te dice si un albarán son dos cajas o la
compra de la semana.

## Lo que hay que decidir antes de tocar código

1. **La columna de estado.** Hoy `invoices.status` guarda
   `pending · accepted · rejected · paid` y `overdue` se deduce de `due_date`.
   Sin pagos sobran `paid` y todo lo que cuelga del vencimiento: quedan tres
   valores y caben en la columna que ya existe. No hace falta un eje nuevo.
2. **La partida sí es columna nueva** en `invoices`, y no vale reaprovechar
   `category`: esa es la categoría de producto del proveedor
   (`src/lib/constants.ts`) y es otra cosa. Un proveedor sirve a varias
   partidas, así que la partida es del albarán — la app puede proponerla
   mirando los albaranes anteriores de ese proveedor.
3. **El nombre «confirmado»** ya significa otra cosa en el pipeline de
   extracción (`batch_items → confirmed`, «los datos extraídos están bien»).
   El estado nuevo dice «la entrega cuadra».

## Las seis partidas

`Cocina caliente · Cocina fría · Pastelería · Economato · Bar` más
`Sin asignar`, que no es una partida sino trabajo pendiente y tiene su propio
filtro en la barra. Los colores salen de la paleta categórica que ya usa la app
(`--mep-series-1…5` y `--mep-series-other`).

## Colores

Los chips de estado reutilizan los tokens que ya existen (`--mep-warn`,
`--mep-pos`, `--mep-neg`). Las gráficas **no** usan esos mismos valores: los tres
del badge (`#654a00 · #14694a · #b03a3a`) no se distinguen como manchas grandes
—verde y rojo se confunden con daltonismo protán, ΔE 4,8—. Los pasos de gráfica
(`#0f7a52 · #bd8206 · #c73f31`, en ese orden de apilado) mantienen el tono y
pasan las comprobaciones de contraste y de visión del color.

## Dónde vive el código de hoy

| Pieza | Fichero |
|---|---|
| Pantalla de listado | `src/routes/(app)/invoices/+page.svelte` |
| Filtros (parseo, URL, contador) | `src/lib/invoice-filters.ts` |
| Estados y clases de badge | `src/lib/status.ts` |
| Categorías de producto (≠ partidas) | `src/lib/constants.ts` |
| Plantilla común de listado | `src/lib/components/mep/ListPageTemplate.svelte` |
| Listado en móvil | `src/lib/components/mobile/MobileInvoiceList.svelte` |
