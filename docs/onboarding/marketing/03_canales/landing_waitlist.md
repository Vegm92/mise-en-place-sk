---
tags: [mep, onboarding, marketing]
related: "[[CONTEXT]]"
---

# Canal: la landing (`/waitlist`)

Hoy es **el único escaparate público que existe**. Todo lo que mejore su
conversión tiene efecto inmediato; todo lo que la rompa nos deja sin nada.

## Qué hay ahora mismo

En este orden:

| Sección | Qué contiene |
|---|---|
| Insignia + navegación | «Beta privada», enlace de entrada a la app, botón «Apuntarme» |
| Hero | «Sabe en qué gasta tu cocina, antes que tú» + captura de email + contador de 50 plazas |
| El problema | Tres bloques con cifra: 4–6 h a la semana · ¿0? visibilidad · +8 % subidas invisibles |
| Cómo funciona | Tres pasos —Captura, Inferencia, Poder— con maquetas animadas al hacer scroll |
| Testimonios | Tres citas firmadas por chefs |
| Nota del fundador | Victor, su paso por cocinas, «hecho en una cocina, no en una sala de juntas» |
| Precios | Prueba gratis + Starter 29 / Pro 59 / Business 129, marcados como provisionales |
| Dudas frecuentes | Cinco: datos, TPV, albarán arrugado, precio, cuándo abre |
| Cierre | «Empieza por la factura de esta semana» + captura de email |

Detalles que conviene saber:

- Es **bilingüe** (es/en) con un selector propio, y tiene modo claro y oscuro.
- Las maquetas del «cómo funciona» se animan según el scroll, y la animación
  también va hacia atrás. Es de lo mejor que tiene: no lo rompas.
- En móvil la maqueta del hero se oculta, y la landing queda mucho más corta.
  **Revisa siempre en móvil**: es donde estará casi todo el tráfico.

## Problemas conocidos

| Problema | Detalle |
|---|---|
| **Precios duplicados** | Los 29/59/129 están escritos aquí a mano e independientes de los de la app. Cambiar uno no cambia el otro (tarea #439) |
| ~~**TPV no construido**~~ | **Resuelto.** La promesa de Square y Revo «desde el primer día» ya no está en la landing. `waitlist.faq.1.a` dice ahora que estamos trabajando en conectar con los TPV más usados en España y que todavía no está disponible — sin nombrar ninguno como ya conectado. Plan: [`docs/02_product/tpv_sales_integration_spain.md`](../../../02_product/tpv_sales_integration_spain.md) |
| **Testimonios sin origen claro** | Hay que confirmar si son reales, de entrevistas o ilustrativos, y marcarlos si es lo tercero |
| **Fecha de apertura** | Resuelto (issue #333): ya no promete un mes/año concreto — dice «abrimos en tandas según vamos incorporando restaurantes». Cuando haya una fecha real, es un cambio de una sola clave en `src/lib/i18n.ts` (`waitlist.faq.4.a`) |
| **Medición** | Se desconoce qué analítica hay instalada. Sin eso, no se puede optimizar nada |

## Qué mide el éxito aquí

En orden de importancia:

1. **Altas en la lista** — el número que importa.
2. **Porcentaje de visitantes que se apuntan** — si no se mide, se optimiza a
   ciegas.
3. **Hasta dónde bajan** — ¿llegan a precios? ¿abandonan en el hero?
4. **Móvil frente a escritorio** — con toda seguridad, dos historias distintas.

## Ideas de mejora, ordenadas por lo que costaría

**Barato y probablemente rentable**

- Dar más peso al pilar de la confianza («no inventa»): hoy vive escondido en
  una duda frecuente, y es nuestra mejor respuesta a la objeción más común.
- Repetir la captura de email a media página, no solo arriba y abajo.
- Que el contador de plazas diga cuántas quedan, si se puede saber de verdad.

**Requiere decisión de Victor**

- Aclarar o retirar la promesa del TPV.
- Marcar los testimonios como ilustrativos, si lo son.
- Confirmar si los precios se enseñan ya o se ocultan hasta cerrarlos.

**Requiere trabajo previo**

- Reescribir el hero con las palabras exactas que usen los hosteleros
  entrevistados. Hoy es la voz del fundador; podría ser la del cliente.
- Una página específica por ángulo (regulación, gestorías) para captar
  búsquedas distintas.

## Reglas al tocar esta página

1. **Nunca en un solo idioma.** Cualquier cambio, en español y en inglés.
2. **Nunca solo en escritorio.** Comprueba las dos vistas.
3. Los precios son **provisionales**: la palabra tiene que seguir ahí.
4. Los cambios de texto pasan por el equipo técnico —viven dentro del código—,
   así que entrega el texto final, no una descripción de lo que quieres.

## Relacionado

- [[docs/onboarding/marketing/00_base/01_vocabulario|Vocabulario]] — las frases que ya son nuestras
- [[docs/onboarding/marketing/05_medicion/metricas|Métricas]]
- [[docs/onboarding/03_mapa_de_la_app|Mapa de la app]]
