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

### Fase 3: Backend MVP
- Diseñar API REST
- Implementar autenticación JWT
- Proxy de APIs (Whisper, Claude)
- Rate limiting

### Fase 4: Monetización
- Integrar Stripe
- Implementar planes

### Fase 5: Pulido
- Auto-updates
- Onboarding
- Documentación

### Fase 6: Android (opcional)
- React Native
