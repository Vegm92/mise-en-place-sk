---
tags: [mep, onboarding, marketing]
related: "[[CONTEXT]]"
---

# Paquete RRSS — beta privada · agosto 2026

Paquete de contenido para redes, anuncios de pago y SEO, orientado a un único
objetivo: **altas en la lista de espera** (`/waitlist`). Elaborado contra las
fuentes del repositorio — posicionamiento, mensajes, reglas inquebrantables,
plan de negocio (única fuente de cifras) — y contra el estado real del producto
según la **revisión de preparación para la beta del 27-08-2026**
(`docs/05_operations/beta_readiness_review_2026-08-27.md`, PR #741).

Todo el texto publicable va en español y en inglés (británico), español
primero. Sin emojis, sin exclamaciones, tuteo, vocabulario del sector
(*albarán*, *cocina*, *margen*, *food cost*). Cada cifra lleva su fuente del
plan de negocio. Lo que no se puede afirmar hoy está en la sección de
**avisos**, no camuflado en el texto.

---

## 1 · Estrategia (resumen operativo)

**ICP y segmentos, por valor:**

1. **Dueño-chef de restaurante independiente** (1 local, cocina propia,
   decenas de albaranes al mes). Decide solo, le mueve el tiempo y el agobio.
   Entrada: el papeleo del viernes, nunca la analítica.
2. **Grupo pequeño (2–5 locales).** Le mueve comparar locales. Entrada: «qué
   local compra más caro, y desde cuándo».
3. **Gestoría** (canal prescriptor, ~70.000 despachos, ~10 % digitalizados —
   plan de negocio). No es objetivo de esta tanda de RRSS; se trabaja aparte.

**Dolores que atacamos (con prueba):**

- Tiempo: ~14 h/semana de administración en hostelería (Square + American
  Express, 2024, citado en el plan de negocio).
- Dinero: cesta de alimentos +35 % acumulado desde 2021 (OCU); food cost
  28–35 % de las ventas; rentabilidad del sector −0,9 % en 2025 pese a
  facturar +3 % (Hosteltur/DBK). Las subidas por línea pasan desapercibidas
  hasta el cierre de la gestoría.
- Confianza: escáneres anteriores que fallaban. Nuestra respuesta es regla de
  producto verificada en la QA: un importe dudoso **no se puede guardar** sin
  revisión humana; campos en verde, ámbar y rojo.

**Diferenciadores utilizables hoy:**

- Precio por ingrediente y conversión de unidades, no solo la cabecera fiscal.
- Valor con la primera factura; sin implantación, sin comercial.
- «Si algo no se entiende, te lo señala para que lo confirmes tú — no inventa.»
- Origen: «Hecho en una cocina, no en una sala de juntas.»
- Lado de la **recepción** de la ola normativa (MDR-001): leemos la factura
  electrónica que vas a empezar a recibir. Verificado en la QA: una factura
  Facturae XML procesada de principio a fin, sin IA.

**Reparto conocimiento/conversión:** los ángulos de tiempo y dinero (posts 1,
6; anuncios A1, A2) abren la relación; confianza, edición de fundadores y
construir en público (posts 2, 4; anuncios A3, A5) cierran el alta. El ángulo
normativo es de contenido/SEO: educa y trae búsquedas con fecha, con cierre
suave.

---

## 2 · Publicaciones de lista de espera

Las seis piezas empujan a `/waitlist`. El enlace real de la landing se añade al
publicar. Visuales: **cuenta de demostración y facturas sintéticas
únicamente** (regla inquebrantable n.º 4); nada de `/admin`, nada de
proveedores reales.

### P1 — X/Twitter · el papeleo que no acaba en ningún sitio

- **Gancho:** la cifra de horas, y a dónde van.
- **Copy ES:**
  > Los hosteleros de España dedican unas 14 horas a la semana a tareas
  > administrativas (Square y American Express, 2024). Buena parte es teclear
  > albaranes que no acaban en ningún sitio.
  >
  > Mise en Place los lee por ti. Foto, revisión, confirmar. Tres movimientos.
  > Cero hojas de cálculo.
  >
  > Beta privada. 50 cocinas en Barcelona. Lista de espera abierta.
- **Copy EN:**
  > Spanish hospitality owners spend around 14 hours a week on admin (Square
  > and American Express, 2024). A good chunk of it is typing up delivery
  > notes that end up nowhere.
  >
  > Mise en Place reads them for you. Photo, review, confirm. Three moves.
  > Zero spreadsheets.
  >
  > Private beta. 50 kitchens in Barcelona. Waitlist open.
- **CTA:** Apúntate a la lista de espera / Join the waitlist + enlace.
- **Visual:** foto real de encimera con taco de albaranes arrugados junto al
  móvil haciendo la foto (recrear con facturas sintéticas).
- **Hashtags/keywords:** #hostelería #restaurantes #foodcost (máximo dos o
  tres en X; el peso lo lleva el texto).

### P2 — LinkedIn · construir en público: la revisión de la beta

- **Gancho:** «Esta semana hemos intentado romper nuestra propia beta.»
- **Copy ES:**
  > Esta semana hemos intentado romper nuestra propia beta.
  >
  > Antes de invitar a la primera cocina, pasamos la aplicación entera por una
  > revisión de preparación: todas las pantallas, móvil y escritorio, 157
  > capturas. Salieron catorce fallos, dos de ellos serios. Se arreglan antes
  > de que entre nadie: preferimos encontrarlos nosotros a que los encuentre
  > un chef con el turno a medias.
  >
  > Lo que ya funciona de punta a punta: la lectura de albaranes con revisión
  > guiada — cada campo dudoso marcado, y ningún importe se guarda sin que lo
  > confirmes tú —, el aviso de posibles duplicados, y la factura electrónica
  > estructurada (Facturae) procesada sin IA de por medio.
  >
  > La edición de fundadores son 50 cocinas en Barcelona. Si llevas un
  > restaurante y quieres estar dentro, la lista de espera está abierta.
- **Copy EN:**
  > This week we tried to break our own beta.
  >
  > Before inviting the first kitchen, we ran the whole app through a
  > readiness review: every screen, mobile and desktop, 157 screenshots. It
  > surfaced fourteen issues, two of them serious. They get fixed before
  > anyone comes in: we would rather find them ourselves than have a chef
  > find them mid-shift.
  >
  > What already works end to end: delivery-note reading with guided review —
  > every doubtful field flagged, and no amount is saved until you confirm it
  > —, duplicate warnings, and structured e-invoices (Facturae) processed
  > with no AI involved.
  >
  > The founders edition is 50 kitchens in Barcelona. If you run a restaurant
  > and want in, the waitlist is open.
- **CTA:** enlace a `/waitlist` en el primer comentario y al final del post.
- **Visual:** collage de 3–4 capturas de la cuenta de demostración (pantalla
  de revisión con campos verde/ámbar/rojo, lista de albaranes, gráfico de
  gasto) sobre fondo neutro. Alternativa: captura del propio documento de QA
  con los títulos visibles, sin rutas internas.
- **Keywords:** hostelería, food cost, digitalización de albaranes, beta.

### P3 — Instagram · carrusel «Tres movimientos»

- **Gancho:** demostración en cuatro tarjetas.
- **Tarjetas (ES / EN):**
  1. «El albarán llega arrugado, con prisa y con grasa. Normal: es una
     cocina.» / “The delivery note arrives crumpled, in a hurry, covered in
     grease. Normal: it is a kitchen.”
  2. «Foto. Mise en Place lo lee y marca en ámbar lo que no está claro.» /
     “Photo. Mise en Place reads it and flags anything unclear in amber.”
  3. «Confirmas tú. Nada se guarda con dudas. No inventa.» / “You confirm.
     Nothing is saved while in doubt. It does not make things up.”
  4. «Y a partir de ahí: gasto por categoría, precios por ingrediente,
     avisos de subidas. Sabe en qué gasta tu cocina, antes que tú.» / “From
     there: spend by category, price per ingredient, price-rise alerts. It
     knows what your kitchen spends, before you do.”
- **Copy del pie ES:** Tres movimientos. Cero hojas de cálculo. Beta privada,
  50 cocinas en Barcelona. Lista de espera en la bio.
- **Copy del pie EN:** Three moves. Zero spreadsheets. Private beta, 50
  kitchens in Barcelona. Waitlist in the bio.
- **CTA:** «Lista de espera en la bio» / “Waitlist in the bio”.
- **Visual:** tarjeta 1 fotografía real; tarjetas 2–4 capturas de la app
  (demo, modo claro u oscuro consistente) con facturas sintéticas.
- **Hashtags:** #hostelería #restauración #chefs #cocinaprofesional
  #foodcost #barcelona #gastro (bloque al final del pie, no en el texto).

### P4 — X/Twitter · el pilar de la confianza

- **Gancho:** la objeción del escáner que falló.
- **Copy ES:**
  > ¿Probaste un escáner de facturas y te falló un total?
  >
  > Por eso en Mise en Place un importe dudoso no se puede guardar sin que lo
  > confirmes tú. Cada campo va en verde, ámbar o rojo. Si la máquina duda,
  > te lo dice — no inventa.
  >
  > No es una promesa: es una regla del producto.
- **Copy EN:**
  > Tried an invoice scanner before and had it get a total wrong?
  >
  > That is why in Mise en Place a doubtful amount cannot be saved until you
  > confirm it. Every field is marked green, amber or red. When the machine
  > is unsure, it says so — it does not make things up.
  >
  > That is not a promise: it is a product rule.
- **CTA:** «La beta privada abre en Barcelona: 50 cocinas» + enlace.
- **Visual:** captura recortada de la pantalla de revisión con un campo en
  ámbar y el aviso de confirmación (factura sintética).
- **Keywords:** escáner de facturas, OCR, confianza.

### P5 — LinkedIn / Facebook · la ola normativa, del lado que nadie cuenta

*(Redacción conforme a MDR-001 y a INC-001: recepción, no cumplimiento; sin
fecha firme para la e-factura B2B.)*

- **Gancho:** «VERI*FACTU ya tiene fecha. Lo que casi nadie te cuenta es la
  otra mitad.»
- **Copy ES:**
  > VERI*FACTU ya tiene fecha: 2027 (1 de enero para sociedades, 1 de julio
  > para autónomos — RDL 15/2025). Obliga a emitir con un programa de
  > facturación certificado. Eso te lo resolverá tu programa de facturación o
  > tu gestoría: Mise en Place no emite facturas, y no vamos a decirte lo
  > contrario.
  >
  > La otra mitad, de la que casi nadie habla: las facturas que recibes de
  > tus proveedores van a llegar cada vez más como ficheros electrónicos
  > estructurados. La factura electrónica B2B de la Ley Crea y Crece está en
  > camino, aún sin fecha cerrada.
  >
  > Mise en Place ya lee ese formato: en la revisión de la beta procesamos
  > una factura Facturae de principio a fin. Ya que la ley te va a dar el
  > dato estructurado, úsalo para comprar mejor.
- **Copy EN:**
  > VERI*FACTU now has a date: 2027 (1 January for companies, 1 July for the
  > self-employed — Royal Decree-Law 15/2025). It requires certified invoicing
  > software for the invoices you issue. Your invoicing tool or your
  > accountant will handle that side: Mise en Place does not issue invoices,
  > and we are not going to tell you otherwise.
  >
  > The other half, which almost nobody talks about: the invoices you receive
  > from suppliers will increasingly arrive as structured electronic files.
  > Spain's B2B e-invoicing mandate is on its way, with no firm date yet.
  >
  > Mise en Place already reads that format: during the beta review we
  > processed a Facturae e-invoice end to end. Since the law is going to hand
  > you structured data, use it to buy better.
- **CTA:** «Empieza por la factura de esta semana» + enlace a la lista.
- **Visual:** diagrama simple de dos columnas: «Lo que emites → tu programa
  certificado» / «Lo que recibes → Mise en Place». Nada de logos de la AEAT.
- **Keywords:** VERI*FACTU hostelería, factura electrónica restaurantes, Ley
  Crea y Crece.

### P6 — Facebook / Instagram (imagen única) · la subida que no viste

- **Gancho:** la frase viva del aceite.
- **Copy ES:**
  > El aceite sube un ocho por ciento un martes cualquiera. Lo normal es
  > descubrirlo meses después, cuando la gestoría cierra el trimestre — con
  > el margen ya perdido.
  >
  > La cesta de alimentos acumula más de un 35 % de subida desde 2021 (OCU).
  > Cada subida que se te escapa sale directamente de tu margen.
  >
  > Mise en Place compara cada albarán con tu histórico y te avisa el mismo
  > día en que un precio se dispara. Tu margen, defendido cada día.
- **Copy EN:**
  > Olive oil goes up eight per cent on a random Tuesday. You usually find
  > out months later, when your accountant closes the quarter — margin
  > already gone.
  >
  > Food prices in Spain are up more than 35 % since 2021 (OCU). Every rise
  > you miss comes straight out of your margin.
  >
  > Mise en Place checks every delivery note against your own history and
  > warns you the same day a price jumps. Your margin, defended daily.
- **CTA:** «Beta privada, 50 cocinas en Barcelona. Apúntate» + enlace.
- **Visual:** captura de la alerta de subida de precio en la app (datos
  sintéticos), o gráfico de línea sencillo de un ingrediente con el punto de
  alerta marcado.
- **Hashtags:** #hostelería #foodcost #inflación #restaurantes #margen.

---

## 3 · Conceptos de anuncio (captación de lista de espera)

Todos con objetivo de conversión (alta en `/waitlist`), formato principal
Meta (Instagram + Facebook) porque el dueño-chef no vive en LinkedIn. Sin
precios (regla n.º 3): la oferta comunicable es «acceso anticipado gratuito».

### A1 — «La hora del viernes» *(tiempo)*

- **Gancho primario:** el momento semanal que todo dueño-chef reconoce.
- **Headline ES/EN:** «Esa hora del viernes puede dejar de existir» / “That
  Friday hour can stop existing”.
- **Copy ES:** Cierras la semana con un taco de albaranes y una hoja de
  cálculo que nunca está al día. Con Mise en Place, la foto que le haces al
  albarán ya es el dato: gasto por categoría, precios por ingrediente, avisos
  de subidas. Sin implantación. Empiezas por la factura de esta semana.
- **Copy EN:** You end the week with a stack of delivery notes and a
  spreadsheet that is never up to date. With Mise en Place, the photo you
  take of the delivery note becomes the data: spend by category, price per
  ingredient, price-rise alerts. No setup project. Start with this week's
  invoice.
- **CTA:** «Únete a la lista de espera» / “Join the waitlist”.
- **Audiencia:** España (arranque: Barcelona y área), 25–55, intereses
  hostelería/restauración/gestión de restaurantes, dispositivos móviles.
- **Dolor atacado:** tiempo de administración (~14 h/semana, fuente en plan).
- **Creativo:** vídeo de 10–15 s grabado en cocina real: mano que fotografía
  un albarán arrugado → pantalla de revisión → gráfico de gasto. Facturas
  sintéticas, sin proveedores reales.

### A2 — «Te enteras el mismo día» *(dinero)*

- **Gancho primario:** la subida silenciosa de un proveedor.
- **Headline ES/EN:** «¿Cuánto te subió el aceite este mes?» / “How much did
  your oil go up this month?”.
- **Copy ES:** Si tienes que mirarlo, ya llegas tarde. Mise en Place compara
  cada albarán con tu histórico de precios por ingrediente y te avisa el
  mismo día en que algo se dispara. Con la cesta un 35 % más cara que en 2021
  (OCU), no enterarse es lo caro.
- **Copy EN:** If you have to go and check, you are already late. Mise en
  Place compares every delivery note against your own price history per
  ingredient and warns you the same day something jumps. With food costs up
  35 % since 2021 (OCU), not knowing is the expensive part.
- **CTA:** «Apúntate al acceso anticipado» / “Sign up for early access”.
- **Audiencia:** como A1; sirve también para retarget de visitantes de la
  landing que no se apuntaron.
- **Dolor atacado:** subidas de precio invisibles hasta el cierre trimestral.
- **Creativo:** estático — un gráfico de línea limpio de un ingrediente con
  la anotación de la alerta, en el estilo visual de la app.

### A3 — «No inventa» *(confianza)*

- **Gancho primario:** la mala experiencia previa con escáneres.
- **Headline ES/EN:** «Si duda, te pregunta. No inventa.» / “If it is unsure,
  it asks you. It does not make things up.”
- **Copy ES:** Los escáneres de facturas se ganaron mala fama por inventarse
  totales. Aquí un importe dudoso no se puede guardar sin que lo confirmes
  tú: cada campo va marcado en verde, ámbar o rojo. Es una regla del
  producto, no una promesa de folleto.
- **Copy EN:** Invoice scanners earned a bad name by making up totals. Here a
  doubtful amount cannot be saved until you confirm it: every field is
  marked green, amber or red. That is a product rule, not brochure talk.
- **CTA:** «Pruébalo con tus albaranes — lista de espera» / “Try it with your
  own delivery notes — join the waitlist”.
- **Audiencia:** la misma base; especialmente eficaz como segunda impresión
  (retarget de quien vio A1/A2 sin convertir).
- **Dolor atacado:** desconfianza en el dato extraído.
- **Creativo:** captura grande de la pantalla de revisión con un campo en
  ámbar y el resto en verde; el titular superpuesto.

### A4 — «Qué local compra más caro» *(grupos 2–5)*

- **Gancho primario:** la comparación entre locales.
- **Headline ES/EN:** «Qué local está comprando más caro, y desde cuándo» /
  “Which site is buying dearer, and since when”.
- **Copy ES:** Con dos o cinco locales, el descontrol no está en un sitio:
  está entre sitios. Mise en Place normaliza los precios por ingrediente de
  todos tus locales y te deja ver quién compra bien y quién no.
- **Copy EN:** With two to five sites, the mess is not in one place: it is
  between places. Mise en Place normalises ingredient prices across your
  sites so you can see who buys well and who does not.
- **CTA:** «Acceso anticipado para grupos — lista de espera» / “Early access
  for groups — join the waitlist”.
- **Audiencia:** LinkedIn + Meta, cargos de operaciones/propiedad de grupos
  de restauración, España.
- **Dolor atacado:** falta de comparabilidad entre locales.
- **Creativo:** tabla simple de dos locales con el mismo ingrediente a dos
  precios (datos sintéticos).
- **Aviso:** el flujo multi-local existe en producto pero quedó en «no
  cubierto» en la QA del 27-08. Confirmar su estado antes de poner
  presupuesto detrás de este concepto.

### A5 — «50 cocinas» *(escasez honesta, cierre)*

- **Gancho primario:** la edición de fundadores, tal cual es.
- **Headline ES/EN:** «Edición de fundadores: 50 cocinas en Barcelona» /
  “Founders edition: 50 kitchens in Barcelona”.
- **Copy ES:** Mise en Place está en beta privada. La primera tanda son 50
  cocinas en Barcelona: cerca, para acompañarlas de verdad. Acceso
  anticipado gratuito y línea directa con el fundador — que fue chef antes
  que fundador. Hecho en una cocina, no en una sala de juntas.
- **Copy EN:** Mise en Place is in private beta. The first intake is 50
  kitchens in Barcelona: close by, so we can genuinely walk alongside them.
  Free early access and a direct line to the founder — who was a chef before
  he was a founder. Made in a kitchen, not in a boardroom.
- **CTA:** «Pide tu plaza prioritaria» / “Request your priority spot”.
- **Audiencia:** retarget de toda la actividad anterior + Barcelona amplio.
- **Dolor atacado:** ninguno directamente; convierte el interés acumulado.
- **Creativo:** retrato del fundador en cocina (real, no stock) con el pie
  «Hecho en una cocina, no en una sala de juntas». Sin inventar contador de
  plazas restantes: solo se comunica el total de 50.

---

## 4 · Ángulos de contenido a testar

| # | Ángulo | Pieza tipo | Estado de la prueba |
|---|---|---|---|
| 1 | **Dolor/papeleo** — la hora del viernes | P1, A1 | Cifra con fuente (14 h/semana) |
| 2 | **Antes/después** — carpeta de plástico → panel de gasto | Reel corto | Todo demostrable con la demo |
| 3 | **Demostración** — tres movimientos, foto a dato | P3, vídeo A1 | Flujo real verificado en QA |
| 4 | **Construir en público** — la QA honesta, fallos incluidos | P2 | Basado en PR #741, verificable |
| 5 | **Beta/acceso anticipado** — 50 plazas, edición de fundadores | A5 | Honesto por diseño (regla n.º 8) |
| 6 | **Dinero** — subidas invisibles, inflación +35 % | P6, A2 | Fuentes OCU/INE en plan de negocio |
| 7 | **Dolor sectorial/normativa** — recepción de e-factura | P5, blog | Con MDR-001 e INC-001 delante |
| 8 | **Contrarian/curiosidad** — «Un escáner que admite que duda vale más que uno que promete magia» | P4, A3 | Regla de producto real |

El ángulo fundador/oficio (Victor fue chef) no es una pieza: es la firma que
atraviesa 4, 5 y la nota del fundador. No gastarlo en un solo post.

---

## 5 · Capa SEO

El canal de contenido está sin arrancar (ver `03_canales/contenido_y_seo.md`);
esta capa sirve para los textos sociales de arriba y para las tres primeras
piezas de blog del ángulo normativo.

**Palabras clave primarias** *(intención comercial/transaccional — landing y
anuncios)*:

- digitalizar albaranes restaurante
- control de costes restaurante / control de compras restaurante
- food cost restaurante
- app para escanear facturas de proveedores

**Secundarias** *(apoyo y semántica)*:

- escandallo, precio por ingrediente, gasto por categoría
- subida de precios alimentos hostelería
- software para restaurantes independientes
- factura electrónica proveedores

**Long-tail** *(intención informacional — contenido; el cierre a la lista va
suave y al final)*:

- qué es VERI*FACTU y a qué restaurantes obliga (calendario 2027)
- cuándo será obligatoria la factura electrónica entre empresas en España
- cómo calcular el food cost de un restaurante
- cómo saber si un proveedor me está subiendo los precios
- qué hacer con los albaranes de proveedores (y qué mandar a la gestoría)
- app para hacer foto a los albaranes y llevar el gasto

**Mapa de intención:** normativa → informacional con fecha (máxima urgencia de
publicación, mínima presión comercial); food cost/escandallo → informacional
comercial (el producto es la respuesta natural); «app/software para…» →
transaccional (landing y anuncios).

**Frases a integrar de forma natural en el copy social** (ya son de la marca —
repetirlas construye; cambiarlas destruye):

- «Sabe en qué gasta tu cocina, antes que tú.»
- «Tres movimientos. Cero hojas de cálculo.»
- «Tu margen, defendido cada día.»
- «Empieza por la factura de esta semana.»
- «Hecho en una cocina, no en una sala de juntas.»
- «Si algo no se entiende, te lo señala para que lo confirmes tú — no inventa.»

---

## 6 · Avisos y huecos (lo que NO se puede afirmar hoy)

1. **Las 157 capturas de la QA no están en el repositorio** (solo el informe).
   Los visuales de este paquete se recrean con la cuenta de demostración y el
   generador de facturas sintéticas — nunca datos reales ni `/admin`.
2. **Nada de pagos.** Por dirección del fundador (27-08, PR #741) el producto
   abandona el modelo pagada/no pagada en favor de revisado · por revisar ·
   con incidencias. Ninguna pieza de este paquete menciona recordatorios de
   pago ni vencimientos, aunque README y plan de negocio aún los citen.
3. **Sin precios.** 29/59/129 y 49/99/199 conviven sin confirmar (regla n.º
   3). Solo se comunica «acceso anticipado gratuito».
4. **Sin fecha para la e-factura B2B** (INC-001): «en camino, sin fecha
   cerrada». VERI*FACTU sí: 2027, con el matiz emisión/recepción de MDR-001.
5. **Sin TPV, sin previsión de stock** (regla n.º 1 e INC-002): no aparecen.
6. **WhatsApp:** el bot existe en el código pero quedó «no cubierto» en la QA
   (necesita credenciales reales). Es el mejor argumento de adopción que
   tenemos («tu personal no tiene que usar una app») — confirmar con Victor
   antes de construir una pieza sobre él.
7. **Multi-local:** en producto, pero no cubierto por la QA. A4 no se lanza
   sin confirmarlo.
8. **La landing dice «a partir de julio de 2026»** y ya es agosto: revisar esa
   fecha antes de mandar tráfico de pago.
9. **El «4–6 h a la semana» de la landing no tiene fuente en el plan**; este
   paquete usa el dato con fuente (14 h/semana, Square + Amex 2024).
10. **Testimonios de la landing sin origen confirmado:** ninguna pieza de este
    paquete los reutiliza.

---

## 7 · Los tres conceptos a publicar primero

Ordenados por potencial esperado de altas en la lista:

1. **A1 · «La hora del viernes» (Meta, vídeo).** Ataca el dolor por el que
   entra el dueño-chef según toda la documentación de audiencia (tiempo y
   agobio, no analítica), con cifra con fuente, en el canal y dispositivo
   donde está, y con la demostración de 15 segundos que el producto ya
   aguanta. Es el concepto con mayor alcance útil por euro.
2. **P6/A2 · La subida que no viste (orgánico + estático de pago).** El
   ángulo de dinero con la narrativa más concreta de la marca (el aceite un
   martes cualquiera) y el respaldo macro con fuente (+35 % OCU). Convierte
   al que negocia con proveedores, que es quien paga; funciona además como
   retarget natural de A1.
3. **P2 · La QA en público + edición de fundadores (LinkedIn).** Audiencia
   menor pero de máxima intención; la honestidad de «encontramos catorce
   fallos y los arreglamos antes de invitarte» es la ejecución perfecta de la
   regla n.º 8 (somos pre-lanzamiento y se nota, a propósito) y arma la
   escasez honesta de las 50 plazas. Alimenta también a prensa y gestorías.

Los tres usan solo afirmaciones verificadas hoy; ninguno depende de resolver
los avisos de la sección 6.
