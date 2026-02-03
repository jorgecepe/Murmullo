# Troubleshooting - Solución de Problemas

Esta guía te ayuda a resolver los problemas más comunes con Murmullo.

## La app no graba audio

### Síntomas
- El indicador no cambia a rojo al presionar el hotkey
- No se transcribe nada

### Soluciones
1. **Verifica permisos de micrófono**
   - Windows: Configuración > Privacidad > Micrófono > Asegúrate de que las apps de escritorio puedan acceder
   - Si usaste el portable, puede que necesites aceptar el permiso la primera vez

2. **Reinicia la aplicación**
   - Cierra completamente desde el tray (click derecho > Salir)
   - Vuelve a abrir

3. **Verifica que el micrófono funcione**
   - Prueba en otra app (Grabadora de voz de Windows)
   - Asegúrate de que el micrófono correcto esté seleccionado como predeterminado

---

## El hotkey no funciona

### Síntomas
- Presionar Ctrl+Shift+Space no hace nada

### Soluciones
1. **Conflicto con otra app**
   - Cierra apps que podrían usar el mismo atajo (algunas apps de screenshots, launchers, etc.)
   - Cambia el hotkey en Configuración > Hotkey

2. **La app no está corriendo**
   - Busca el icono en el system tray (cerca del reloj)
   - Si no está, abre Murmullo de nuevo

3. **Prueba otro hotkey**
   - Ve a Configuración > Hotkey
   - Selecciona una combinación diferente como `F9` o `Ctrl+Alt+Space`

---

## Error de API key

### Síntomas
- Error "OpenAI API key not configured"
- Error "Anthropic API key not configured"

### Soluciones
1. **Modo Offline (con tus propias keys)**
   - Ve a Configuración > API Keys
   - Ingresa tu key de OpenAI (obligatorio para transcripción)
   - Ingresa tu key de Anthropic (opcional, para modo inteligente)

2. **Modo Backend (sin API keys)**
   - Ve a Configuración > Cuenta
   - Activa "Modo de conexión"
   - Inicia sesión o crea una cuenta
   - El servicio proveerá las API keys

3. **Verifica el formato de la key**
   - OpenAI: debe empezar con `sk-`
   - Anthropic: debe empezar con `sk-ant-`

---

## Error "El archivo de audio está corrupto"

### Síntomas
- Error mencionando "header inválido" o "corrupto"

### Soluciones
1. **Reinicia la aplicación completamente**
   - Click derecho en el tray > Salir
   - Vuelve a abrir
   - Esto limpia el estado del grabador de audio

2. **Graba por más tiempo**
   - Grabaciones muy cortas (<1 segundo) pueden fallar
   - Habla al menos 2-3 palabras

---

## Múltiples instancias abiertas

### Síntomas
- Aparecen varios iconos en el tray
- El hotkey abre múltiples ventanas

### Soluciones
1. **Cerrar todas las instancias**
   - Click derecho en cada icono > Salir
   - O usa el Administrador de Tareas:
     - Busca "Murmullo" o "electron"
     - Finaliza todos los procesos relacionados

2. **Reinicia**
   - Abre una sola instancia de Murmullo

**Nota**: Desde v1.4.0, la app previene automáticamente múltiples instancias.

---

## El texto no se pega

### Síntomas
- La transcripción se completa pero no aparece en la app activa

### Soluciones
1. **Asegúrate de tener una app de texto activa**
   - Antes de grabar, haz click en donde quieres el texto
   - Notepad, Word, VS Code, etc.

2. **Espera a que termine**
   - El indicador debe ponerse verde antes de pegar
   - Si cambias de ventana durante el procesamiento, puede fallar

3. **Pega manualmente**
   - El texto queda en el portapapeles temporalmente
   - Puedes usar Ctrl+V manualmente si el auto-paste falla

---

## Errores de red / Servidor no disponible

### Síntomas
- "Backend error" o "Network error"
- "fetch failed"

### Soluciones
1. **Verifica tu conexión a internet**
   - Abre un navegador y verifica que puedas navegar

2. **Retry automático**
   - La app reintenta automáticamente 3 veces
   - Si persiste, espera unos minutos y vuelve a intentar

3. **Modo offline**
   - Si el servidor de Murmullo no está disponible, usa tus propias API keys
   - Ve a Configuración > Cuenta > Desactiva "Modo de conexión"

---

## La app se congela en "Procesando"

### Síntomas
- El indicador azul gira indefinidamente

### Soluciones
1. **Espera un poco más**
   - Las APIs pueden tardar 5-15 segundos
   - El modo inteligente toma más tiempo que el rápido

2. **Verifica los logs**
   - Configuración > Logs > Ver el archivo más reciente
   - Busca mensajes de error

3. **Reinicia la app**
   - Si después de 30 segundos sigue igual, cierra y abre de nuevo

---

## Cómo reportar un problema

Si ninguna solución funciona:

1. **Exporta los logs**
   - Configuración > Logs > Exportar todos los logs

2. **Describe el problema**
   - Qué estabas haciendo
   - Qué error apareció
   - Qué versión de Murmullo usas (Configuración > Ayuda)

3. **Crea un issue en GitHub**
   - [github.com/jorgecepe/Murmullo/issues](https://github.com/jorgecepe/Murmullo/issues)
   - Adjunta el archivo de logs

---

## FAQ

### ¿Es seguro guardar mis API keys?
Sí. Las keys se almacenan cifradas usando Windows Credential Manager (o equivalente en macOS/Linux). Nunca se envían a servidores externos excepto a las APIs oficiales de OpenAI/Anthropic.

### ¿Puedo usar Murmullo sin internet?
Actualmente no. Tanto la transcripción (Whisper) como el post-procesamiento (Claude/GPT) requieren conexión a internet.

### ¿Cuánto cuesta usar Murmullo?
La app es gratis. Solo pagas por el uso de APIs:
- Whisper: ~$0.006 USD por minuto de audio
- Claude Haiku: ~$0.0002 USD por transcripción típica
- Uso típico: ~$0.10 USD por hora de uso intensivo

### ¿Funciona en español de España y Latinoamérica?
Sí. Whisper detecta automáticamente las variantes del español.
