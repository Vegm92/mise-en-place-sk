---
tags: [mep, onboarding, marketing]
related: "[[CONTEXT]]"
---

# INC-002 — "Previsión de stock bajo" no tiene base de datos que la sostenga

**Estado:** Abierta
**Área:** producto / mensaje
**Detectada:** 2026-08-14
**Por:** Paula, revisando el resumen de producto con Claude

## Qué se afirma hoy

El resumen de producto que maneja el equipo incluye, entre las alertas,
"previsión de stock bajo."

## El problema

Una factura (o un albarán) dice qué ha **comprado** el restaurante, no qué ha
**consumido** ni cuánto le queda. Sin datos de venta/consumo — que hoy no
existen, porque la integración con TPV está marcada como no construida en
[[docs/onboarding/marketing/00_base/02_reglas_inquebrantables|reglas
inquebrantables, caso 1]] — lo único que se puede inferir es la cadencia de
compra: "sueles pedir esto cada X días y vas con retraso." Eso es una alerta
útil, pero no es "previsión de stock bajo" en el sentido que el cliente va a
entender (cuánto le queda de verdad, ahora mismo).

Es exactamente el tipo de caso que cubre la regla madre del equipo: **"no
prometemos lo que el producto no hace."** Esta funcionalidad, tal y como está
descrita, se acerca a esa línea.

## Por qué importa

No aparece en [[docs/onboarding/marketing/01_estrategia/mensajes|mensajes.md]]
entre los tres pilares oficiales, que sí llevan su columna de "prueba que
tenemos / prueba que falta". O es una funcionalidad que todavía no ha entrado
en el mensaje oficial, o es una funcionalidad que no debería prometerse tal
cual sin pasar antes por ese mismo trabajo de prueba.

## Qué hay que hacer

- [ ] Confirmar con Victor si "previsión de stock bajo" es una función real
      hoy o una intención a futuro.
- [ ] Si es real: definir con qué dato exacto se calcula (cadencia de compra,
      no consumo) y escribirle su fila de mensaje con prueba, como los tres
      pilares de mensajes.md.
- [ ] Si se comunica, renombrarla a algo honesto sobre lo que hace de verdad
      — por ejemplo "aviso de reposición por patrón de compra" — en vez de
      "previsión de stock", que implica conocer el nivel real.
- [ ] Mientras no se resuelva, no incluirla en material de marketing nuevo.

## Relacionado

- [[docs/onboarding/marketing/00_base/02_reglas_inquebrantables|Reglas inquebrantables]]
- [[docs/onboarding/marketing/01_estrategia/mensajes|Mensajes]]
