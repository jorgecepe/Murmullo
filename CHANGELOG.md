# Changelog

Todos los cambios notables de Murmullo serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

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

### [1.2.0] - Por definir
- [ ] Integración con Groq para transcripción más rápida
- [ ] Doble-tap de Ctrl como hotkey alternativo
- [ ] UI flotante durante grabación

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
