param(
  [string]$ManifestPath = "public\assets\avatar-layered-v1\base-debug\frames.manifest.json"
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestPath = if ([IO.Path]::IsPathRooted($ManifestPath)) { $ManifestPath } else { Join-Path $projectRoot $ManifestPath }
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
$runtimeRoot = Split-Path -Parent $manifestPath
$masterRoot = (Resolve-Path (Join-Path $runtimeRoot $manifest.masterDirectory)).Path
$webpRoot = Join-Path $runtimeRoot $manifest.runtimeDirectory
$rigRoot = Join-Path $runtimeRoot $manifest.pointRigDirectory
$expectedDimensions = "$($manifest.canvas.width)x$($manifest.canvas.height)"
$frameIds = @($manifest.semanticFrames)
$failures = [System.Collections.Generic.List[string]]::new()

if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
  throw "ImageMagick 'magick' is required for base mannequin QA."
}

foreach ($frameId in $frameIds) {
  $master = Join-Path $masterRoot "$frameId.png"
  $runtime = Join-Path $webpRoot "$frameId.webp"
  $rig = Join-Path $rigRoot "$frameId.webp"

  foreach ($asset in @(
    @{ Path = $master; Label = "master" },
    @{ Path = $runtime; Label = "runtime" },
    @{ Path = $rig; Label = "point-rig" }
  )) {
    if (-not (Test-Path -LiteralPath $asset.Path -PathType Leaf)) {
      $failures.Add("Missing $($asset.Label) frame: $frameId")
      continue
    }
    $dimensions = [string](& magick identify -format "%wx%h" $asset.Path)
    if ($dimensions -ne $expectedDimensions) {
      $failures.Add("$frameId $($asset.Label) dimensions are $dimensions; expected $expectedDimensions")
    }
  }

  if ((Test-Path -LiteralPath $master) -and ([string](& magick identify -format "%[opaque]" $master)) -ne "False") {
    $failures.Add("$frameId master must contain transparent pixels")
  }
  if ((Test-Path -LiteralPath $runtime) -and ([string](& magick identify -format "%[opaque]" $runtime)) -ne "True") {
    $failures.Add("$frameId runtime frame must be precomposited on the safe backdrop")
  }
  if ((Test-Path -LiteralPath $rig) -and ([string](& magick identify -format "%[opaque]" $rig)) -ne "False") {
    $failures.Add("$frameId point-rig frame must preserve alpha")
  }
}

$masterFiles = @(Get-ChildItem -LiteralPath $masterRoot -Filter "*.png" -File)
$runtimeFiles = @(Get-ChildItem -LiteralPath $webpRoot -Filter "*.webp" -File)
$rigFiles = @(Get-ChildItem -LiteralPath $rigRoot -Filter "*.webp" -File)
foreach ($collection in @(
  @{ Name = "master"; Count = $masterFiles.Count },
  @{ Name = "runtime"; Count = $runtimeFiles.Count },
  @{ Name = "point-rig"; Count = $rigFiles.Count }
)) {
  if ($collection.Count -ne $frameIds.Count) {
    $failures.Add("$($collection.Name) frame count $($collection.Count) does not match manifest count $($frameIds.Count)")
  }
}

$primaryMaster = Join-Path $masterRoot "private-playful.png"
$legacyMaster = Join-Path $masterRoot "private-playful-alt.png"
$primaryRuntime = Join-Path $webpRoot "private-playful.webp"
$legacyRuntime = Join-Path $webpRoot "private-playful-alt.webp"
$primaryRig = Join-Path $rigRoot "private-playful.webp"
$legacyRig = Join-Path $rigRoot "private-playful-alt.webp"
foreach ($pair in @(
  @{ Primary = $primaryMaster; Legacy = $legacyMaster; Label = "master" },
  @{ Primary = $primaryRuntime; Legacy = $legacyRuntime; Label = "runtime" },
  @{ Primary = $primaryRig; Legacy = $legacyRig; Label = "point-rig" }
)) {
  if ((Test-Path -LiteralPath $pair.Primary) -and (Test-Path -LiteralPath $pair.Legacy)) {
    $primaryHash = (Get-FileHash -LiteralPath $pair.Primary -Algorithm SHA256).Hash
    $legacyHash = (Get-FileHash -LiteralPath $pair.Legacy -Algorithm SHA256).Hash
    if ($primaryHash -eq $legacyHash) {
      $failures.Add("Corrected and legacy bonk $($pair.Label) frames must be distinct")
    }
  }
}

if ($manifest.bonkFrames.corrected.frame -ne "private-playful" -or
    $manifest.bonkFrames.corrected.garment -ne "warm-peach-beige-two-piece-strapless-swimsuit") {
  $failures.Add("Corrected bonk must be pinned to the approved two-piece strapless swimsuit")
}

$sample = $manifest.qualityGates.correctedBonkMidriffSample
if ($sample) {
  $sampleRed = [double]::Parse(
    [string](& magick $primaryMaster -format "%[fx:p{$($sample.x),$($sample.y)}.r]" info:),
    [Globalization.CultureInfo]::InvariantCulture
  )
  $sampleBlue = [double]::Parse(
    [string](& magick $primaryMaster -format "%[fx:p{$($sample.x),$($sample.y)}.b]" info:),
    [Globalization.CultureInfo]::InvariantCulture
  )
  if ($sampleRed -lt [double]$sample.minimumRed -or $sampleBlue -lt [double]$sample.minimumBlue) {
    $failures.Add("Corrected bonk midriff sample does not expose the approved swimsuit gap")
  }
}

Write-Host "Base mannequin: $($frameIds.Count) semantic frames ($($runtimeFiles.Count) runtime, $($rigFiles.Count) point-rig)."
Write-Host "Corrected bonk: private-playful in the approved two-piece swimsuit; legacy command bonk2: private-playful-alt."

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Host "ERROR: $_" -ForegroundColor Red }
  exit 1
}

Write-Host "Base mannequin asset QA passed."
