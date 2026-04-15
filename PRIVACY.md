# Política de Privacidad de Murmullo

**Última actualización:** 14 de abril de 2026
**Versión de referencia:** Murmullo v1.9.x

Murmullo es una aplicación de escritorio de dictado por voz diseñada para
respetar al máximo la privacidad de sus usuarios. Este documento describe
qué datos procesa la aplicación, dónde se almacenan, y cuándo salen del
equipo del usuario.

## 1. Principios de diseño

- **Local por defecto.** Toda la configuración, historial y credenciales se
  almacenan únicamente en el equipo del usuario.
- **Sin telemetría automática.** Murmullo no envía estadísticas de uso,
  crashes o identificadores de dispositivo a ningún servidor propio
  salvo que el usuario lo habilite explícitamente.
- **Sin publicidad ni trackers de terceros.** La aplicación no carga scripts
  externos ni redes publicitarias.

## 2. Datos que Murmullo almacena localmente

Todos los datos siguientes se guardan en `%APPDATA%/murmullo/` (Windows) o
`~/Library/Application Support/murmullo/` (macOS) y nunca abandonan el
equipo salvo en los escenarios descritos en la sección 3.

| Dato | Archivo | Cifrado | Propósito |
|------|---------|---------|-----------|
| API keys (OpenAI, Anthropic) | `secure-keys.json` | Sí (Electron safeStorage) | Autenticarse contra los proveedores elegidos por el usuario. |
| Configuración (hotkey, idioma, modo) | `config.json` | No | Persistir preferencias entre sesiones. |
| Contador de uso (minutos transcritos) | `usage.json` | No | Aplicar el límite de prueba gratuita de 30 minutos. |
| Diccionario personalizado | `dictionary.json` | No | Sustituciones find/replace definidas por el usuario. |
| Logs de depuración | `logs/*.log` | No | Diagnóstico local, nunca se envían automáticamente. |
| Audios de depuración (opcional) | `debug_audio/` | No | Solo si el usuario activa "Debug audio". |

## 3. Datos que salen del equipo

Los siguientes datos abandonan el equipo únicamente cuando el usuario
realiza acciones concretas:

- **Audio de dictado** → se envía a **OpenAI Whisper** (`api.openai.com`) o al
  backend de Murmullo (`murmullo-api.luminaconsulting.ai`) cuando el usuario
  pulsa el hotkey para transcribir. El audio se envía en una única petición
  HTTPS y no se almacena en servidores de Murmullo más allá del tiempo
  necesario para devolver la transcripción.
- **Texto transcrito (modo Smart)** → se envía a **Anthropic Claude**
  (`api.anthropic.com`) o al backend de Murmullo para mejorar puntuación y
  términos técnicos.
- **Credenciales de cuenta** → si el usuario crea una cuenta en el backend
  de Murmullo, el correo y la contraseña (hasheada con bcrypt) se almacenan
  en la base de datos del backend.

Murmullo **no envía** en ningún momento: contactos, archivos, ubicación,
historial de navegador, portapapeles, pantalla, teclas distintas al hotkey
configurado, ni datos biométricos.

## 4. Retención de datos

- Los datos locales permanecen en el equipo hasta que el usuario los borre
  manualmente o desinstale la aplicación.
- OpenAI y Anthropic aplican sus propias políticas de retención sobre el
  audio y texto enviados. Consulte sus páginas oficiales.
- El backend de Murmullo (cuando se usa) retiene el historial de
  transcripciones durante 90 días por defecto, configurable en la cuenta.

## 5. Derechos del usuario

El usuario puede en cualquier momento:

- Borrar su historial local desde **Panel de control → Historial → Limpiar**.
- Exportar su historial a CSV.
- Borrar sus API keys desde **Panel de control → API Keys**.
- Eliminar su cuenta del backend enviando un correo a soporte (ver README).
- Reiniciar el contador de uso (`usage.json`) eliminando el archivo.

## 6. Menores de edad

Murmullo no está dirigido a menores de 13 años. Si descubrimos que un
menor ha creado una cuenta en el backend, la eliminaremos.

## 7. Cambios a esta política

Los cambios se anunciarán en el `CHANGELOG.md` y en la página de
releases del repositorio. El uso continuado tras un cambio implica
aceptación de la nueva versión.

## 8. Contacto

Para consultas sobre esta política o para solicitar eliminación de datos:

- GitHub: https://github.com/jorgecepe/Murmullo/issues
- Correo: (definir cuando se habilite el soporte público)
