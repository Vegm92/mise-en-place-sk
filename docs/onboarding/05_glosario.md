---
tags: [mep, onboarding, glosario]
related: "[[CONTEXT]]"
---

# 5 · Glosario

El traductor. A la izquierda, lo que vas a oír en una reunión o leer en un
ticket; a la derecha, qué significa de verdad. **No hace falta memorizarlo**:
está para consultarlo cuando alguien suelte una palabra rara.

## Palabras del producto

| Palabra | Qué significa |
|---|---|
| **Restaurante** *(restaurant, tenant, "rid")* | La cuenta. Es a la vez quien paga y la frontera de los datos: todo lo que existe en la app pertenece a un restaurante y solo a uno |
| **Local** *(location)* | Un restaurante adicional colgado de otro. Solo en el plan Business, hasta cinco |
| **Membresía** | El vínculo entre una persona y un restaurante. Es lo que decide qué puede ver cada quien |
| **Propietario** *(owner)* | El único rol que puede tocar el pago, vincular WhatsApp y crear locales |
| **Lote** *(batch)* | Un grupo de documentos subidos de una vez, que se revisan juntos |
| **Extracción** | El paso en el que la IA lee el documento |
| **Confianza** *(confidence)* | Cómo de segura está la IA de cada campo. Es lo que pinta los puntos verde / ámbar / rojo |
| **Confirmación** | El momento en que una persona valida lo leído. Antes es borrador; después es dato oficial |
| **Factura canónica** | La factura ya confirmada: el único registro financiero de verdad |
| **Proveedor** *(supplier)* | Se crea solo a partir de las facturas, no hay que darlo de alta |
| **Producto** | La identidad normalizada de una línea. Une "TOMATE PERA 5KG" y "Tomate pera caja 5kg" bajo un mismo nombre |
| **Alias** | Cada una de las formas en que un proveedor escribe el mismo producto |
| **Unidad canónica** | La unidad en la que medimos un producto (kg, L, unidad) sin importar cómo venga en la factura |
| **Conversión de unidades** | La regla que traduce "caja de 6 botellas de 75 cl" a litros, para poder comparar precios |
| **Pack** | Un formato múltiple dentro de una línea ("3 x 1 kg"). Se detecta, no se supone |
| **Shock de precio** | El aviso cuando un precio se dispara más de un 15 % respecto a lo habitual |
| **Digest** | El resumen semanal generado por IA |
| **Cuota** *(quota)* | Cuántas facturas al mes incluye el plan (100 / 300 / ilimitado) |
| **Prueba** *(trial)* | 30 días de acceso antes de pagar |
| **Onboarding (dentro de la app)** | ⚠️ Cuidado, aquí significa otra cosa: es la experiencia guiada del cliente hasta que confirma su primera factura, no la bienvenida a un empleado |

## Palabras técnicas que vas a oír

No necesitas saber usarlas. Necesitas no perderte cuando aparezcan.

| Palabra | Traducción de andar por casa |
|---|---|
| **Repositorio / repo** | La carpeta donde vive todo el código y esta documentación |
| **Rama** *(branch)* | Una copia de trabajo donde alguien hace un cambio sin romper lo que está publicado |
| **PR** *(pull request)* | La propuesta de meter un cambio en la versión buena, con revisión previa. Si oyes "está en la PR 445", es un cambio esperando aprobación |
| **Issue** | Una tarea o un fallo apuntado en GitHub, con un número. "El #439" = la tarea 439 |
| **Deploy / desplegar** | Publicar los cambios para que los usuarios los vean |
| **Producción** *(prod)* | La versión real que usan los clientes. Lo contrario de "en local", que es el ordenador de un desarrollador |
| **Frontend / backend** | Lo que se ve en pantalla / lo que trabaja por detrás. Aquí van juntos en el mismo programa |
| **Base de datos** | Donde se guarda todo de forma ordenada: facturas, proveedores, usuarios |
| **API** | La puerta por la que dos programas se hablan sin humanos de por medio |
| **Endpoint** | Una de esas puertas concretas |
| **Worker** | Un proceso aparte que va sacando trabajos de la cola (leer facturas, mandar resúmenes). Si el worker está parado, las facturas se quedan "pensando" |
| **Cola** *(queue)* | La lista de trabajos pendientes que el worker va procesando |
| **Cron** | Un trabajo que se ejecuta solo a una hora fija (por ejemplo, el resumen semanal) |
| **Test** | Una comprobación automática de que algo sigue funcionando. Si "los tests están rojos", hay algo roto |
| **CI** | El robot que ejecuta todos los tests cada vez que alguien propone un cambio |
| **Migración** | Un cambio en la forma de la base de datos (añadir una columna, por ejemplo) |
| **ADR** | *Architecture Decision Record*: una ficha corta que explica **por qué** se tomó una decisión técnica importante. Hay 22 |
| **i18n** | Abreviatura de *internationalization*. Aquí significa: el sistema de traducciones es/en |
| **Multi-tenant** | Que muchos clientes comparten el mismo sistema sin verse entre ellos |
| **Rate limit** | Un tope de peticiones por minuto, para que nadie (ni un fallo) dispare la factura de la IA |
| **Webhook** | Un aviso automático que nos manda otro servicio ("este cliente ha pagado") |
| **Sentry** | La herramienta que nos avisa cuando algo falla en producción |
| **Railway** | La empresa donde está alojada la aplicación |
| **Stripe** | La pasarela de pago con tarjeta |
| **Gemini** | El modelo de IA de Google que lee las facturas y responde en el chat |

## Palabras del sector hostelero

Por si vienes de fuera del sector:

| Palabra | Qué es |
|---|---|
| **Albarán** | El papel que acompaña a la mercancía cuando se entrega. No es la factura, pero lleva los productos y a menudo los precios. Los restaurantes reciben muchos más albaranes que facturas |
| **Escandallo** | El cálculo de lo que cuesta elaborar un plato, sumando el coste de cada ingrediente |
| **Food cost** | El porcentaje que representa la materia prima sobre las ventas. Entre el 28 % y el 35 % en un restaurante sano |
| **TPV** | La caja registradora moderna. Donde se cobra al cliente. Nosotros **no** somos esto |
| **Gestoría / asesoría** | El despacho externo que lleva impuestos y nóminas del restaurante |
| **VERI\*FACTU** | El sistema español de facturación certificada, obligatorio desde 2027 |
| **Facturae / UBL** | Los formatos oficiales de factura electrónica. Son archivos que las máquinas leen perfectamente |

## Si quieres profundizar

- `docs/00_system/terminology.md` — el glosario oficial del equipo (en inglés,
  con el nombre técnico exacto de cada concepto)
