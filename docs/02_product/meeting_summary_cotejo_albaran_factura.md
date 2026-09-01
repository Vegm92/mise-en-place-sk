# Resumen de reunión: cotejo albarán-factura (conversación fundacional)

Notas de una conversación de definición de producto entre los fundadores
(hermanos; Víctor lleva la interfaz, la otra persona aporta la experiencia
de administración de restaurante y prácticas en una startup de extracción
de documentos). Es una discusión de alcance temprana — varias de las
ideas descritas aquí ya están implementadas en el producto actual (ver
`product_definition.md`); este documento conserva el razonamiento original
como referencia.

## A qué se dedica el software

- **Cotejo automático albarán ↔ factura** para restaurantes independientes
  (empezando a escala local/pequeña, ej. Sitges — no cadenas grandes, esas
  ya usan sistemas más potentes).
- Corre en local: nadie puede "quitarte" el control del proceso porque no
  depende de un tercero.

**Por qué no lo resuelve ya un gestor/programa contable (Innova):**
- Innova (u otro software contable) solo registra **facturas**, no
  albaranes, y contabiliza el gasto se pague o no. No hace previsión de
  pagos ni verifica que lo facturado coincide con lo recibido.
- Ninguna gestoría ofrece este cotejo: a la escala de un restaurante
  llegan decenas de albaranes por semana, es inviable manualmente para
  ellos y no es su función (solo necesitan el documento que acredita el
  gasto para la declaración de impuestos).
- Antes esto se llevaba a mano en Excel (previsión de pagos, gasto por
  categoría) — el objetivo es sustituir ese Excel por la aplicación.

## Qué procedimiento resuelve

1. Verificar que lo que llegó físicamente (albarán) coincide con lo que
   se factura después (factura): mismo proveedor, mismos artículos,
   mismo importe.
2. Detectar automáticamente discrepancias (artículo faltante, importe
   distinto) y generar la reclamación al proveedor sin trabajo manual.
3. Dar visibilidad del gasto **antes** de cerrar el mes (previsión de
   pagos), no solo un registro contable a toro pasado.
4. Al final del mes, entregar a la gestoría **solo las facturas**
   (original + rectificativa + versión final si las hay) ya cotejadas y
   listas para contabilizar — la gestoría nunca necesita albaranes.

## Fases del flujo

1. **Subir documento** (un único punto de entrada, no "subir albarán" /
   "subir factura" por separado).
2. **Detección automática del tipo de documento** (albarán vs. factura)
   por IA.
3. **Extracción de datos**: campos obligatorios siempre extraídos
   (proveedor, nº de documento, fecha, total…) + campos opcionales
   configurables por empresa (ej. fecha de vencimiento) que se pueden
   mostrar u ocultar desde Ajustes sin dejar de extraerse internamente
   (experiencia de usuario limpia, sin forzar un esquema único para
   todos).
4. **Revisión de discrepancias**, con dos niveles distintos:
   - *Incidencia de lectura*: el escaneo falla en cuadrar una suma (p.ej.
     IVA duplicado, portes no sumados al total) — es un problema de
     extracción, no del albarán en sí. Debe marcarse de forma distinta a
     una incidencia real.
   - *Incidencia real del albarán*: falta un artículo, cantidad
     incorrecta, etc. → la IA redacta y envía automáticamente un email de
     reclamación al proveedor con los datos ya extraídos; el usuario
     puede personalizar el mensaje antes de enviarlo (plantilla
     predeterminada editable).
5. **Archivado** del albarán aprobado.
6. La **factura** llega más tarde (a veces con semanas de diferencia) →
   se sube al mismo flujo → **cotejo automático** contra el albarán (o
   contra la corrección pendiente si la hubo).
7. Si el cotejo es correcto → pasa a **previsión de pagos / gastos**.
   Una factura sin albarán asociado no es necesariamente un error (se
   pueden extraviar, o no lo dan) — se contempla como caso válido.
8. Marcar **estado de pago**: pagado, pendiente, o domiciliado (banco
   cobra automáticamente a X días). Filtrable después en el resumen.
9. Fin de mes: **exportar solo facturas** (con originales, rectificativas
   y finales) para enviar a la gestoría.

## Tablón de gastos (resumen / dashboard)

- Vista de **"Gastos"** (no "pendiente de pago") filtrable por periodo
  (semana, mes…).
- Agrupado **por categoría** en desplegables: total de la categoría +
  detalle de las facturas que la componen.
- Filtro adicional por **estado de pago** (pagado / pendiente /
  domiciliado) cruzado con el periodo.
- Gráfico **donut** para gasto por categoría (preferido sobre barras: la
  proporción del gasto se lee mejor — "75% bebida, 38% comida…").
- Gráfico de gasto por volumen a lo largo del año.
- Selección múltiple + **descargar documentos** (imágenes + datos)
  exportado a Excel, incluyendo **base imponible** además del importe
  total (el gasto real deducible es sin IVA).

## Categorías / etiquetas

- No cerrar el sistema a "solo comida y bebida": dejarlo abierto a
  mantenimiento, suministros, marketing, administración, etc. — no
  cuesta más y evita tener que rehacerlo después.
- **Configurable por el usuario**: al dar de alta el restaurante, se
  eligen o crean las etiquetas deseadas, con el nivel de detalle que
  quieran (p.ej. "comida y bebida" a secas, o subcategorizar en lácteos,
  congelados, etc.).
- Un proveedor → una única categoría (evitar duplicar el importe en dos
  etiquetas distintas por el mismo gasto).
- Si necesitan más categorías después, las solicitan al administrador y
  se añaden (no requiere volver a configurar todo).

## Funcionalidades a implementar (prioridad)

**Núcleo del MVP** (esto es "la esencia"):
- Subir documento → detectar tipo → extraer datos con campos
  configurables → cotejo albarán/factura → reclamación automática por
  email si falta algo → resumen de gastos por categoría/periodo con
  estado de pago.

**Secundario / fase 2** (aporta valor pero no bloquea el MVP):
- Catálogo de **productos y proveedores** con actualización automática de
  precios (útil sobre todo para quien hace inventario a inicio de
  temporada, no tanto para administración).
- **Plantilla de inventario en Excel**: se autogenera a partir de los
  productos ya registrados, agrupados por categoría, con las fórmulas de
  totales ya montadas — el usuario solo rellena las cantidades físicas
  contadas. Candidata a **feature de pago (versión Pro)**: la versión
  gratuita permite consultar los datos manualmente, la Pro genera la
  plantilla lista para usar.

## Notas de implementación mencionadas

- Los errores de extracción son inevitables (ej. IVA duplicado al sumar
  dos tipos de impuesto, portes no incluidos en el total) — deben quedar
  visibles como incidencias de lectura para que el usuario los revise, no
  bloquear silenciosamente el flujo.
- El comportamiento debe ser consistente entre el entorno de desarrollo y
  el acceso externo (un caso de "funciona en local, no fuera" se señaló
  como pendiente de corregir).
