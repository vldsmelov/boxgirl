param(
  [string]$ManifestPath = "public\assets\avatar-v2\frames.manifest.json"
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestPath = if ([IO.Path]::IsPathRooted($ManifestPath)) { $ManifestPath } else { Join-Path $projectRoot $ManifestPath }
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
$outfitId = if ($manifest.PSObject.Properties.Name -contains "outfitId") { $manifest.outfitId } else { "hoodie" }
$runtimeRoot = Split-Path -Parent $manifestPath
$masterRoot = (Resolve-Path (Join-Path $runtimeRoot $manifest.masterDirectory)).Path
$expectedDimensions = "$($manifest.canvas.width)x$($manifest.canvas.height)"
$minimumPsnr = [double]$manifest.qualityGates.runtimePsnrMinimumDb
$rigRoot = Join-Path $runtimeRoot $manifest.pointRigDirectory
$rows = @()
$failures = [System.Collections.Generic.List[string]]::new()

if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
  throw "ImageMagick 'magick' is required for avatar QA."
}

foreach ($property in $manifest.frames.PSObject.Properties) {
  $frameId = $property.Name
  $runtimePath = Join-Path $runtimeRoot $property.Value.file
  $masterPath = Join-Path $masterRoot "$frameId.png"
  $rigPath = Join-Path $rigRoot "$frameId.webp"

  if (-not (Test-Path -LiteralPath $runtimePath)) {
    $failures.Add("Missing runtime frame: $frameId")
    continue
  }
  if (-not (Test-Path -LiteralPath $masterPath)) {
    $failures.Add("Missing PNG master: $frameId")
    continue
  }
  if (-not (Test-Path -LiteralPath $rigPath)) {
    $failures.Add("Missing point-rig frame: $frameId")
    continue
  }

  $dimensions = [string](& magick identify -format "%wx%h" $runtimePath)
  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $psnrOutput = [string](& magick compare -metric PSNR $masterPath $runtimePath null: 2>&1)
  $ErrorActionPreference = $previousErrorPreference
  $psnrMatch = [regex]::Match($psnrOutput, "[0-9]+(?:\.[0-9]+)?")
  $psnr = if ($psnrMatch.Success) {
    [double]::Parse($psnrMatch.Value, [Globalization.CultureInfo]::InvariantCulture)
  } else {
    0
  }

  if ($dimensions -ne $expectedDimensions) {
    $failures.Add("$frameId has dimensions $dimensions; expected $expectedDimensions")
  }
  if ($psnr -lt $minimumPsnr) {
    $failures.Add("$frameId has PSNR $([math]::Round($psnr, 2)) dB; expected >= $minimumPsnr dB")
  }

  $rigDimensions = [string](& magick identify -format "%wx%h" $rigPath)
  $rigOpaque = [string](& magick identify -format "%[opaque]" $rigPath)
  $rigCenterAlpha = [double]::Parse(
    [string](& magick $rigPath -format "%[fx:p{$([int]($manifest.canvas.width / 2)),$([int]($manifest.canvas.height / 2))}.a]" info:),
    [Globalization.CultureInfo]::InvariantCulture
  )
  if ($rigDimensions -ne $expectedDimensions) {
    $failures.Add("$frameId point-rig dimensions are $rigDimensions; expected $expectedDimensions")
  }
  if ($rigOpaque -ne "False") {
    $failures.Add("$frameId point-rig frame has no transparent backdrop")
  }
  if ($rigCenterAlpha -lt 0.98) {
    $failures.Add("$frameId point-rig foreground center is unexpectedly transparent")
  }

  $rows += [PSCustomObject]@{
    Frame = $frameId
    Dimensions = $dimensions
    PSNR = [math]::Round($psnr, 2)
    RuntimeKB = [math]::Round((Get-Item -LiteralPath $runtimePath).Length / 1KB, 1)
    RigKB = [math]::Round((Get-Item -LiteralPath $rigPath).Length / 1KB, 1)
  }
}

$runtimeFiles = @(Get-ChildItem -LiteralPath (Join-Path $runtimeRoot "webp") -Filter "*.webp" -File)
$rigFiles = @(Get-ChildItem -LiteralPath $rigRoot -Filter "*.webp" -File)
$manifestFrameCount = @($manifest.frames.PSObject.Properties).Count
if ($runtimeFiles.Count -ne $manifestFrameCount) {
  $failures.Add("Runtime frame count $($runtimeFiles.Count) does not match manifest count $manifestFrameCount")
}
if ($rigFiles.Count -ne $manifestFrameCount) {
  $failures.Add("Point-rig frame count $($rigFiles.Count) does not match manifest count $manifestFrameCount")
}

$privateRuntimePath = Join-Path $runtimeRoot $manifest.frames.'private-playful'.file
$joyRuntimePath = Join-Path $runtimeRoot $manifest.frames.joy.file
$privateRigPath = Join-Path $rigRoot "private-playful.webp"
$joyRigPath = Join-Path $rigRoot "joy.webp"
if (
  (Get-FileHash -LiteralPath $privateRuntimePath -Algorithm SHA256).Hash -eq
  (Get-FileHash -LiteralPath $joyRuntimePath -Algorithm SHA256).Hash
) {
  $failures.Add("private-playful runtime frame is an alias of joy; bonk requires authored full-frame art")
}
if (
  (Get-FileHash -LiteralPath $privateRigPath -Algorithm SHA256).Hash -eq
  (Get-FileHash -LiteralPath $joyRigPath -Algorithm SHA256).Hash
) {
  $failures.Add("private-playful point-rig frame is an alias of joy; bonk requires authored full-frame art")
}

$rows | Format-Table -AutoSize
Write-Host "Avatar runtime: $($runtimeFiles.Count) frames, $([math]::Round(($runtimeFiles | Measure-Object Length -Sum).Sum / 1MB, 2)) MB"
Write-Host "Point-rig runtime: $($rigFiles.Count) transparent frames, $([math]::Round(($rigFiles | Measure-Object Length -Sum).Sum / 1MB, 2)) MB"

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Host "ERROR: $_" -ForegroundColor Red }
  exit 1
}

Write-Host "Avatar asset QA passed for $outfitId."
