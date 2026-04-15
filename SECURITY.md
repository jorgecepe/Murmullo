# Política de seguridad

## Reportar vulnerabilidades

Si descubres una vulnerabilidad, **no abras un issue público**. Escribe
directamente a (correo por definir cuando se habilite el soporte
público) con:

- Descripción de la vulnerabilidad.
- Pasos para reproducirla.
- Versión afectada (ver `package.json`).
- Impacto potencial.

Nos comprometemos a responder en 72 horas y a publicar un parche en
un plazo razonable según la severidad.

## Versiones soportadas

| Versión | Soporte |
|---------|---------|
| 1.9.x   | Parches activos |
| 1.8.x   | Parches críticos hasta 2026-10 |
| < 1.8   | Sin soporte |

## Auditoría de dependencias

Murmullo ejecuta `npm audit` en cada build de CI. El estado actual
(2026-04-14) tiene hallazgos conocidos en **dependencias de
build-time**, no de runtime. Detalle:

### Vulnerabilidades conocidas (build-time únicamente)

Todas están en la cadena `electron-builder → cacache → tar`:

- GHSA-8qq5-rm4j-mr97 (tar arbitrary file overwrite via symlink)
- GHSA-83g3-92jg-28cx (tar hardlink target escape via symlink chain)
- GHSA-qffp-2rhf-9h96 (tar hardlink path traversal)
- GHSA-9ppj-qmqm-q256 (tar symlink path traversal)
- GHSA-r6q2-hw4h-h46w (tar race condition on macOS APFS)

**Impacto en runtime:** ninguno. Estas librerías solo se ejecutan
durante `npm run build:win` / `build:mac` / `build:linux`, nunca en el
ejecutable distribuido al usuario final. El `.exe` firmado no incluye
`tar` ni `cacache`.

**Mitigación en CI/local:** los runners de GitHub Actions son
efímeros (se recrean por build), lo que cierra la ventana de
explotación. Localmente, solo se exponen si el desarrollador extrae
un tarball malicioso de una fuente no confiable durante `npm install`.

**Fix planificado para v1.10:** actualizar `electron-builder` a
`26.x` (breaking change según `npm audit fix --force`). Se pospone
para no romper el pipeline de v1.9-beta ya validado. Seguimiento en
el backlog.

### Runtime dependencies

Las dependencias que corren en el binario final (Electron, React, etc.)
están auditadas sin hallazgos altos/críticos abiertos al momento del
release. Si aparecen nuevos CVE para dependencias de runtime, el
release siguiente los absorberá con máxima prioridad.

## Arquitectura de defensa

Resumen de las capas aplicadas en v1.9:

1. **contextIsolation + nodeIntegration=false + sandbox=true** en ambas
   ventanas Electron: el renderer no puede invocar APIs de Node ni
   acceder al sistema de archivos.
2. **Validación estricta de IPC** (ipcValidation.js): cada canal tiene
   un esquema; canales desconocidos se rechazan.
3. **Rate limiting por canal** (rateLimiter.js): defensa contra bucles
   runaway o XSS que intenten agotar quota de API.
4. **safeStorage del OS** para API keys; base64 como fallback solo en
   sistemas sin DPAPI/Keychain.
5. **CSP estricta**: `default-src 'self'`, `connect-src` whitelist
   explícita (OpenAI, Anthropic, Groq, Google, Murmullo backend).
6. **DEBUG desactivado en builds empaquetados**: sin logs verbosos
   que expongan rutas de usuario o metadata de hardware.
7. **Timeout absoluto en grabación** (5 min) y API calls (60 s).
8. **Límite free tier persistente** (30 min) para prevenir abuso con
   API keys del proyecto.

## Historial de revelaciones

(Vacío, ningún incidente reportado hasta hoy.)
