# TODO: ops scripts (Fase 2)

Pendientes de la re-revisión independiente (2026-11-17).

- [ ] **R1. `pg-backup.sh:71,74,136`: un fallo real de `aws cp` borra el dump terminado.** `finished` solo es 1 al final (o en la rama de verificación de tamaño), así que si `aws s3 cp` sale con error el `cleanup` elimina el dump local (comprobado: directorio vacío). Es coherente con "no dejar datos en claro", pero se pierde el trabajo y la rama de "verification failed" sí lo conserva: criterio distinto. Sugerencia: unificar (conservar siempre en fallo de subida y avisar, o borrar siempre y decirlo).
- [ ] **R2. `pg-backup.sh:168-169`: con el reloj mal, la rotación se omite con salida 0.** Un cron no alertará. Sugerencia: salir con un código propio (p. ej. 3) o escribir una línea que el monitor pueda buscar.
- [ ] **R3. `lib-pgurl.sh:47`: solo se respeta `sslmode` de la query de la URL.** `sslrootcert`, `connect_timeout`, `options`, `application_name` se descartan en silencio (probado: `?sslmode=disable&connect_timeout=5` conecta, el resto se ignora); un `sslmode=verify-full` + `sslrootcert` degradaría a verificación sin CA. Sugerencia: rechazar parámetros desconocidos con un error claro o mapearlos a `PG*`.
- [ ] **R4. `pg-backup.sh:37` y `verify:27` cargan `lib-pgurl.sh` de su propio directorio.** La imagen del job diario (acción 3 del autor) debe copiar ese fichero junto al script, o fallará al arrancar.
