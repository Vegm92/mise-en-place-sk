# PROPUESTA MVP — Sistema de Albaranes y Escandallos

**Rama asociada:** `mvp-modular-limpio`
**Fecha:** 2026-08-20
**Estado:** Fase 1 sin empezar (documento de referencia, aún no hay código de esta iniciativa)

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

---

## 1. Objetivo del MVP

Validar, con el mínimo desarrollo posible, si una app que **fotografía un albarán, extrae sus datos automáticamente (OCR) y calcula el coste real de las recetas (escandallos)** aporta valor real a un restaurante independiente español, antes de invertir en las funcionalidades avanzadas (auditoría completa, cumplimiento HACCP, funcionamiento sin conexión, etc.) que sí forman parte de la visión final del producto pero no son necesarias para la primera validación.

La visión completa del producto está documentada en `ESPECIFICACIÓN_APP_ALBARANES_v2.md` (fuera de este repositorio). **Este documento es una versión recortada y reordenada de esa especificación, pensada específicamente para un MVP construible por una sola persona sin experiencia previa programando.**

---

## 2. Reglas de trabajo de esta rama

1. **Fases estrictamente secuenciales.** No se empieza una fase hasta que la anterior está probada y funcionando de verdad (no solo "el código compila", sino "lo he usado y hace lo que tiene que hacer").
2. **Nada de funcionalidades avanzadas por adelantado.** Si algo no es imprescindible para que la fase actual funcione, se anota como pendiente y no se construye todavía (ver sección 4, "Fuera de alcance del MVP").
3. **Todo el trabajo vive en `mvp-modular-limpio`.** No se hace merge a `main` hasta que se decida explícitamente, fase por fase o al final.
4. **Commits frecuentes y explicados**, como puntos de guardado seguros dentro de esta rama.

---

## 3. Las 4 fases — versión MVP

### Fase 1 — Captura y extracción OCR *(la que empezamos ahora)*

**Objetivo:** de una foto de un albarán a un dato estructurado, validado, guardado. Nada más.

- Pantalla con un botón para escanear el albarán (cámara).
- Aviso simple si la foto sale borrosa o mal encuadrada.
- El OCR extrae: proveedor, fecha, y las líneas del albarán (artículo, cantidad, unidad, precio unitario, importe), **separando correctamente el IVA** de cada línea o del total.
- Validación estructural mínima: si faltan datos obligatorios (proveedor, fecha, al menos una línea con cantidad), el albarán queda marcado como "incompleto" y no se da por válido.
- El resultado se guarda tal cual se ha extraído — **sin** intentar todavía relacionarlo con una lista maestra de ingredientes (eso es Fase 2).

**Qué NO incluye esta fase** (aunque el documento original lo mencionaba dentro de "Fase 1"):
- Vinculación automática (fuzzy matching) del nombre del artículo con un ingrediente ya existente. Se guarda el nombre tal cual lo lee el OCR; la vinculación llega en Fase 2.
- Cualquier lógica de precios históricos, alertas de subida de precio, o escandallos.

**Criterio de "fase terminada":** puedes fotografiar un albarán real de un proveedor, ver los datos extraídos en pantalla, y son correctos (incluyendo el IVA separado) en la mayoría de los casos.

### Fase 2 — Vinculación de ingredientes e histórico de precios

- Cada línea del albarán se intenta vincular a un ingrediente ya conocido, por nombre parecido (fuzzy matching simple basado en texto — sin modelos de inteligencia artificial de por medio, eso se valora más adelante si hace falta).
- Si la coincidencia es clara, se vincula sola. Si es dudosa, se pregunta. Si no hay ninguna parecida, se puede crear un ingrediente nuevo.
- Se guarda un histórico simple de precios por ingrediente y proveedor (para saber si ha subido o bajado).
- Alerta simple si un precio sube más de un % configurable.
- Si un albarán llega sin precio en alguna línea, esa línea queda marcada como "pendiente de precio" en vez de asumir 0€.

### Fase 3 — Recetas y escandallos

- Crear una receta añadiendo ingredientes (de los ya vinculados en Fase 2) y sus cantidades.
- Cálculo automático de: coste total, % Food Cost, margen en € y en %, con un código de color simple (verde/ámbar/rojo) para saber de un vistazo si el precio de venta es rentable.
- Si algún ingrediente de la receta está "pendiente de precio" (de Fase 2), no se puede guardar la receta como definitiva — evita calcular un margen con datos falsos.

### Fase 4 — Recálculo cuando cambia un precio

- Cuando el precio de un ingrediente cambia (por un nuevo albarán), se recalculan automáticamente las recetas que lo usan.
- Se muestra en algún sitio visible (ej. un panel o lista) qué recetas han cambiado y cuánto, para que no sea un cambio invisible.

---

## 4. Fuera de alcance del MVP (pospuesto, no descartado)

Estas ideas del documento original son buenas y quedan documentadas para el futuro, pero **no se construyen en esta rama** porque añaden mucha complejidad antes de saber si el MVP básico funciona:

| Idea pospuesta | Por qué se pospone |
|---|---|
| **Funcionamiento sin conexión (offline-first) con sincronización** | Es, con diferencia, lo más complejo técnicamente de todo el documento original — más que el propio OCR. Se revisará si usuarios reales lo piden explícitamente. |
| **Auditoría completa con hash (SHA256) en cada cambio, cumplimiento HACCP** | Tiene sentido como diferenciador comercial más adelante, pero implica tocar cada punto de guardado de la app desde el primer día. Se pospone hasta tener usuarios reales. |
| **Matching por inteligencia artificial (embeddings/sentence-transformers)** | Para el MVP basta con una comparación de texto simple. Se valorará IA solo si el matching simple no da buenos resultados. |
| **Gestión multi-proveedor avanzada (mismo ingrediente con varios proveedores a la vez)** | Se simplifica en el MVP: un ingrediente-proveedor es una combinación única, sin lógica avanzada de "proveedor sugerido" todavía. |

---

## 5. Convención técnica acordada

- En el código y en la base de datos, no se usan tildes ni caracteres especiales en nombres (ej. `ALBARAN`, no `ALBARÁN`), para evitar problemas de compatibilidad. Los textos que ve el usuario en pantalla sí llevan tilde con normalidad ("Albarán").

---

## 6. Estado actual

- [ ] Fase 1 — en preparación, sin código todavía.
- [ ] Fase 2
- [ ] Fase 3
- [ ] Fase 4

*(Este documento se debe actualizar según avancen las fases, marcando lo completado y anotando cualquier decisión importante que se tome por el camino.)*
