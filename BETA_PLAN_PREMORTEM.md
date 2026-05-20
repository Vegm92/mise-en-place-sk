# Plan de Beta: 10 Restaurantes en Barcelona en 30 Días + Premortem

**Fecha:** Mayo 2026  
**Contexto:** Solo developer, producto funcionando (extracción Gemini ~30s), sin equipo, sin financiación externa

---

# DOCUMENTO 1: Plan de Acción — 10 Restaurantes Beta

## 1. Checklist de Producto antes de la Primera Demo

**Ya listo para mostrar:**
- Upload de facturas + extracción Gemini (~30s)
- Formulario de revisión editable
- Alertas de subida de precio
- Dashboard KPIs + gasto por proveedor
- Lista de facturas + exportación CSV
- Analytics de gasto + tendencias de precio
- Gestión de presupuestos
- Recordatorios de pago

**Fixes de 1–2 días antes de la primera demo:**

| Fix | Esfuerzo | Por qué importa |
|---|---|---|
| Creación manual de cuentas desde admin panel | 1 día | No puedes estar presente en cada onboarding |
| Cuenta demo con datos realistas | 0.5 días | Un DB vacío mata la demo. Pre-cargar 3 meses de facturas de un restaurante ficticio barcelonés (Makro, Dibaq, pescadería local) |
| Upload flow responsive en móvil | 1 día | Lo primero que harán es abrirlo en el iPhone |
| Mensaje de error cuando la extracción falla | 0.5 días | Un spinner que no resuelve sin feedback mata la demo |
| Auditoría de UI en español | 0.5 días | "Submit", "Dashboard", "Upload" en inglés genera desconfianza inmediata |

**No construir antes de la beta:**
- Escandallos (anunciar fecha, no construir aún)
- Conciliación albarán-factura
- Integraciones TPV
- Signup público self-serve

**Total trabajo pre-beta: 3–4 días.**

---

## 2. Perfil del Restaurante Ideal

**El beta ideal:**
- Tipo: casual dining o gastrobar, 30–80 cubiertos
- Tamaño: 1–2 locales (grupos multi-local = decisiones lentas)
- Volumen de facturas: 15–40 facturas de proveedor por semana
- Proveedores: mix de Makro/Metro + especialistas locales
- Tech: usa WhatsApp en el móvil, tiene una hoja de cálculo o Notion
- Dolor actual: facturas en una caja de cartón que recoge el gestor, o introducción manual en Excel

**Abordar primero:**
- Restaurantes independientes (no cadenas)
- Propietarios que publican en Instagram sobre subida de costes
- Donde el dueño está presente en el local

**Evitar:**
- Hoteles (procurement centralizado, meses de decisión)
- Franquicias (no pueden cambiar sistemas)
- Restaurantes recién abiertos (<3 meses)
- Usuarios actuales de Haddock contentos (coste de cambio alto)
- Fine dining / Michelin (piden NDAs, sensibles a datos)

---

## 3. Canales de Captación — Barcelona Específico

**Presencial (mayor conversión — hacer esto primero):**

- **Mercabarna (martes–jueves, 4am–8am):** Compradores y chefs pensando en facturas y precios en tiempo real. Llevar una hoja impresa de una cara. Canal más auténtico.
- **Eixample / Gràcia, cold visits 10am–12pm:** Entre desayuno y mise en place. Pedir directamente por el encargado o propietario, no el camarero.
- **Zona Sant Antoni:** Alta densidad de gastrobares modernos con dueños presentes por las mañanas.

**Asociaciones:**
- **Gremi de Restauració de Barcelona** (gremirestauracio.cat, ~2.000 socios): Pedir aparecer en su newsletter o presentar en un evento formativo. Angle: "herramienta gratuita para socios durante 3 meses."
- **FEHB (Federación Española de Hostelería, delegación Barcelona):** Sesiones de formación en herramientas digitales — pedir slot para demo.

**Online — específico:**
- **Facebook "Restaurantes Barcelona - Propietarios y Gestores":** Primero hacer una pregunta genuina ("¿cómo gestionáis las facturas de proveedores?"), luego mencionar la herramienta 3–4 días después.
- **LinkedIn:** Buscar "propietario restaurante Barcelona" + "chef ejecutivo Barcelona". Mensaje de conexión corto, sin pitch.
- **Instagram:** DM a cuentas de 500–5k seguidores que hayan publicado sobre subida de costes. Evitar cuentas >10k (spam masivo).

**Red caliente:**
- Tu gestor, contable o cualquier contacto que trabaje con restaurantes conoce 5 restauradores. Un warm intro vale 50 mensajes fríos.

---

## 4. El Pitch

**WhatsApp frío:**
> Hola [Nombre], soy [tu nombre], estoy construyendo una herramienta para restaurantes en Barcelona. Sube una factura de proveedor y en 30 segundos tienes todos los datos extraídos y guardados — sin teclear nada. Busco 10 restaurantes para probarlo gratis este mes. ¿Te viene bien hablar 15 minutos esta semana?

No añadir más. No enviar enlace. Esperar respuesta.

**En persona:**
> "Vengo a hablar con el propietario — tengo una herramienta para que no tengáis que introducir las facturas de proveedores a mano. Tarda 30 segundos. ¿Tienes una factura de Makro aquí? Te lo enseño ahora mismo."

**Si conocen Haddock:**
> "¿Conoces Haddock? Similar idea, pero ellos tardan 48 horas en procesar una factura — nosotros 30 segundos. Y ahora mismo es completamente gratis para beta."

No atacar a Haddock. Solo enunciar la diferencia como un hecho.

**Si preguntan por escandallos:**
> "Está en el roadmap — septiembre. Por ahora resuelve la entrada de datos y las alertas de precios. Muchos restaurantes ya ahorran con solo eso."

**Pregunta diagnóstico (antes del pitch, para cualificar):**
> "¿Cuánto tiempo tardáis en introducir las facturas de la semana en vuestro sistema?"

Dejar que calculen en voz alta. Luego: "Esto lo hace en 30 segundos."

---

## 5. La Oferta

**Lo que das:**
- 6 meses gratis (no 3 — tiene que cubrir el lanzamiento de escandallos)
- Onboarding white-glove: tú importas personalmente sus últimas 20 facturas el día 1
- Línea de WhatsApp directa contigo para soporte
- Acceso prioritario a escandallos cuando lance
- Check-in mensual de 30 minutos (por tu iniciativa, no la suya)

**Lo que pides:**
- Usar la herramienta con al menos 3 facturas reales por semana
- Una sesión de feedback de 45 minutos en la semana 4
- Permiso para usar sus datos anonimizados para mejorar el producto
- Un testimonio si les gusta (pedirlo explícitamente desde el inicio)
- Disponibilidad como referencia para futuros clientes

**Lo que te comprometes a hacer:**
- Sus datos de factura no se comparten con nadie ni se usan para entrenamiento sin consentimiento
- Cualquier error de extracción corregido en 24 horas
- Si la herramienta cae >2 horas en horario laboral, introduces sus facturas manualmente
- No cobrar hasta 30 días después de que lancen los escandallos

**Cómo enmarcar el trato:**
> "Yo te doy la herramienta gratis 6 meses y soporte directo. A cambio te pido que la uses de verdad y me digas qué falla. Es un trato entre personas, no un contrato."

---

## 6. Onboarding — Primeras 48 Horas

**Hora 0 (dicen que sí):**
- Crear su cuenta desde el panel de admin
- Enviar WhatsApp con credenciales + vídeo Loom de 2 minutos del flujo de upload
- NO enviar un párrafo de texto

**Horas 1–4:**
- Pedirles que te manden 5 facturas recientes por WhatsApp
- Tú las subes, revisas extracciones, corriges errores
- Les mandas captura: "Mira, esto es lo que tienes ahora en el sistema"

**Horas 4–24:**
- Google Meet de 20 minutos o llamada con pantalla compartida
- Flujo: cómo subir, cómo leer el dashboard, qué significa la alerta de precio
- Responder la pregunta que siempre harán: "¿Esto es seguro? ¿Quién ve mis facturas?"

**Horas 24–48:**
- Suben su primera factura solos
- Tú lo monitorizas y les escribes proactivamente: "Vi que subiste la factura de [proveedor] — ¿salió bien?"

**Final semana 1:**
> "Esta semana procesaste X facturas, detectamos una subida de precio en [producto]. ¿Todo bien?"

Este mensaje crea el hábito. Hacerlo manualmente para todos los beta.

---

## 7. Timeline Semana a Semana

**Días 1–7: Preparar y primeros contactos**
- Días 1–3: 4 fixes pre-beta + cuenta demo con datos realistas. Practicar la demo hasta que dure <5 minutos de principio a fin
- Día 4: Primera ronda presencial Eixample + Gràcia. Meta: 10 conversaciones, 3 interesados
- Día 5: Posts en grupos de Facebook + 20 conexiones LinkedIn
- Día 6: Contactar Gremi de Restauració para newsletter
- Día 7: Follow-up de días 4–5. Primeras 2–3 demos agendadas

**Meta fin semana 1:** 3 demos agendadas, 1 restaurante onboarded

**Días 8–14: Primeros onboardings + iterar el pitch**
- Días 8–10: Demos agendadas. Empezar con la extracción en vivo de UNA factura suya, no el dashboard. El wow tiene que llegar en el minuto 2
- Día 11: Ajustar pitch según las objeciones que salieron
- Días 12–13: Segunda ronda presencial Sant Antoni + Poblenou
- Día 14: Visita Mercabarna (arrancar a las 4am)

**Meta fin semana 2:** 4–5 restaurantes onboarded

**Días 15–21: Escalar captación, proteger usuarios iniciales**
- Día 15: Check-in semanal con todos los onboarded. Proactivo, no reactivo
- Días 16–17: Pedir a los primeros usuarios si refieren a alguien. Un warm intro por restaurante = 10 leads más
- Día 18: Follow-up de todos los leads abiertos de semanas 1–2
- Días 19–20: Contactar FEHB sobre próximos eventos de formación
- Día 21: Auditoría: ¿cuáles restaurantes están subiendo facturas de verdad? Doblar lo que funciona en el pitch

**Meta fin semana 3:** 7–8 restaurantes onboarded

**Días 22–30: Cerrar los 10, empezar a aprender**
- Días 22–24: Último push de captación. Usar testimonios/datos de los primeros usuarios
- Día 25: Primera sesión de feedback formal con los usuarios de la semana 1
- Días 26–28: Corregir los 3 problemas principales que salgan en el feedback
- Día 29: Documentar qué funcionó en captación y qué no
- Día 30: Revisar engagement real. Identificar cuáles de los 10 están comprometidos vs. tolerando educadamente

---

## 8. Métricas de Éxito

**Un restaurante beta "exitoso" a día 30:**
- Ha subido al menos 8–10 facturas reales (no solo probado una vez)
- Ha visto al menos 1 alerta de precio dispararse sobre datos reales
- Ha entrado por iniciativa propia al menos 3 veces (no solo cuando tú has avisado)
- Puede explicarle a alguien qué hace la herramienta en una frase
- No ha pedido parar de usarla

**Señales de éxito a nivel beta:**
- 6 de 10 restaurantes cumplen el umbral anterior
- Al menos 2 comentarios positivos no solicitados
- Al menos 1 restaurante dispuesto a ser referencia
- Precisión de extracción >90% sobre todas las facturas
- Cero restaurantes perdidos por fallos técnicos

**Señales de alarma que anulan el contador de "10 restaurantes":**
- Todos usan el producto porque tú los empujas, no porque resuelve un problema
- Nadie ha visto una alerta de precio (volumen muy bajo o umbral mal calibrado)
- Estás corrigiendo manualmente más del 20% de las extracciones

---

---

# DOCUMENTO 2: Premortem

*Asume que estamos en el Día 60 y el beta ha fallado. Cero restaurantes usan el producto activamente. Aquí están todos los caminos realistas hasta ese resultado.*

---

## Categoría 1: Fallos de Producto

### Precisión de extracción demasiado baja para facturas reales
- **Qué falló:** Gemini no lee bien las facturas reales — productos incorrectos, cantidades erróneas, unidades equivocadas. El usuario corrige demasiado y deja de confiar
- **Por qué:** Las facturas españolas son muy variadas. Makro es estructurada; el proveedor de pescado local es manuscrita o escaneo de baja calidad
- **Probabilidad:** 🔴 Alta
- **Mitigación:** Antes de la primera demo, recopilar 30+ facturas reales españolas de proveedores variados y testear. Si la precisión es <85%, no empezar el beta
- **Señal de detección:** Cualquier restaurante que corrija más de 2 campos por factura en su primera semana. Loguear las diferencias entre extracción y versión guardada

### El flow de upload se rompe con archivos reales
- **Qué falló:** Los restaurantes suben fotos de iPhone (HEIC, 6MB, rotadas). La app cuelga, devuelve extracción vacía o no termina
- **Por qué:** En desarrollo se usaron PDFs limpios. Los archivos reales son HEIC, JPEGs rotados, PDFs multipágina de impresoras antiguas
- **Probabilidad:** 🔴 Alta
- **Mitigación:** Testear con HEIC, JPEGs rotados, PDFs multipágina hasta 20 páginas y archivos >5MB antes del beta. Añadir validación client-side con mensajes útiles y timeout con botón de reintento
- **Señal de detección:** Cualquier upload sin registro en DB después de 5 minutos

### Las alertas de precio disparan demasiados falsos positivos
- **Qué falló:** El umbral del 15% se activa por fluctuaciones estacionales, cambios de unidad o errores de extracción. Los restaurantes ignoran las alertas y luego ignoran el producto
- **Probabilidad:** 🟡 Media
- **Mitigación:** Revisar manualmente cada alerta que se dispare en la semana 1. Si >30% son falsos positivos, ajustar el umbral o añadir verificación de consistencia de unidades
- **Señal de detección:** Un restaurante pregunta "¿por qué me avisa tanto?" o descarta alertas sin actuar

---

## Categoría 2: Fallos de Captación

### No se puede llegar al dueño
- **Qué falló:** Visitas presenciales bloqueadas por camareros o encargados. Nunca se habla con un decisor
- **Por qué:** Los restaurantes son caóticos. Durante el servicio es terrible. Fuera del servicio, los dueños suelen no estar
- **Probabilidad:** 🔴 Alta
- **Mitigación:** Ir de 10am a 12pm lunes o martes. Buscar el nombre del propietario en Google Maps/LinkedIn antes de ir. La ruta Mercabarna evita este problema — les pillas en contexto de compra
- **Señal de detección:** Si en 20 visitas frías hablas con menos de 8 propietarios, el canal no funciona. Pivotear a warm intros antes

### Target equivocado — volumen de facturas insuficiente
- **Qué falló:** Se seleccionan bares de tapas o cafeterías con 5–10 facturas por semana. El dolor no es suficiente para cambiar de comportamiento
- **Probabilidad:** 🟡 Media
- **Mitigación:** Preguntar temprano en el pitch: "¿Cuántas facturas de proveedor recibís a la semana?" Si la respuesta es <10, ser honesto sobre si merece la pena el onboarding
- **Señal de detección:** Restaurantes onboarded en semana 1 con menos de 10 facturas subidas en 14 días

### El pitch no conecta — no reconocen el dolor
- **Qué falló:** Describir la herramienta y la respuesta es "bueno, ya lo llevamos nosotros, no está mal." El dolor es real pero latente — lo han normalizado
- **Probabilidad:** 🟡 Media
- **Mitigación:** Empezar con pregunta diagnóstico, no con pitch: "¿Cuánto tiempo tardáis en introducir las facturas de la semana?" Dejar que calculen. Luego: "Esto lo hace en 30 segundos"
- **Señal de detección:** En 5+ demos, nadie dice "sí, eso es exactamente lo que nos pasa." Reescribir el opener

---

## Categoría 3: Fallos de Engagement

### Primera extracción con errores → abandono permanente
- **Qué falló:** La primera extracción es del 80%. El usuario corrige 3 campos. Piensa "esto no funciona bien" y no vuelve
- **Por qué:** La primera impresión en herramientas de IA es sticky. Una mala experiencia crea la etiqueta "no es fiable" muy difícil de quitar
- **Probabilidad:** 🔴 Alta
- **Mitigación:** Para usuarios beta, monitorizar cada extracción en la primera semana. Si hay errores en la DB antes de que los vean, corregirlos o avisar proactivamente: "Vi un pequeño error en la extracción de [proveedor] — ya lo he corregido, revísalo"
- **Señal de detección:** Usuario que entra una vez y no vuelve. Visible en datos de sesión en 48 horas

### No se forma el hábito — la herramienta queda olvidada
- **Qué falló:** Usaron la herramienta una o dos veces. Funcionó. Pero las facturas siguen acumulándose en el sistema anterior
- **Por qué:** El cambio de comportamiento requiere un trigger. El trigger (recibir una factura) ocurre durante la entrega, lejos del ordenador. Si la herramienta no está en la mano en ese momento, queda fuera de la mente
- **Probabilidad:** 🔴 Alta
- **Mitigación:** El WhatsApp de check-in al final de la semana 1 es crítico. Preguntar: "¿Cuándo recibes las facturas normalmente?" y sincronizar los mensajes con ese momento durante las 2 primeras semanas
- **Señal de detección:** Sin uploads en ninguna ventana de 5 días en el primer mes

### El dashboard no genera "wow" en la semana 2
- **Qué falló:** Después de subir facturas, el usuario mira el dashboard y ve KPIs vagos que no sabe cómo usar. Sin momento aha
- **Probabilidad:** 🟡 Media
- **Mitigación:** En el check-in de semana 2, narrar activamente el dashboard: "Mira, tu gasto en proteínas ha subido un 12% este mes vs el anterior — esto es la factura de [proveedor] del martes"
- **Señal de detección:** En la llamada de semana 2 dicen "sí, lo vi, pero no sé muy bien qué significa"

---

## Categoría 4: Fallos de Confianza

### No quieren dar sus datos de factura a un desconocido
- **Qué falló:** El restaurador pregunta "¿y mis facturas dónde se guardan? ¿quién las ve?" Sin respuesta clara y confiada, no comparten datos comercialmente sensibles
- **Por qué:** Los datos de factura revelan proveedores, precios negociados, volumen de compra — información que competidores o proveedores podrían aprovechar
- **Probabilidad:** 🟡 Media
- **Mitigación:** Preparar un párrafo en lenguaje llano (no política de privacidad legal) enviable por WhatsApp. Datos alojados en la UE, no compartidos, no usados para entrenar modelos. Tener respuesta para "¿y si la empresa cierra?" (exportación + borrado)
- **Señal de detección:** Si aparece una pregunta sobre datos en >40% de las demos, abordarlo proactivamente en el pitch

### Un solo developer no es creíble para datos críticos de negocio
- **Qué falló:** Al restaurador le gusta el producto pero pregunta por soporte, uptime y qué pasa si desapareces. No puedes dar respuestas de nivel enterprise. Van con Haddock ("por lo menos son una empresa")
- **Probabilidad:** 🟡 Media
- **Mitigación:** Ser honesto sobre ser solo, pero con respuestas concretas: backups automáticos diarios, monitorización de uptime (UptimeRobot, gratis, 10 minutos de setup), botón de exportación de datos. El framing "soy solo así que hablas directamente con el founder, no con un ticket de soporte" es genuinamente una ventaja
- **Señal de detección:** Cualquier pregunta "¿sois una empresa grande?" en demos

---

## Categoría 5: Fallos de Timing

### Los restaurantes están demasiado ocupados en la rampa de verano (junio–agosto)
- **Qué falló:** En junio entran en temporada alta. Los propietarios no tienen ancho de banda mental para nuevas herramientas. Dicen que sí en semana 1 y desaparecen en semanas 2–4
- **Probabilidad:** 🟡 Media
- **Mitigación:** Arrancar agresivamente ahora (mayo) — el plan de 30 días tiene que terminar antes de mediados de junio. Alternativamente, hacer una fase de "lista de interés" en verano y onboarding real en septiembre
- **Señal de detección:** La tasa demo-to-use cae después del 10 de junio

---

## Categoría 6: Fallos Competitivos

### El restaurante ya usa Haddock y está contento
- **Qué falló:** Pitchas y dicen "ya usamos Haddock, funciona bien." El coste de cambio es mayor que el beneficio
- **Probabilidad:** 🟡 Media
- **Mitigación:** No intentar desplazar usuarios contentos de Haddock. Pregunta cualificadora temprana: "¿Usáis ya alguna herramienta para las facturas?" Si dicen Haddock y se quejan de las 48 horas, ahí está la apertura
- **Señal de detección:** Más de 3 de 10 primeros contactos son usuarios activos de Haddock

### La hoja de cálculo + WhatsApp "ya funciona bastante bien"
- **Qué falló:** Tienen un sistema funcional — el gestor recoge facturas el viernes, reenvían mensajes de proveedores manualmente. No es bueno pero es conocido. El coste de cambio > el coste del status quo
- **Probabilidad:** 🔴 Alta
- **Mitigación:** No pitchear el producto — pitchear el coste del status quo. "¿Cuánto tiempo dedica alguien a introducir facturas a la semana? ¿3 horas? A €15/hora son €50 a la semana, €200 al mes. La herramienta cuesta cero durante el beta." El framing como recuperación de coste es más convincente que comparar features
- **Señal de detección:** La objeción no es "vuestra herramienta no es buena" sino "ya nos arreglamos". Requiere un pitch diferente, no un producto diferente

---

## Categoría 7: Fallos de Ejecución Solo Developer

### La carga de soporte consume todo el tiempo de desarrollo
- **Qué falló:** 10 restaurantes beta generan 10 conversaciones de WhatsApp al día. Corrigiendo extracciones, respondiendo preguntas, haciendo workarounds manuales. Los escandallos nunca se construyen. Los restaurantes hacen churn en el mes 3 porque la feature prometida no llega
- **Probabilidad:** 🔴 Alta
- **Mitigación:** Crear un FAQ simple en Notion desde el día 1 y enviarlo a cada nuevo usuario. Establecer expectativas: "respondo en máximo 4 horas en horario laboral." Concentrar el soporte en dos ventanas: 9–10am y 5–6pm. No estar de guardia 24/7
- **Señal de detección:** Más de 3 horas/día en soporte después de la semana 2

### El scope creep de usuarios beta destruye el foco
- **Qué falló:** Tres restaurantes piden tres features distintas (albaranes, multi-local, Holded). Empiezas a construirlas. Nada se termina. Los escandallos siguen sin estar en el mes 4
- **Probabilidad:** 🔴 Alta
- **Mitigación:** Anotar cada feature request. Decir "lo apunto para el roadmap" — nunca "lo miro". Compartir un roadmap público con los 3 items prioritarios. Escandallos es el ítem 1. Todo lo demás es "fase 2". Decirlo en voz alta en el onboarding
- **Señal de detección:** Abres el editor de código en una feature que no son escandallos más de una vez en una semana dada

### Sobre-inviertes en encontrar los próximos 10 y bajo-inviertes en los primeros 10
- **Qué falló:** En semana 3 tienes 6 restaurantes pero con bajo engagement. En lugar de profundizar, sigues buscando hasta llegar al número. Final del mes 2: 10 restaurantes con bajo engagement y sin aprendizaje
- **Probabilidad:** 🟡 Media
- **Mitigación:** Si algún restaurante sube <2 facturas por semana en la semana 3, tener una conversación directa: "¿Esto no te está ayudando o hay algo que lo dificulta?" Corregir el problema o reemplazarlo. Un beta de 6 restaurantes muy engaged vale más que 10 pasivos
- **Señal de detección:** Media de facturas subidas por restaurante por semana cae por debajo de 3 en el día 21

---

## Los 3 Bets Principales

*Los tres cambios al plan que más reducen la probabilidad de fallo total:*

### Bet 1: Hacer onboarding white-glove en persona para los primeros 5 restaurantes

El fallo de mayor probabilidad es "lo probaron una vez, había errores, no volvieron." La única mitigación real es estar presente, monitorizar extracciones y resolver problemas antes de que el usuario los vea. No es escalable. No necesita serlo. Necesita funcionar para 5 restaurantes durante 2 semanas. El aprendizaje de hacerlo manualmente te dirá exactamente qué necesita hacer el producto de forma automática. No lo delegues. Hazlo tú mismo.

### Bet 2: Testear la extracción con 30 facturas españolas reales antes de hablar con cualquier restaurante

Los fallos de captación son recuperables. Una primera impresión mala de un producto roto no lo es. Si en la demo muestras la extracción en vivo con UNA factura real suya y funciona perfectamente, cierras el trato en el local. Si falla o devuelve basura, has perdido ese contacto y probablemente su red. Los 3–4 días de trabajo pre-beta no son opcionales — son la base entera. Especialmente: testear con fotos borrosas de móvil, porque eso es lo que recibirás en la realidad.

### Bet 3: Establecer una fecha firme para escandallos y anunciarla a los usuarios beta en la semana 1

El mayor riesgo competitivo es que los usuarios toleren la ausencia de escandallos en el mes 1 pero hagan churn en el mes 3 cuando todavía no está. Si les dices en el onboarding "escandallos estará listo en septiembre, y seréis los primeros en tenerlo," conviertes la feature que falta de un trigger de churn en un hook de retención. También te fuerza a construirlo — los deadlines anunciados crean accountability. El único moat duradero de Haddock son los escandallos; cerrar ese gap es el juego completo.
