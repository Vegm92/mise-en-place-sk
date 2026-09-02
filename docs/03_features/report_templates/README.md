---
tags: [mep, features]
related: "[[CONTEXT]]"
---

# Plantillas de informe

Fuentes de diseño de la pantalla `/reports` y de los cuatro informes que genera.
Cada `.dc.html` es una lámina (artboard) y `canvas.json` las coloca en el lienzo.

## Qué hay

| Fichero | Qué es |
|---|---|
| `Main.dc.html` | Pantalla de elección (escritorio): tipo × estilo, vista previa en vivo |
| `MovilInformes.dc.html` | La misma pantalla en móvil (390×844) |
| `MovilMenu.dc.html` | El menú lateral abierto sobre esa pantalla |
| `CierreSemanal.dc.html` | Informe semanal, A4, estilo Ejecutivo |
| `CierreMensual.dc.html` | Informe mensual, A4, estilo Ejecutivo |
| `Precios.dc.html` | Variación de precios, A4, estilo Ejecutivo |
| `Proveedores.dc.html` | Cuentas a pagar, A4, estilo Ejecutivo |
| `EstiloContable.dc.html` | El cierre mensual en estilo Contable |
| `EstiloEditorial.dc.html` | El cierre mensual en estilo Editorial |
| `ExportacionCSV.dc.html` | Esquema de columnas y reglas de formato de los cuatro CSV |

## Dónde vive el código

Estas láminas ya no son solo diseño. La pantalla es `/reports` (elección) y
`/reports/[type]` (el informe), con `?style=` y `?period=` en la URL.

| Pieza | Fichero |
|---|---|
| Tipos, estilos y serializador CSV | `src/lib/reports.ts` |
| Un constructor por informe | `src/lib/server/reports/{weekly,monthly,prices,payables}.ts` |
| Despacho y traducción del CSV | `src/lib/server/reports/index.ts` |
| Lámina A4 y los tres estilos | `src/routes/(app)/reports/[type]/+page.svelte` |
| Descarga CSV | `src/routes/(app)/reports/[type]/csv/+server.ts` |

Cada constructor devuelve un `ReportDoc` — cabecera, indicadores, gráfico,
tabla y filas de CSV — y **un solo** componente dibuja los cuatro. Añadir un
informe es escribir un constructor, no una pantalla.

El PDF es `window.print()` contra un `@page { size: A4 }`: no hay librería de
PDF ni navegador sin cabeza en el servidor.

El cierre semanal y el mensual leen las tablas vivas, no
`mv_category_monthly_spend`, para que un albarán subido hoy cuente hoy; la
vista materializada solo se refresca por la noche. La variación de precios sí
lee `mv_price_snapshots` — reconstruir esa ventana en vivo no compensa para un
informe de tendencia.

## De dónde salen los datos

- **Cierre semanal** — `weekly_digest` más los albaranes de la semana ISO
- **Cierre mensual** — `mv_category_monthly_spend` contra `budgets`
- **Variación de precios** — `mv_price_snapshots` y el umbral de alerta
- **Cuentas a pagar** — `invoices` con `due_date`, por tramos de antigüedad

Las cifras de las láminas son de ejemplo, pero cuadran entre sí: los totales,
los porcentajes y los desvíos suman, y la semana 31 encaja dentro de julio.

## Reglas del CSV

Un fichero por informe, en el mismo grano que la tabla principal del PDF.
UTF-8 **con BOM**, separador `;`, coma decimal con 2 decimales fijos y sin
separador de miles, fechas ISO `AAAA-MM-DD`, entrecomillado RFC 4180, una
sola fila de cabecera y **sin** fila de totales. Sin las tres primeras reglas
Excel en español abre el fichero en una columna y con los acentos rotos.

La exportación de Albaranes (`/invoices/export`) sigue siendo XLSX y no la
sustituyen: aquélla va a nivel de línea, éstas al grano del informe.

## Navegación en móvil

La navegación sale de `src/routes/(app)/+layout.svelte`: cabecera de 56 px con
hamburguesa, título y acciones, más un `<aside>` de 232 px que entra deslizando
sobre una capa `bg-black/60`. **No hay barra inferior de pestañas.**

`MobileTabBar.svelte` y `MobilePageHeader.svelte` se borraron en la issue #660:
nadie los importaba y no representaban la navegación real. Adoptar una barra
inferior de pestañas sigue siendo una opción de producto, pero es un cambio de
UX que habría que aprobar aparte.

Por debajo de `md` la cabecera deja en la fila solo hamburguesa, título,
campana y CTA de subida; los conmutadores de idioma y tema viven en el
`<aside>` deslizante, que hace de menú de desbordamiento (#660).

## Tokens

Todo sale de `src/app.css`, con el acento **slate** (`--mep-acc: #34507a`,
hover `#2b4368`, soft `rgba(52,80,122,.10)`), fondo `#f5f4f0` y Mona Sans.

El acento fue amber hasta [ADR-026](../../06_decisions/experience/ADR-026-warm-severity-ramp-cool-actions.md),
que lo movió a slate porque el ámbar y `--mep-warn` compartían tono, y
[ADR-027](../../06_decisions/experience/ADR-027-amber-accent-removed-and-enforced.md),
que borró el bloque amber de `app.css`. Las 13 raíces de ruta montan
`<div class="mep" data-accent="slate">`. El bloque teal sigue declarado pero
no lo usa ninguna ruta.

`--mep-warn` es ámbar, pero no el ocre de antes: `#654a00` en claro y `#efc233`
en oscuro. El ocre original quedaba a ΔE 4,7 del acento en claro y 4,7 en
oscuro — por debajo del umbral de percepción, así que un aviso y un botón se
veían del mismo color. Los nuevos están a ΔE 15,1 y 33,3, y pasan AA también
sobre su propio `warn-soft`, que es donde se usan como texto en
`.badge-pending`.

En claro no se puede separar mucho más sin romper AA: `warn` tiene que ser
oscuro para contrastar sobre su tinte, y el acento también lo es. En oscuro hay
margen de sobra.

La rampa de antigüedad del saldo no usa `warn`: verde/ámbar/rojo/oscuro daba
20/27/32 en escala de grises, apiñado e ilegible impreso en B/N. Va con un solo
tono que escalona 81/32/11.

Los gráficos de gasto por categoría van con la paleta **por categoría**
(`--mep-cat-<slug>`, más `--mep-cat-other` para el bucket «resto»), que es lo
que resuelve `categoryColor()` en `src/lib/colors.ts`. Cada categoría tiene su
color fijo en toda la app. `seriesColor()` y `--mep-series-*` son para series
posicionales —productos, por ejemplo—, no para categorías. Las barras de una
sola serie (gasto por día) van en acento, como el `Sparkline`. El tipo de letra de
los A4 sube al mínimo de imprenta (12 pt = 16 px a 96 ppp) en vez de la
densidad de pantalla de la app.

## Regenerar el lienzo

Las láminas se siembran en una copia de la plantilla del skill `design`
(`seed-canvas.mjs --template … --artboard … --canvas canvas.json`) y se
publican como Artifact. No se edita el HTML sembrado: se editan estos
ficheros y se vuelve a sembrar.
