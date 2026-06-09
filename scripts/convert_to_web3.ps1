# --- НАСТРОЙКИ ---
$SourceDir = "\\192.168.1.91\Camera\YiHome3WoodNorth\" 
$TargetDir = "C:\tmp\Output" 
# -----------------

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

if (!(Test-Path $SourceDir)) {
    Write-Host "Error: Source directory $SourceDir not found!" -ForegroundColor Red
    exit
}

# 1. Включаем рекурсивный поиск файлов (-Recurse) во всех подпапках
$Files = Get-ChildItem -Path $SourceDir -Filter *.mp4 -Recurse
$TotalFiles = $Files.Count
$CurrentFileIndex = 0

$Global:ProcessingSpeedMBps = 0.5 
$TotalProcessedBytes = 0
$TotalProcessingTime = 0

foreach ($File in $Files) {
    $CurrentFileIndex++
    
    # 2. Вычисляем относительный путь подпапки, в которой лежит текущий файл
    # Пример: если файл в "...\record\2024\07\01\file.mkv", то $RelativePath будет "2024\07\01"
    $RelativePath = $File.DirectoryName.Replace($SourceDir, "").TrimStart("\")
    
    # 3. Формируем точный путь для новой папки и нового файла в целевой директории
    $CurrentTargetFolder = Join-Path $TargetDir $RelativePath
    $OutputFile = Join-Path $CurrentTargetFolder ($File.BaseName + ".mp4")

    # Если папка структуры еще не существует в TargetDir — создаем ее
    if (!(Test-Path $CurrentTargetFolder)) { 
        New-Item -ItemType Directory -Path $CurrentTargetFolder | Out-Null 
    }

    # Проверка на существование готового файла
    if (Test-Path $OutputFile) {
        Write-Host "[$CurrentFileIndex/$TotalFiles] Skip: $RelativePath\$($File.BaseName).mp4 already exists." -ForegroundColor Gray
        continue
    }

    $FileSizeMB = [math]::Round($File.Length / 1MB, 2)
    Write-Host "[$CurrentFileIndex/$TotalFiles] Processing: $RelativePath\$($File.Name) ($FileSizeMB MB)..." -ForegroundColor Cyan
    
    # Расчет прогнозного времени
    $EstimatedTotalSeconds = [math]::Max(5, [math]::Round($FileSizeMB / $Global:ProcessingSpeedMBps))
    
    # Асинхронный запуск ffmpeg (без звука)
    $FFmpegArgs = "-i `"$($File.FullName)`" -c:v libx265 -crf 30 -preset medium -an -movflags +faststart `"$OutputFile`" -y -loglevel quiet"
    $ProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
    $ProcessInfo.FileName = "ffmpeg"
    $ProcessInfo.Arguments = $FFmpegArgs
    $ProcessInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    
    $FFmpegProcess = [System.Diagnostics.Process]::Start($ProcessInfo)
    $StartSeconds = [DateTimeOffset]::Now.ToUnixTimeSeconds()
    
    # Умный прогресс-бар
    while (!$FFmpegProcess.HasExited) {
        $CurrentSeconds = [DateTimeOffset]::Now.ToUnixTimeSeconds()
        $ElapsedSeconds = $CurrentSeconds - $StartSeconds
        
        $Percent = [math]::Min(99, [math]::Round(($ElapsedSeconds / $EstimatedTotalSeconds) * 100))
        $TimeRemaining = [math]::Max(1, ($EstimatedTotalSeconds - $ElapsedSeconds))

        Write-Progress -Activity "Encoding video to MP4 (H.265) with Folder Structure" `
                       -Status "File $CurrentFileIndex of $TotalFiles | Folder: $RelativePath" `
                       -PercentComplete $Percent `
                       -SecondsRemaining $TimeRemaining
        
        Start-Sleep -Milliseconds 500
    }
    
    Write-Progress -Activity "Encoding video to MP4 (H.265) with Folder Structure" -Completed
    
    # Корректировка коэффициента скорости
    $ActualSeconds = [DateTimeOffset]::Now.ToUnixTimeSeconds() - $StartSeconds
    $ActualSeconds = [math]::Max(1, $ActualSeconds)
    
    $TotalProcessedBytes += $File.Length
    $TotalProcessingTime += $ActualSeconds
    $Global:ProcessingSpeedMBps = ($TotalProcessedBytes / 1MB) / $TotalProcessingTime
}

Write-Host "All files processed and structured successfully!" -ForegroundColor Green