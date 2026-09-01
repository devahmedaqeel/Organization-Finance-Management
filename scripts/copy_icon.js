const fs = require('fs');
const path = require('path');

const src = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\6c57b316-2a7a-4539-82df-79714a010dca\\ofm_master_app_icon_1787251992388.jpg';
const destDir = path.resolve(__dirname, '..', 'assets', 'images');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const targets = [
  'icon.png',
  'adaptive-icon.png',
  'favicon.png',
  'splash-icon.png'
];

targets.forEach((file) => {
  const dest = path.join(destDir, file);
  fs.copyFileSync(src, dest);
  console.log(`Copied master icon to ${dest}`);
});
