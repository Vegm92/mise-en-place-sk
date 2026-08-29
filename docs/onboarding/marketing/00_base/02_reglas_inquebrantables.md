---
tags: [mep, onboarding, marketing]
related: "[[CONTEXT]]"
---

# Reglas inquebrantables

El equipo técnico tiene una lista de invariantes que ningún cambio puede
romper. Esto es su equivalente en comunicación. **Si algo de aquí choca con una
buena idea, gana esta lista.**

## 1. No prometemos lo que el producto no hace

La regla madre. Somos pre-lanzamiento, y la distancia entre lo que se promete y
lo que se entrega es lo que mata la confianza del hostelero — que ya viene
escaldado de escáneres que fallan.

**Antes de escribir que el producto hace X, compruébalo**: en la app, en
`docs/02_product/product_definition.md`, o preguntando. No lo deduzcas de la
propia landing: parte de lo que hay ahí es promesa, no producto.

### Casos abiertos hoy

| Afirmación viva en la landing | Estado real | Qué hacer |
|---|---|---|
| ~~«Se conecta a Square y Revo desde el primer día»~~ | **Resuelto.** La afirmación ya no existe en la landing: `waitlist.faq.1.a` dice ahora, en ambos idiomas, que estamos trabajando en conectar con los TPV más usados en España y que **todavía no está disponible** | Se puede decir «estamos trabajando en ello». Sigue prohibido nombrar un TPV concreto como ya conectado hasta que lo esté. El plan está en [`docs/02_product/tpv_sales_integration_spain.md`](../../../02_product/tpv_sales_integration_spain.md) |
| «Almacenamos cifradas en servidores en la UE» | Verosímil, pero hay que confirmar la región real del alojamiento | Confirmar antes de reutilizar la frase |
| «Nunca las usaremos para entrenar modelos públicos» | Depende de las condiciones del proveedor de IA | Confirmar antes de reutilizar la frase |
| Testimonios firmados con nombre y rol | Sin clientes de pago todavía. Hay que aclarar si son reales, de entrevistas, o ilustrativos | Preguntar. Si son ilustrativos, **deben ir marcados como tales** |

Ninguna de estas es una acusación: son cabos sueltos normales en una landing
pre-lanzamiento. Pero el día que entre tráfico real, son riesgo.

## 2. No decimos que cumplimos VERI\*FACTU

Mise en Place **no emite facturas**, así que no es —y no puede ser— un sistema
de facturación certificado. Decir «cumple VERI\*FACTU» es falso y en un sector
con obligación legal encima es un problema serio.

- ✅ «Preparado para la factura electrónica que vas a empezar a recibir»
- ✅ «Leemos y verificamos el QR VERI\*FACTU de las facturas que recibes»
- ❌ «Cumple con VERI\*FACTU»
- ❌ «Te pone al día con la normativa»

Hay una decisión registrada sobre esto:
[[docs/onboarding/marketing/06_decisiones/MDR-001-no-comunicamos-cumplimiento-verifactu|MDR-001]].

## 3. Ningún precio sale fuera sin confirmar

Conviven dos tablas: 29/59/129 € en la app y la landing, 49/99/199 € en el plan
de negocio. Los primeros están marcados como **provisionales** y, además,
escritos por duplicado en dos sitios que no se sincronizan entre sí.

Si un precio va a aparecer en algo que se publica, se confirma antes. Sin
excepciones.

## 4. Lo interno no se enseña

Todo lo que cuelga de `/admin` es herramienta del equipo: salud del sistema,
errores, ingresos, trabajos fallidos. Fuera de capturas, vídeos, demos y
publicaciones.

Tampoco salen fuera: datos reales de un cliente, nombres de proveedores reales
en una captura, ni cifras de facturación de nadie. Para material visual hay un
generador de facturas sintéticas y una cuenta de demostración.

## 5. Todo lo público es bilingüe

Español primero, inglés después, **en la misma entrega**. El producto tiene una
comprobación automática que bloquea la publicación si aparece un texto sin
traducir. Marketing no tiene esa red: la disciplina la pones tú.

Si propones una frase para la interfaz o para la landing, trae las dos
versiones. Media entrega es cero entrega.

## 6. Un dato sin fuente no se publica

Toda cifra —inflación, número de establecimientos, horas de administración,
porcentajes de margen— sale de `docs/02_product/plan_de_negocio.md`, que cita sus fuentes.
Si un dato no está ahí y no tienes de dónde sacarlo, **no lo uses**.

Esto aplica muy especialmente a lo que produzca Claude: escribe cifras
plausibles con una seguridad total. Ver
[[docs/onboarding/marketing/07_con_claude/flujo_de_trabajo|el protocolo de verificación]].

## 7. No hablamos mal de la competencia por su nombre

Sus puntos débiles nos sirven para **construir nuestro mensaje**, no para
atacarles en público. «Precisión en la que puedes confiar» es buen marketing;
«MarketMan falla la mitad de las veces» es un pleito y una mala imagen.

En material interno (esta carpeta), toda la franqueza. Hacia fuera, se habla de
la categoría, no de la empresa.

## 8. Somos pre-lanzamiento y se nota, a propósito

Nada debe sugerir que ya hay una base de clientes consolidada. La beta privada,
las 50 plazas y la nota del fundador funcionan **porque** son honestas: la gente
se apunta a algo que está empezando.

## Checklist final

Antes de que algo salga:

- [ ] Cada afirmación sobre el producto es verificable hoy
- [ ] Ningún reclamo de cumplimiento normativo
- [ ] Los precios están confirmados, o no aparecen
- [ ] Nada interno ni datos de terceros en las imágenes
- [ ] Español e inglés, los dos
- [ ] Cada cifra tiene fuente
- [ ] Ningún competidor mencionado en negativo

## Relacionado

- [[docs/onboarding/marketing/06_decisiones/README|Decisiones de marketing]]
- [[docs/onboarding/marketing/01_estrategia/mensajes|Mensajes]]
- [[docs/onboarding/06_como_trabajamos|Cómo trabajamos]]
