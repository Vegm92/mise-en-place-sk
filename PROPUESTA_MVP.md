# PROPUESTA MVP — Sistema de Albaranes y Escandallos

**Rama asociada:** `mvp-modular-limpio`
**Fecha:** 2026-08-20 (revisado el mismo día tras auditar el código real)
**Estado:** ver sección 6

---

## 0. Nota de contexto — léase antes de trabajar en esta rama

**Quien desarrolla en esta rama no es programadora.** Esto no es un detalle menor, es una condición de trabajo:

- Cualquier explicación técnica debe darse en lenguaje llano, con analogías si hace falta, sin dar por hecho que se conocen términos de programación.
- No se asume conocimiento previo de conceptos como "commit", "rama", "base de datos", "API", etc. Si se usan, se explican la primera vez.
- El avance se hace en pasos pequeños y verificables. Cada pieza se prueba (viendo la app funcionar de verdad) antes de pasar a la siguiente.
- Ante la duda entre "hacerlo más completo" o "hacerlo más simple pero entendible y probado", se elige lo segundo.

Este documento es el **contexto de la rama**: cualquiera (persona o asistente IA) que retome el trabajo aquí debe leer esto primero para saber qué se está construyendo, en qué orden, y qué queda deliberadamente fuera todavía.

### Recordatorio para cada sesión de trabajo

Antes de tocar nada, y de nuevo al terminar, comprobar dos cosas (pedirle a Claude que lo compruebe si hace falta):

1. **¿Estoy en la rama correcta?** → `git branch --show-current` debe decir `mvp-modular-limpio`, nunca `main`.
2. **¿He hecho commit de lo que he avanzado?** → cada trozo de trabajo que funcione debe quedar guardado con un commit antes de cerrar la sesión, para no perderlo.

Si en algún momento se me olvida, quiero que se me recuerde explícitamente en vez de darlo por hecho.

### ⚠️ Corrección importante (2026-08-20)

La primera versión de este documento decía "Fase 1 sin empezar, sin código todavía". **Eso era falso.** Esta rama parte del historial completo de `main`, y `main` ya es una aplicación real en producción (con cobro por Stripe activo) que cubre gran parte de lo descrito aquí. Se hizo una auditoría línea a línea del código antes de escribir esta versión del documento — ver sección 3 para el estado real, comprobado, de cada pieza.

---

## 1. Objetivo del MVP

Validar, con el mínimo desarrollo posible, si una app que **fotografía un albarán, extrae sus datos automáticamente (OCR) y calcula el coste real de las recetas (escandallos)** aporta valor real a un restaurante independiente español, antes de invertir en las funcionalidades avanzadas que sí forman parte de la visión final del producto pero no son necesarias para la primera validación.

**El objetivo, en una frase:** *leer papel* (factura, factura-albarán, albarán) → *administrar la información* (saber qué productos tengo, avisos de precio, proveedores) → *controlar escandallos y mermas* — con **cero fricción**, para poder validar el mercado y luego diseñar el UX que compita en eficiencia por ser una app de nicho.

La visión completa del producto está documentada en `ESPECIFICACIÓN_APP_ALBARANES_v2.md` (fuera de este repositorio). Este documento es una versión recortada, pensada para un MVP de validación de mercado.

---

## 2. Reglas de trabajo de esta rama

1. **Fases estrictamente secuenciales.** No se empieza una fase hasta que la anterior está probada y funcionando de verdad (no solo "el código compila", sino "lo he usado y hace lo que tiene que hacer").
2. **Nada de funcionalidades avanzadas por adelantado.** Si algo no es imprescindible para que la fase actual funcione, se anota como pendiente y no se construye todavía (ver sección 4).
3. **Todo el trabajo vive en `mvp-modular-limpio`.** No se hace merge a `main` hasta que se decida explícitamente, fase por fase o al final.
4. **Commits frecuentes y explicados**, como puntos de guardado seguros dentro de esta rama.
5. **Reconstrucción, no invención.** Lo que ya existe en `main` y funciona de forma completa y coherente se trae/pule en esta rama tal cual. No se reescribe desde cero solo por reescribir.

---

## 3. Los 3 pasos del MVP — estado real, verificado

### Paso 1 — Recepción y digitalización de albaranes por OCR

**Qué hace este paso:** el restaurante fotografía un albarán o factura (con la app, o mandando la foto por WhatsApp), una IA (Gemini) lee el documento y extrae los datos estructurados (proveedor, artículos, cantidades, precios, IVA), y esos datos quedan guardados y visibles en pantalla, listos para alimentar el Paso 2 (histórico de precios) y, más adelante, el Paso 3 (escandallos).

**De qué partes se compone:**
1. Captura de la foto (app o WhatsApp).
2. Extracción por IA (lectura del documento y conversión a datos).
3. Pantalla de revisión (donde se ve lo que la IA leyó, antes de guardar).
4. Guardado (con sus validaciones y protecciones).
5. Pantallas de consulta posteriores (detalle del albarán, edición).
6. Vinculación de cada artículo del albarán con la materia prima interna del restaurante.

A continuación, cada pieza: qué hace, cómo funcionaba antes de esta sesión, qué pregunta o error hizo saltar la alarma, y qué se corrigió.

---

**1. Captura de la foto — cámara o WhatsApp**
- *Qué hace:* deja fotografiar el albarán con el móvil (con cola de subida si no hay conexión) o mandarlo directamente por WhatsApp a un número del restaurante.
- *Cómo funcionaba antes:* ya funcionaba así, completo.
- *Verificación:* se confirmó que el webhook de WhatsApp valida la firma de Meta correctamente y que existe cola offline en el navegador. No se encontró ningún problema.
- *Corrección aplicada:* ninguna. Se confirma explícitamente que WhatsApp **forma parte del MVP** (antes no estaba en el documento).

**2. Extracción por IA — lectura del documento**
- *Qué hace:* la IA lee la foto/PDF y devuelve proveedor, número, fecha, y cada línea (artículo, cantidad, unidad, precio, IVA), distinguiendo si el documento es una factura o un albarán.
- *Cómo funcionaba antes:* extraía proveedor/artículos/cantidades/precio/importe correctamente, pero:
  - **No leía el IVA por línea en absoluto** — solo un resumen global del documento entero (ej. "10%: base 45€", sin decir qué línea concreta lleva ese 10%).
  - **No le decía a la IA si el precio debía ir con o sin IVA** — si un proveedor imprimía el precio ya con el IVA incluido, la IA podía copiarlo tal cual.
- *Pregunta/error que hizo saltar la alarma:* preguntaste explícitamente "¿el parser separa la base imponible del IVA por línea?". Al revisar el código se confirmó que no — el campo `tax_rate` por línea sencillamente no existía en lo que la IA devolvía, y el precio de línea era ambiguo (podía venir con o sin IVA según el documento).
- *Corrección aplicada:*
  - Se añadió `tax_rate` como campo obligatorio por línea en lo que la IA debe devolver, con instrucciones de cómo repartirlo cuando el documento solo trae un tipo global o varios tipos sin indicar cuál va con cada línea.
  - Se le exige explícitamente que el precio de cada línea sea siempre la **base imponible** (sin IVA), calculándolo ella misma si el documento solo imprime el precio con IVA incluido — bajando la confianza de esa línea cuando tiene que hacer ese cálculo en vez de leerlo directo.
  - **Limitación que queda, documentada y no resuelta:** si un **impuesto especial** (ej. en bebidas alcohólicas) va mezclado en el precio sin desglosar en el documento, no hay forma de separarlo — no existe un campo para eso. Se acepta como parte del precio y esa línea queda con confianza más baja. Se revisará si aparece en la práctica con proveedores reales.

**3. Pantalla de revisión — antes de guardar**
- *Qué hace:* muestra lo que la IA leyó para que el usuario lo revise/corrija antes de confirmar el guardado. Ya calculaba internamente "¿cuadra el total?" comparando la suma de las líneas + impuestos contra el total impreso en el documento.
- *Cómo funcionaba antes:* el campo de IVA por línea existía como un campo **escondido** del formulario (invisible, aunque nunca tenía datos reales porque la IA no lo leía — ver punto 2). El aviso de "no cuadra" ya asumía en silencio que las líneas eran sin IVA, sin que nadie se lo hubiera pedido explícitamente a la IA — es decir, ya había una inconsistencia latente antes de esta sesión.
- *Pregunta/error que hizo saltar la alarma:* al ir a "simplemente enseñar" el campo escondido, se descubrió que ese campo siempre estaba vacío (ver punto 2) — mostrarlo tal cual no hubiera arreglado nada.
- *Corrección aplicada:* una vez la IA sí devuelve el IVA por línea (punto 2), se cambió el campo de escondido a visible y editable en la pantalla de revisión, con su columna propia.

**4. Guardado — validaciones y protecciones**
- *Qué hace:* guarda el albarán. Bloquea el guardado si algún dato de cabecera (proveedor, número, fechas, importe total) tiene menos del 85% de confianza, para forzar una revisión manual.
- *Cómo funcionaba antes:* ese bloqueo por confianza **solo miraba los 5 campos de cabecera**, nunca la confianza de una línea individual. Una línea (cantidad, precio) mal leída con muy poca confianza se resaltaba en naranja, pero se podía guardar igual sin corregirla. Y ese dato de confianza de línea, una vez guardado, se perdía — no quedaba registrado en la base de datos.
- *Pregunta/error que hizo saltar la alarma:* al preguntarte si quería extender el bloqueo también a nivel de línea (mismo riesgo que el punto 2: alimentar el escandallo con un precio mal leído), **decidiste dejarlo como está** — el resaltado visual es suficiente por ahora, sin añadir más fricción al guardado.
- *Corrección aplicada:* ninguna — decisión consciente de no tocarlo, documentada aquí para que quede constancia de que se evaluó y se descartó a propósito.

**5. Líneas sin precio — "Pendiente de tarificación"**
- *Qué hace:* cuando un albarán llega sin precios (habitual: el precio llega después con la factura), la línea se guarda igual, con las cantidades, y debe quedar marcada como pendiente de tarificar.
- *Cómo funcionaba antes:* se guardaba correctamente sin precio (no bloqueaba nada), pero no había ninguna etiqueta — el importe simplemente aparecía vacío, indistinguible de un error de lectura o de un artículo genuinamente gratis.
- *Pregunta/error que hizo saltar la alarma:* preguntaste explícitamente si existía este estado en la base de datos. La respuesta es que **no existe como estado real guardado** — es una etiqueta que se calcula al mostrar la pantalla ("si no hay precio, escribe este texto"), no una columna en la base de datos.
- *Corrección aplicada:* se añadió la etiqueta visible "Pendiente de tarificación" en el detalle del albarán (escritorio y móvil), en vez de dejar el importe vacío. **Sigue pendiente, sin resolver:** que esa línea se actualice sola cuando llega el precio real (con la factura) — eso pertenece al Paso 2 y no se ha construido todavía. Tampoco se ha convertido en un estado real de base de datos; si el Paso 3 necesita bloquear escandallos por esto de forma fiable, habrá que revisarlo entonces.

**6. Foto defectuosa**
- *Qué hace:* debería avisar o impedir seguir si la foto sale borrosa o mal encuadrada.
- *Cómo funcionaba antes / verificación:* se confirmó que **no existe ninguna comprobación de calidad de imagen** (nitidez, resolución, iluminación) antes de mandar la foto a la IA — no hay ni la herramienta técnica para hacerlo en el proyecto. Solo se valida tamaño de archivo y tipo (jpg/png/pdf). La única protección es posterior: si la IA devuelve poca confianza, se bloquea el guardado (ver punto 4).
- *Pregunta/error que hizo saltar la alarma:* preguntaste explícitamente si había validación de calidad de imagen antes de llamar a la IA.
- *Corrección aplicada:* ninguna — **decisión consciente**: no hace falta el rechazo automático en el momento de la foto, la protección posterior (bloqueo por confianza) es suficiente para este MVP.

**7. Vinculación de cada artículo con la materia prima interna**
- *Qué hace:* cada línea del albarán ("Tomate pera roja") debe asociarse a un ingrediente ya conocido del restaurante ("Tomate pera"), aunque el nombre no sea idéntico (nombres manuscritos, abreviados, o de cada proveedor).
- *Cómo funcionaba antes:* primero busca un texto ya visto antes → lo reutiliza directo (correcto, sin ambigüedad). Si no, compara por similitud de texto contra los artículos ya existentes; si la similitud supera un umbral, **vinculaba automáticamente esa línea al artículo existente y avisaba después** con una notificación de "sugerencia" — se podía deshacer, pero el vínculo ya se había hecho antes de que nadie lo confirmara. Si no encontraba nada parecido, creaba un artículo nuevo, y además lanzaba en segundo plano una segunda comprobación con IA (esta sí, sin vincular sola — solo sugiere).
- *Pregunta/error que hizo saltar la alarma:* preguntaste cómo se comportaba el sistema ante una coincidencia dudosa. Al explicarte que "vinculaba y avisaba después" (no "preguntaba antes"), pediste explícitamente cambiarlo.
- *Corrección aplicada:* ahora, igual que ya hacía el segundo nivel con IA, una coincidencia dudosa (no exacta) **nunca se vincula sola** — la línea se guarda como su propio artículo nuevo, y solo se fusiona con el candidato parecido si el usuario confirma la sugerencia. Se retiró la función `rejectProductAlias` y la acción "reject" de la API porque dejaron de tener sentido: ya no existe el estado de "vinculado por error, sin confirmar" que esa función arreglaba.

**Criterio de "paso terminado":** fotografías un albarán real (por la app o por WhatsApp), ves los datos extraídos en pantalla incluyendo el IVA correctamente separado por línea y como base imponible, las líneas sin precio aparecen marcadas "Pendiente de tarificación", y una coincidencia dudosa de artículo no se vincula sola sin que lo confirmes. **Falta por hacer antes de darlo por cerrado del todo:** probarlo con un albarán real en la app funcionando — todo lo anterior está verificado por código y por tests automáticos, pero no se ha visto todavía funcionando en pantalla con un caso real.

### Paso 2 — Procesamiento y control histórico de precios

**Objetivo:** con cada albarán guardado, saber si un precio ha cambiado y tener organizada la información de productos y proveedores.

| Pieza | Estado |
|---|---|
| Los precios anteriores no se sobrescriben; quedan archivados con fecha | ✅ Ya existe: cada albarán guardado es un registro histórico permanente, el precio "vigente" es simplemente el más reciente |
| Comparación del precio nuevo contra el último precio de ese artículo+proveedor exactos | ✅ Ya existe y funciona así literalmente |
| Alerta visual si el precio cambia más de un % configurable | ✅ Ya existe, umbral configurable (hoy 15% por defecto). **Decisión tomada**: avisa tanto si sube como si baja fuerte (una bajada fuerte también puede ser un error de lectura) |
| Línea "Pendiente de tarificación" (ver Paso 1) | ⚠️ La etiqueta ya se ve (Paso 1), pero falta construir la parte de este paso: cuando llega el precio real (por ejemplo con la factura), que esa línea se actualice sola en vez de quedar pendiente para siempre. **Pendiente de construir.** |
| Productos y proveedores organizados automáticamente a partir de los albaranes | ✅ Ya existe y funciona |
| Evolución de precios (analítica) | ✅ Ya existe, se mantiene como parte natural de "administrar información" |
| Avisos de stock bajo | ❌ **Descartado del MVP.** Existe una tabla y una conexión técnica a medio construir, pero no hay ninguna pantalla donde el restaurante pueda introducir su stock actual o su consumo diario — y un albarán, por sí solo, nunca dice cuánto queda en el almacén. Hacerlo bien exigiría que alguien apuntara stock a mano cada día, lo cual va en contra del objetivo de "cero fricción". Se descarta, no se aparca — no encaja en el pipeline de este MVP tal como está planteado. |

**Criterio de "paso terminado":** al guardar un albarán con un precio distinto al anterior, ves la alerta; al guardar uno con un precio muy parecido, no ves ninguna; las líneas "pendientes de tarificación" se resuelven cuando llega el precio real.

### Paso 3 — Creador de recetas y escandallos dinámicos *(a construir desde cero — no existe nada todavía)*

**Objetivo:** saber, por cada plato, cuánto cuesta de verdad y cuánto margen deja — y que ese cálculo se mantenga siempre al día.

- **Clic 1:** crear un plato nuevo con su nombre comercial.
- **Clic 2:** añadir ingredientes con un buscador predictivo (sobre los productos ya vinculados en el Paso 2), cantidad neta, y merma técnica opcional.
- **Clic 3:** introducir el PVP (precio de venta al público).
- **Cálculo automático:** coste de materia prima por ración, % Food Cost, margen bruto en € — con semáforo verde/ámbar/rojo para saber de un vistazo si el precio de venta es rentable.
- **Bloqueo de seguridad:** si algún ingrediente de la receta está "Pendiente de tarificación" (Paso 1/2), no se puede guardar la receta como definitiva, para no calcular un margen con datos falsos.
- **Actualización en cadena:** cuando cambia el precio de un ingrediente (por un nuevo albarán), se recalculan automáticamente todas las recetas que lo usan, y se muestra en algún sitio visible qué recetas cambiaron y cuánto — para que no sea un cambio invisible.

**Criterio de "paso terminado":** creas una receta real con 3-4 ingredientes, ves el coste/food cost/margen calculados correctamente, y al cambiar el precio de uno de esos ingredientes (subiendo un albarán nuevo), la receta se actualiza sola y lo ves reflejado en algún sitio.

---

## 4. Fuera de alcance del MVP (pospuesto o descartado)

Ya existe código construido y funcionando para varias de estas piezas en `main` — pero no forman parte del pipeline "leer → administrar → escandallar" que define este MVP, así que no se destacan ni se prueban activamente en esta fase.

| Idea | Estado del código | Decisión |
|---|---|---|
| Chat con IA sobre los datos de compra | Completo, funcionando | Pospuesto |
| Resumen semanal generado por IA | Completo, funcionando | Pospuesto |
| Presupuestos mensuales por categoría | Completo, funcionando | Pospuesto — es gestión financiera, no de producto/escandallo |
| Recordatorios de pago de facturas vencidas | Completo, funcionando | Pospuesto — mismo motivo |
| Avisos de stock bajo | A medias, no usable hoy (ver Paso 2) | Descartado del MVP, no solo pospuesto |
| Funcionamiento sin conexión (offline-first) avanzado | Parcial (cola de subida sí existe) | Pospuesto, se revisará si usuarios reales lo piden |
| Auditoría completa con hash (SHA256), cumplimiento HACCP | No existe | Pospuesto hasta tener usuarios reales |
| Gestión multi-proveedor avanzada (mismo ingrediente, varios proveedores a la vez) | Simplificado | Se mantiene simplificado en el MVP |

**Herramientas internas que se mantienen sin más debate** (no las ve el restaurante, no añaden fricción a su flujo): exportar a CSV/Excel, panel de administración interno.

**Sistema de planes de pago (Stripe):**
- El plan gratuito de prueba tenía un límite de 20 albaranes al mes. **Hecho:** se quitó ese límite mientras dure la fase de validación de mercado, para no cortar la prueba a mitad de camino.
- El resto del sistema de cobro (planes, Stripe) se deja tal cual está construido, sin desactivar, pero sin que bloquee ninguna funcionalidad del núcleo (Pasos 1-3) durante esta fase.

---

## 5. Convención técnica acordada

- En el código y en la base de datos, no se usan tildes ni caracteres especiales en nombres (ej. `ALBARAN`, no `ALBARÁN`), para evitar problemas de compatibilidad. Los textos que ve el usuario en pantalla sí llevan tilde con normalidad ("Albarán").

---

## 6. Estado actual

- [x] **Paso 1** — completo a nivel de código: OCR, WhatsApp, IVA por línea (visible y como base imponible), "Pendiente de tarificación" visible, foto defectuosa y confianza por línea revisadas y con decisión tomada, vinculación de artículos corregida para preguntar antes de fusionar. Probado con `pnpm check` + suite de tests (1088 tests, todos en verde). **Pendiente antes de cerrarlo del todo: probarlo con un albarán real en la app funcionando** — todo lo anterior está verificado por código y tests automáticos, no visto en pantalla todavía.
- [x] Cuota de prueba sin límite (20/mes quitado) — hecho y probado.
- [~] **Paso 2** — el flujo base ya existe y funciona (historial de precios, alertas, evolución de precios); queda pendiente la resolución automática de líneas "Pendiente de tarificación" cuando llega el precio real.
- [ ] **Paso 3** — no empezado, se construye desde cero.

*(Cambios de código de esta sesión, en orden, en `mvp-modular-limpio`: `9a55895`, `6b8884a`, `fec4692`, `12524f4`, `f8099d8`, `0089d87`, `36df2a8`. El detalle de cada incidencia encontrada y su resolución está también recogido en `INCIDENCIAS_AUDITORIA.md`, pensado para consultarse si esta rama se fusiona alguna vez con `main`.)*

*(Este documento se debe actualizar según avancen los pasos, marcando lo completado y anotando cualquier decisión importante que se tome por el camino.)*
