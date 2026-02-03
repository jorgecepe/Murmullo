; Murmullo NSIS Installer Script
; This script handles detection and closing of running instances

!macro customInit
  ; Check if Murmullo is running before installation
  nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq Murmullo.exe" /NH'
  Pop $0 ; Exit code
  Pop $1 ; Output

  ; Check if the output contains "Murmullo.exe"
  ${If} $1 != ""
    StrCpy $2 $1 12 ; Get first 12 chars
    ${If} $2 != "INFO: No tasks"
      ; Murmullo is running, ask user to close it
      MessageBox MB_YESNO|MB_ICONQUESTION "Murmullo está ejecutándose actualmente.$\n$\n¿Desea cerrar Murmullo automáticamente para continuar con la instalación?" IDYES closeApp IDNO abortInstall

      closeApp:
        ; Kill the process
        nsExec::ExecToStack 'taskkill /F /IM Murmullo.exe'
        Pop $0
        Pop $1

        ; Wait a moment for the process to fully close
        Sleep 1000

        ; Verify it's closed
        nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq Murmullo.exe" /NH'
        Pop $0
        Pop $1
        StrCpy $2 $1 12
        ${If} $2 != "INFO: No tasks"
          MessageBox MB_OK|MB_ICONEXCLAMATION "No se pudo cerrar Murmullo automáticamente.$\n$\nPor favor, cierre la aplicación manualmente y vuelva a ejecutar el instalador."
          Abort
        ${EndIf}
        Goto done

      abortInstall:
        MessageBox MB_OK|MB_ICONINFORMATION "Instalación cancelada.$\n$\nPor favor, cierre Murmullo manualmente y vuelva a ejecutar el instalador."
        Abort

      done:
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInit
  ; Also check before uninstall
  nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq Murmullo.exe" /NH'
  Pop $0
  Pop $1

  ${If} $1 != ""
    StrCpy $2 $1 12
    ${If} $2 != "INFO: No tasks"
      MessageBox MB_YESNO|MB_ICONQUESTION "Murmullo está ejecutándose actualmente.$\n$\n¿Desea cerrar Murmullo automáticamente para continuar con la desinstalación?" IDYES closeAppUn IDNO abortUn

      closeAppUn:
        nsExec::ExecToStack 'taskkill /F /IM Murmullo.exe'
        Pop $0
        Pop $1
        Sleep 1000
        Goto doneUn

      abortUn:
        MessageBox MB_OK|MB_ICONINFORMATION "Desinstalación cancelada."
        Abort

      doneUn:
    ${EndIf}
  ${EndIf}
!macroend
