# Plan Integral de Seguridad — Mise en Place

Auditoría de las 20 directrices de seguridad contra el código real del proyecto
(SvelteKit 2 + Drizzle ORM/Postgres + Auth.js + Railway), con implementación y
test de verificación por punto. Complementa `security_rules.md` (modelo vigente)
y los invariantes de `docs/00_system/architectural_invariants.md`.

**Leyenda de estado**
- ✅ Implementado — el código ya cumple la directriz.
- ⚠️ Mejora recomendada — cumple lo esencial, hay hardening pendiente.
- ❌ Pendiente — no existe hoy; se incluye implementación propuesta.

| # | Directriz | Estado |
|---|-----------|--------|
| 1 | Claves API en variables de entorno | ✅ |
| 2 | Higiene de Git (secretos, .gitignore) | ✅ (gitleaks en CI) |
| 3 | Aislamiento de la base de datos | ✅ código listo — fijar `DATABASE_CA_CERT` en Railway |
| 4 | Row-Level Security / aislamiento por tenant | ✅ (a nivel de app, ADR-005) |
| 5 | Cifrado en reposo y en tránsito | ⚠️ sin cifrado a nivel de columna |
| 6 | Fuerza de autenticación | ✅ (mínimo 12) |
| 7 | RBAC / restricción de acceso a registros | ✅ |
| 8 | Bloqueo de mass assignment | ✅ |
| 9 | Flags de cookies | ✅ |
| 10 | Hashing de contraseñas | ✅ (bcrypt cost 12) |
| 11 | Limitación de intentos de login | ✅ (requiere `ADDRESS_HEADER` en prod) |
| 12 | Protección contra bots | ✅ honeypot + Turnstile opt-in |
| 13 | Parametrización de consultas (SQLi) | ✅ |
| 14 | Validación de entradas | ✅ (manual por convención) |
| 15 | Escape de output (XSS) | ✅ (JSON-LD escapado) |
| 16 | Restricción de subidas de archivos | ✅ |
| 17 | Rate limiting general de API | ✅ por ruta + backstop global |
| 18 | Cabeceras de seguridad HTTP | ✅ |
| 19 | Fuerza HTTPS | ✅ (TLS en el edge de Railway) |
| 20 | Logging sin PII | ✅ |

**Acciones prioritarias** — las seis están implementadas en código:
1. ✅ Escaneo de secretos (gitleaks) en CI — job `secret-scan` en `ci.yml` sobre todo el historial.
2. ✅ `DATABASE_CA_CERT` en modo `require` ahora verifica la cadena TLS (sin hostname check) — `db-ssl.ts`. **Acción operativa pendiente:** fijar la variable en Railway con la root CA del servicio Postgres.
3. ✅ Mínimo de contraseña 12 / máximo 128 — `src/lib/server/password-policy.ts`, aplicado en signup, reset y settings (server + formularios + i18n). Los usuarios existentes con contraseñas de 8-11 siguen pudiendo iniciar sesión; la política aplica a contraseñas nuevas.
4. ✅ JSON-LD de `waitlist/+page.svelte` escapa `<` como `\u003c`.
5. ✅ Backstop global por usuario/IP para `/api/*` en `hooks.server.ts` (`API_GLOBAL_RATE_LIMIT`, 300/min por defecto; health y webhooks firmados exentos).
6. ✅ Turnstile opt-in en signup y waitlist — activo solo si `TURNSTILE_SECRET_KEY` + `PUBLIC_TURNSTILE_SITE_KEY` están configuradas; sin claves, ni widget ni verificación. Fail-open si Cloudflare no responde.

---

## 1. Ocultación de claves API (.env)

**Riesgo:** exposición de credenciales (Stripe, Gemini, AWS, Auth) en el
repositorio o en el bundle del cliente → toma de control de servicios externos.

**Estado actual: ✅**
- Todas las variables se leen a través de `src/lib/server/env.ts` (módulo
  server-only: SvelteKit prohíbe importar `$lib/server/*` desde código cliente,
  así que un secreto nunca puede llegar al bundle del navegador).
- `.env` y `.env.*` están en `.gitignore` (solo `.env.example` y `.env.test`
  se versionan); `.env.example` documenta cada variable sin valores reales.
- `src/lib/server/config.ts` → `assertProductionEnv()` se ejecuta al arrancar
  (`hooks.server.ts:21`) y tira el proceso si en producción faltan
  `AUTH_SECRET`, `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  o `GEMINI_API_KEY`.
- En producción los valores viven en el variable store de Railway, nunca en
  ficheros.

**Implementación (patrón vigente, para nuevas claves):**

```ts
// src/lib/server/env.ts — añadir aquí, nunca process.env suelto en rutas
export const NUEVA_API_KEY = process.env.NUEVA_API_KEY ?? '';
```

```ts
// src/lib/server/config.ts — si la clave es crítica en producción
const REQUIRED_IN_PRODUCTION = [
	'AUTH_SECRET', 'DATABASE_URL', 'STRIPE_SECRET_KEY',
	'STRIPE_WEBHOOK_SECRET', 'GEMINI_API_KEY',
	'NUEVA_API_KEY',
] as const;
```

**Test de verificación:**

```bash
# 1. Ningún secreto hardcodeado ni process.env fuera de la capa server:
grep -rn "process.env" src/routes src/lib/components && echo "FALLO" || echo "OK"

# 2. .env jamás trackeado:
git ls-files | grep -E '^\.env$|^\.env\.' | grep -v example | grep -v test \
  && echo "FALLO" || echo "OK"

# 3. El boot falla sin claves críticas:
NODE_ENV=production node -e "
  import('./src/lib/server/config.ts')" 2>&1 | grep -q Missing && echo OK
# (o el unit test existente de assertProductionEnv)
```

---

## 2. Higiene de Git — secretos en el historial y .gitignore

**Riesgo:** una clave commiteada sigue viva en el historial aunque se borre del
working tree; bots escanean GitHub en segundos tras un push.

**Estado actual: ✅**
- `.gitignore` ya cubre `.env*`, `*.db`, `/uploads/` (PII de usuarios) y
  `/data/sk_sessions/` (tokens de sesión) con comentarios que explican el porqué.
- Job `secret-scan` en `.github/workflows/ci.yml`: gitleaks sobre todo el
  historial alcanzable desde el commit del PR (`--log-opts=HEAD` con
  `fetch-depth: 0`); el build falla si detecta un secreto. Se acota a HEAD a
  propósito: escanear todas las ramas (`--all`) haría que un falso positivo
  en cualquier rama vieja rompiera el check de todos los PRs; los pushes a
  otras ramas los cubre el push protection de GitHub en servidor. Falsos
  positivos verificados se fijan por fingerprint en `.gitleaksignore`.

**Implementación:**

1) Escaneo del historial completo, hoy (una vez):

```bash
# Trufflehog: solo hallazgos verificados contra la API real del proveedor
docker run --rm -v "$PWD:/repo" trufflesecurity/trufflehog:latest \
  git file:///repo --only-verified

# Alternativa: gitleaks sobre todo el historial
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  detect --source /repo --log-opts="--all"
```

2) Si aparece un secreto: **primero rotarlo** (Stripe/Gemini/AWS/AUTH_SECRET —
la limpieza del historial no sirve si la clave sigue siendo válida), después
purgar el historial:

```bash
# git-filter-repo (sucesor recomendado de BFG)
pip install git-filter-repo
git filter-repo --invert-paths --path .env --path secrets.json
# o por contenido: git filter-repo --replace-text expressions.txt
git push --force --all && git push --force --tags
# Avisar al equipo: todos deben re-clonar (los hashes cambian).
```

3) Gate permanente en CI — añadir a `.github/workflows/ci.yml`:

```yaml
  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

4) Gate local — `.githooks/` ya existe en el repo; añadir un pre-commit:

```bash
#!/bin/sh
# .githooks/pre-commit
command -v gitleaks >/dev/null && exec gitleaks protect --staged
exit 0
```

**Test de verificación:**

```bash
# El escaneo del historial sale limpio:
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  detect --source /repo --log-opts="--all" --exit-code 1 && echo OK

# El gate funciona: commitear un secreto de prueba debe fallar en CI.
# Construir el valor en runtime para no dejar un patrón de clave literal en
# ningún fichero versionado (este doc incluido — GitHub Push Protection lo
# bloquearía, como debe):
printf 'STRIPE_SECRET_KEY=%s_%s_%s\n' sk live "$(openssl rand -hex 12)" > kaboom.txt
git add kaboom.txt   # el hook / el job de CI deben bloquearlo
```

---

## 3. Seguridad de la base de datos — aislamiento y credenciales

**Riesgo:** un Postgres con puerto público es escaneado y atacado por fuerza
bruta en minutos; una conexión sin TLS verificado permite MITM.

**Estado actual: ✅ (código) — queda una acción operativa**
- La app conecta por la red privada de Railway
  (`postgres.railway.internal:5432`) — el puerto no se expone a Internet
  mientras no se active el TCP Proxy del servicio Postgres.
- `src/lib/server/db-ssl.ts`: con `DATABASE_SSL_MODE=require` **y
  `DATABASE_CA_CERT` fijada**, la conexión verifica la cadena de certificados
  contra la CA pinneada (sin hostname check — el cert de Railway es
  `CN=localhost`, así que `verify-full` con hostname no puede pasar). Sin la
  variable, sigue cifrando sin verificar y lo avisa en producción.
- **Acción operativa pendiente:** fijar `DATABASE_CA_CERT` en Railway con la
  root CA del servicio Postgres (web y worker).
- Timeouts defensivos ya configurados: `DB_CONNECT_TIMEOUT_SECONDS=10`,
  `DB_STATEMENT_TIMEOUT_MS=15000`.
- El gate de tests (`tests/helpers/db-gate.ts`) impide que suites destructivas
  corran contra una base de datos remota.

**Implementación:**

```bash
# 1. Extraer la root CA. Railway no publica ninguna: la imagen postgres-ssl
#    genera su propia CA dentro del volumen en el primer arranque, distinta
#    por instancia. Vive en el PGDATA del servicio Postgres:
railway ssh --service Postgres
#    ...y dentro de la sesión:
cat /var/lib/postgresql/data/certs/root.crt
#    Copiar la salida a railway-root-ca.crt. NO redirigir `railway ssh ... >
#    fichero`: el CLI escribe en stdout su banner de registro de clave, que
#    acaba en el fichero en lugar del certificado.

# 1b. Verificar ANTES de fijar la variable — si esto no imprime la cabecera,
#     el fichero no es un certificado y ambos servicios caerán al arrancar:
head -1 railway-root-ca.crt   # → -----BEGIN CERTIFICATE-----

# 1c. Pinnear en los dos servicios (web y worker), como variable multiline:
railway variables --service web --set "DATABASE_CA_CERT=$(cat railway-root-ca.crt)"

#    DATABASE_SSL_MODE se queda en 'require'. Ponerlo en 'verify-full' no
#    puede funcionar: el SAN del cert es solo DNS:localhost.

# 2. Confirmar que el servicio Postgres NO tiene TCP Proxy público activo
#    (Railway → Postgres → Settings → Networking: solo Private Networking).

# 3. Credenciales: un usuario por servicio si se necesita granularidad:
```

```sql
-- Usuario de solo lectura para analítica/BI (nunca la credencial de la app):
CREATE ROLE mep_readonly LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE railway TO mep_readonly;
GRANT USAGE ON SCHEMA public TO mep_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mep_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mep_readonly;
```

**Test de verificación:**

```bash
# El puerto no responde desde Internet (debe fallar/timeout):
nc -zv -w5 <proyecto>.up.railway.app 5432 && echo "EXPUESTO" || echo "OK"

# La conexión exige TLS (desde la red interna, psql):
psql "$DATABASE_URL" -c "SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid();"
# → ssl = t

# Con DATABASE_CA_CERT puesto, una CA falsa debe romper la conexión (chain check).
```

---

## 4. Row-Level Security — cada usuario solo ve sus registros

**Riesgo:** IDOR / fuga cross-tenant — el usuario A lee facturas del
restaurante B cambiando un id en la URL.

**Estado actual: ✅ (a nivel de aplicación, decisión ADR-005)**
El RLS nativo de Postgres se retiró deliberadamente (ADR-005); el aislamiento
se garantiza en la capa de aplicación con **tres barreras que ya existen**:

1. **Resolución central del tenant** — `hooks.server.ts` deriva
   `locals.restaurantId` de la tabla de membresías `user_restaurants` en cada
   request; la cookie `active_restaurant` solo se acepta si el usuario es
   miembro (`resolveMembership`, y re-validación en
   `api/active-restaurant/+server.ts` antes de fijar la cookie).
2. **Scoping obligatorio en queries** — toda query de negocio pasa por
   `forTenant(restaurantId).scope(...)` (`src/lib/server/tenant.ts`):

```ts
const target = forTenant(locals.restaurantId);
const rows = await db.select().from(invoices)
	.where(target.scope(invoices.restaurantId, eq(invoices.id, id)));
```

3. **Lint gates que lo hacen inevitable** — `scripts/lint-invariants.mjs`
   deriva del schema qué tablas tienen `restaurantId` y falla el build si:
   - aparece un `eq(*.restaurantId, ...)` crudo fuera de `tenant.ts`
     (`pnpm lint:tenant-scope`, corre dentro de `pnpm check`);
   - una query toca una tabla tenant sin scope (`pnpm lint:unscoped-query`).

**Test de verificación:**

```bash
pnpm lint:tenant-scope && pnpm lint:unscoped-query
pnpm vitest run tests/tenant-isolation   # suites de aislamiento existentes
```

```ts
// Patrón del test de integración (ya cubierto en tests/tenant-isolation*):
// seed: factura en restaurante B; sesión: usuario de restaurante A
const res = await fetch(`/invoice/${invoiceOfB.id}`, { headers: cookieA });
expect([403, 404, 303]).toContain(res.status); // jamás 200 con datos de B
```

*(Si algún día se quiere defensa en profundidad con RLS nativo, revisar antes
ADR-005 — se retiró por el coste de `SET LOCAL` por transacción con el pooler;
no reintroducirlo sin nuevo ADR.)*

---

## 5. Cifrado de datos en reposo y en tránsito

**Riesgo:** lectura de datos sensibles ante robo de disco/backup o
interceptación de red.

**Estado actual: ⚠️**
- **En tránsito:** TLS 1.2+ en el edge de Railway para todo el tráfico HTTP;
  conexión a Postgres cifrada (`DATABASE_SSL_MODE=require`); S3/Bucket vía
  HTTPS (`AWS_ENDPOINT_URL`); HSTS activo (punto 18).
- **En reposo:** volúmenes y buckets gestionados por Railway (cifrado de
  infraestructura). Las contraseñas van hasheadas (bcrypt), nunca en claro.
- **Hueco:** los tokens de terceros de larga vida (p. ej.
  `WHATSAPP_ACCESS_TOKEN` si se persistiera por tenant) o cualquier columna
  de alta sensibilidad se guardarían en claro. Para esos casos, cifrado a
  nivel de aplicación:

**Implementación (helper AES-256-GCM para columnas sensibles):**

```ts
// src/lib/server/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY = Buffer.from(process.env.DATA_ENCRYPTION_KEY ?? '', 'base64');
// Generar: openssl rand -base64 32  → 32 bytes = AES-256

export function encryptField(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', KEY, iv);
	const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}

export function decryptField(stored: string): string {
	const [, iv, tag, data] = stored.split(':');
	const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
	decipher.setAuthTag(Buffer.from(tag, 'base64'));
	return Buffer.concat([
		decipher.update(Buffer.from(data, 'base64')),
		decipher.final(),
	]).toString('utf8');
}
```

Añadir `DATA_ENCRYPTION_KEY` a `REQUIRED_IN_PRODUCTION` si se adopta, y el
prefijo `v1:` deja la puerta abierta a rotación de clave.

**Test de verificación:**

```ts
// tests/crypto.test.ts
expect(decryptField(encryptField('secreto'))).toBe('secreto');
expect(encryptField('a')).not.toBe(encryptField('a')); // IV aleatorio
// Manipulación → GCM tira (integridad):
expect(() => decryptField(tampered)).toThrow();
```

```sql
-- En la DB la columna jamás contiene el valor en claro:
SELECT col FROM tabla LIMIT 5;  -- todo debe empezar por 'v1:'
```

---

## 6. Fuerza de autenticación — contraseñas y verificación de sesión

**Riesgo:** cuentas comprometidas por contraseñas débiles o sesiones que
sobreviven a un cambio de credenciales.

**Estado actual: ⚠️**
- Sesión JWT firmada con `AUTH_SECRET` (Auth.js, `src/lib/server/auth.ts`),
  30 días de vida, verificada en **cada request** por `hooks.server.ts`
  (`event.locals.auth()`); `/api/*` sin sesión → 401 JSON, páginas → redirect
  a `/login`.
- **Revocación real de JWT**: el callback `jwt` comprueba `tokenVersion`
  contra la DB (`src/lib/server/token-version.ts`) — al cambiar la contraseña
  o borrar la cuenta se incrementa y todas las sesiones emitidas mueren.
- Login con credenciales exige `emailVerified` (`auth-credentials.ts:11`);
  tokens de verificación/reset de un solo uso con TTL 1 h.
- Política de contraseñas centralizada en `src/lib/server/password-policy.ts`
  (mínimo 12, máximo 128 como guard de truncado de bcrypt), aplicada en
  signup, reset y settings — server, formularios (`minlength="12"`) e i18n.
  Las contraseñas existentes de 8-11 caracteres siguen siendo válidas para
  login; la política aplica al crear o cambiar contraseña.

**Implementación:**

```ts
// src/lib/server/password-policy.ts — una sola fuente de verdad
import { createHash } from 'node:crypto';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128; // cap anti-DoS de bcrypt

export function passwordPolicyError(pw: string): string | null {
	if (pw.length < MIN_PASSWORD_LENGTH) return 'tooShort';
	if (pw.length > MAX_PASSWORD_LENGTH) return 'tooLong';
	return null;
}

// k-anonymity contra HaveIBeenPwned (solo viajan 5 chars del SHA-1):
export async function isBreachedPassword(pw: string): Promise<boolean> {
	const sha1 = createHash('sha1').update(pw).digest('hex').toUpperCase();
	const res = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);
	if (!res.ok) return false; // fail-open: no bloquear signup si HIBP cae
	return (await res.text()).includes(sha1.slice(5));
}
```

Sustituir los tres `length < 8` por `passwordPolicyError()` y actualizar los
`minlength="8"` de los formularios a 12.

**Test de verificación:**

```ts
// Toda ruta protegida sin cookie → 401/redirect:
const r = await fetch('/api/notifications');
expect(r.status).toBe(401);

// Cambio de contraseña mata las sesiones antiguas (tokenVersion):
await changePassword(session1);
const r2 = await fetch('/', { headers: session1cookie });
expect(r2.headers.get('location')).toContain('/login');

// Política: signup con 'abcdefgh' (8) → fail(422)
```

---

## 7. Restricción de acceso a registros — RBAC

**Riesgo:** escalada horizontal (datos de otro tenant) o vertical (funciones
de admin/owner sin serlo).

**Estado actual: ✅** — cuatro capas ya operativas:

| Capa | Dónde | Qué controla |
|------|-------|--------------|
| Admin | `isAdminUser()` (`admin.ts`) + gate en `hooks.server.ts:176` | `/admin/*` → 303 a `/` si el email no está en `AUTH_ADMIN_EMAIL` |
| Aprobación de acceso | `access-gate.ts` + `resolveAccess` en hooks | usuarios no aprobados → `/pending` o 403 en API |
| Membresía/tenant | `resolveMembership` + `forTenant()` (punto 4) | solo restaurantes de los que eres miembro |
| Entitlements | `entitlementHandle` + `policyFor(route)` (`entitlements.ts`) | features por plan de suscripción, resueltas desde la fila `subscriptions` de la DB, nunca de claims del cliente |

Acciones owner-only (billing, WhatsApp pairing) comprueban rol dentro de la
membresía (ver `security_rules.md`).

**Implementación (patrón para una nueva ruta admin-only):** no hace falta nada
por ruta — el gate de `hooks.server.ts` cubre todo `/admin/*` por prefijo. Para
una acción owner-only nueva:

```ts
const [m] = await db.select({ role: userRestaurants.role })
	.from(userRestaurants)
	.where(target.scope(userRestaurants.restaurantId, eq(userRestaurants.userId, user.id)));
if (m?.role !== 'owner') throw error(403, 'Owner only');
```

**Test de verificación:**

```ts
// No-admin a /admin → redirect fuera:
const r = await fetch('/admin', { headers: memberCookie, redirect: 'manual' });
expect(r.status).toBe(303);
expect(r.headers.get('location')).toBe('/');

// API con policy de plan sin entitlement → 403 JSON (entitlementHandle)
// Miembro 'staff' intentando abrir billing → 403
```

---

## 8. Bloqueo de manipulación de campos (Mass Assignment)

**Riesgo:** un atacante añade `role=owner` o `accessStatus=approved` al body y
el ORM lo persiste porque el handler hace `update(req.body)`.

**Estado actual: ✅** — el proyecto es inmune por construcción:
- Ningún handler hace spread del body al modelo. El patrón vigente extrae
  **campo a campo** desde `FormData`/JSON y construye el objeto de escritura
  explícitamente (convención "hand-rolled, explicit and local" de
  `security_rules.md`).
- Drizzle exige `.set({ columnas explícitas })` — no existe un
  `Model.update(params)` estilo Rails/Sequelize que acepte claves arbitrarias.
- Los campos privilegiados (`accessStatus`, `tokenVersion`, `role`,
  `subscriptions.*`) solo se escriben en flujos server-side dedicados
  (admin, webhook de Stripe verificado por firma).

**Implementación (el patrón a mantener — allowlist explícita):**

```ts
// CORRECTO (patrón del repo): solo los campos que el usuario puede tocar
const name  = String(form.get('name') ?? '').trim().slice(0, 200);
const notes = String(form.get('notes') ?? '').trim().slice(0, 2000);
await db.update(suppliers)
	.set({ name, notes })                    // nunca role/restaurantId/estado
	.where(target.scope(suppliers.restaurantId, eq(suppliers.id, id)));

// PROHIBIDO: db.update(x).set(Object.fromEntries(form)) — jamás.
```

**Test de verificación:**

```ts
// POST con campo privilegiado extra: se ignora, no se persiste
const form = new FormData();
form.set('name', 'Proveedor X');
form.set('accessStatus', 'approved');      // intento de inyección
await fetch('/suppliers/1?/update', { method: 'POST', body: form, headers: cookie });
const [u] = await db.select().from(users).where(eq(users.id, uid));
expect(u.accessStatus).not.toBe('approved');
```

```bash
# Guard estático: ningún spread de FormData/body hacia .set() o .values()
grep -rn "set(Object.fromEntries\|values(Object.fromEntries" src && echo FALLO || echo OK
```

---

## 9. Protección de cookies

**Riesgo:** robo de sesión por XSS (`document.cookie`), envío en claro, o
CSRF por cookies enviadas cross-site.

**Estado actual: ✅**
- Cookie de sesión (`src/lib/server/auth-session.ts:19` y Auth.js):
  `httpOnly: true`, `secure` en HTTPS, `sameSite: 'lax'`, `path: '/'`, y
  **prefijo `__Secure-`** en producción (el navegador rechaza la cookie si
  algún día llegara sin `Secure`).
- `active_restaurant` (`api/active-restaurant/+server.ts:29` y
  `settings/+page.server.ts:261`): mismos flags.
- `SameSite=Lax` es la elección correcta aquí (no `Strict`): el callback de
  OAuth de Google y los retornos 303 de Stripe Checkout necesitan que la
  cookie viaje en la navegación top-level de vuelta. `Lax` + las form actions
  de SvelteKit (con su check de origin incorporado) cubren CSRF.

**Implementación:** ya aplicada; para cualquier cookie nueva, copiar el patrón:

```ts
cookies.set(name, value, {
	path: '/', httpOnly: true, sameSite: 'lax',
	secure: NODE_ENV === 'production', maxAge: ...,
});
```

**Test de verificación:**

```bash
curl -si https://<dominio>/login -X POST -d '...' | grep -i set-cookie
# Debe verse: __Secure-authjs.session-token=...; Path=/; HttpOnly; Secure; SameSite=Lax
```

```js
// En consola del navegador autenticado:
document.cookie   // NO debe aparecer el session token (HttpOnly)
```

---

## 10. Hashing de contraseñas

**Riesgo:** un volcado de la tabla `users` convierte hashes rápidos (MD5/SHA)
en contraseñas en horas.

**Estado actual: ✅**
- bcrypt con **cost 12** en los cuatro puntos de escritura
  (`signup/+page.server.ts:44`, `reset-password/+page.server.ts:33`,
  `settings/+page.server.ts:216`, `auth-seed.ts:29`); salt embebido en el
  hash por diseño de bcrypt.
- Verificación con `bcrypt.compare` (tiempo constante) en
  `auth-credentials.ts:13`.
- La política pública (`/privacy`) declara exactamente lo que el código hace.

**Implementación (mejora opcional — upgrade transparente de cost):**

```ts
// src/lib/server/auth-credentials.ts — rehash on login si sube el cost
const BCRYPT_COST = 12;
const valid = await bcrypt.compare(password, user.passwordHash);
if (!valid) return null;
if (bcrypt.getRounds(user.passwordHash) < BCRYPT_COST) {
	const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
	await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
}
```

*(Argon2id sería el estado del arte, pero bcrypt-12 es plenamente aceptado por
OWASP; migrar no es prioritario. Si se hace: paquete `argon2`, memoria 19 MiB,
t=2, p=1, con migración perezosa en login como arriba.)*

**Test de verificación:**

```sql
SELECT password_hash FROM users LIMIT 5;
-- Todos con formato $2a$12$ / $2b$12$ (algoritmo bcrypt, cost 12)
```

```ts
// El hash tarda "lo que debe" (~100-300 ms — anti fuerza bruta offline):
const t = performance.now();
await bcrypt.hash('x'.repeat(20), 12);
expect(performance.now() - t).toBeGreaterThan(50);
```

---

## 11. Limitación de intentos de login

**Riesgo:** fuerza bruta / credential stuffing contra `/login`, enumeración en
signup y reset.

**Estado actual: ✅ (con una condición operativa)**
- Todos los formularios públicos pasan por `publicFormAction`
  (`src/lib/server/public-form-action.ts`): resuelve la IP, aplica reglas de
  `checkRateLimit`, devuelve `fail(429, 'rate_limited')` y emite eventos
  `login_rate_limited` / `signup_rate_limited` con **IP hasheada** (punto 20).
- `checkRateLimit` (`rate-limiter.ts`) usa **Upstash Redis sliding window**
  cuando hay credenciales (correcto para multi-réplica) y cae a un token
  bucket en memoria si no (aviso ruidoso en logs).
- **Condición:** en producción tras el proxy de Railway hay que fijar
  `ADDRESS_HEADER=x-forwarded-for` y `XFF_DEPTH=1` — `hooks.server.ts:52` ya
  avisa si falta; sin ello todos los clientes comparten un solo bucket de IP.

**Implementación (regla tipo, ya en uso en login/signup):**

```ts
export const actions = {
	default: publicFormAction({
		limits: ({ ip, form }) => [
			{ key: `login:ip:${ip}`, max: 10, scope: 'ip' },
			{ key: `login:email:${String(form.get('email') ?? '').toLowerCase()}`, max: 5, scope: 'email' },
		],
		rateLimitEvent: 'login_rate_limited',
	}, async (ctx) => { /* verifyCredentials... */ }),
};
```

El doble bucket (IP + email) frena también ataques distribuidos contra una
sola cuenta. El bloqueo es temporal por ventana deslizante — preferible al
lockout permanente, que habilita DoS contra usuarios legítimos.

**Test de verificación:**

```bash
# 11 logins fallidos seguidos → el último debe ser 429:
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<dominio>/login \
    -d "email=victim@example.com&password=wrong$i";
done | tail -1   # → 429
```

```bash
# En prod: confirmar que las IPs se distinguen
railway variables --service web | grep -E "ADDRESS_HEADER|XFF_DEPTH"
```

---

## 12. Protección contra bots

**Riesgo:** signups masivos, spam en la waitlist, scraping de datos.

**Estado actual: ✅**
- **Honeypot siempre activo**: `publicFormAction` rechaza con 422 cualquier
  envío con el campo oculto `_hp` relleno (los bots lo rellenan, los humanos
  no lo ven) — cubre waitlist/signup sin fricción para usuarios.
- Rate limiting por IP en todos los formularios públicos (punto 11) limita el
  volumen de cualquier bot.
- **Cloudflare Turnstile opt-in** en signup y waitlist: `publicFormAction`
  verifica el token contra siteverify cuando `TURNSTILE_SECRET_KEY` está
  configurada (`src/lib/server/turnstile.ts`), y el widget
  (`src/lib/components/Turnstile.svelte`) se renderiza solo cuando
  `PUBLIC_TURNSTILE_SITE_KEY` existe. Sin claves, cero cambios de
  comportamiento. Fail-open si Cloudflare no responde (disponibilidad antes
  que bloqueo de bots). CSP ampliado a `challenges.cloudflare.com` en
  `script-src`/`frame-src`.
- Scraping de datos de negocio: irrelevante — todo lo valioso está detrás de
  login + tenant scoping; las páginas públicas son marketing.

**Implementación (ya aplicada — para activarla, fijar ambas claves):**

```bash
railway variables --service web --set "TURNSTILE_SECRET_KEY=..." \
  --set "PUBLIC_TURNSTILE_SITE_KEY=..."
```

Referencia del flujo:

```svelte
<!-- en el formulario de signup/waitlist -->
<script>
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
</script>
<div class="cf-turnstile" data-sitekey={PUBLIC_TURNSTILE_SITE_KEY}></div>
<svelte:head><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></svelte:head>
```

```ts
// server: dentro del handler de publicFormAction
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
	const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
	});
	return (await res.json()).success === true;
}
if (!(await verifyTurnstile(String(form.get('cf-turnstile-response') ?? ''), ctx.ip)))
	return fail(422, { error: 'bot_suspected' });
```

*(Nota: exigiría añadir `challenges.cloudflare.com` a `script-src`/`frame-src`
en el CSP de `svelte.config.js`.)*

**Test de verificación:**

```bash
# El honeypot bloquea:
curl -s -o /dev/null -w "%{http_code}" -X POST https://<dominio>/waitlist \
  -d "email=bot@x.com&_hp=gotcha"    # → 422

# Con Turnstile: POST sin token → 422; con token válido → 200.
```

---

## 13. Parametrización de consultas (SQL Injection)

**Riesgo:** `' OR 1=1 --` en un input concatenado a SQL → volcado o borrado de
la base de datos.

**Estado actual: ✅ — erradicado por construcción y vigilado por lint:**
- Todas las queries van por Drizzle ORM (`eq()`, `and()`, builders), que emite
  **prepared statements** con placeholders siempre.
- El SQL manual usa el template tag `` sql`...` `` de Drizzle, que parametriza
  las interpolaciones (`${x}` se convierte en `$1`, nunca en concatenación).
- `sql.raw()` está **prohibido por gate de CI**: `pnpm lint:no-sql-raw`
  (`scripts/lint-invariants.mjs`) falla el build si aparece en `src/`.
- El chatbot LLM nunca genera SQL dinámico (ADR, ver `security_rules.md`).

**Implementación (el patrón a seguir):**

```ts
// Builder (preferido):
await db.select().from(invoices)
	.where(target.scope(invoices.restaurantId, eq(invoices.invoiceNumber, userInput)));

// SQL manual cuando hace falta — SIEMPRE con ${}, que parametriza:
await db.execute(sql`
	SELECT date_trunc('month', invoice_date) AS m, sum(total_amount) AS total
	FROM invoices
	WHERE restaurant_id = ${restaurantId} AND supplier_name = ${userInput}
	GROUP BY 1
`);

// PROHIBIDO (y bloqueado por lint): sql.raw(`... ${userInput} ...`)
```

**Test de verificación:**

```bash
pnpm lint:no-sql-raw   # gate estático, corre en CI
```

```ts
// Payloads clásicos tratados como literales, no como SQL:
for (const p of [`' OR '1'='1`, `"; DROP TABLE users; --`, `1; SELECT pg_sleep(5)`]) {
	const rows = await searchSuppliers(rid, p);
	expect(rows).toEqual([]);          // 0 resultados, 0 errores de sintaxis
}
```

---

## 14. Validación de entradas en backend

**Riesgo:** datos malformados que corrompen estado, provocan 500s explotables
o llegan a sinks peligrosos.

**Estado actual: ✅ (convención deliberada del repo)**
La validación es **manual, explícita y local a cada endpoint** — es una
decisión documentada en `security_rules.md` ("No zod — keep validation
explicit and local"), no una carencia. Los elementos ya presentes:
- Cast + normalización en el borde: `String(form.get('x') ?? '').trim()`,
  `.toLowerCase()` en emails, caps de longitud, `Number.isFinite` en números.
- Whitelists para enums (extensiones de archivo, modos, estados).
- Anti open-redirect: `safeRedirect` rechaza prefijos `//` y `/\`.
- La salida del LLM se parsea como JSON y se valida campo a campo antes de
  tocar la DB (nunca se confía en la estructura devuelta).

**Implementación (plantilla canónica para un endpoint nuevo):**

```ts
export const actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();

		const name = String(form.get('name') ?? '').trim();
		if (!name || name.length > 200) return fail(422, { error: 'name_invalid' });

		const qty = Number(form.get('qty'));
		if (!Number.isFinite(qty) || qty < 0 || qty > 1_000_000)
			return fail(422, { error: 'qty_invalid' });

		const unit = String(form.get('unit') ?? '');
		if (!['kg', 'l', 'ud'].includes(unit)) return fail(422, { error: 'unit_invalid' });

		// Solo tras validar TODO se toca la DB, y siempre tenant-scoped:
		// db.insert(...).values({ name, qty: String(qty), unit, restaurantId: rid })
	},
};
```

Reglas: validar **antes** de cualquier efecto; responder `fail(422)` con clave
i18n, nunca eco del valor crudo; longitud máxima en todo string persistido.

**Test de verificación:**

```ts
// Por endpoint: tabla de casos inválidos → todos 422, ninguno toca la DB
const bad = [
	{ name: '' }, { name: 'x'.repeat(201) },
	{ qty: 'NaN' }, { qty: '-1' }, { unit: 'DROP' },
];
for (const c of bad) expect((await post('/products?/create', c)).status).toBe(422);
```

---

## 15. Escape de contenido del usuario (XSS)

**Riesgo:** un nombre de proveedor como `<img src=x onerror=...>` ejecuta JS
en el navegador de otro usuario y roba su sesión.

**Estado actual: ✅**
- Svelte **escapa por defecto** toda interpolación `{...}` — el 100 % del
  contenido de usuario (nombres de proveedores, facturas, notas, y todo lo
  extraído por el LLM de PDFs subidos) se renderiza escapado.
- Solo existen **dos** usos de `{@html}` en todo `src/`:
  1. `waitlist/+page.svelte` — bloque JSON-LD para SEO. Contenido estático +
     `canonicalUrl` derivada en servidor, y el `JSON.stringify` escapa `<`
     como `\u003c`, de modo que ningún campo futuro pueda cerrar el tag con
     `</script>`.
  2. `settings/+page.svelte:351` — SVG de QR **generado en servidor** por
     `qrcode-generator` (`src/lib/server/qr.ts`), sin input de usuario.
- El CSP (punto 18) es la segunda muralla: `script-src 'self'` en modo hash
  bloquea cualquier script inline inyectado aunque un escape fallara.

**Implementación (ya aplicada):**

```svelte
<!-- src/routes/waitlist/+page.svelte -->
<script>
	const jsonLd = JSON.stringify({ /* ...igual que ahora... */ })
		.replace(/</g, '\\u003c');   <!-- neutraliza </script> y <!-- -->
</script>
{@html `<script type="application/ld+json">${jsonLd}</script>`}
```

Regla de repo: **nuevo `{@html}` solo con contenido generado en servidor y
nunca derivado de input de usuario**; si hiciera falta HTML de usuario algún
día, sanitizar con `dompurify` antes.

**Test de verificación:**

```ts
// Payload almacenado → llega escapado al HTML:
await createSupplier(rid, { name: `<script>window.pwned=1</script>` });
const html = await (await fetch('/suppliers', { headers: cookie })).text();
expect(html).toContain('&lt;script&gt;');
expect(html).not.toContain('<script>window.pwned');
```

```bash
# No aparecen nuevos {@html} sin revisión:
grep -rn "{@html" src --include="*.svelte" | wc -l   # esperado: 2
```

---

## 16. Restricción de subidas de archivos

**Riesgo:** subir un `.php`/`.html` ejecutable, un zip-bomb, o un path
traversal (`../../etc/passwd`) vía nombre de archivo.

**Estado actual: ✅ (ADR-016) — defensa en cuatro capas ya implementadas:**

| Capa | Dónde | Detalle |
|------|-------|---------|
| Extensión | `sessions.ts:6` | allowlist `.pdf .jpg .jpeg .png .xml` — todo lo demás → `unsupportedType` |
| Contenido real | `sessions.ts:67` | **magic bytes**: el contenido debe coincidir con la extensión (`contentMismatch` si un `.exe` se renombra a `.pdf`) |
| Tamaño | `(app)/+page.server.ts:37` | 20 MB por archivo, rechazo antes de procesar; cuota de uploads por plan |
| Almacenamiento | `storage.ts` | fuera de la raíz pública: `uploads/` en disco (nunca servido estáticamente) o bucket S3; el `LocalDriver.read` verifica que la ruta resuelta siga dentro de `base` (anti-traversal); nombres re-generados con sufijo (`stem_suffix.ext`) |
| Servido | `hooks.server.ts:196` | los archivos se sirven solo vía `/api/upload/*` (autenticado + tenant-scoped) con `X-Content-Type-Options: nosniff` y framing limitado a `SAMEORIGIN` |

**Implementación:** ya aplicada; al añadir un tipo nuevo, tocar **las dos**
tablas (`ALLOWED_EXTENSIONS` **y** `MAGIC_BYTES`) — nunca solo la primera.

**Test de verificación:**

```ts
// 1. HTML renombrado a .pdf → contentMismatch:
const fake = new File(['<html><script>x</script></html>'], 'invoice.pdf');
expect((await upload(fake)).errors[0].reason).toBe('contentMismatch');

// 2. Extensión fuera de la allowlist:
expect((await upload(new File(['x'], 'shell.php'))).errors[0].reason).toBe('unsupportedType');

// 3. Traversal en la clave de lectura:
await expect(getStorage().read('../../etc/passwd')).rejects.toThrow('Invalid storage key');
```

```bash
# 4. uploads/ jamás accesible sin sesión:
curl -s -o /dev/null -w "%{http_code}" https://<dominio>/uploads/x.pdf  # → 404
curl -s -o /dev/null -w "%{http_code}" https://<dominio>/api/upload/1/x.pdf  # sin cookie → 401
```

---

## 17. Limitación de consumo de API (rate limiting general)

**Riesgo:** abuso de endpoints caros (LLM, exports) y DoS de capa 7.

**Estado actual: ✅**
- **Por ruta: excelente.** Más de 25 endpoints ya limitados con
  `checkRateLimit` y presupuestos ajustados al coste real: chat LLM
  (`CHAT_RATE_LIMIT_RPM`), export de cuenta (5/min), borrado (3/min), uploads
  (10/min), APIs de lectura (60/min)… Backend Upstash → válido multi-réplica.
- Los endpoints más caros del sistema (extracción con Gemini) tienen además
  un **semáforo distribuido** (`acquireExtractionSlot`, lease en Redis) que
  capa la concurrencia global.
- **Backstop global** en `hooks.server.ts`: toda ruta `/api/*` (salvo
  `/api/health` y los webhooks firmados de Stripe/WhatsApp) pasa por
  `checkRateLimit('api-global:<sujeto>')` — sujeto = id de usuario
  autenticado, o IP si no hay sesión. `API_GLOBAL_RATE_LIMIT` (300/min por
  defecto, 0 lo desactiva) responde 429 con `Retry-After` antes de tocar la
  DB de membresías.

**Implementación (ya aplicada):**

```ts
// hooks.server.ts — dentro de appHandle, tras resolver la sesión:
const API_GLOBAL_MAX = 300;   // req/min por sujeto; generoso, es un backstop

if (path.startsWith('/api/') && path !== '/api/health') {
	const subject = user ? `u:${user.id}` : `ip:${event.getClientAddress()}`;
	if (!(await checkRateLimit(`api-global:${subject}`, API_GLOBAL_MAX))) {
		return json({ error: 'Too many requests' }, {
			status: 429, headers: { 'Retry-After': '60' },
		});
	}
}
```

*(El DoS volumétrico real se absorbe en el edge de Railway/Cloudflare — el
límite de aplicación protege el coste por request: DB, LLM, CPU.)*

**Test de verificación:**

```bash
# Ráfaga sobre una API cualquiera → aparece el 429 del backstop:
seq 1 320 | xargs -P8 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Cookie: $SESSION" https://<dominio>/api/trend | sort | uniq -c
# Esperado: mayoría 200/…, cola de 429

# Y los límites por ruta siguen siendo los primeros en saltar (más estrictos).
```

---

## 18. Cabeceras de seguridad HTTP

**Riesgo:** clickjacking, MIME sniffing, inyección de scripts de terceros,
downgrade a HTTP.

**Estado actual: ✅ — todo aplicado centralmente:**
- `hooks.server.ts:196-201`, en **toda** respuesta:
  - `X-Frame-Options: DENY` (SAMEORIGIN solo para el visor de PDFs propio)
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- **CSP en `svelte.config.js` en modo `hash`** (más fuerte que nonce para
  contenido estático): `default-src 'self'`, `script-src 'self'`,
  `object-src 'none'`, `base-uri 'self'`, `frame-src 'self'`,
  `form-action` limitado a self + Google OAuth + Stripe Checkout/Portal —
  cada excepción justificada con comentario en el propio archivo.
- Respuestas autenticadas con `Cache-Control` privado
  (`applyPrivateCacheHeaders`) — evita fugas por cachés intermedias.

**Implementación:** ya aplicada. Regla de mantenimiento: cualquier script o
endpoint de terceros nuevo se añade a la directiva CSP **más estrecha** que lo
permita, con comentario del porqué (patrón ya seguido en el archivo).

**Test de verificación:**

```bash
curl -sI https://<dominio>/ | grep -iE \
  "content-security-policy|x-frame-options|x-content-type|strict-transport|referrer-policy|permissions-policy"
# Deben aparecer las 6.

# Auditoría externa (objetivo A/A+):
# https://observatory.mozilla.org y https://securityheaders.com
```

```ts
// Regresión en CI:
const h = (await fetch('/login')).headers;
expect(h.get('x-frame-options')).toBe('DENY');
expect(h.get('x-content-type-options')).toBe('nosniff');
expect(h.get('strict-transport-security')).toContain('max-age=31536000');
```

---

## 19. Fuerza HTTPS

**Riesgo:** credenciales y cookies viajando en claro; MITM en redes públicas.

**Estado actual: ✅**
- Railway termina TLS en el edge con certificados válidos autogestionados
  (Let's Encrypt) y **redirige HTTP→HTTPS automáticamente** para los dominios
  del servicio — no hace falta (ni conviene) duplicar el redirect en la app.
- HSTS con `max-age` de 1 año + `includeSubDomains` + `preload`
  (punto 18) hace que el navegador ni siquiera intente HTTP tras la primera
  visita.
- Las cookies llevan `Secure` + prefijo `__Secure-` (punto 9): aunque un
  downgrade ocurriera, la sesión no viajaría.
- Interno: `postgres.railway.internal` va por la red privada del proyecto;
  la conexión Postgres va además cifrada (punto 3).

**Implementación:** ya aplicada. Pasos operativos al añadir dominio propio:
apuntar CNAME a Railway, esperar el cert, verificar el redirect, y (opcional)
enviar el dominio a https://hstspreload.org una vez estable.

**Test de verificación:**

```bash
# Redirect HTTP → HTTPS:
curl -sI http://<dominio>/ -o /dev/null -w "%{http_code} %{redirect_url}\n"
# → 301/308 https://<dominio>/

# Certificado válido y protocolo moderno:
echo | openssl s_client -connect <dominio>:443 2>/dev/null \
  | openssl x509 -noout -dates -issuer
# Auditoría completa: https://www.ssllabs.com/ssltest/ (objetivo A)
```

---

## 20. Registro y auditoría — logging sin datos sensibles

**Riesgo:** contraseñas, tokens o PII acabando en logs/Sentry — accesibles a
todo el equipo y a terceros (proveedor de observabilidad).

**Estado actual: ✅ — diseñado así desde el principio:**
- **Sentry sin PII**: `sendDefaultPii: false`, y todo evento pasa por
  `scrubSentryEvent` (`src/lib/sentry-scrub.ts`) antes de salir
  (`hooks.server.ts:36`). El usuario se identifica **solo por id** interno
  (`setUser({ id })`), nunca email/nombre.
- **Auditoría de autenticación** (`src/lib/server/auth-events.ts`): eventos
  tipados (`login_failed`, `login_rate_limited`, `password_reset_completed`,
  `password_changed`…) con la **IP hasheada** (`hashIp`: SHA-256 truncado a
  12 hex) — correlacionable para detectar ataques, no reversible a la IP.
- Las contraseñas jamás se registran: los handlers de auth solo loguean el
  tipo de evento + `ipHash` + scope. Los errores de login no distinguen
  "usuario no existe" de "contraseña mal" (anti-enumeración).

**Implementación (patrón para nuevos eventos auditables):**

```ts
// SIEMPRE a través del helper, nunca console.log con el objeto crudo:
logAuthEvent('password_changed', { ipHash: hashIp(ip) });

// Para acciones de negocio sensibles (admin, borrados), registrar
// identificadores internos, nunca contenido:
console.info('[audit] invoice-bulk-delete', {
	userId: user.id, restaurantId: rid, count: ids.length,
});
```

Reglas: (1) ids internos sí, emails/nombres/importes no; (2) el valor de un
input de usuario nunca se interpola en un log (log injection + PII); (3) ante
un error, loguear `error.message`, no el body de la request.

**Test de verificación:**

```ts
expect(hashIp('203.0.113.7')).toHaveLength(12);
expect(hashIp('203.0.113.7')).not.toContain('203');

// scrubSentryEvent elimina cabeceras/campos sensibles (test unitario existente)
```

```bash
# Barrido periódico de sinks peligrosos:
grep -rniE "console\.(log|info|warn|error)\(.*(password|passwordHash|authorization|token[^V])" src \
  && echo "REVISAR" || echo "OK"

# En Railway: railway logs --service web | grep -iE "password=|@gmail|@hotmail"  → vacío
```

---

## Cadencia de verificación

- **En cada PR (CI, ya existente + propuesto):** `pnpm check`
  (incluye `lint:tenant-scope`), `pnpm lint:no-sql-raw`,
  `pnpm lint:unscoped-query`, tests de aislamiento de tenant, **gitleaks**
  (punto 2).
- **Mensual:** `curl -sI` de cabeceras (punto 18), securityheaders.com,
  revisión de `pnpm audit` / overrides de `package.json` (ya se usan
  overrides para CVEs de transitorias — mantener la práctica).
- **Trimestral:** SSL Labs (punto 19), escaneo trufflehog del historial
  (punto 2), revisión de `AUTH_ADMIN_EMAIL` y de credenciales de servicio
  (punto 3), simulacro de rate limits (puntos 11/17).
- **Ante cualquier sospecha de fuga:** rotar primero (punto 2), preguntar
  después.
