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
  & magick $sourcePath `
    -bordercolor $cornerColor -border 1 `
    -alpha set -channel RGBA -fuzz "12%" `
    -fill none -draw "color 0,0 floodfill" `
    -shave 1x1 `
    -define webp:method=6 -quality 94 `
    $targetPath

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to build point-rig frame: $frameId"
  }
}

Write-Host "Built $(@($manifest.frames.PSObject.Properties).Count) runtime and transparent point-rig frames for $outfitId"
