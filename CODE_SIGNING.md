# Code Signing de Murmullo para Windows

Este documento explica cómo firmar digitalmente los instaladores de
Murmullo para evitar que Windows SmartScreen y Smart App Control los
bloqueen como "publicador desconocido".

## Por qué firmar

Sin firma, al distribuir el `.exe` a amigos/usuarios:

- SmartScreen muestra una advertencia roja "Windows protegió tu PC".
- Smart App Control (Windows 11+) bloquea la ejecución completamente.
- Antivirus pueden marcar falsos positivos con más frecuencia.

Firmar el instalador resuelve 1, reduce drásticamente 3, y con tiempo
de reputación acumulada (ver sección 6) también resuelve 2.

## 1. Tipos de certificado

| Tipo | Precio anual aprox. | Bloqueos SmartScreen | Smart App Control |
|------|---------------------|----------------------|-------------------|
| OV (Organization Validated) | USD 80-150 | Se desbloquea tras 1000-3000 descargas (reputación) | Usualmente bloquea |
| **EV (Extended Validation)** | **USD 300-450** | **Desbloqueado desde el día 1** | Desbloqueado con reputación acumulada más rápido |

**Recomendación:** EV. Es caro pero elimina el friction de descargas
iniciales, que es crítico cuando recién empiezas a distribuir.

## 2. Proveedores recomendados

Ordenados por relación precio/experiencia:

1. **SSL.com** (EV ~USD 350/año) - Soporta firma en la nube, sin HSM físico.
2. **SectiGo / Comodo** (EV ~USD 400/año) - Muy aceptado; envía HSM USB.
3. **DigiCert** (EV ~USD 500/año) - Estándar enterprise.

Para Murmullo como autor individual, **SSL.com eSigner** es la opción
más ágil porque evita el token físico y permite firmar desde CI.

## 3. Pasos concretos (SSL.com EV + eSigner)

1. Compra un "EV Code Signing Certificate" en ssl.com.
2. Pasa la validación EV (se verifica identidad empresarial o individual
   con documento + llamada telefónica; toma 3-7 días hábiles).
3. Activa el servicio **eSigner** (firma en la nube).
4. Descarga tu certificado en formato `.pfx` desde el portal, o usa el
   servicio `CodeSignTool` de SSL.com para firmar sin descarga.
5. Guarda el `.pfx` cifrado con password fuerte (NO en el repo).

## 4. Configuración en GitHub Actions

Los secrets a crear en `Settings → Secrets and variables → Actions`:

| Secret | Valor |
|--------|-------|
| `WIN_CSC_LINK` | URL (o base64) del archivo `.pfx`. Para SSL.com usa el endpoint seguro de eSigner. |
| `WIN_CSC_KEY_PASSWORD` | Password del `.pfx`. |

El workflow ya está preparado en `.github/workflows/ci.yml`:

```yaml
env:
  CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
  CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
  CSC_IDENTITY_AUTO_DISCOVERY: false
```

Cuando los secrets estén definidos, electron-builder firma
automáticamente. Si no existen, el build sigue funcionando sin firma
(útil para forks y pruebas locales).

## 5. Configuración en package.json

Ya está aplicada en v1.9:

```json
"win": {
  "signAndEditExecutable": true,
  "signingHashAlgorithms": ["sha256"],
  "publisherName": "Jorge Cepeda",
  "verifyUpdateCodeSignature": true
}
```

Ajusta `publisherName` para que coincida exactamente con el "Subject CN"
del certificado emitido. Si el nombre no coincide, `electron-updater`
rechazará las actualizaciones.

## 6. Reputación de SmartScreen

Aunque firmes con EV, SmartScreen usa además un algoritmo de
"reputación" basado en descargas. Tips:

- No cambies el certificado entre versiones: reinicia la reputación.
- No cambies el Common Name (CN) del publisher.
- Promueve descargas desde una única URL (GitHub Releases) para
  concentrar señal.
- Evita renombrar el `.exe` entre versiones (mantén `Murmullo-Setup-*.exe`).

## 7. Firma local (opcional, para testing)

Si quieres firmar localmente antes de CI:

```bash
# Windows PowerShell
$env:CSC_LINK = "file:///C:/ruta/a/cert.pfx"
$env:CSC_KEY_PASSWORD = "tu-password"
npm run build:win
```

Verifica la firma con:

```powershell
Get-AuthenticodeSignature "dist-electron\Murmullo-Setup-1.9.0-beta.0.exe"
```

El campo `Status` debe ser `Valid` y `SignerCertificate` debe mostrar
tu CN.

## 8. Checklist antes de publicar release firmado

- [ ] Certificado EV activo y no expirado.
- [ ] Secrets `WIN_CSC_LINK` y `WIN_CSC_KEY_PASSWORD` configurados en GitHub.
- [ ] `publisherName` en package.json coincide con CN del cert.
- [ ] Commit `npm test` pasa.
- [ ] Tag `vX.Y.Z` pushed; el job `release` del workflow se dispara.
- [ ] Descargar el artefacto firmado, verificar con `Get-AuthenticodeSignature`.
- [ ] Probar instalación en Windows 11 sin exclusiones de SmartScreen.

## 9. Coste total estimado año 1

- EV cert: USD 350-450.
- GitHub (público): gratis.
- Servidores de distribución: GitHub Releases gratis (hasta 2 GB por archivo, 5000 descargas/hora).

**Total:** ~USD 400/año para distribuir sin friction a toda la comunidad
hispanohablante de devs.
