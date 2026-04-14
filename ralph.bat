@echo off
setlocal enabledelayedexpansion

REM Ralph Wiggum - Long-running AI agent loop
REM Usage: ralph.bat [--tool amp^|claude] [max_iterations]

set "tool=amp"
set "max_iterations=10"

:parse_args
if "%~1"=="" goto :done_args
if /i "%~1"=="--tool" (
    set "tool=%~2"
    shift
    shift
    goto :parse_args
)
if /i "%~1"=="--tool=amp" (
    set "tool=amp"
    shift
    goto :parse_args
)
if /i "%~1"=="--tool=claude" (
    set "tool=claude"
    shift
    goto :parse_args
)
REM Assume it's max_iterations if it's a number
echo %~1| findstr /r "^[0-9][0-9]*$" >nul
if !errorlevel!==0 (
    set "max_iterations=%~1"
)
shift
goto :parse_args
:done_args

REM Validate tool choice
if /i not "%tool%"=="amp" if /i not "%tool%"=="claude" (
    echo Error: Invalid tool '%tool%'. Must be 'amp' or 'claude'.
    exit /b 1
)

set "SCRIPT_DIR=%~dp0"
REM Remove trailing backslash
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "PRD_FILE=%SCRIPT_DIR%\prd.json"
set "PROGRESS_FILE=%SCRIPT_DIR%\progress.txt"
set "ARCHIVE_DIR=%SCRIPT_DIR%\archive"
set "LAST_BRANCH_FILE=%SCRIPT_DIR%\.last-branch"

REM Archive previous run if branch changed
if exist "%PRD_FILE%" if exist "%LAST_BRANCH_FILE%" (
    set "CURRENT_BRANCH="
    REM Parse branchName from prd.json using findstr
    for /f "tokens=2 delims=:," %%a in ('findstr /c:"branchName" "%PRD_FILE%" 2^>nul') do (
        set "CURRENT_BRANCH=%%~a"
    )
    REM Trim quotes and spaces
    set "CURRENT_BRANCH=!CURRENT_BRANCH: =!"
    set "CURRENT_BRANCH=!CURRENT_BRANCH:"=!"

    set "LAST_BRANCH="
    set /p LAST_BRANCH=<"%LAST_BRANCH_FILE%"

    if defined CURRENT_BRANCH if defined LAST_BRANCH if "!CURRENT_BRANCH!" neq "!LAST_BRANCH!" (
        REM Build date string
        for /f "tokens=2 delims==" %%d in ('wmic os get localdatetime /value ^<nul 2^>nul') do set "DT=%%d"
        set "DATE=!DT:~0,4!-!DT:~4,2!-!DT:~6,2!"

        REM Strip "ralph/" prefix
        set "FOLDER_NAME=!LAST_BRANCH:ralph/=!"
        set "ARCHIVE_FOLDER=%ARCHIVE_DIR%\!DATE!-!FOLDER_NAME!"

        echo Archiving previous run: !LAST_BRANCH!
        if not exist "!ARCHIVE_FOLDER!" mkdir "!ARCHIVE_FOLDER!"
        if exist "%PRD_FILE%" copy /y "%PRD_FILE%" "!ARCHIVE_FOLDER!\" >nul
        if exist "%PROGRESS_FILE%" copy /y "%PROGRESS_FILE%" "!ARCHIVE_FOLDER!\" >nul
        echo    Archived to: !ARCHIVE_FOLDER!

        REM Reset progress file for new run
        (
            echo # Ralph Progress Log
            echo Started: %DATE% %TIME%
            echo ---
        ) > "%PROGRESS_FILE%"
    )
)

REM Track current branch
if exist "%PRD_FILE%" (
    set "CURRENT_BRANCH="
    for /f "tokens=2 delims=:," %%a in ('findstr /c:"branchName" "%PRD_FILE%" 2^>nul') do (
        set "CURRENT_BRANCH=%%~a"
    )
    set "CURRENT_BRANCH=!CURRENT_BRANCH: =!"
    set "CURRENT_BRANCH=!CURRENT_BRANCH:"=!"
    if defined CURRENT_BRANCH echo !CURRENT_BRANCH!> "%LAST_BRANCH_FILE%"
)

REM Initialize progress file if it doesn't exist
if not exist "%PROGRESS_FILE%" (
    for /f "tokens=2 delims==" %%d in ('wmic os get localdatetime /value ^<nul 2^>nul') do set "DT=%%d"
    set "DATE=!DT:~0,4!-!DT:~4,2!-!DT:~6,2!"
    (
        echo # Ralph Progress Log
        echo Started: !DATE! !TIME!
        echo ---
    ) > "%PROGRESS_FILE%"
)

echo Starting Ralph - Tool: %tool% - Max iterations: %max_iterations%

set "TMP_OUT=%TEMP%\ralph_output_%RANDOM%.txt"

for /l %%i in (1,1,%max_iterations%) do (
    echo.
    echo ===============================================================
    echo   Ralph Iteration %%i of %max_iterations% (%tool%)
    echo ===============================================================

    REM Run the selected tool, capture output to temp file and display
    if /i "%tool%"=="amp" (
        type "%SCRIPT_DIR%\prompt.md" | amp --dangerously-allow-all > "%TMP_OUT%" 2>&1
    ) else (
        type "%SCRIPT_DIR%\CLAUDE.md" | claude --dangerously-skip-permissions --print > "%TMP_OUT%" 2>&1
    )

    REM Display output
    type "%TMP_OUT%"

    REM Check for completion signal
    findstr /c:"<promise>COMPLETE</promise>" "%TMP_OUT%" >nul 2>&1
    if !errorlevel!==0 (
        del /q "%TMP_OUT%" 2>nul
        echo.
        echo Ralph completed all tasks!
        echo Completed at iteration %%i of %max_iterations%
        exit /b 0
    )

    echo Iteration %%i complete. Continuing...
    timeout /t 2 /nobreak >nul
)

del /q "%TMP_OUT%" 2>nul

echo.
echo Ralph reached max iterations (%max_iterations%) without completing all tasks.
echo Check %PROGRESS_FILE% for status.
exit /b 1
