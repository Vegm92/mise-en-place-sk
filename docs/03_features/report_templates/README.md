# Plantillas de informe

Fuentes de diseño de la pantalla `/reports` y de los cuatro informes que genera.
Cada `.dc.html` es una lámina (artboard) y `canvas.json` las coloca en el lienzo.

## Qué hay

| Fichero | Qué es |
|---|---|
| `Main.dc.html` | Pantalla de elección (escritorio): tipo × estilo, vista previa en vivo |
| `MovilInformes.dc.html` | La misma pantalla en móvil (390×844) |
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

## Tokens

Todo sale de `src/app.css` (acento teal `#0f5f5c`, fondo `#f5f4f0`, familia
Mona Sans) y, en móvil, de `src/lib/components/mobile`. El tipo de letra de
los A4 sube al mínimo de imprenta (12 pt = 16 px a 96 ppp) en vez de la
densidad de pantalla de la app.

## Regenerar el lienzo

Las láminas se siembran en una copia de la plantilla del skill `design`
(`seed-canvas.mjs --template … --artboard … --canvas canvas.json`) y se
publican como Artifact. No se edita el HTML sembrado: se editan estos
ficheros y se vuelve a sembrar.
