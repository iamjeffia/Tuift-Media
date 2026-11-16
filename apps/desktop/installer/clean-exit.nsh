; Replaces electron-builder's check for a running app (customCheckAppRunning, see
; app-builder-lib/templates/nsis/include/allowOnlyOneInstallerInstance.nsh). Its default ends the
; app's processes about a second after it finds them: closing the window only sends this app to
; the tray, so that is always a forced end, and it skips the turns, the server and the database
; closing in order. This one asks the app to quit first and waits for it.
;
;   1. App not running: nothing else happens.
;   2. App running and it ships resources\clean-exit.txt (older versions do not know the switch
;      and would only raise their window): start the app's own executable with
;      --quit-for-install=silent (installer run with /S) or =ask, and read its exit code
;      (INSTALL_QUIT_EXIT in apps/desktop/src/install-quit.ts):
;        0  gone: the app quit by itself, in order. Processes left over are waited for 5 s, then
;           ended by force, and the log says so.
;        10 chats are working and nobody can answer (silent): stop here, exit code 10, nothing was
;           closed. An install run by a script never interrupts work.
;        11 the person chose to keep the chats working, 12 the question went unanswered
;           (interactive): a box offers Retry (ask again) or Cancel (exit code 1, nothing closed).
;        20 no answer in 5 s, 21 still running 25 s after it agreed: fall through to the default
;           check below, which ends the processes by force as before, and the log says so.
;   3. The default check runs last: it finds nothing when the app is gone.
;
; The log is %TEMP%\TUIFT-Code-install.log; the app's own client writes to it too, with times.
; The uninstaller keeps the default check.

!include "getProcessInfo.nsh"
Var pid

!macro tuiftLog TEXT
  FileOpen $9 "$TEMP\TUIFT-Code-install.log" a
  FileSeek $9 0 END
  FileWrite $9 "installer: ${TEXT}$\r$\n"
  FileClose $9
!macroend

!macro tuiftAskAppToQuit
  !ifndef BUILD_UNINSTALLER
    ${if} ${FileExists} "$INSTDIR\resources\clean-exit.txt"
    ${andIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
      ${if} $R0 == 0
        StrCpy $R2 "ask"
        ${if} ${Silent}
          StrCpy $R2 "silent"
        ${endIf}

        tuift_ask:
        DetailPrint "Asking ${PRODUCT_NAME} to quit"
        !insertmacro tuiftLog "asking the running app to quit ($R2)"
        ClearErrors
        ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --quit-for-install=$R2' $R1
        ${if} ${errors}
          StrCpy $R1 20
        ${endIf}

        ${if} $R1 == 0
          !insertmacro tuiftLog "the app quit by itself"
          StrCpy $R3 0
          tuift_wait:
          !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
          ${if} $R0 == 0
            IntOp $R3 $R3 + 1
            ${if} $R3 > 5
              !insertmacro tuiftLog "processes of the app were still there after it quit; ending them by force"
              !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 1
              Sleep 500
            ${else}
              Sleep 1000
              Goto tuift_wait
            ${endIf}
          ${endIf}
        ${elseIf} $R1 == 10
          !insertmacro tuiftLog "a chat was working and nobody could be asked; the app was left running and the install stopped (exit code 10)"
          DetailPrint "${PRODUCT_NAME} has a chat working; nothing was closed."
          SetErrorLevel 10
          Quit
        ${elseIf} $R1 == 11
        ${orIf} $R1 == 12
          !insertmacro tuiftLog "a chat is working and the person kept it working (code $R1)"
          ${if} $LANGUAGE == 1046
            StrCpy $R4 "O ${PRODUCT_NAME} ainda está trabalhando em chats e não foi fechado.$\r$\n$\r$\nEspere terminarem e escolha Tentar novamente. Cancelar interrompe a instalação."
          ${else}
            StrCpy $R4 "${PRODUCT_NAME} is still working on chats, so it was not closed.$\r$\n$\r$\nWait for them to finish, then choose Retry. Cancel stops the install."
          ${endIf}
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$R4" /SD IDCANCEL IDRETRY tuift_ask
          SetErrorLevel 1
          Quit
        ${else}
          !insertmacro tuiftLog "the app did not quit on request (code $R1); ending it by force, as before"
        ${endIf}
      ${endIf}
    ${endIf}
  !endif
!macroend

!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro tuiftAskAppToQuit
  !insertmacro _CHECK_APP_RUNNING
!macroend
