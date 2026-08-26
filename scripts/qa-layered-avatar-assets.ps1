param(
  [string]$ManifestPath = "art\boxgirl-layered-v1\layered.manifest.json",
  [switch]$AllowPartial
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestPath = if ([IO.Path]::IsPathRooted($ManifestPath)) { $ManifestPath } else { Join-Path $projectRoot $ManifestPath }
$manifestPath = (Resolve-Path -LiteralPath $manifestPath).Path
$manifestRoot = Split-Path -Parent $manifestPath
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
$outputRoot = [IO.Path]::GetFullPath((Join-Path $manifestRoot $manifest.outputRoot))
$runtimeManifestPath = Join-Path $outputRoot "model.manifest.json"
$failures = [System.Collections.Generic.List[string]]::new()

if (-not (Test-Path -LiteralPath $runtimeManifestPath)) { throw "Missing runtime layered manifest" }
$runtimeManifest = Get-Content -Raw -Encoding UTF8 $runtimeManifestPath | ConvertFrom-Json
$expectedDimensions = "$($manifest.canvas.width)x$($manifest.canvas.height)"
$outfitLayerRoot = [IO.Path]::GetFullPath((Join-Path $manifestRoot $manifest.outfitLayerRoot))
$baseRoot = [IO.Path]::GetFullPath((Join-Path $manifestRoot $manifest.baseMasterDirectory))
$poseCount = @($manifest.poseMap.PSObject.Properties.Value | Sort-Object -Unique).Count
if ($poseCount -ne [int]$manifest.qualityGates.requiredPoseCount) {
  $failures.Add("Pose count is $poseCount")
}
if (-not $AllowPartial -and -not [bool]$runtimeManifest.complete) {
  $failures.Add("Runtime manifest is partial: $($runtimeManifest.missing -join ', ')")
}

function Test-TransparentLayer([string]$Path, [string]$Label, [bool]$ProtectFrontRegion) {
  if (-not (Test-Path -LiteralPath $Path)) {
    $failures.Add("Missing source layer $Label")
    return
  }
  $dimensions = [string](& magick identify -format "%wx%h" $Path)
  if ($dimensions -ne $expectedDimensions) { $failures.Add("$Label dimensions are $dimensions") }
  $opaque = [string](& magick identify -format "%[opaque]" $Path)
  if ($opaque -ne "False") { $failures.Add("Source layer is opaque: $Label") }
  $maximumAlphaText = [string](& magick identify -format "%[fx:maxima.a]" $Path)
  $maximumAlpha = [double]::Parse($maximumAlphaText, [Globalization.CultureInfo]::InvariantCulture)
  if ($maximumAlpha -le 0.001) { $failures.Add("Source layer is empty: $Label") }

  if ($ProtectFrontRegion) {
    $region = $manifest.qualityGates.protectedFrontRegion
    $geometry = "$($region.width)x$($region.height)+$($region.x)+$($region.y)"
    $protectedAlphaText = [string](& magick $Path -crop $geometry +repage -format "%[fx:maxima.a]" info:)
    $protectedAlpha = [double]::Parse($protectedAlphaText, [Globalization.CultureInfo]::InvariantCulture)
    if ($protectedAlpha -gt 0.01) {
      $failures.Add("Source layer overlaps protected face/hair region: $Label")
    }
  }
}

foreach ($frameId in $manifest.semanticFrames) {
  Test-TransparentLayer (Join-Path $baseRoot "$frameId.png") "base/$frameId" $false
}

foreach ($presentationProperty in $manifest.presentations.PSObject.Properties) {
  if ($presentationProperty.Value.mode -ne "layered") { continue }
  $presentationId = $presentationProperty.Name
  foreach ($poseId in $manifest.poseMap.PSObject.Properties.Value | Sort-Object -Unique) {
    $frontLayer = Join-Path $outfitLayerRoot "$presentationId\front\$poseId.png"
    Test-TransparentLayer $frontLayer "$presentationId/front/$poseId" $true
    $backLayer = Join-Path $outfitLayerRoot "$presentationId\back\$poseId.png"
    if (Test-Path -LiteralPath $backLayer) {
      Test-TransparentLayer $backLayer "$presentationId/back/$poseId" $false
    }
  }
}

foreach ($presentationId in $runtimeManifest.presentations) {
  foreach ($frameId in $manifest.semanticFrames) {
    $runtimePath = Join-Path $outputRoot "$presentationId\webp\$frameId.webp"
    $rigPath = Join-Path $outputRoot "$presentationId\webp-rig\$frameId.webp"
    foreach ($entry in @(@($runtimePath, "runtime"), @($rigPath, "rig"))) {
      if (-not (Test-Path -LiteralPath $entry[0])) {
        $failures.Add("Missing $($entry[1]) $presentationId/$frameId")
        continue
      }
      $dimensions = [string](& magick identify -format "%wx%h" $entry[0])
      if ($dimensions -ne $expectedDimensions) {
        $failures.Add("$presentationId/$frameId $($entry[1]) dimensions are $dimensions")
      }
    }
    if (Test-Path -LiteralPath $rigPath) {
      $opaque = [string](& magick identify -format "%[opaque]" $rigPath)
      if ($opaque -ne "False") { $failures.Add("Rig frame is opaque: $presentationId/$frameId") }
    }
  }
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Host "ERROR: $_" -ForegroundColor Red }
  exit 1
}
Write-Host "Layered avatar asset QA passed."
