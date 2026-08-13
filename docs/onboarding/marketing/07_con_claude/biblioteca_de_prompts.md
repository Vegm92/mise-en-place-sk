---
tags: [mep, onboarding, marketing]
related: "[[CONTEXT]]"
---

# Biblioteca de prompts

Peticiones listas para copiar. Todas asumen que has abierto la conversación
dándole contexto (paso 1 del
[[docs/onboarding/marketing/07_con_claude/flujo_de_trabajo|flujo]]).

Cuando uno funcione especialmente bien, **añádelo aquí**.

## Arranque de sesión

```
Trabajo en marketing de Mise en Place, un SaaS que digitaliza facturas de
proveedor para restaurantes. Lee estos archivos antes de responder nada:

- docs/onboarding/marketing/README.md
- docs/onboarding/marketing/00_base/02_reglas_inquebrantables.md
- docs/onboarding/marketing/04_produccion/guia_de_estilo.md
- docs/onboarding/marketing/01_estrategia/mensajes.md

Cuando los tengas, dime en tres líneas qué has entendido que NO podemos decir.
Luego te paso la tarea.
```

Pedirle que empiece por lo prohibido es deliberado: fija los límites antes de
que se ponga creativo.

## Titulares y frases

```
Necesito 8 versiones de <titular / asunto de email / frase de cierre> para
<superficie>, dirigido a <persona>.

Cuatro deben apoyarse en el pilar de <tiempo / dinero / confianza>; las otras
cuatro, libres.

Respeta la guía de estilo: frases cortas, concreto en vez de abstracto, tuteo,
sin emoji, sin superlativos. Nada de promesas que el producto no cumple hoy.

Para cada una, una línea diciendo por qué podría funcionar y a qué objeción
responde.
```

## Borrador de contenido

```
Encargo:
<pega aquí la plantilla de encargo rellenada>

Antes de redactar, devuélveme solo el esquema: título, subtítulos y una frase
por sección. Espera mi visto bueno.

Marca con ⚠️ cualquier dato, cifra o fecha que necesites y que no puedas
respaldar con las fuentes que te he dado. No los rellenes por tu cuenta.
```

## Traducción al inglés

```
Traduce este texto al inglés británico para <superficie>.

No traduzcas literal: busca lo que diría un chef británico. Mantén el registro
cercano y directo, las frases cortas y el tuteo natural del inglés.

Vocabulario del sector: delivery note (albarán), supplier, food cost, margin.
Ortografía británica (normalise, no normalize).

Señálame cualquier frase que no funcione en inglés y propón una alternativa,
en vez de forzar la traducción.
```

## Revisión antes de publicar

```
Revisa este texto como si fueras el responsable de que no salga nada
problemático. Comprueba una por una:

1. ¿Alguna afirmación sobre el producto que no sea verificable hoy?
2. ¿Alguna insinuación de cumplimiento normativo? (ver MDR-001)
3. ¿Algún precio sin confirmar?
4. ¿Alguna cifra sin fuente?
5. ¿Algún competidor mencionado en negativo?
6. ¿Suena a texto generado por IA? Señala las frases concretas.

Lístame los problemas por gravedad. No reescribas todavía.
```

Este es probablemente el prompt más útil de la biblioteca: separar redactar de
revisar da mejores resultados que pedir las dos cosas a la vez.

## Análisis de entrevistas

```
Te paso <N> entrevistas con hosteleros. Para cada una extrae:
- La cita textual más reveladora, literal
- Qué hace hoy con las facturas (el recorrido real, no lo que dice que debería)
- Qué le duele más, con sus palabras

Después, en conjunto:
- Patrones que aparezcan en 3 o más
- Lo que CONTRADICE nuestras hipótesis de segmentos_y_personas.md
- Objeciones nuevas que no estén en objeciones.md

Prioriza lo que nos contradice. Es lo que más nos sirve.
```

## Vaciado de reseñas de competencia

```
Te paso reseñas públicas de <competidor>. Agrúpalas por tipo de queja y ordena
por frecuencia.

Para cada grupo:
- La queja en una frase
- Una cita representativa, literal
- Si Mise en Place lo resuelve, no lo resuelve, o no está claro

Recuerda: esto es material interno. No propongas textos que mencionen al
competidor por su nombre.
```

## Actualizar esta carpeta

```
Hemos aprendido <esto>. Actualiza <archivo> para reflejarlo:

- Respeta el formato y el tono del archivo
- Toca solo lo afectado, no reescribas el resto
- Si contradice algo de otro archivo, dímelo en vez de arreglarlo por tu cuenta
- Si contradice una decisión de 06_decisiones/, para y avísame
```

## Lo que NO conviene pedirle

| No le pidas | Por qué |
|---|---|
| «¿Cuánto cuesta un anuncio en X?» | Datos cambiantes que no puede verificar |
| «¿Es esto legal?» | No es asesoría jurídica, y aquí hay normativa real |
| «¿Qué precio deberíamos poner?» | Decisión de negocio, y no tiene el contexto |
| «Invéntate un testimonio» | Es exactamente lo que las reglas prohíben |
| «Dame datos del mercado español» | Se los inventará. Usa el plan de negocio |

## Relacionado

- [[docs/onboarding/marketing/07_con_claude/flujo_de_trabajo|Flujo de trabajo]]
- [[docs/onboarding/marketing/04_produccion/plantillas|Plantillas]]
