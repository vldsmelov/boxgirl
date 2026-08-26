param(
  [string]$ManifestPath = "public\assets\avatar-v2\frames.manifest.json",
  [switch]$RebuildRuntime
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestPath = if ([IO.Path]::IsPathRooted($ManifestPath)) { $ManifestPath } else { Join-Path $projectRoot $ManifestPath }
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
$outfitId = if ($manifest.PSObject.Properties.Name -contains "outfitId") { $manifest.outfitId } else { "hoodie" }
$assetRoot = Split-Path -Parent $manifestPath
$sourceRoot = Join-Path $assetRoot "webp"
$targetRoot = Join-Path $assetRoot "webp-rig"
$masterRoot = (Resolve-Path (Join-Path $assetRoot $manifest.masterDirectory)).Path
$backgroundFuzzPercent = if (
  $manifest.PSObject.Properties.Name -contains "alphaExtraction" -and
  $manifest.alphaExtraction.PSObject.Properties.Name -contains "backgroundFuzzPercent"
) { [double]$manifest.alphaExtraction.backgroundFuzzPercent } else { 12.0 }
$greenProtectionRatio = if (
  $manifest.PSObject.Properties.Name -contains "alphaExtraction" -and
  $manifest.alphaExtraction.PSObject.Properties.Name -contains "greenProtectionRatio"
) { [double]$manifest.alphaExtraction.greenProtectionRatio } else { $null }
$greenProtectionCloseRadius = if (
  $manifest.PSObject.Properties.Name -contains "alphaExtraction" -and
  $manifest.alphaExtraction.PSObject.Properties.Name -contains "greenProtectionCloseRadius"
) { [int]$manifest.alphaExtraction.greenProtectionCloseRadius } else { 0 }

if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
  throw "ImageMagick 'magick' is required to build point-rig assets."
}

New-Item -ItemType Directory -Force -Path $sourceRoot, $targetRoot | Out-Null

foreach ($property in $manifest.frames.PSObject.Properties) {
  $frameId = $property.Name
  $sourcePath = Join-Path $assetRoot $property.Value.file
  $targetPath = Join-Path $targetRoot "$frameId.webp"
  $masterPath = Join-Path $masterRoot "$frameId.png"
  if ($RebuildRuntime -or -not (Test-Path -LiteralPath $sourcePath)) {
    if (-not (Test-Path -LiteralPath $masterPath)) {
      throw "Missing master frame: $masterPath"
    }
    & magick $masterPath -define webp:method=6 -quality 94 $sourcePath
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to build runtime frame: $frameId"
    }
  }
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Missing source frame: $sourcePath"
  }

  # The authored backdrop is a connected, low-contrast dark field. Flood-fill
  # removes only that connected field and preserves dark line art inside the
  # character (eyes, hair shadows, hoodie contours).
  $cornerColor = [string](& magick $sourcePath -format "%[pixel:p{0,0}]" info:)
  if ($null -ne $greenProtectionRatio) {
    # A dark saturated-green garment can sit numerically close to the neutral
    # backdrop. Preserve those source pixels while keeping the connected-field
    # flood fill aggressive enough to avoid a charcoal halo around the body.
    $temporaryPrefix = Join-Path $targetRoot ".$frameId-alpha-build"
    $floodPath = "$temporaryPrefix-flood.png"
    $protectionPath = "$temporaryPrefix-protection.png"
    $alphaPath = "$temporaryPrefix-union.png"
    try {
      & magick $sourcePath `
        -bordercolor $cornerColor -border 1 `
        -alpha set -channel RGBA -fuzz "$backgroundFuzzPercent%" `
        -fill none -draw "color 0,0 floodfill" `
        -shave 1x1 `
        $floodPath
      if ($LASTEXITCODE -ne 0) { throw "Failed to flood-fill point-rig frame: $frameId" }

      $ratio = $greenProtectionRatio.ToString([Globalization.CultureInfo]::InvariantCulture)
      if ($greenProtectionCloseRadius -gt 0) {
        & magick $sourcePath -alpha off `
          -fx "(g > r*$ratio && g > b*$ratio) ? 1 : 0" `
          -morphology Close "Disk:$greenProtectionCloseRadius" `
          $protectionPath
      }
      else {
        & magick $sourcePath -alpha off -fx "(g > r*$ratio && g > b*$ratio) ? 1 : 0" $protectionPath
      }
      if ($LASTEXITCODE -ne 0) { throw "Failed to build foreground protection mask: $frameId" }

      & magick $floodPath -alpha extract $protectionPath -compose Lighten -composite $alphaPath
      if ($LASTEXITCODE -ne 0) { throw "Failed to combine point-rig alpha masks: $frameId" }

      & magick $sourcePath $alphaPath `
        -alpha off -compose CopyOpacity -composite `
        -define webp:method=6 -quality 94 `
        $targetPath
    }
    finally {
      Remove-Item -LiteralPath $floodPath, $protectionPath, $alphaPath -Force -ErrorAction SilentlyContinue
    }
  }
  else {
    & magick $sourcePath `
      -bordercolor $cornerColor -border 1 `
      -alpha set -channel RGBA -fuzz "$backgroundFuzzPercent%" `
      -fill none -draw "color 0,0 floodfill" `
      -shave 1x1 `
      -define webp:method=6 -quality 94 `
      $targetPath
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to build point-rig frame: $frameId"
  }
}

Write-Host "Built $(@($manifest.frames.PSObject.Properties).Count) runtime and transparent point-rig frames for $outfitId"
