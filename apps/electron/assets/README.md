# App icons

`icon.svg` is the master artwork. Generate the platform-specific raster files
listed below before shipping a signed release; electron-builder will otherwise
fall back to the default Electron icon.

## Generate icons

The easiest tool is [`electron-icon-builder`](https://www.npmjs.com/package/electron-icon-builder):

```bash
# from apps/electron/
npx electron-icon-builder --input=assets/icon.svg --output=assets --flatten
mv assets/icons/mac/icon.icns assets/icon.icns
mv assets/icons/win/icon.ico  assets/icon.ico
mv assets/icons/png/1024x1024.png assets/icon.png
rm -rf assets/icons
```

Or, by hand on macOS:

```bash
# 1024 PNG
sips -s format png -Z 1024 assets/icon.svg --out assets/icon.png

# .icns (multi-resolution)
mkdir icon.iconset
for sz in 16 32 64 128 256 512; do
  sips -z $sz $sz assets/icon.png --out icon.iconset/icon_${sz}x${sz}.png
done
iconutil -c icns icon.iconset -o assets/icon.icns
rm -rf icon.iconset

# .ico (Windows)
magick assets/icon.png -define icon:auto-resize=16,24,32,48,64,128,256 assets/icon.ico
```

## Tray icons

Provide a 22x22 (and @2x 44x44) template PNG for macOS as `tray-Template.png`
(the `Template` suffix tells macOS to tint it automatically for menu bar contrast).
Provide a colored 32x32 `tray.png` for Windows/Linux.

## DMG background (optional)

`build/dmg-background.png` should be 540×380 (and @2x 1080×760).
