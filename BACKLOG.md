# MURMULLO - Backlog de Issues y Mejoras

## Issues Encontrados Durante Testing

### ALTO - Afectan estabilidad

#### ISSUE-001: Múltiples procesos de Murmullo (6 instancias)
- **Fecha**: 2026-02-03
- **Descripción**: Al revisar procesos corriendo, se encontraron 6 instancias de Murmullo.exe ejecutándose simultáneamente
- **Impacto**: Consumo excesivo de memoria, posibles conflictos de hotkeys, comportamiento impredecible
- **Causa probable**: La app instalada no está usando `app.requestSingleInstanceLock()` correctamente, o hay procesos zombie que no se terminan
- **Solución propuesta**:
  1. Verificar que `app.requestSingleInstanceLock()` está implementado correctamente
  2. Agregar cleanup de procesos huérfanos al iniciar
  3. Revisar el instalador NSIS para asegurar que cierra todas las instancias antes de actualizar

---

## Mejoras Pendientes (de Fase 1: Seguridad)

### Completado ✅
- [x] Eliminar .env del repositorio, crear .env.example
- [x] Implementar cifrado de API keys con electron-safeStorage
- [x] Sanitizar logs (no mostrar contenido de transcripciones completo)
- [x] Agregar Content Security Policy
- [x] Implementar validación de IPC

### Pendiente
- [ ] Cifrar base de datos SQLite local (SQLCipher o similar)
- [ ] Agregar tests para las funciones de seguridad

---

## Backlog Futuro (Fases 2-6)

Ver plan completo en: `~/.claude/plans/curious-seeking-porcupine.md`

### Fase 2: Testing Automatizado ✅ COMPLETADA
- [x] Configurar Vitest - `vitest.config.js` creado
- [x] Configurar Playwright - `playwright.config.js` creado
- [x] Implementar tests prioritarios - **62 tests pasando**
  - 20 tests de seguridad (IPC validation, log sanitization)
  - 13 tests de audio (WAV conversion, format detection)
  - 18 tests de configuración (settings, hotkeys, providers)
  - 11 tests de integración (transcription flow, clipboard)
- [x] Configurar GitHub Actions - `.github/workflows/ci.yml` creado
- [x] E2E tests básicos con Playwright para Electron

### Fase 3: Backend MVP ✅ COMPLETADA
- [x] Diseñar API REST - Express.js con rutas modulares
- [x] Implementar autenticación JWT - Login, registro, refresh tokens
- [x] Proxy de Whisper API - `/api/v1/transcription`
- [x] Proxy de Claude/GPT API - `/api/v1/ai/process`
- [x] Rate limiting - Por endpoint con express-rate-limit
- [x] Base de datos PostgreSQL - Migraciones incluidas
- [x] Tracking de uso - Por usuario con límites por plan
- [x] Documentación API - README.md con endpoints

### Fase 4: Monetización
- [ ] Integrar Stripe
- [ ] Implementar planes (Free/Pro/Business)
- [ ] Dashboard de facturación

### Fase 5: Conectar Electron a Backend ✅ COMPLETADA
- [x] API client para comunicación con backend - `src/services/apiClient.js`
- [x] Backend mode handlers en main.js - Routing de transcripción por backend
- [x] Persistencia de tokens JWT en config.json
- [x] IPC handlers para backend - login, register, logout, getMe, getUsage
- [x] UI de cuenta en ControlPanel - Toggle backend mode, login inline, uso
- [x] Preload.js actualizado con nuevos handlers

### Fase 6: Pulido
- [ ] Auto-updates con electron-updater
- [ ] Onboarding mejorado
- [ ] Documentación de usuario

### Fase 7: Deploy Backend
- [ ] Configurar Render/Railway
- [ ] Variables de entorno en producción
- [ ] Dominio y SSL

### Fase 8: Android (opcional)
- [ ] React Native app
