# Changelog

Todos los cambios notables de Murmullo serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.9.0-beta.8] - 2026-04-22

Groq language detection y feedback visual para silencio detectado.

### Corregido

- **Groq rechaza `language: 'auto'`**. Groq's OpenAI-compatible endpoint sólo acepta códigos de idioma específicos (`es`, `en`, etc.), no `auto` para autodeteccion. Cuando la UI enviaba `language: 'auto'`, la API respondía con un error sobre idiomas no soportados. Ahora el main process mapea `auto` a `es` para Groq (el idioma por defecto en Murmullo) mientras que OpenAI sigue recibiendo `auto` como antes.

### Agregado

- **Indicador visual de "No se detectó audio"**. Cuando el silence gate descarta una grabación por falta de sonido, el ícono del micrófono ahora muestra un signo de interrogación (?) en amarillo durante 2 segundos, con tooltip: "No se detectó audio. Verifica que tu micrófono esté activo y hables más alto." Esto distingue claramente el silencio (error del usuario) de otros tipos de error, eliminando la confusión de "por qué nada pasó cuando presioné el micrófono".

---

## [1.9.0-beta.7] - 2026-04-22

Hotfix crítico: las API keys de Groq eran rechazadas silenciosamente al guardar.

### Corregido

- **`isValidApiKey` rechazaba el prefijo `gsk_`**. El validador de formato en `ipcValidation.js` sólo aceptaba keys que empezaran con `sk-` o `sk-ant-`. Las keys de Groq (que empiezan con `gsk_`) fallaban la validación, el IPC `set-api-key` retornaba `{ success: false, error: 'Invalid API key format' }`, y la UI no mostraba nada porque el handler sólo actuaba en el éxito. Regresión introducida en beta.3 cuando agregué el soporte Groq; testeé el endpoint pero no el flujo de guardado. Ahora `gsk_` está en la lista de prefijos aceptados.

- **Errores del guardado eran silenciosos**. Cuando `setApiKey` fallaba por cualquier razón (validación de formato, IPC denegado, storage corrupto), la UI simplemente no hacía nada y el usuario quedaba sin feedback. Ahora el handler del botón Guardar muestra un mensaje rojo "⚠ No se pudo guardar la key: {motivo}" para que cualquier falla de save se vea en pantalla.

---

## [1.9.0-beta.6] - 2026-04-22

UX de la pestaña API Keys rehecha tras reportes de confusión sobre cómo pegar y guardar keys.

### Agregado

- **Botón "Pegar" visible** al lado de cada input de API Key. Resuelve el problema de que Chromium desactiva la opción Pegar del menú contextual nativo sobre `<input type="password">` por razones de seguridad, dejando al usuario sin forma de pegar excepto con Ctrl+V (no siempre evidente). El botón lee el portapapeles vía nueva IPC `read-clipboard` del main process y hace trim de whitespace.
- **Botón "Mostrar/Ocultar"** (ojo) que alterna el tipo del input entre `password` y `text` para que el usuario pueda verificar visualmente que la key se pegó completa antes de guardar. Se resetea a oculto al guardar.
- **Botón "Guardar key de forma cifrada"** con texto explícito + ícono Save. Reemplaza el ícono Shield solitario que no se entendía. Mismo estilo visual de botón primario, ahora ancho completo y evidente.
- **Validación en vivo al guardar**. Después de almacenar, Murmullo hace una llamada de verificación contra el proveedor (`GET /v1/models` para OpenAI/Groq, `POST /v1/messages` de 1 token para Anthropic). El mensaje bajo el campo dice una de cuatro cosas: "Verificando...", "✓ Key guardada y verificada", "⚠ Key guardada pero el proveedor la rechazó (401)", o "Key eliminada". Elimina el bucle "guardé la key pero nada funciona" sin tener que esperar a la primera transcripción.

### Corregido

- La key que estabas pegando se quedaba en el input pero **nunca llegaba a `secureStorage`** si no clickeabas el ícono Shield. El badge mostraba "No configurada" correctamente, pero la UI no lo aclaraba. Con el nuevo botón "Guardar key de forma cifrada" con texto explícito esto queda resuelto.

---

## [1.9.0-beta.5] - 2026-04-22

UX de configuración y observabilidad del silence gate. Motivado por dos reportes: (1) alucinación de "Subtítulos de Amara.org" seguía apareciendo aunque el gate está activo, y (2) no había forma de saber qué API keys estaban guardadas ni cuál estaba siendo realmente usada.

### Agregado

- **Banner "Proveedores activos ahora mismo"** en la pestaña API Keys. Muestra con precisión qué proveedor está procesando la transcripción y el post-procesamiento en este momento, diferenciando entre plan del servidor, Groq (tu key), OpenAI (tu key) o Anthropic (tu key). Si un proveedor fue seleccionado pero no tiene API key guardada, aparece una advertencia.

- **Badges "✓ Guardada" / "— No configurada"** al lado de cada label de API key. Elimina la ambigüedad anterior donde un campo vacío podía ser "no hay key" o "hay key pero no se muestra".

- **Aviso de backend-mode** en el selector "Proveedor de transcripción" (General). Cuando tu plan del servidor está activo, el selector queda deshabilitado y aparece una nota explicando que la elección sólo aplica en modo local/offline. Elimina la confusión de que "seleccionar Groq" parecía no hacer nada.

- **Umbral de silencio configurable**. Slider en Configuración → General (rango 0.005-0.1, step 0.005, default 0.025). Sube el valor si tu mic tiene mucho ruido de fondo y el silencio pasa como audio; bájalo si voces suaves se descartan por error.

- **Instrumentación del silence gate en los logs del archivo**. Nueva IPC `log-from-renderer` que permite al renderer escribir líneas estructuradas en los mismos logs que main (visibles en Configuración → Logs). Cada grabación emite una entrada `silence-gate` con `peakWindowRms`, `overallRms`, `threshold`, `duration`, `sampleRate`, `decodeMs` y `willSkip`. Así el usuario puede calibrar el umbral en base a mediciones reales de su micrófono sin abrir DevTools.

### Cambiado

- **Umbral de silencio por defecto subió de 0.015 a 0.025**. El valor anterior era demasiado bajo para micrófonos con ruido de fondo moderado (ej. laptops con mic integrado, headsets sin noise suppression), lo que hacía que casi cualquier grabación superara el umbral. 0.025 descarta silencio real sin matar voces suaves en la mayoría de mics.

---

## [1.9.0-beta.4] - 2026-04-22

Hotfix sobre beta.3.

### Corregido

- **Silence gate no disparaba**. La implementación original de beta.3 medía el RMS en vivo vía un `AnalyserNode` conectado al MediaStream, pero en Electron el `AudioContext` no pasa a estado `running` sin gesto de usuario (el hotkey global no cuenta), así que `getFloatTimeDomainData` devolvía sólo ceros y la guarda `peakRms > 0` hacía que nunca se activara, dejando pasar grabaciones silenciosas que Whisper alucinaba como "Subtítulos de Amara.org". Reemplazado por una decodificación offline del blob al inicio de `processAudio`: se calcula el RMS sobre ventanas de 100 ms y se toma el pico. Si el pico está bajo 0.015 (ajustable) se salta la llamada a la API. Costo: ~30-80 ms por grabación (aceptable comparado con el ahorro de una llamada fallida). Determinístico, sin dependencia del estado del AudioContext.

---

## [1.9.0-beta.3] - 2026-04-22

Cuatro optimizaciones de velocidad basadas en la investigación del mercado de transcripción rápida. Todas se controlan desde Configuración → General y API Keys.

### Agregado

- **Proveedor de transcripción: Groq (Whisper Large v3 Turbo)**. Alternativa drop-in al `whisper-1` de OpenAI. Misma API compatible, misma calidad de modelo (turbo variant), pero procesado sobre LPUs de Groq a 216× real-time (~5-10× más rápido que OpenAI) y ~9× más barato ($0.04/hr vs $0.36/hr). Requiere Groq API Key propia (gratuita en `console.groq.com/keys`). Ver Configuración → General → "Proveedor de transcripción".

- **Pegado instantáneo (fire-and-forget)**. Nuevo toggle en Configuración → General. Cuando está activo y el modo Smart está seleccionado, Murmullo pega el texto crudo de Whisper apenas llega y lanza la corrección con Claude en segundo plano. Reduce la latencia percibida a sólo (grabación → red → Whisper). La versión pulida se guarda en el historial. Off por defecto para mantener compatibilidad.

- **Subida rápida (WebM/Opus directo)**. Nuevo toggle, on por defecto. Evita el paso de conversión renderer a WAV (AudioContext decode + resample + encode). Ahorra ~200-500 ms por transcripción y reduce ~10× los bytes subidos (640 KB → 60 KB para clip de 20 s). Main.js ya tenía fallback con ffmpeg para reparar headers WebM corruptos, así que el riesgo es bajo.

- **Silencio gate (AnalyserNode peak-RMS)**. Nuevo toggle, on por defecto. Detecta recordings sin voz (hotkey pulsado por error) y salta el envío a Whisper. Evita alucinaciones típicas ("Subtítulos de Amara.org", "Gracias por ver el video") y ahorra minutos del plan gratuito. Umbral fijo 0.01 RMS pico.

### Interno

- `isValidProvider` acepta `'groq'` como provider en IPC validation.
- `secureStorage` acepta nueva entrada `groq_api_key` (cifrada con la misma protección OS que las demás).
- `transcribe-audio` IPC handler elige endpoint/model según `options.transcriptionProvider`. El cuerpo multipart y los headers son idénticos para ambos proveedores.
- CSP ya permitía `api.groq.com` desde beta.0, no requirió cambios.

---

## [1.9.0-beta.2] - 2026-04-22

Hotfix sobre beta.1.

### Corregido

- **Crash en onboarding (`ReferenceError: Zap is not defined`)**. `WelcomeModal.jsx` usaba el ícono `Zap` en dos lugares pero no lo importaba. En dev no se notó porque HMR mantenía el módulo cargado; en el instalador recién instalado, al abrir el onboarding automático tras el setup, el panel se quedaba en la pantalla de error de `ControlPanelErrorBoundary`. Hacer install y abrirlo manualmente funcionaba porque no se disparaba el flujo de onboarding automático.

---

## [1.9.0-beta.1] - 2026-04-22

Iteración de UX sobre el ícono flotante del micrófono, motivada por fricción reportada durante uso diario.

### Agregado

- **Botón Cancelar en el ícono flotante (estado azul)**. Al hacer hover sobre el micrófono mientras está procesando una transcripción (ícono azul), aparece una X roja. Al hacer clic, cancela el envío inmediatamente sin esperar timeouts de red. Útil cuando la API responde lento o cuando hay un problema de conectividad local.
- **Menú contextual con clic derecho sobre el ícono flotante**. Abre un menú nativo con "Configuración", "Exportar Logs", "Acerca de Murmullo..." y "Salir", replicando las opciones del systray pero directamente sobre el ícono donde la mano del usuario ya está.

### Corregido

- **Bloqueo de 2 segundos tras transcripción exitosa**. El ícono verde (SUCCESS) ahora permite iniciar una nueva grabación inmediatamente con el hotkey, en vez de ignorarlo hasta que el badge se desvanezca. También se limpia la transición pendiente a IDLE para que no sobrescriba la nueva grabación un segundo después. Se aplica la misma mejora al estado de error (rojo).

### Infraestructura

- Cancelación real en `main.js`: `AbortController` por petición, registrado en un `Set` global, cancelable vía IPC `cancel-transcription`. Las fetches a Whisper/Anthropic/OpenAI/backend propagan el `signal` y `fetchWithRetry` respeta el aborto sin reintentar.
- `preload.js`: nuevos handlers `cancelTranscription()` y `showFloatingMenu()`.

---

## [1.9.0-beta.0] - 2026-04-14

Primer release de la línea 1.9, enfocado en endurecer Murmullo para distribución pública. **La línea 1.8 sigue siendo estable** (tag `v1.8.0-stable`) y es la recomendada para uso diario mientras se valida 1.9.

### Seguridad (crítico para producción)

- **Sandbox del renderer activado** (`sandbox: true` en ambas ventanas). Si se explota un XSS en React el atacante ya no tiene acceso ilimitado al IPC; se reduce drásticamente el blast radius.
- **DEBUG solo en builds no empaquetados.** `DEBUG = !app.isPackaged`. Los instaladores firmados dejan de escribir logs verbosos con rutas del usuario y metadata de hardware.
- **Rate limiting por canal IPC** (`rateLimiter.js`). Protege contra renderers comprometidos que intenten quemar quota de OpenAI/Anthropic en segundos. Policies conservadoras por canal: 10/min en transcripción, 5/min en login (defensa anti brute-force), 120/min default.
- **CSP extendida** para soportar Groq (`api.groq.com`) y Google Gemini (`generativelanguage.googleapis.com`) sin abrir orígenes arbitrarios.
- **webPreferences endurecido**: `experimentalFeatures: false`, `navigateOnDragDrop: false`, `webgl: false` en la ventana principal.

### Monetización y límite gratuito

- **UsageTracker** (`usageTracker.js`) persiste en `%APPDATA%/murmullo/usage.json` el total de segundos transcritos.
- **Free tier de 30 minutos** aplicado automáticamente. Bloquea transcripción con error `FREE_TIER_EXHAUSTED` y sugiere añadir API key propia o suscripción.
- **BYOK (Bring Your Own Key)** detectado automáticamente: si el usuario guardó su API key, el ceiling se desactiva (paga directo a OpenAI/Anthropic).
- **Backend autenticado** siempre tiene preferencia sobre el límite local (usa las cuotas del plan contratado).
- Handlers IPC `get-usage`, `reset-usage`, `validate-api-key` expuestos al renderer para construir UI de contador y paywall.

### UX y resiliencia

- **Tope absoluto de grabación a 5 minutos**: previene fugas de memoria y grabaciones fantasma por hotkeys olvidados.
- **Mensajes de error específicos**: el renderer traduce códigos (`rate_limit_exceeded`, `FREE_TIER_EXHAUSTED`, `401`, `network`) a texto accionable en español.
- **Validación en vivo de API keys** contra el proveedor (`GET /v1/models` para OpenAI, `POST /v1/messages` de 1 token para Anthropic), con timeout de 8 segundos.

### Legal y distribución

- **LICENSE** (MIT con atribución a Open-Whispr).
- **NOTICE** (dependencias y servicios de terceros detallados).
- **PRIVACY.md** (política de privacidad en español, con tabla de datos almacenados localmente).
- **TERMS.md** (términos de uso, plan gratuito, jurisdicción Chile).
- **CODE_SIGNING.md** (guía paso a paso para conseguir un certificado EV y activarlo en CI).

### Build y CI

- `package.json` preparado para code signing: `signAndEditExecutable: true`, `signingHashAlgorithms: ["sha256"]`, `publisherName`, `verifyUpdateCodeSignature: true`.
- `.github/workflows/ci.yml` consume `WIN_CSC_LINK` y `WIN_CSC_KEY_PASSWORD` desde secrets (sin romper si no existen, útil para forks).
- Rama `v1.9-dev` añadida al workflow para validación continua.

### Tests

- 18 tests nuevos (`rateLimiter` + `usageTracker`). Suite total: 102 tests, todos en verde.

### Pendiente para 1.9.0 estable

- Paywall/banner UI visible en el panel de control cuando el usuario se acerque a los 30 minutos.
- Modal de onboarding en el primer uso que explique hotkey y modos.
- Refactor de `ControlPanel.jsx` (2.5k líneas) en sub-componentes.
- Compra del certificado EV y primer release firmado.

---

## [1.8.0] - 2026-04-05

### Agregado
- **Ícono arrastrable**: El indicador flotante del micrófono ahora se puede mover arrastrándolo con el mouse
- **Recuperación de ventana**: La ventana flotante se restaura automáticamente después de cada transcripción, tras sleep/wake del sistema, y con verificación periódica cada 5 minutos

### Corregido
- **Ícono desaparecía**: La ventana flotante se ocultaba al pegar texto y nunca se restauraba, causando que el ícono desapareciera después de la primera transcripción
- **Crash en modo dev**: `electron-updater` crasheaba al importarse antes de que Electron estuviera listo; cambiado a lazy-loading

### Mejorado
- **Plan free ampliado**: Límite del plan gratuito aumentado de 30 a 120 minutos/mes

### Build
- `Murmullo-Setup-1.8.0.exe` - Instalador NSIS con auto-update
- `Murmullo-Portable-1.8.0.exe` - Versión portable

---

## [1.7.0] - 2026-03-24

### Cambiado
- **Backend migrado a Hetzner VPS**: Backend self-hosted con Docker en lugar de Render, mejor latencia y control
- **URL de producción**: `murmullo-api.luminaconsulting.ai`

### Corregido
- **Transcripción con idioma 'auto'**: El backend ahora acepta la opción de idioma 'auto' para detección automática

---

## [1.6.0] - 2026-03-10

### Agregado
- **Diccionario personalizado**: Define tus propias palabras y reemplazos para la transcripción
- **Endpoints de admin**: API para gestión de usuarios y planes (`set-plan`, `reset-usage`, `users`)

---

## [1.5.0] - 2026-02-15

### Agregado
- **Modo debug de audio**: Guarda archivos de audio para diagnóstico (activable desde configuración)
- **Transcripción verbatim**: Nuevo modo de transcripción sin post-procesamiento

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
