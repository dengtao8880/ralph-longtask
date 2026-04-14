# Ralph Wiggum - Long-running AI agent loop
# Usage: .\ralph.ps1 [-tool amp|claude] [-maxIterations <int>]

param(
    [ValidateSet("amp", "claude")]
    [string]$tool = "amp",
    [int]$maxIterations = 10
)

$ErrorActionPreference = "Stop"

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PRD_FILE = Join-Path $SCRIPT_DIR "prd.json"
$PROGRESS_FILE = Join-Path $SCRIPT_DIR "progress.txt"
$ARCHIVE_DIR = Join-Path $SCRIPT_DIR "archive"
$LAST_BRANCH_FILE = Join-Path $SCRIPT_DIR ".last-branch"

# Archive previous run if branch changed
if ((Test-Path $PRD_FILE) -and (Test-Path $LAST_BRANCH_FILE)) {
    $CURRENT_BRANCH = ""
    try {
        $prd = Get-Content $PRD_FILE -Raw | ConvertFrom-Json
        $CURRENT_BRANCH = $prd.branchName
        if ($null -eq $CURRENT_BRANCH) { $CURRENT_BRANCH = "" }
    } catch {
        $CURRENT_BRANCH = ""
    }

    $LAST_BRANCH = ""
    if (Test-Path $LAST_BRANCH_FILE) {
        $LAST_BRANCH = Get-Content $LAST_BRANCH_FILE -Raw
    }

    if ($CURRENT_BRANCH -and $LAST_BRANCH -and ($CURRENT_BRANCH -ne $LAST_BRANCH)) {
        $DATE = Get-Date -Format "yyyy-MM-dd"
        # Strip "ralph/" prefix from branch name for folder
        $FOLDER_NAME = $LAST_BRANCH -replace "^ralph/", ""
        $ARCHIVE_FOLDER = Join-Path $ARCHIVE_DIR "$DATE-$FOLDER_NAME"

        Write-Host "Archiving previous run: $LAST_BRANCH"
        New-Item -ItemType Directory -Path $ARCHIVE_FOLDER -Force | Out-Null
        if (Test-Path $PRD_FILE) { Copy-Item $PRD_FILE $ARCHIVE_FOLDER }
        if (Test-Path $PROGRESS_FILE) { Copy-Item $PROGRESS_FILE $ARCHIVE_FOLDER }
        Write-Host "   Archived to: $ARCHIVE_FOLDER"

        # Reset progress file for new run
        @"
# Ralph Progress Log
Started: $(Get-Date)
---
"@ | Set-Content $PROGRESS_FILE
    }
}

# Track current branch
if (Test-Path $PRD_FILE) {
    try {
        $prd = Get-Content $PRD_FILE -Raw | ConvertFrom-Json
        $CURRENT_BRANCH = $prd.branchName
        if ($CURRENT_BRANCH) {
            Set-Content -Path $LAST_BRANCH_FILE -Value $CURRENT_BRANCH
        }
    } catch {
        # Ignore JSON parse errors
    }
}

# Initialize progress file if it doesn't exist
if (-not (Test-Path $PROGRESS_FILE)) {
    @"
# Ralph Progress Log
Started: $(Get-Date)
---
"@ | Set-Content $PROGRESS_FILE
}

Write-Host "Starting Ralph - Tool: $tool - Max iterations: $maxIterations"

for ($i = 1; $i -le $maxIterations; $i++) {
    Write-Host ""
    Write-Host "==============================================================="
    Write-Host "  Ralph Iteration $i of $maxIterations ($tool)"
    Write-Host "==============================================================="

    # Run the selected tool with the ralph prompt
    $PROMPT_FILE = if ($tool -eq "amp") {
        Join-Path $SCRIPT_DIR "prompt.md"
    } else {
        Join-Path $SCRIPT_DIR "CLAUDE.md"
    }

    try {
        if ($tool -eq "amp") {
            $OUTPUT = Get-Content $PROMPT_FILE -Raw | & amp --dangerously-allow-all 2>&1
        } else {
            $OUTPUT = & claude --dangerously-skip-permissions --print (Get-Content $PROMPT_FILE -Raw) 2>&1
        }
        # Display output
        Write-Host $OUTPUT
    } catch {
        Write-Host $_.Exception.Message
        $OUTPUT = ""
    }

    # Check for completion signal
    if ($OUTPUT -match "<promise>COMPLETE</promise>") {
        Write-Host ""
        Write-Host "Ralph completed all tasks!"
        Write-Host "Completed at iteration $i of $maxIterations"
        exit 0
    }

    Write-Host "Iteration $i complete. Continuing..."
    Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "Ralph reached max iterations ($maxIterations) without completing all tasks."
Write-Host "Check $PROGRESS_FILE for status."
exit 1
