---
tags: [mep, onboarding, marketing]
related: "[[CONTEXT]]"
---

# Bitácora de sesiones con Claude

Registro cronológico de las conversaciones de marketing con Claude. Sirve para
que cualquier sesión nueva arranque sabiendo qué se ha hablado, qué se decidió
y qué queda pendiente — sin tener que reexplicar nada.

## Cómo usarla

Al empezar una sesión, dile a Claude:

> Lee `docs/onboarding/marketing/07_con_claude/bitacora_de_sesiones.md` antes
> de nada.

Al terminar una sesión con algo que valga la pena, añade una entrada nueva
**arriba del todo** (la más reciente primero). Mismo criterio que el resto de
la carpeta: lo bueno se queda escrito, no en el chat.

## Sesiones

### 2026-08-17 — Propuesta de navegación v2 del MVP (Resumen · Facturas · Compras)

**Qué se trabajó:**

- Paula planteó que la interfaz actual le parece confusa y poco
  diferenciadora, y propuso cortar el sidebar de 8 secciones (Dashboard,
  Facturas, Proveedores, Productos, Análisis, Presupuestos, Recordatorios,
  Resumen semanal, Chat) a 3.
- Se contrastó la propuesta contra el código real, no a ciegas: `+layout.svelte`,
  `MobileTabBar.svelte`, `ChatFab.svelte`, `DesktopDashboard.svelte`,
  `NotificationBell.svelte`, `billing-plans.ts` y `AGENTS.md`.
- Se cerraron los huecos de la v1 (destino de los KPIs del dashboard viejo,
  formato del digest semanal, versión mobile de Facturas, solapamiento entre
  la bandeja de excepciones y las alertas de Resumen, casa de Presupuestos) y
  se entregó una estructura final bajo el criterio "máxima información con la
  mayor simplicidad": cada pantalla contesta una sola pregunta, ningún dato
  vive en dos sitios a la vez.

**Estructura final:**

```
Sidebar (3): Resumen · Facturas · Compras
Resumen    → alertas por color (🔴🟠⚪) + tarjeta del digest semanal
             reescrita como 3-4 puntos accionables (mismo formato que las
             alertas, no un párrafo aparte). Sin KPIs ni gráficos.
Facturas   → documento original / datos extraídos (lado a lado en desktop,
             toggle segmentado en mobile). Bandeja de excepciones acotada
             solo a problemas de extracción. Onboarding integrado como
             estado vacío (la ruta /onboarding desaparece).
Compras    → sub-tabs: Vista general (aquí aterrizan los KPIs de gasto que
             salieron de Resumen) · Proveedores · Productos · Comparativa ·
             Presupuestos (opcional).
Asistente  → deja de ser ruta/pestaña; overlay flotante global (ChatFab).
```

**Hallazgos y estado:**

- Confirmado en `billing-plans.ts`: Presupuestos no es una feature de plan
  de pago hoy (no aparece en `MatrixFeatures`) — puede vivir como toggle
  libre dentro de Compras, sin lógica de billing.
- `NotificationBell.svelte` en el header duplica hoy la bandeja de alertas
  (dropdown propio con lista y descarte) que pasa a ser responsabilidad
  única de Resumen — hay que colapsarlo a un badge sin contenido propio.
- `/chat` sigue siendo ruta y pestaña de sidebar a la vez que existe
  `ChatFab` como overlay flotante — dos entradas al mismo asistente,
  redundancia real ya en producción, no solo propuesta a futuro.
- Victor considera necesario el dashboard con KPIs; Paula lo ve complicado
  e impráctico. No es un desacuerdo real de fondo: el dashboard actual
  mezcla dos preguntas distintas en una pantalla ("¿qué necesita mi
  atención hoy?" vs. "¿cómo voy este mes?"). La estructura final ya separa
  ambas — alertas en Resumen, KPIs en Compras → Vista general — sin que
  ninguno de los dos ceda información.
- "Aprender de las decisiones del usuario" (dismissals, umbrales tipo "no
  avisarme de <5%") queda fuera de este cambio a propósito — es una
  feature de producto con estado persistente, se especifica aparte.

**Para la próxima sesión:**

- Llevar la estructura final a wireframes.
- Decidir con Victor si el digest semanal se reescribe en el backend como
  puntos accionables (cambio de contenido, no solo de UI) o si solo cambia
  la presentación.
- Clasificar el trabajo de implementación por nivel (`docs/07_ai/change_protocol.md`):
  la fusión de Proveedores/Productos/Análisis/Presupuestos en Compras toca
  varias rutas existentes y probablemente sea Level 3+, necesita plan
  explícito antes de tocar código.

### 2026-08-16 — Análisis de competencia en Barcelona (método + hallazgos)

**Qué se trabajó:**

- Se ejecutó el "trabajo pendiente" que dejó abierto la sesión del 14-08 en
  [[docs/onboarding/marketing/01_estrategia/competencia|competencia.md]]:
  ficha real por competidor, precios reales, cómo se publicitan.
- Se definió un método fijo de ficha (8 puntos) para repetir con cualquier
  competidor nuevo que aparezca.
- Se investigaron a fondo Haddock, Kitchen Stocker (fichaje nuevo) y Gstock;
  de forma más ligera Yurest, MarketMan, Apicbase (nuevo), Cuiner y el grupo
  contable (Holded, Quipu, Billin, Dext).
- Todo el detalle vive en
  [[docs/onboarding/marketing/01_estrategia/analisis_competencia_bcn|Análisis
  de competencia en Barcelona]]; `competencia.md` se actualizó con el resumen
  y el checklist de trabajo pendiente.

**Hallazgos y estado:**

- Haddock ya publica precio (Growth 85 €/mes, Premium 120 €/mes) y tiene
  reseñas razonables (Trustpilot 4,2/5) — el dato antiguo de "precio opaco,
  ~3,9" queda desactualizado. A cambio, se ha ampliado a suite (RRHH, TPV,
  IA): más superficie, menos foco, que sigue siendo nuestro hueco de mensaje.
- **Kitchen Stocker** es un fichaje nuevo que no estaba en el mapa: autoservicio
  real (como nosotros), OCR de facturas, precio público (99 €/mes). Rompe el
  argumento de que "alta sola sin comercial" nos diferencia solos. Su foco
  sigue siendo inventario/merma, no precio por ingrediente — ahí seguimos
  teniendo hueco.
- Ningún competidor de los ocho revisados comunica la regla de "si la máquina
  duda, no se guarda sin confirmar". Es el hueco de confianza más claro y el
  que más va a pesar según haya más competidores parecidos en el mercado.
- Se propuso un dolor específico y una propuesta de valor más afiladas (ver
  el documento a fondo) y una sexta pregunta para las conversaciones de
  validación, que se suma a las cinco de
  [[docs/onboarding/marketing/02_audiencia/segmentos_y_personas|segmentos_y_personas.md]].
- Se tradujeron los gaps a 7 principios esquemáticos para la interfaz del
  MVP (la foto como portada, precio por ingrediente en la línea, verde/ámbar/
  rojo visible, WhatsApp como puerta de entrada, nada de módulos ajenos).

**Límite de esta sesión:**

- No hubo navegador disponible, así que no hay capturas de pantalla reales de
  ninguna web competidora — el análisis sale de leer su contenido y
  estructura, no de verlas. Queda en el trabajo pendiente.

**Para la próxima sesión:**

Sigue en pie lo que ya marcaba la sesión del 14-08 (perfilar cliente y dolor,
las 10-15 conversaciones, medición de OCR de Victor, one-pager). Añadido hoy:
0) capturas reales de Haddock/Kitchen Stocker/Gstock, 1) probar Kitchen
Stocker como usuario real (mistery shopper) para ver su onboarding de
verdad, 2) llevar la sexta pregunta a las conversaciones y anotar la
respuesta aparte, 3) confirmar con Victor si integración TPV es un no-goal
deliberado o un hueco a cerrar.

### 2026-08-14 — Primera revisión del resumen de producto y creación de la carpeta de incidencias

**Qué se trabajó:**

- Paula ha decidido entrar en Mise en Place, el proyecto de su hermano
  Victor — no lo compagina con una idea de SaaS propia en paralelo.
- Se revisó el resumen de producto (captura de factura por foto/WhatsApp →
  extracción con Gemini → confirmación → analítica de gasto, alertas,
  presupuestos, chat).
- Se verificaron contra fuentes externas los datos regulatorios que cita el
  proyecto (VERI\*FACTU y factura electrónica B2B / Ley Crea y Crece).
- Se descubrió que `docs/onboarding/marketing/` ya tenía un manual completo:
  posicionamiento, mensajes, audiencias, reglas inquebrantables, MDR-001.
- Se creó `08_incidencias/` para registrar cosas a revisar que todavía no son
  decisiones.

**Reparto de tareas para el MVP de validación:**

*Lo que le incumbe a Paula:*

- Perfilar el cliente y el dolor exacto que ataca el producto — todavía no
  está definido con precisión. Paso previo a cualquier branding, aunque sea
  mínimo.
- Branding mínimo: nombre + logo simple, y un one-pager o tarjeta para dejar
  tras la visita. Nada de identidad visual completa todavía — eso se hace
  después de validar, no antes.
- Un único precio de referencia para las conversaciones: usar la respuesta ya
  escrita en `02_audiencia/objeciones.md` ("durante el acceso anticipado,
  gratis") y el argumento de valor ya calculado (recuperar 1 % del gasto en
  un restaurante que compra 15.000 €/mes son 150 €/mes).
- Llevar memorizada la respuesta a la objeción de competencia ("ya se lo
  mando a mi gestor" / comparación con Holded): "ellos se quedan en la
  cabecera de la factura, nosotros bajamos al precio por ingrediente."
- Ejecutar las 10-15 conversaciones de validación con las 5 preguntas de
  `02_audiencia/segmentos_y_personas.md`.

*Lo que debe hacer Victor:*

- Un flujo de demo que funcione de verdad en el móvil (foto → extracción →
  confirmación) con datos reales — sin esto no hay validación posible.
- Medir la precisión real del OCR sobre un lote de facturas reales de cocina
  (manuscritas, arrugadas, foto mala), no sobre facturas de ejemplo — es la
  prueba que falta en `01_estrategia/mensajes.md`.

**Hallazgos y estado:**

- Por bien desarrollado que esté el producto a nivel técnico, todavía no hay
  un cliente claro establecido ni se ha aplicado mentalidad de negocio: no se
  define con precisión a qué dolor ataca. Es trabajo de Paula y Victor
  perfilar esto antes de avanzar con el branding mínimo.
- VERI\*FACTU (2027) — confirmado correcto, ya bien gestionado en
  [[docs/onboarding/marketing/06_decisiones/MDR-001-no-comunicamos-cumplimiento-verifactu|MDR-001]].
- Frontera con contabilidad, y quién captura la factura vs quién decide — ya
  resuelto en `01_estrategia/` y `02_audiencia/`. No hace falta reabrirlo.
- [[docs/onboarding/marketing/08_incidencias/INC-001-fecha-factura-electronica-b2b-sin-confirmar|INC-001]]
  — la fecha "2027-2028" de la factura electrónica B2B no está confirmada.
  Abierta.
- [[docs/onboarding/marketing/08_incidencias/INC-002-prevision-stock-bajo-sin-base-de-datos|INC-002]]
  — "previsión de stock bajo" no tiene datos que la sostengan (no hay
  integración con TPV). Abierta.

**Para la próxima sesión:**

El objetivo ya no es "arrancar con el plan de marketing" directamente — es
validación primero. Retomar por: 0) si se ha perfilado ya el cliente y el
dolor exacto que ataca el producto (paso previo al branding mínimo), 1) si ya
se hicieron las 10-15 conversaciones con dueños-chef y qué salió (tasa de
vuelta espontánea la semana 2), 2) qué dio la medición de precisión del OCR
sobre facturas reales, y 3) si se preparó el one-pager y el precio único de
referencia. El plan de marketing (y cerrar INC-001 e INC-002) se escribe
después, con esos datos en la mano.

## Relacionado

- [[docs/onboarding/marketing/08_incidencias/README|Incidencias y cosas a revisar]]
- [[docs/onboarding/marketing/06_decisiones/README|Decisiones de marketing (MDR)]]
- [[docs/onboarding/marketing/07_con_claude/flujo_de_trabajo|Cómo trabajar con Claude aquí]]
