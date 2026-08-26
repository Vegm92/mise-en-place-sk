# Albaranes · revisión

Fuentes de diseño para descongestionar los filtros de `/invoices` y añadir los
tres estados de revisión: **Por revisar · Confirmado · Incidencia**.
Cada `.dc.html` es una lámina (artboard) y `canvas.json` las coloca en el lienzo.

## Qué hay

| Fichero | Qué es |
|---|---|
| `Main.dc.html` | **Versión A · Barra compacta** — la página de ahora, con los filtros recogidos en un panel flotante y las bandejas en un segmentado (1440×900) |
| `VersionB.dc.html` | **Versión B · Bandejas** — la lista como bandeja de revisión: pestañas por estado, sin rejilla de KPIs, marcar desde la fila (1440×900) |
| `Estados.dc.html` | Los tres estados y la matriz revisión × pago — la decisión de modelo de datos |
| `Opcion1.dc.html` | Gráfica · carga de revisión (columnas apiladas por semana) |
| `Opcion2.dc.html` | Gráfica · gasto por proveedor (barras) |
| `Opcion3.dc.html` | Gráfica · incidencias por proveedor (barras) |
| `Opcion4.dc.html` | Gráfica · ninguna — tres cifras en su lugar |

Las dos versiones y la opción 1 son interactivas: se puede cambiar de bandeja,
seleccionar filas, marcar estados y deshacer. Los datos son de ejemplo (16
albaranes de una semana) y cuadran entre las siete láminas.

## Lo que hay que decidir antes de tocar código

1. **Versión A o B** — A conserva la estructura actual, B convierte la lista en
   una cola de triaje.
2. **La columna de estado.** Hoy `invoices.status` guarda
   `pending · accepted · rejected · paid` en un solo campo y `overdue` se deduce
   de la fecha de vencimiento. Los tres estados nuevos son un eje distinto del
   pago: mientras compartan columna, «pagado sin revisar» y «pagado con
   incidencia abierta» no se pueden representar. Ver `Estados.dc.html`.
3. **Qué enseña la pestaña «Gráfica»** — las cuatro opciones responden a
   preguntas distintas y cada lámina lleva escrito su coste. La 1 y la 4
   conviven bien.

## Colores

Los chips reutilizan los tokens que ya existen (`--mep-warn`, `--mep-pos`,
`--mep-neg`). Las gráficas **no** usan esos mismos valores: los tres del badge
(`#654a00 · #14694a · #b03a3a`) no se distinguen como manchas grandes —verde y
rojo se confunden con daltonismo protán, ΔE 4,8—. Los pasos de gráfica
(`#0f7a52 · #bd8206 · #c73f31`, en ese orden de apilado) mantienen el tono y
pasan las comprobaciones de contraste y de visión del color.

## Dónde vive el código de hoy

| Pieza | Fichero |
|---|---|
| Pantalla de listado | `src/routes/(app)/invoices/+page.svelte` |
| Filtros (parseo, URL, contador) | `src/lib/invoice-filters.ts` |
| Estados y clases de badge | `src/lib/status.ts` |
| Plantilla común de listado | `src/lib/components/mep/ListPageTemplate.svelte` |
| Listado en móvil | `src/lib/components/mobile/MobileInvoiceList.svelte` |
