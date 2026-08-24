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

`MobileTabBar.svelte` y `MobilePageHeader.svelte` siguen en
`src/lib/components/mobile/` pero no los importa nadie — son código muerto y no
representan la navegación real. Conviene borrarlos o marcarlos.

## Tokens

Todo sale de `src/app.css`, con el acento **amber** (`--mep-acc: #8a530f`,
hover `#7e4c0d`, soft `rgba(138,83,15,.10)`), fondo `#f5f4f0` y Mona Sans.

Ojo con esto: el bloque teal aparece primero en `app.css` y va comentado como
«Accent — teal (default)», pero **ninguna ruta lo usa**. Todas montan
`<div class="mep" data-accent="amber">`, así que el acento real de la app es
amber. El comentario induce a error.

`--mep-warn` es ahora un rojo de peligro (`#a5320a` en claro, `#ee8355` en
oscuro), no el ocre de antes. Ojo: queda muy cerca de `--mep-neg` (`#b03a3a`),
y ambos se usan juntos —`badge-pending` frente a `badge-overdue`, y la rampa de
`semColor()`. En «Cuentas a pagar» se ve: las tarjetas «Vencido» y «Vence en
7 días» son casi el mismo rojo.

Por eso la rampa de antigüedad del saldo no usa `warn`: en gris daba 27/26/32
y era ilegible impresa. Va con un solo tono que sí escalona (81/32/11).

Los gráficos de gasto por categoría van con la paleta de series
(`--mep-series-1..5` más `--mep-series-other` para el resto), igual que
`MobileAnalyticsSpend`. Las barras de una sola serie (gasto por día) van en
acento, como el `Sparkline`. El tipo de letra de
los A4 sube al mínimo de imprenta (12 pt = 16 px a 96 ppp) en vez de la
densidad de pantalla de la app.

## Regenerar el lienzo

Las láminas se siembran en una copia de la plantilla del skill `design`
(`seed-canvas.mjs --template … --artboard … --canvas canvas.json`) y se
publican como Artifact. No se edita el HTML sembrado: se editan estos
ficheros y se vuelve a sembrar.
