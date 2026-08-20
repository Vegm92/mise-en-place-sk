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

**Objetivo:** de una foto (por la app o por WhatsApp) a un dato estructurado, validado, guardado.

| Pieza | Estado |
|---|---|
| Captura fotográfica (cámara/archivo, con cola si no hay conexión) | ✅ Ya existe y funciona |
| Envío del albarán por **WhatsApp** como vía alternativa de entrada | ✅ Ya existe y funciona (webhook con verificación de firma) — **confirmado dentro del MVP** |
| Extracción por IA: proveedor, artículos, cantidades, unidad, precio unitario, importe | ✅ Ya existe y funciona, distingue factura vs. albarán |
| **IVA**, incluidos documentos con **varios tipos de IVA a la vez** (ej. 10% + 21% en el mismo albarán) | ⚠️ Se extrae y se guarda bien por línea, **pero no se muestra en ninguna pantalla de revisión ni de detalle**. **Pendiente de arreglar**: mostrar el IVA leído en la pantalla donde se revisa/edita el albarán, para poder comprobar a simple vista que la IA lo ha leído bien. |
| Línea sin precio → se registra igualmente, con estado **"Pendiente de tarificación"** | ⚠️ Hoy se guarda con el precio vacío, sin etiqueta. **Pendiente de construir**: el estado explícito "Pendiente de tarificación", visible en pantalla. |
| Foto defectuosa | ✅ **Decisión tomada**: no hace falta rechazo automático en el momento de la foto. Basta con lo que ya existe: si la IA tiene menos del 85% de confianza en un dato clave, bloquea el guardado y resalta los campos dudosos para revisión manual. |
| Vinculación inteligente de nombres manuscritos/comerciales a la materia prima interna (fuzzy matching + IA de refuerzo) | ✅ Ya existe y funciona. **Decisión tomada**: se mantiene el uso de IA como segundo nivel, aunque la idea original era "solo texto" — ya demostró que hacía falta. |

**Criterio de "paso terminado":** fotografías un albarán real (por la app o por WhatsApp), ves los datos extraídos en pantalla **incluyendo el IVA correctamente separado por línea**, y las líneas sin precio aparecen marcadas como "Pendiente de tarificación".

### Paso 2 — Procesamiento y control histórico de precios

**Objetivo:** con cada albarán guardado, saber si un precio ha cambiado y tener organizada la información de productos y proveedores.

| Pieza | Estado |
|---|---|
| Los precios anteriores no se sobrescriben; quedan archivados con fecha | ✅ Ya existe: cada albarán guardado es un registro histórico permanente, el precio "vigente" es simplemente el más reciente |
| Comparación del precio nuevo contra el último precio de ese artículo+proveedor exactos | ✅ Ya existe y funciona así literalmente |
| Alerta visual si el precio cambia más de un % configurable | ✅ Ya existe, umbral configurable (hoy 15% por defecto). **Decisión tomada**: avisa tanto si sube como si baja fuerte (una bajada fuerte también puede ser un error de lectura) |
| Línea "Pendiente de tarificación" (ver Paso 1) | Se resuelve aquí: cuando llega el precio real (por ejemplo con la factura), se actualiza esa línea de forma retroactiva. **Pendiente de construir** junto con la etiqueta del Paso 1. |
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

**Pendiente de decidir — sistema de planes de pago (Stripe):**
- El plan gratuito de prueba tenía un límite de 20 albaranes al mes. **Decisión tomada: se quita ese límite mientras dure la fase de validación de mercado**, para no cortar la prueba a mitad de camino.
- El resto del sistema de cobro (planes, Stripe) se deja tal cual está construido, sin desactivar, pero sin que bloquee ninguna funcionalidad del núcleo (Pasos 1-3) durante esta fase.

---

## 5. Convención técnica acordada

- En el código y en la base de datos, no se usan tildes ni caracteres especiales en nombres (ej. `ALBARAN`, no `ALBARÁN`), para evitar problemas de compatibilidad. Los textos que ve el usuario en pantalla sí llevan tilde con normalidad ("Albarán").

---

## 6. Estado actual

- [x] **Paso 1** — el flujo base ya existe y funciona; quedan 2 correcciones pendientes: mostrar el IVA en pantalla, y construir el estado "Pendiente de tarificación".
- [x] **Paso 2** — el flujo base ya existe y funciona; queda pendiente la etiqueta "Pendiente de tarificación" (compartida con el Paso 1) y quitar el límite de 20 albaranes/mes.
- [ ] **Paso 3** — no empezado, se construye desde cero.
- [ ] Ajuste de cuota de Stripe (quitar límite de 20/mes durante la validación).

*(Este documento se debe actualizar según avancen los pasos, marcando lo completado y anotando cualquier decisión importante que se tome por el camino.)*
