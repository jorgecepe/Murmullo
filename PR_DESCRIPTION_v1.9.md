# PR: v1.9-dev → main (production hardening)

*Este archivo es material para la descripción del PR cuando decidas
fusionar la rama v1.9-dev a main. Copia/pega las secciones en el form
de `gh pr create` o la UI de GitHub.*

## Título sugerido

`v1.9.0-beta.0: production hardening (security, free tier, legal, code signing prep)`

## Summary

- Rama `v1.9-dev` creada desde v1.8.0 el 2026-04-14. Tag `v1.8.0-stable` funciona como punto de restauración si algo se rompe en producción.
- Hardening multi-capa de Electron, monetización con contador de 30 minutos visible, onboarding guiado, documentación legal completa, y preparación de code signing.
- 102 tests en verde (18 nuevos: rateLimiter, usageTracker).
- Build Windows v1.9.0-beta.0 verificado localmente: `Murmullo-Setup-1.9.0-beta.0.exe` (108 MB).

## Cambios por área

### Seguridad
- `sandbox: true` en las dos ventanas Electron. Reduce drásticamente el blast radius de cualquier XSS en el renderer.
- `DEBUG = !app.isPackaged`: los instaladores firmados dejan de escribir logs verbosos con rutas del usuario y metadata de hardware.
- `rateLimiter.js`: token buckets por canal IPC. 10/min en transcribe-audio, 20/min en process-text, 5/min en backend-login (defensa brute-force), 120/min default.
- CSP extendida para Groq y Google Gemini sin abrir orígenes arbitrarios.
- `webPreferences`: experimentalFeatures, navigateOnDragDrop, webgl desactivados.
- `SECURITY.md` con política de reporting y estado de auditoría de deps.

### Monetización (free tier 30 min)
- `usageTracker.js`: persiste segundos transcritos en `%APPDATA%/murmullo/usage.json`. BYOK y backend-auth bypasean el ceiling automáticamente.
- Handler `transcribe-audio` aplica el gate antes de llamar a OpenAI y registra duración tras éxito (lectura directa del header WAV cuando es posible, estimación por conteo de palabras como fallback).
- Handlers nuevos: `get-usage`, `reset-usage`, `validate-api-key`.
- `UsagePanel` component: contador visible en el tab GENERAL, barra de progreso con umbrales de color (azul/ámbar/rojo), CTAs a tabs API Keys y Account cuando se agota.
- Tooltip del ícono flotante muestra minutos restantes de prueba gratuita en estado idle.

### UX / Onboarding
- `WelcomeModal`: flujo de 3 pasos (bienvenida → elegir path BYOK/trial/backend → confirmación). Valida API key en vivo contra OpenAI antes de persistir.
- Auto-abrir ControlPanel en primer uso (marker `.first-run-completed` en userData). Evita que el usuario primerizo se quede atascado con solo el ícono flotante.
- Mensajes de error específicos en App.jsx: traduce `rate_limit_exceeded`, `FREE_TIER_EXHAUSTED`, `401`, `network` a texto accionable en español.
- Hard cap de 5 minutos en grabación para prevenir fugas de memoria por hotkeys olvidados.

### Legal y compliance
- `LICENSE` (MIT con atribución a Open-Whispr).
- `NOTICE` (dependencias y servicios de terceros detallados).
- `PRIVACY.md` (política de privacidad con tabla de datos almacenados).
- `TERMS.md` (términos de uso, plan gratuito, jurisdicción Chile).
- `CODE_SIGNING.md` (guía paso a paso para EV cert + eSigner).
- `SECURITY.md` (política de reporting, estado de auditoría de deps).

### CI/CD
- `.github/workflows/ci.yml`: consume `WIN_CSC_LINK` y `WIN_CSC_KEY_PASSWORD` desde secrets (no-op si no existen, forks siguen building).
- Rama `v1.9-dev` y tags `v*` añadidos como triggers.
- `package.json` preparado para code signing: `signingHashAlgorithms: ["sha256"]`, `publisherName`, `verifyUpdateCodeSignature: true`. `signAndEditExecutable` queda en `false` hasta que el cert EV esté comprado (evita que el build local falle por privilegios de symlink; ver `signing_symlink_gotcha` en memoria).

## Test plan

- [ ] Instalar `Murmullo-Setup-1.9.0-beta.0.exe` en una máquina limpia.
- [ ] Confirmar que el ControlPanel se abre automáticamente y muestra el WelcomeModal.
- [ ] Probar el flujo BYOK: pegar una API key de OpenAI, confirmar que la validación en vivo marca "Clave verificada".
- [ ] Pegar una API key inválida y confirmar que el mensaje dice "OpenAI rechazó la clave".
- [ ] Sin API key configurada, grabar varias veces y observar que el UsagePanel acumula minutos.
- [ ] Al pasar del 80% mostrar banner ámbar; al 100% mostrar banner rojo con CTAs.
- [ ] Cambiar a backend-auth y confirmar que el banner se reemplaza por "Sin límite".
- [ ] Verificar tooltip del ícono flotante muestra minutos restantes.
- [ ] Grabar más de 5 minutos y confirmar que se auto-detiene con toast.
- [ ] Cerrar internet, intentar grabar, confirmar mensaje "Sin conexión".
- [ ] Lanzar varios transcribes seguidos muy rápido y confirmar que el rate limiter devuelve mensaje amigable.

## Cosas que NO están en este PR (backlog para v1.10)

- Refactor de `ControlPanel.jsx` (2.5k líneas en un solo archivo, ya identificado como tech debt).
- Bump de `electron-builder` a 26.x para cerrar las vulns de `tar`/`cacache` (build-time only; ver SECURITY.md para el análisis).
- Sistema de demo-key para el "primeros 30 min gratis pagados por Murmullo" sin obligar al usuario a traer su propia key ni registrarse. Requiere desplegar un endpoint proxy sin-auth en el backend.
- Telemetría opt-in.
- Modo offline con whisper.cpp local.

## Qué hacer al mergear

1. Cuando confirmes el smoke test, fusiona con `Squash and merge` o merge directo (prefieres el segundo para preservar la secuencia de commits incrementales).
2. Pushea tag `v1.9.0-beta.0` para que el job de release de CI arranque:
   ```bash
   git tag v1.9.0-beta.0 && git push origin v1.9.0-beta.0
   ```
3. Cuando tengas el certificado EV, crea los secrets `WIN_CSC_LINK` y `WIN_CSC_KEY_PASSWORD` en `Settings → Secrets and variables → Actions`, flipea `signAndEditExecutable: true` en `package.json`, y pushea un tag `v1.9.0` (sin `-beta`) para el release firmado.
