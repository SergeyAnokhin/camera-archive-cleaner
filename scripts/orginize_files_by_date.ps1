# --- SETTINGS ---
# $TargetDir = "C:\tmp\Output"          # Target directory with files
$TargetDir = "\\192.168.1.91\Camera\FoscamPTZ\FI9828P_00626E68890F\snap\"          # Target directory with files
$FileExtension = "*.jpg"               # File extension to process
$DateRegex = "(\d{4})(\d{2})(\d{2})" # Regex pattern YYYYMMDD
# -----------------

# Set terminal output encoding to UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

if (!(Test-Path $TargetDir)) {
    Write-Host "Error: Directory $TargetDir not found!" -ForegroundColor Red
    exit
}

$Files = Get-ChildItem -Path $TargetDir -Filter $FileExtension
$TotalFiles = $Files.Count

if ($TotalFiles -eq 0) {
    Write-Host "No files found matching $FileExtension" -ForegroundColor Yellow
    exit
}

Write-Host "Found files to organize: $TotalFiles" -ForegroundColor Cyan

$AutoApproveCount = 0       
$AutoApproveUntilDay = $null 
$AutoApproveUntilMonth = $null 
$AutoApproveUntilYear = $null  

foreach ($File in $Files) {
    if ($File.Name -match $DateRegex) {
        $Year  = $Matches[1]
        $Month = $Matches[2]
        $Day   = $Matches[3]
    } else {
        continue
    }

    $NewFolderDir = Join-Path $TargetDir "$Year\$Month\$Day"
    $DestFilePath = Join-Path $NewFolderDir $File.Name
    $NeedsPrompt = $true

    if ($AutoApproveCount -gt 0) {
        $AutoApproveCount--
        $NeedsPrompt = $false
    }
    elseif ($AutoApproveUntilDay -and $AutoApproveUntilDay -eq "$Year$Month$Day") { $NeedsPrompt = $false }
    elseif ($AutoApproveUntilMonth -and $AutoApproveUntilMonth -eq "$Year$Month") { $NeedsPrompt = $false }
    elseif ($AutoApproveUntilYear -and $AutoApproveUntilYear -eq $Year) { $NeedsPrompt = $false }
    else {
        $AutoApproveUntilDay = $null
        $AutoApproveUntilMonth = $null
        $AutoApproveUntilYear = $null
    }

    if ($NeedsPrompt) {
        Clear-Host
        Write-Host "--- [CONFIRMATION REQUEST] ---" -ForegroundColor Magenta
        Write-Host "File  : $($File.Name)" -ForegroundColor Cyan
        Write-Host "Target: $Year\$Month\$Day\" -ForegroundColor Green
        Write-Host "--------------------------------------------------"
        Write-Host "[Y]  - Yes (Only this file)"
        Write-Host "[10] - Process next 10 files automatically"
        Write-Host "[D]  - Process all files for DAY ($Year-$Month-$Day)"
        Write-Host "[M]  - Process all files for MONTH ($Year-$Month)"
        Write-Host "[A]  - Process all files for YEAR ($Year)"
        Write-Host "[Q]  - Quit script"
        Write-Host "--------------------------------------------------"
        
        $Choice = Read-Host "Your choice"
        $Choice = $Choice.ToUpper().Trim()

        switch ($Choice) {
            "Y"  { $NeedsPrompt = $false }
            "10" { $AutoApproveCount = 9; $NeedsPrompt = $false } 
            "D"  { $AutoApproveUntilDay = "$Year$Month$Day"; $NeedsPrompt = $false }
            "M"  { $AutoApproveUntilMonth = "$Year$Month"; $NeedsPrompt = $false }
            "A"  { $AutoApproveUntilYear = $Year; $NeedsPrompt = $false }
            "Q"  { Write-Host "Exit requested by user."; break }
            default { 
                Write-Host "Invalid choice, file skipped..." -ForegroundColor Yellow
                Start-Sleep -Seconds 1
                continue 
            }
        }
    }

    if (!(Test-Path $NewFolderDir)) {
        New-Item -ItemType Directory -Path $NewFolderDir | Out-Null
    }

    if (!(Test-Path $DestFilePath)) {
        Move-Item -Path $File.FullName -Destination $DestFilePath
        if (!$NeedsPrompt) {
            Write-Host "Moved: $($File.Name) -> $Year\$Month\$Day\" -ForegroundColor Gray
        }
    }
}

Write-Host "Processing completed successfully!" -ForegroundColor Green