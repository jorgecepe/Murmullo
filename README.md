# Murmullo

**Dictado de voz inteligente para desarrolladores y profesionales hispanohablantes.**

[![Descargar v1.6.0](https://img.shields.io/badge/Descargar-v1.6.0-blue?style=for-the-badge&logo=windows)](https://github.com/jorgecepe/Murmullo/releases/latest)

> Fork de [Open-Whispr](https://github.com/HeroTools/open-whispr) optimizado para español con preservación de términos técnicos.

[Read in English](#english) | [Documentación completa en español](./README_ES.md)

---

## Sobre Murmullo

Murmullo convierte tu voz en texto, preservando términos técnicos como `git`, `commit`, `deploy`, `API` y más de 70 términos en inglés mientras transcribe en español.

### Ejemplo

**Dices:** "Hice un commit en el branch de desarrollo y después hice push al repositorio remoto"

**Resultado:** Hice un commit en el branch de desarrollo y después hice push al repositorio remoto.

Los términos técnicos se mantienen en inglés automáticamente.

## Características Principales

- **Español técnico**: Transcribe en español preservando terminología en inglés
- **Diccionario personalizado**: Define tus propias palabras y reemplazos
- **Dos modos**: Rápido (solo transcripción) o Inteligente (con corrección IA)
- **Hotkey ergonómico**: `Ctrl+Shift+Space` por defecto (personalizable)
- **Sin privilegios de admin**: Se instala en la carpeta del usuario
- **Multi-proveedor**: OpenAI Whisper o Claude para post-procesamiento
- **Modo Backend**: Usa el servicio en la nube sin necesidad de API keys propias
- **Auto-actualizaciones**: Recibe updates automáticamente
- **Indicador de progreso**: Muestra qué está haciendo en cada momento
- **Exportar historial**: Exporta tus transcripciones a CSV

## Instalación Rápida

### Desde Releases (Recomendado)

Descarga el instalador desde [Releases](https://github.com/jorgecepe/Murmullo/releases/latest):
- **Windows**: `Murmullo-Setup-1.6.0.exe` (instalador) o `Murmullo-Portable-1.6.0.exe` (portable)

**Actualizaciones automáticas**: Murmullo detecta y descarga actualizaciones automáticamente desde la pestaña Configuración > Actualizaciones.

### Desde el Código Fuente

```bash
git clone https://github.com/jorgecepe/Murmullo.git
cd murmullo
npm install
cp .env.example .env
# Editar .env con tus API keys (opcional si usas modo backend)
npm run dev
```

## Configuración

| Proveedor | Uso | Obtener Key |
|-----------|-----|-------------|
| **OpenAI** | Transcripción (Whisper) | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Anthropic** | Post-procesamiento (Claude) | [console.anthropic.com](https://console.anthropic.com) |

**Configuración económica recomendada:**
- Transcripción: Groq (gratis) o OpenAI Whisper (~$0.006/min)
- Post-procesamiento: Claude Haiku (~$0.25/1M tokens)

## Documentación

- [CHANGELOG.md](./CHANGELOG.md) - Historial de cambios
- [CLAUDE.md](./CLAUDE.md) - Referencia técnica para IA

## Origen del Proyecto (Fork)

Murmullo es un fork de **[Open-Whispr](https://github.com/HeroTools/open-whispr)** (804+ estrellas, proyecto activo).

### Modificaciones principales

| Cambio | Open-Whispr | Murmullo |
|--------|-------------|----------|
| Idioma principal | Inglés | Español con términos técnicos |
| Hotkey por defecto | Backtick (`) | `Ctrl+Shift+Space` |
| Instalación Windows | Requiere admin | Sin privilegios de admin |
| Prompts del sistema | Inglés | Español técnico |
| Documentación | Inglés | Español |

### Sincronización con Upstream

Mantenemos compatibilidad con Open-Whispr para poder incorporar mejoras futuras.

## Desarrollo

```bash
npm run dev          # Desarrollo con hot-reload
npm run build:win    # Crear instalador Windows
npm run build:mac    # Crear instalador macOS
npm run build:linux  # Crear instalador Linux
npm run pack         # Build sin firmar (uso personal)
```

## Licencia

MIT License - Ver [LICENSE](./LICENSE)

Proyecto original: [Open-Whispr](https://github.com/HeroTools/open-whispr) por HeroTools

---

<a name="english"></a>
## English

**Murmullo** ("whisper" in Spanish) is a fork of [Open-Whispr](https://github.com/HeroTools/open-whispr) optimized for Spanish-speaking developers and professionals.

### Key Features

- Transcribes in Spanish while preserving ~70 technical terms in English
- Default hotkey: `Ctrl+Shift+Space` (better for Spanish keyboards)
- No admin privileges required for Windows installation
- Supports OpenAI, Anthropic Claude, Google Gemini, Groq, and local processing

### Why Fork?

Open-Whispr is excellent, but:
- The default backtick (`) hotkey is awkward on Spanish keyboards
- Spanish technical dictation often mistranslates terms like "commit" to "compromiso"
- We needed Spanish documentation for our team

### Installation

Download from [Releases](https://github.com/jorgecepe/Murmullo/releases/latest) or build from source:

```bash
git clone https://github.com/jorgecepe/Murmullo.git
cd murmullo
npm install
npm run dev
```

### Credits

- [Open-Whispr](https://github.com/HeroTools/open-whispr) - Original project
- [OpenAI Whisper](https://openai.com/research/whisper) - Speech recognition
- [Anthropic Claude](https://anthropic.com) - AI post-processing
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) - Local transcription
