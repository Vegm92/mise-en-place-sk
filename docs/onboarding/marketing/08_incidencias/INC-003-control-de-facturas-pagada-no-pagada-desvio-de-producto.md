---
tags: [mep, onboarding, marketing]
related: "[[CONTEXT]]"
---

# INC-003 — "Control de facturas — pagada/no pagada" puede ser un desvío de producto

**Estado:** Abierta
**Área:** producto / alcance
**Detectada:** 2026-08-17
**Por:** Paula

## El reparto de roles, tal y como está hoy

- **Jefe de cocina:** recibe el albarán, comprueba la mercancía y
  registra/valida la recepción. Puede aportar precios si el albarán no los
  trae (no siempre vienen valorados los albaranes, y además no siempre llega
  la factura a la vez que la mercancía).
- **Mise:** debería ayudar a digitalizar y estructurar esa información, pero
  no necesariamente gestionar la contabilidad de facturas.
- **Gerente / administración / gestoría:** recibe, registra, concilia y paga
  las facturas.

## El problema

Si el MVP de Mise está dirigido al jefe de cocina, un apartado de "Control de
facturas — pagada/no pagada" no encaja con ese rol: pagar y conciliar
facturas es tarea de gerencia/gestoría, no de cocina. Incluirlo puede ser un
desvío de producto — construir o comunicar una función que responde a un
usuario (administración) distinto del que el MVP dice servir (jefe de
cocina).

## Por qué importa

Choca con la lógica de [[docs/onboarding/marketing/01_estrategia/mensajes|mensajes.md]]
y las [[docs/onboarding/marketing/00_base/02_reglas_inquebrantables|reglas
inquebrantables]]: no se promete ni se construye lo que no es el producto
real para el usuario real. Si "pagada/no pagada" se comunica como parte del
valor para el jefe de cocina, es una promesa que corresponde a otro rol y a
otro flujo (el de gestoría), no al de recepción de mercancía.

## Qué hay que hacer

- [ ] Confirmar con Victor si "control de facturas — pagada/no pagada" está
      en el alcance del MVP o es una función pensada para gerencia/gestoría
      más adelante.
- [ ] Si no está en el alcance del jefe de cocina: sacarla del mensaje de
      producto dirigido a cocina y, si existe en la interfaz, revisar a qué
      rol se le muestra.
- [ ] Dejar explícito en el reparto de roles (jefe de cocina digitaliza y
      valida recepción / Mise estructura los datos / gestoría gestiona pago y
      conciliación) dónde termina la responsabilidad de Mise.
- [ ] Mientras no se resuelva, no presentar "pagada/no pagada" como
      funcionalidad para el jefe de cocina en material de marketing nuevo.

## Relacionado

- [[docs/onboarding/marketing/00_base/02_reglas_inquebrantables|Reglas inquebrantables]]
- [[docs/onboarding/marketing/01_estrategia/mensajes|Mensajes]]
