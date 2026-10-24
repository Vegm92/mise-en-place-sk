# 03 · Guion de demo: 15 minutos

**Objetivo de la llamada:** salir con un **piloto acordado y fecha de arranque**, o con un «no» claro. No con un «ya te diré».

**Regla de oro:** el cliente habla más que usted en los minutos 0–4. La demo usa **su** factura siempre que sea posible. El número de euros lo calcula **él** con sus cantidades, no usted con supuestos.

---

## A. Preparación (30–45 min antes, no se salta)

### Sobre la cuenta

- [ ] Ficha CRM leída: locales, cocina, `[DATO_PUBLICO]`, software actual si se sabe.
- [ ] Carta publicada revisada: anotar 3 productos caros y probables (`[PRODUCTO_CLAVE]`).
- [ ] Si mandaron facturas antes: procesadas en una **cuenta de piloto propia** (no la de demostración) y con la tabla de hallazgos preparada.

### Sobre la app (comprobar en producción, no en local)

- [ ] **Cuenta de demostración** con 3–4 facturas **sintéticas** del mismo proveedor, de fechas distintas, con un producto que sube (p. ej. 3 entregas de merluza con precio creciente). Sin datos reales de nadie ni nombres de proveedores reales (regla 4 de `docs/onboarding/marketing/00_base/02_reglas_inquebrantables.md`). El generador de facturas sintéticas se describe en `docs/onboarding/06_como_trabajamos.md`.
- [ ] En la cuenta de demostración: **Ajustes → Alertas → Umbral de alerta de precio = 2 %**. El valor por defecto es 15 %, que no enseña subidas pequeñas. El control admite de 1 % a 50 %.
- [ ] Una factura sintética nueva (o la del cliente) lista para subir en directo, con un producto que ya esté en el historial.
- [ ] Cuota de la cuenta: la prueba estándar procesa **20 documentos al mes**. Si va a subir histórico, ampliar antes la cuota de esa cuenta (`settings.plan_quota`).
- [ ] El trabajador de extracción está vivo (subir una factura de prueba 10 minutos antes; si se queda en «en cola», no hacer demo en directo y usar la ya procesada).
- [ ] Saber, el día de la demo, si **WhatsApp** y el **reenvío por email** están activos en producción. Si no lo sabe con certeza: «está en piloto», y no se enseña.

### Material

- [ ] Calculadora abierta (o una hoja con la fórmula: `(precio nuevo − precio anterior) × cantidad al mes × 12`).
- [ ] `04_oferta_piloto_30dias.md` en PDF o pegable en un email.
- [ ] Huecos de calendario para proponer el arranque (2 opciones concretas).

---

## B. Guion minuto a minuto

### 0:00 – 1:00 · Apertura y permiso

> «Gracias por los 15 minutos. Propongo esto: cinco minutos me cuenta cómo funcionan hoy las facturas de proveedor, cinco le enseño qué sale con una factura y al final vemos si tiene sentido un piloto de 30 días. Si en algún momento ve que no le sirve, me lo dice y lo dejamos. ¿Le parece?»

### 1:00 – 5:00 · Descubrimiento (pasado, no hipótesis)

Elija 5–6. Anote las cifras literalmente: se usan en el minuto 10.

1. «¿Qué pasó con el último albarán que llegó? ¿Quién lo recibió y dónde está ahora?»
2. «¿Cuántos proveedores tienen activos? ¿Cuáles son los tres en los que más gastan?»
3. «¿Cuánto compraron a proveedores el mes pasado, aproximadamente?» → **`[G]`**
4. «La última vez que un proveedor les subió un precio, ¿cómo se enteraron? ¿Cuánto tiempo después?»
5. «¿Cuánto compran al mes de `[PRODUCTO_CLAVE]`?» → **`[Q]` y unidad**
6. «¿Han encontrado alguna vez un cobro de más, una factura repetida o algo facturado que no llegó? ¿Cómo lo vieron?»
7. «¿Qué usan hoy: Excel, algún programa, la gestoría?»
8. *(Grupos)* «¿Las compras las decide cada local o alguien centralizado?»

**Si en este bloque aparece que ya lo tienen resuelto** (todas las facturas línea a línea en otra herramienta con alertas, y están contentos): dígalo y ofrezca cerrar antes. Ahorra 10 minutos a los dos y deja buena imagen.

### 5:00 – 10:00 · Demo en directo (4 pantallas)

**Pantalla 1 — Subir (≈ 1 min).** Inicio → subir la factura (PDF o foto con el móvil).
> «Así se sube: foto o PDF. Puede subir varias a la vez; si un PDF trae varias facturas, las separa.»

Mientras se procesa (unos segundos), una frase: «Lo que importa no es leer la cabecera; es leer cada línea.»

**Pantalla 2 — Líneas extraídas y revisión (≈ 1,5 min).** Revisión del lote.
> «Aquí está cada línea: producto, cantidad, unidad y precio. Lo que la app no tiene claro sale marcado: el verde está seguro, el ámbar y el rojo hay que mirarlo. Si un importe dudoso no se revisa, no se puede guardar. No se inventa nada.»

Corregir un campo en directo si hay alguno en ámbar. Confirmar.

**Pantalla 3 — Historial de precio (≈ 1,5 min).** Ficha del producto.
> «Este es `[PRODUCTO]` con este proveedor: lo que pagó en cada entrega. Cuando reconoce el formato, la app lo pasa a la misma unidad (la caja de 12 × 1 l y la botella suelta se comparan por litro), así que la comparación es justa; si no lo reconoce, lo avisa para que usted indique la conversión. Si compra el mismo producto a otro proveedor, también lo ve aquí.»

**Pantalla 4 — La alerta (≈ 1 min).** Panel / campana de avisos.
> «Y esto es lo que ve sin buscarlo: "`[PRODUCTO]` subió un `[pct]` %, de `[precio anterior]` a `[precio nuevo]` por unidad". El aviso salta al confirmar la factura, no a final de mes. El umbral lo pone usted: yo lo tengo al 2 %.»

Si en la cuenta aparece la alternativa («otro proveedor lo vende a … , un … % menos»), enséñela: solo aparece cuando el mismo producto se ha comprado a dos proveedores.

**Opcional, 30 s, si el cliente mencionó errores en el minuto 4:** «Si sube el albarán y la factura de la misma entrega, los cruza: señala líneas que faltan o cantidades que no cuadran, y, si tiene el email del proveedor, le prepara un borrador de reclamación que usted revisa y envía. Nunca se envía solo.»

### 10:00 – 12:00 · El momento «€ en juego»

Con **sus** cifras del minuto 1–5, en voz alta y que lo vea escrito:

> «Usted me ha dicho que compra unos `[Q]` `[unidad]` de `[PRODUCTO_CLAVE]` al mes. Si sube `[Δ]` € por `[unidad]` —que es lo que acabamos de ver en esta factura, o pongamos un 2 %— son:
> `[Δ] × [Q] = [€/mes]` al mes, `× 12 = [€/año]` al año. En un solo producto de un solo proveedor.»

Y la cuenta global, solo si dio `[G]`:

> «Sobre lo que compra en total, `[G]` € al mes, cada punto de subida que no se ve son `[G × 0,01]` € al mes.»

Comparación con el precio (solo si ya sabe `[PRECIO_TIER]`):

> «La suscripción son `[PRECIO_TIER]` al mes, `[PRECIO_TIER × 12]` al año. Con que detecte `[PRECIO_TIER × 12 ÷ (Δ × Q)]` meses de esa subida, se ha pagado.»

**No dé usted una cifra de ahorro.** Si el cliente pregunta «¿cuánto ahorran sus clientes?»: «No le voy a dar una cifra porque estamos empezando y no la tengo medida. Por eso le propongo el piloto: lo medimos con sus facturas.»

### 12:00 – 14:00 · La oferta de piloto

> «Le propongo 30 días con sus facturas reales. Usted sube el histórico de sus 3 a 5 proveedores principales de los últimos 2–3 meses y, durante el mes, todo lo que llegue de ellos. Yo le dejo la cuenta configurada y reviso con usted a los 15 y a los 30 días.
> La condición es esta: si en 30 días no encontramos al menos `[X]` € entre subidas de precio, errores y cobros de más —y `[X]` es el 1 % de lo que me ha dicho que compra al mes: `[G] × 0,01`—, no paga nada. Si lo encontramos, sigue con `[PRECIO_TIER]` al mes con el descuento de fundador, sin permanencia.»

Detalle completo: `04_oferta_piloto_30dias.md`.

*(Grupos)* «Empezamos por el local que más compra. Multi-local está en piloto: cada local va con sus datos por separado; una vista que sume todos los locales todavía no existe. Si el piloto funciona en uno, añadimos el segundo.»

### 14:00 – 15:00 · Cierre

Una pregunta cerrada, dos opciones:

> «¿Lo arrancamos el lunes `[fecha 1]` o el jueves `[fecha 2]`? Para empezar necesito una sola cosa: las facturas de `[proveedor principal]` de los últimos dos meses.»

Si duda:

> «¿Qué tendría que pasar para que dijera que sí?» *(Callar. Anotar la respuesta literal; es la objeción real.)*

Si es «no»:

> «Gracias, de verdad. ¿Me dice qué le ha hecho decir que no? Me sirve para mejorar.»

---

## C. Después de la llamada (mismo día)

- [ ] Email de resumen (5 líneas): lo que dijo, la fórmula con sus números, la oferta con `[X]` calculado, la fecha de arranque, el primer paso.
- [ ] CRM: `gasto_mensual_declarado`, `objecion_principal`, `siguiente_paso`, fecha.
- [ ] Si hay piloto: crear la cuenta, umbral al 2 %, cuota ampliada, y avisarle cuando esté lista.

## D. Qué no hacer en la demo

- Enseñar `/admin` o cualquier pantalla interna.
- Prometer WhatsApp o reenvío por email si no ha comprobado ese día que funcionan.
- Decir «cumple VERI\*FACTU», «integra con su TPV», «exporta a a3», «vista de todo el grupo», «usuarios para cada cocinero».
- Dar porcentajes de acierto de lectura: no hay una cifra medida publicada.
- Hablar mal de otro software por su nombre.
