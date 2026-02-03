# Changelog

Todos los cambios notables de Murmullo serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.4.0] - 2026-02-03

### Agregado
- **Auto-actualizaciones**: Murmullo detecta, descarga e instala actualizaciones automáticamente
- **Nueva pestaña "Actualizaciones"**: Ver estado de updates, descargar e instalar manualmente
- **Indicador de progreso detallado**: Muestra en qué etapa está el procesamiento (Preparando audio, Transcribiendo, Procesando con IA, etc.)
- **Toast de errores visible**: Los errores ahora se muestran como notificaciones visibles en lugar de solo en tooltip
- **Sonido de completado**: Beep sutil al terminar una transcripción exitosamente
- **Auto-guardado de settings**: Los cambios se guardan automáticamente con debounce de 1 segundo
- **Exportar historial a CSV**: Botón para descargar todas las transcripciones como archivo CSV
- **Retry automático para errores de red**: Las llamadas a APIs reintentan hasta 3 veces con backoff exponencial
- **Guía de troubleshooting**: Nuevo archivo TROUBLESHOOTING.md con soluciones a problemas comunes

### Mejorado
- **Prevención de múltiples instancias**: Uso de `process.exit(0)` para garantizar cierre inmediato de instancias duplicadas
- **CI/CD para releases**: GitHub Actions publica releases automáticamente cuando se crea un tag

### Build
- `Murmullo Setup 1.4.0.exe` - Instalador NSIS con auto-update
- `Murmullo-Portable-1.4.0.exe` - Versión portable

---

## [1.3.0] - 2026-01-30

### Agregado
- **Backend mode**: Conexión a servidor Murmullo para usar sin API keys propias
- **Sistema de autenticación**: Login/registro para usuarios del backend
- **Tracking de uso**: Muestra minutos utilizados vs límite del plan

---

## [1.2.0] - 2026-01-23

### Agregado
- **UI flotante minimal**: Ventana reducida a 60x60px como indicador circular en esquina inferior derecha
- **Conversión WAV en renderer**: Evita bug de Chromium MediaRecorder que corrompía headers WebM
- **Formateo de listas en español**: Detecta palabras numéricas (uno, dos, tres...) y las convierte a formato de lista numerada
- **Sección "Acerca de" mejorada**: Versión dinámica, links a GitHub, Changelog y reporte de issues
- **Audios de prueba**: 4 archivos WAV de ejemplo en `test_audio/` para testing
- **Flag SAVE_DEBUG_AUDIO**: Permite capturar audios para debugging (desactivado por defecto)

### Cambiado
- **Operación solo por hotkey**: Eliminada funcionalidad de click, solo responde a Ctrl+Shift+Space
- **Limpieza de recursos de audio**: Mejor manejo del ciclo de vida de MediaRecorder y streams

### Corregido
- **Bug de regex en listas**: El uso de `test()` en regex global consumía el estado e impedía el `replace()` posterior
- **Headers WebM corruptos**: Conversión a WAV evita el problema de headers inválidos en grabaciones consecutivas

### Build
- `Murmullo Setup 1.2.0.exe` - Instalador NSIS
- `Murmullo-Portable-1.2.0.exe` - Versión portable

---

## [1.1.0] - 2025-01-21

### Agregado
- **Sistema de logs persistentes**: Los logs se guardan en `%APPDATA%/murmullo/logs/` con un archivo por día
- **Pestaña de Logs en configuración**: Ver, exportar y limpiar archivos de log desde la UI
- **Opción "Export Logs" en menú del systray**
- **Instalador Windows**: Configuración de electron-builder para crear instaladores NSIS y portable
- **Icono de aplicación**: Icono 256x256 para el instalador

### Cambiado
- **Preservación del portapapeles**: Las transcripciones ya no sobrescriben el contenido del portapapeles. Se guarda y restaura automáticamente.

### Build
- `Murmullo Setup 1.1.0.exe` - Instalador NSIS
- `Murmullo-Portable-1.1.0.exe` - Versión portable

---

## [1.0.0] - 2025-01-21

### Agregado
- **Optimización de latencia**: Envío directo de WebM a Whisper API (sin conversión FFmpeg)
- **Formateo automático de listas**: Detecta listas numeradas y agrega saltos de línea
- **Pestaña de Estadísticas**: Contador de transcripciones, palabras, tiempo ahorrado
- **Estimación de costos**: Cálculo aproximado de uso de API en la pestaña Stats
- **Pestaña de Ayuda**: Información de precios de APIs y enlaces útiles

### Cambiado
- **Prompt de IA mejorado**: Regla "NO ELIMINES NADA" para preservar todo el contenido
- **Comparación Whisper vs Claude**: Logging detallado para debugging

### Corregido
- Ventana no roba foco al aparecer (usa `showInactive`)
- Limpieza de código huérfano de FFmpeg

---

## [0.1.0] - 2025-01-20

### Agregado
- Fork inicial de Open-Whispr
- Transcripción de voz con OpenAI Whisper API
- Post-procesamiento con Claude Haiku (preserva términos técnicos en inglés)
- Hotkey global: `Ctrl+Shift+Space`
- Panel de configuración con pestañas
- Historial de transcripciones en SQLite
- Icono en bandeja del sistema (systray)
- Modo Rápido (solo transcripción) y Modo Inteligente (con IA)

---

## Próximas versiones (planificado)

### [1.5.0] - Por definir
- [ ] Integración con Groq para transcripción más rápida
- [ ] Doble-tap de Ctrl como hotkey alternativo
- [ ] Selección de micrófono en configuración
- [ ] Monetización con Stripe
- [ ] Instalador: cerrar instancias activas antes de instalar
- [ ] Instalador: desinstalar versión anterior automáticamente

---

## Cómo compilar

```bash
# Instalar dependencias
npm install

# Desarrollo
npm run dev

# Compilar instalador Windows
npm run build:win
```

Los archivos compilados se generan en `dist-electron/`.
