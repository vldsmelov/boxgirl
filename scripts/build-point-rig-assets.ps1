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
$opaqueProtectionPolygons = if (
  $manifest.PSObject.Properties.Name -contains "alphaExtraction" -and
  $manifest.alphaExtraction.PSObject.Properties.Name -contains "opaqueProtectionPolygons"
) { @($manifest.alphaExtraction.opaqueProtectionPolygons) } else { @() }
$alphaCleanupRadius = if (
  $manifest.PSObject.Properties.Name -contains "alphaExtraction" -and
  $manifest.alphaExtraction.PSObject.Properties.Name -contains "cleanupRadius"
) { [int]$manifest.alphaExtraction.cleanupRadius } else { 0 }
$connectedComponentAreaThreshold = if (
  $manifest.PSObject.Properties.Name -contains "alphaExtraction" -and
  $manifest.alphaExtraction.PSObject.Properties.Name -contains "connectedComponentAreaThreshold"
) { [int]$manifest.alphaExtraction.connectedComponentAreaThreshold } else { 0 }
$sourceAlphaRequired = if (
  $manifest.PSObject.Properties.Name -contains "alphaExtraction" -and
  $manifest.alphaExtraction.PSObject.Properties.Name -contains "sourceAlphaRequired"
) { [bool]$manifest.alphaExtraction.sourceAlphaRequired } else { $false }

if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
  throw "ImageMagick 'magick' is required to build point-rig assets."
}

New-Item -ItemType Directory -Force -Path $sourceRoot, $targetRoot | Out-Null

foreach ($property in $manifest.frames.PSObject.Properties) {
  $frameId = $property.Name
  $sourcePath = Join-Path $assetRoot $property.Value.file
  $targetPath = Join-Path $targetRoot "$frameId.webp"
  $masterPath = Join-Path $masterRoot "$frameId.png"
  if ($sourceAlphaRequired) {
    if (-not (Test-Path -LiteralPath $masterPath)) {
      throw "Missing master frame: $masterPath"
    }
    $masterChannels = [string](& magick identify -format "%[channels]" $masterPath)
    $masterAlphaMinimum = if ($masterChannels -match "a") {
      [double]::Parse(
        [string](& magick identify -format "%[fx:minima.a]" $masterPath),
        [Globalization.CultureInfo]::InvariantCulture
      )
    } else { 1.0 }
    if ($masterAlphaMinimum -ge 0.999) {
      throw "Master frame must contain a transparent RGBA backdrop: $frameId"
    }
  }
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

  $sourceChannels = [string](& magick identify -format "%[channels]" $sourcePath)
  $sourceAlphaMinimum = if ($sourceChannels -match "a") {
    [double]::Parse(
      [string](& magick identify -format "%[fx:minima.a]" $sourcePath),
      [Globalization.CultureInfo]::InvariantCulture
    )
  } else { 1.0 }
  $sourceHasTransparentAlpha = $sourceAlphaMinimum -lt 0.999

  if ($sourceAlphaRequired -and -not $sourceHasTransparentAlpha) {
    throw "Runtime source lost the required transparent alpha: $frameId"
  }

  if ($sourceHasTransparentAlpha) {
    & magick $sourcePath `
      -define webp:method=6 -quality 94 `
      $targetPath
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to preserve authored point-rig alpha: $frameId"
    }
    continue
  }

  # The authored backdrop is a connected, low-contrast dark field. Flood-fill
  # removes only that connected field and preserves dark line art inside the
  # character (eyes, hair shadows, hoodie contours).
  $cornerColor = [string](& magick $sourcePath -format "%[pixel:p{0,0}]" info:)
  if ($null -ne $greenProtectionRatio -or $opaqueProtectionPolygons.Count -gt 0) {
    # Dark garments can sit numerically close to the neutral backdrop. Combine
    # the connected-field flood mask with optional color and authored interior
    # masks. The polygons are deliberately restricted to regions guaranteed to
    # remain inside the character silhouette for every semantic frame.
    $temporaryPrefix = Join-Path $targetRoot ".$frameId-alpha-build"
    $floodPath = "$temporaryPrefix-flood.png"
    $greenProtectionPath = "$temporaryPrefix-green-protection.png"
    $polygonProtectionPath = "$temporaryPrefix-polygon-protection.png"
    $alphaPath = "$temporaryPrefix-union.png"
    $cleanAlphaPath = "$temporaryPrefix-clean.png"
    $componentAlphaPath = "$temporaryPrefix-components.png"
    $temporaryPaths = [System.Collections.Generic.List[string]]::new()
    try {
      & magick $sourcePath `
        -bordercolor $cornerColor -border 1 `
        -alpha set -channel RGBA -fuzz "$backgroundFuzzPercent%" `
        -fill none -draw "color 0,0 floodfill" `
        -shave 1x1 `
        $floodPath
      if ($LASTEXITCODE -ne 0) { throw "Failed to flood-fill point-rig frame: $frameId" }
      $temporaryPaths.Add($floodPath)

      $protectionPaths = [System.Collections.Generic.List[string]]::new()

      if ($null -ne $greenProtectionRatio) {
        $ratio = $greenProtectionRatio.ToString([Globalization.CultureInfo]::InvariantCulture)
        if ($greenProtectionCloseRadius -gt 0) {
          & magick $sourcePath -alpha off `
            -fx "(g > r*$ratio && g > b*$ratio) ? 1 : 0" `
            -morphology Close "Disk:$greenProtectionCloseRadius" `
            $greenProtectionPath
        }
        else {
          & magick $sourcePath -alpha off -fx "(g > r*$ratio && g > b*$ratio) ? 1 : 0" $greenProtectionPath
        }
        if ($LASTEXITCODE -ne 0) { throw "Failed to build foreground color protection mask: $frameId" }
        $protectionPaths.Add($greenProtectionPath)
        $temporaryPaths.Add($greenProtectionPath)
      }

      if ($opaqueProtectionPolygons.Count -gt 0) {
        $polygonArguments = [System.Collections.Generic.List[string]]::new()
        $polygonArguments.Add("-size")
        $polygonArguments.Add("$($manifest.canvas.width)x$($manifest.canvas.height)")
        $polygonArguments.Add("xc:black")
        $polygonArguments.Add("-fill")
        $polygonArguments.Add("white")
        foreach ($polygon in $opaqueProtectionPolygons) {
          $polygonArguments.Add("-draw")
          $polygonArguments.Add("polygon $polygon")
        }
        $polygonArguments.Add($polygonProtectionPath)
        & magick @polygonArguments
        if ($LASTEXITCODE -ne 0) { throw "Failed to build authored opaque protection mask: $frameId" }
        $protectionPaths.Add($polygonProtectionPath)
        $temporaryPaths.Add($polygonProtectionPath)
      }

      $floodAlphaPath = "$temporaryPrefix-flood-alpha.png"
      & magick $floodPath -alpha extract $floodAlphaPath
      if ($LASTEXITCODE -ne 0) { throw "Failed to extract flood alpha mask: $frameId" }
      $temporaryPaths.Add($floodAlphaPath)

      $currentUnionPath = $floodAlphaPath
      for ($protectionIndex = 0; $protectionIndex -lt $protectionPaths.Count; $protectionIndex++) {
        $nextUnionPath = if ($protectionIndex -eq $protectionPaths.Count - 1) {
          $alphaPath
        } else {
          "$temporaryPrefix-union-$protectionIndex.png"
        }
        & magick $currentUnionPath $protectionPaths[$protectionIndex] `
          -compose Lighten -composite `
          $nextUnionPath
        if ($LASTEXITCODE -ne 0) { throw "Failed to combine point-rig alpha masks: $frameId" }
        $temporaryPaths.Add($nextUnionPath)
        $currentUnionPath = $nextUnionPath
      }

      $effectiveAlphaPath = $alphaPath
      if ($alphaCleanupRadius -gt 0) {
        & magick $alphaPath `
          -morphology Open "Disk:$alphaCleanupRadius" `
          -morphology Close "Disk:$alphaCleanupRadius" `
          $cleanAlphaPath
        if ($LASTEXITCODE -ne 0) { throw "Failed to clean point-rig alpha mask: $frameId" }
        $temporaryPaths.Add($cleanAlphaPath)
        $effectiveAlphaPath = $cleanAlphaPath
      }

      if ($connectedComponentAreaThreshold -gt 0) {
        & magick $effectiveAlphaPath `
          -colorspace Gray -threshold 50% `
          -define "connected-components:area-threshold=$connectedComponentAreaThreshold" `
          -define connected-components:mean-color=true `
          -connected-components 8 -threshold 50% `
          $componentAlphaPath
        if ($LASTEXITCODE -ne 0) { throw "Failed to remove disconnected alpha islands: $frameId" }
        $temporaryPaths.Add($componentAlphaPath)
        $effectiveAlphaPath = $componentAlphaPath
      }

      & magick $sourcePath $effectiveAlphaPath `
        -alpha off -compose CopyOpacity -composite `
        -define webp:method=6 -quality 94 `
        $targetPath
    }
    finally {
      foreach ($temporaryPath in $temporaryPaths) {
        Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
      }
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
