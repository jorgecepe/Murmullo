; Murmullo NSIS Installer Script
; Detects and closes running instances before install/uninstall

!macro customInit
  ; Check if Murmullo is running using tasklist (more compatible)
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq Murmullo.exe" /NH 2>nul | find /i "Murmullo.exe" >nul && echo FOUND || echo NOTFOUND'
  Pop $0 ; Exit code
  Pop $1 ; Output

  ; Check if output starts with "FOUND"
  StrCpy $2 $1 5 ; Get first 5 chars
  StrCmp $2 "FOUND" 0 notRunning

    ; Murmullo is running, ask user to close it
    MessageBox MB_YESNO|MB_ICONQUESTION "Murmullo está ejecutándose actualmente.$\r$\n$\r$\n¿Desea cerrar Murmullo automáticamente para continuar con la instalación?" IDYES closeApp IDNO abortInstall

    closeApp:
      ; Kill the process using taskkill
      nsExec::ExecToStack 'taskkill /F /IM Murmullo.exe'
      Pop $0
      Pop $1

      ; Wait for process to fully close
      Sleep 2000

      ; Verify it's closed
      nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq Murmullo.exe" /NH 2>nul | find /i "Murmullo.exe" >nul && echo FOUND || echo NOTFOUND'
      Pop $0
      Pop $1
      StrCpy $2 $1 5
      StrCmp $2 "FOUND" 0 done
        MessageBox MB_OK|MB_ICONEXCLAMATION "No se pudo cerrar Murmullo automáticamente.$\r$\n$\r$\nPor favor, cierre la aplicación manualmente desde el área de notificaciones (tray) y vuelva a ejecutar el instalador."
        Abort

    abortInstall:
      MessageBox MB_OK|MB_ICONINFORMATION "Instalación cancelada.$\r$\n$\r$\nPor favor, cierre Murmullo manualmente y vuelva a ejecutar el instalador."
      Abort

    notRunning:
    done:
!macroend

!macro customUnInit
  ; Same check for uninstall
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq Murmullo.exe" /NH 2>nul | find /i "Murmullo.exe" >nul && echo FOUND || echo NOTFOUND'
  Pop $0
  Pop $1
  StrCpy $2 $1 5
  StrCmp $2 "FOUND" 0 notRunningUn

    MessageBox MB_YESNO|MB_ICONQUESTION "Murmullo está ejecutándose actualmente.$\r$\n$\r$\n¿Desea cerrar Murmullo automáticamente para continuar con la desinstalación?" IDYES closeAppUn IDNO abortUn

    closeAppUn:
      nsExec::ExecToStack 'taskkill /F /IM Murmullo.exe'
      Pop $0
      Pop $1
      Sleep 2000
      Goto doneUn

    abortUn:
      MessageBox MB_OK|MB_ICONINFORMATION "Desinstalación cancelada."
      Abort

    notRunningUn:
    doneUn:
!macroend
