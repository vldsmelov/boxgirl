param(
  [string]$ManifestPath = "art\boxgirl-layered-v1\layered.manifest.json",
  [switch]$DevelopmentPartial
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestPath = if ([IO.Path]::IsPathRooted($ManifestPath)) { $ManifestPath } else { Join-Path $projectRoot $ManifestPath }
$manifestPath = (Resolve-Path -LiteralPath $manifestPath).Path
$manifestRoot = Split-Path -Parent $manifestPath
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json

if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
  throw "ImageMagick 'magick' is required to build layered avatar assets."
}

$expectedDimensions = "$($manifest.canvas.width)x$($manifest.canvas.height)"
$baseRoot = (Resolve-Path (Join-Path $manifestRoot $manifest.baseMasterDirectory)).Path
$outputRoot = [IO.Path]::GetFullPath((Join-Path $manifestRoot $manifest.outputRoot))
$neutralBase = Join-Path $baseRoot "neutral.png"
if (-not (Test-Path -LiteralPath $neutralBase)) { throw "Missing neutral base master: $neutralBase" }

$poseIds = @($manifest.poseMap.PSObject.Properties.Value | Sort-Object -Unique)
if ($poseIds.Count -ne [int]$manifest.qualityGates.requiredPoseCount) {
  throw "Pose map contains $($poseIds.Count) unique poses; expected $($manifest.qualityGates.requiredPoseCount)."
}
if (@($manifest.semanticFrames).Count -ne [int]$manifest.qualityGates.requiredFrameCount) {
  throw "Manifest frame count does not match the quality gate."
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$workingRoot = Join-Path $projectRoot "target\layered-avatar-build"
New-Item -ItemType Directory -Force -Path $workingRoot | Out-Null
$reportRows = [System.Collections.Generic.List[object]]::new()
$missing = [System.Collections.Generic.List[string]]::new()

function Assert-Dimensions([string]$Path, [string]$Label) {
  $dimensions = [string](& magick identify -format "%wx%h" $Path)
  if ($LASTEXITCODE -ne 0 -or $dimensions -ne $expectedDimensions) {
    throw "$Label has dimensions $dimensions; expected $expectedDimensions"
  }
}

function Get-NormalizedImageValue([string]$Path, [string]$Expression) {
  $value = [string](& magick identify -format "%[fx:$Expression]" $Path)
  if ($LASTEXITCODE -ne 0) { throw "Failed to inspect $Path" }
  return [double]::Parse($value, [Globalization.CultureInfo]::InvariantCulture)
}

function Assert-TransparentLayer([string]$Path, [string]$Label, [bool]$ProtectFrontRegion) {
  Assert-Dimensions $Path $Label
  $opaque = [string](& magick identify -format "%[opaque]" $Path)
  if ($LASTEXITCODE -ne 0 -or $opaque -ne "False") {
    throw "$Label must contain a real alpha channel with transparent pixels."
  }

  $maximumAlpha = Get-NormalizedImageValue $Path "maxima.a"
  if ($maximumAlpha -le 0.001) { throw "$Label is fully transparent." }

  if ($ProtectFrontRegion) {
    $region = $manifest.qualityGates.protectedFrontRegion
    $geometry = "$($region.width)x$($region.height)+$($region.x)+$($region.y)"
    $protectedAlphaText = [string](& magick $Path -crop $geometry +repage -format "%[fx:maxima.a]" info:)
    if ($LASTEXITCODE -ne 0) { throw "Failed to inspect protected region in $Label" }
    $protectedAlpha = [double]::Parse($protectedAlphaText, [Globalization.CultureInfo]::InvariantCulture)
    if ($protectedAlpha -gt 0.01) {
      throw "$Label overlaps the protected face/hair region (maximum alpha $protectedAlpha)."
    }
  }
}

function Convert-Foreground([string]$Source, [string]$Destination) {
  $opaque = [string](& magick identify -format "%[opaque]" $Source)
  if ($opaque -eq "False") {
    & magick $Source PNG32:$Destination
    if ($LASTEXITCODE -ne 0) { throw "Failed to normalize transparent foreground from $Source" }
    return
  }
  $cornerColor = [string](& magick $Source -format "%[pixel:p{0,0}]" info:)
  & magick $Source `
    -bordercolor $cornerColor -border 1 `
    -alpha set -channel RGBA -fuzz "12%" `
    -fill none -draw "color 0,0 floodfill" `
    -shave 1x1 PNG32:$Destination
  if ($LASTEXITCODE -ne 0) { throw "Failed to extract foreground from $Source" }
}

function Write-RuntimePair([string]$RigPng, [string]$RigWebp, [string]$RuntimeWebp) {
  & magick $RigPng -define webp:method=6 -quality $manifest.qualityGates.runtimeWebpQuality $RigWebp
  if ($LASTEXITCODE -ne 0) { throw "Failed to encode $RigWebp" }
  & magick -size $expectedDimensions "xc:$($manifest.backgroundColor)" $RigPng -compose over -composite `
    -define webp:method=6 -quality $manifest.qualityGates.runtimeWebpQuality $RuntimeWebp
  if ($LASTEXITCODE -ne 0) { throw "Failed to encode $RuntimeWebp" }
}

foreach ($presentationProperty in $manifest.presentations.PSObject.Properties) {
  $presentationId = $presentationProperty.Name
  $presentation = $presentationProperty.Value
  $presentationRoot = Join-Path $outputRoot $presentationId
  $runtimeRoot = Join-Path $presentationRoot "webp"
  $rigRoot = Join-Path $presentationRoot "webp-rig"
  New-Item -ItemType Directory -Force -Path $runtimeRoot, $rigRoot | Out-Null

  foreach ($frameId in $manifest.semanticFrames) {
    $runtimeTarget = Join-Path $runtimeRoot "$frameId.webp"
    $rigTarget = Join-Path $rigRoot "$frameId.webp"

    if ($presentation.mode -eq "legacy-precomposed") {
      $sourceRoot = [IO.Path]::GetFullPath((Join-Path $manifestRoot $presentation.source))
      $runtimeSource = Join-Path $sourceRoot "webp\$frameId.webp"
      $rigSource = Join-Path $sourceRoot "webp-rig\$frameId.webp"
      if (-not (Test-Path -LiteralPath $runtimeSource) -or -not (Test-Path -LiteralPath $rigSource)) {
        throw "Missing legacy runtime pair for $presentationId/$frameId"
      }
      Copy-Item -LiteralPath $runtimeSource -Destination $runtimeTarget -Force
      Copy-Item -LiteralPath $rigSource -Destination $rigTarget -Force
      $sourceMode = "legacy-precomposed"
    } else {
      $aliasSource = if ($manifest.baseAliases.PSObject.Properties.Name -contains $frameId) {
        [string]$manifest.baseAliases.$frameId
      } else {
        $null
      }
      $baseSource = if ($aliasSource) {
        Join-Path $baseRoot "$aliasSource.png"
      } else {
        Join-Path $baseRoot "$frameId.png"
      }
      if (-not (Test-Path -LiteralPath $baseSource)) {
        if ($aliasSource) {
          throw "Base alias $frameId -> $aliasSource points to a missing master."
        } else {
          $missing.Add("base/$frameId")
          if (-not $DevelopmentPartial) { continue }
          $baseSource = $neutralBase
        }
      }
      Assert-TransparentLayer $baseSource "base/$frameId" $false
      $baseForeground = Join-Path $workingRoot "base-$frameId.png"
      Convert-Foreground $baseSource $baseForeground

      if ($presentation.mode -eq "base") {
        Copy-Item -LiteralPath $baseForeground -Destination (Join-Path $workingRoot "$presentationId-$frameId.png") -Force
        $rigPng = Join-Path $workingRoot "$presentationId-$frameId.png"
        $sourceMode = if ($aliasSource) {
          "semantic-alias:$aliasSource"
        } elseif ((Split-Path -Leaf $baseSource) -eq "$frameId.png") {
          "base"
        } else {
          "partial-neutral"
        }
      } elseif ($presentation.mode -eq "layered") {
        $poseId = [string]$manifest.poseMap.$frameId
        $layerRoot = Join-Path (Join-Path $manifestRoot $manifest.outfitLayerRoot) $presentationId
        $backLayer = Join-Path $layerRoot "back\$poseId.png"
        $frontLayer = Join-Path $layerRoot "front\$poseId.png"
        if (-not (Test-Path -LiteralPath $frontLayer)) {
          $missing.Add("$presentationId/front/$poseId")
          continue
        }
        Assert-TransparentLayer $frontLayer "$presentationId/front/$poseId" $true
        $rigPng = Join-Path $workingRoot "$presentationId-$frameId.png"
        if (Test-Path -LiteralPath $backLayer) {
          Assert-TransparentLayer $backLayer "$presentationId/back/$poseId" $false
          & magick $backLayer $baseForeground -compose over -composite $frontLayer -compose over -composite PNG32:$rigPng
        } else {
          & magick $baseForeground $frontLayer -compose over -composite PNG32:$rigPng
        }
        if ($LASTEXITCODE -ne 0) { throw "Failed to compose $presentationId/$frameId" }
        $sourceMode = "layered"
      } else {
        throw "Unknown presentation mode '$($presentation.mode)' for $presentationId"
      }
      Write-RuntimePair $rigPng $rigTarget $runtimeTarget
    }

    $reportRows.Add([PSCustomObject]@{
      presentation = $presentationId
      frame = $frameId
      pose = [string]$manifest.poseMap.$frameId
      sourceMode = $sourceMode
      runtimeBytes = (Get-Item -LiteralPath $runtimeTarget).Length
      rigBytes = (Get-Item -LiteralPath $rigTarget).Length
    })
  }
}

if ($missing.Count -gt 0 -and -not $DevelopmentPartial) {
  throw "Layered avatar build is incomplete:`n$($missing -join "`n")"
}

$runtimeManifest = [ordered]@{
  version = [int]$manifest.version
  characterId = [string]$manifest.characterId
  canvas = $manifest.canvas
  semanticFrames = $manifest.semanticFrames
  poseMap = $manifest.poseMap
  baseAliases = $manifest.baseAliases
  presentations = @($manifest.presentations.PSObject.Properties.Name)
  safeFallback = $manifest.safeFallback
  complete = $missing.Count -eq 0
  missing = @($missing)
}
$runtimeManifest | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 (Join-Path $outputRoot "model.manifest.json")
$reportRows | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $outputRoot "build-report.json")

Write-Host "Built $($reportRows.Count) layered avatar runtime frames."
if ($missing.Count -gt 0) {
  Write-Warning "Development partial build used neutral base for: $($missing -join ', ')"
}
