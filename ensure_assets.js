const fs = require('fs');
const path = require('path');

const srcIcon = path.join(__dirname, 'assets', 'images', 'icon.png');
const assetsDir = path.join(__dirname, 'assets');

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

if (fs.existsSync(srcIcon)) {
  const targetFiles = [
    'icon.png',
    'adaptive-icon.png',
    'splash.png',
    'favicon.png'
  ];

  targetFiles.forEach(file => {
    const dest = path.join(assetsDir, file);
    fs.copyFileSync(srcIcon, dest);
    console.log(`[ASSET_SYNC] Synchronized: assets/${file}`);
  });
} else {
  console.warn('[ASSET_SYNC] Warning: assets/images/icon.png not found');
}
