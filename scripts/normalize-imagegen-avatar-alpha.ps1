param(
  [Parameter(Mandatory = $true)]
  [string]$InputDirectory,

  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,

  [int]$ExpectedWidth = 1024,
  [int]$ExpectedHeight = 1536
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
  throw "ImageMagick 'magick' is required to normalize avatar alpha."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$inputRoot = if ([IO.Path]::IsPathRooted($InputDirectory)) {
  (Resolve-Path $InputDirectory).Path
} else {
  (Resolve-Path (Join-Path $projectRoot $InputDirectory)).Path
}
$outputRoot = if ([IO.Path]::IsPathRooted($OutputDirectory)) {
  $OutputDirectory
} else {
  Join-Path $projectRoot $OutputDirectory
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$inputFrames = @(Get-ChildItem -LiteralPath $inputRoot -Filter "*.png" -File | Sort-Object Name)
if ($inputFrames.Count -eq 0) {
  throw "No PNG frames found in $inputRoot"
}

foreach ($inputFrame in $inputFrames) {
  $dimensions = [string](& magick identify -format "%wx%h" $inputFrame.FullName)
  if ($dimensions -ne "${ExpectedWidth}x${ExpectedHeight}") {
    throw "$($inputFrame.Name) has dimensions $dimensions; expected ${ExpectedWidth}x${ExpectedHeight}"
  }

  $outputPath = Join-Path $outputRoot $inputFrame.Name
  $channels = [string](& magick identify -format "%[channels]" $inputFrame.FullName)
  $alphaMinimum = if ($channels -match "a") {
    [double]::Parse(
      [string](& magick identify -format "%[fx:minima.a]" $inputFrame.FullName),
      [Globalization.CultureInfo]::InvariantCulture
    )
  } else { 1.0 }

  if ($alphaMinimum -lt 0.999) {
    Copy-Item -LiteralPath $inputFrame.FullName -Destination $outputPath -Force
  }
  else {
    # Image generation services may visualize requested transparency as a
    # neutral checkerboard. Convert only bright, near-neutral checker pixels;
    # saturated skin, blonde hair, eye whites, highlights and dark clothes stay.
    $maskPath = Join-Path $outputRoot ".$($inputFrame.BaseName)-alpha-mask.png"
    try {
      & magick $inputFrame.FullName -alpha off `
        -fx "((min(r,min(g,b))>0.88)&&(max(r,max(g,b))-min(r,min(g,b))<0.08))?0:1" `
        -blur 0x0.45 `
        $maskPath
      if ($LASTEXITCODE -ne 0) { throw "Failed to build alpha mask for $($inputFrame.Name)" }

      & magick $inputFrame.FullName $maskPath `
        -alpha off -compose CopyOpacity -composite `
        $outputPath
      if ($LASTEXITCODE -ne 0) { throw "Failed to apply alpha mask for $($inputFrame.Name)" }
    }
    finally {
      Remove-Item -LiteralPath $maskPath -Force -ErrorAction SilentlyContinue
    }
  }

  $outputOpaque = [string](& magick identify -format "%[opaque]" $outputPath)
  $cornerAlpha = [double]::Parse(
    [string](& magick $outputPath -format "%[fx:p{0,0}.a]" info:),
    [Globalization.CultureInfo]::InvariantCulture
  )
  $centerAlpha = [double]::Parse(
    [string](& magick $outputPath -format "%[fx:p{$([int]($ExpectedWidth / 2)),$([int]($ExpectedHeight / 2))}.a]" info:),
    [Globalization.CultureInfo]::InvariantCulture
  )
  if ($outputOpaque -ne "False" -or $cornerAlpha -gt 0.02 -or $centerAlpha -lt 0.98) {
    throw "$($inputFrame.Name) failed normalized alpha QA"
  }
}

Write-Host "Normalized $($inputFrames.Count) RGBA avatar masters into $outputRoot"
