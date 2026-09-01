const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'OFM icon');
const dest = path.join(__dirname, 'assets', 'images', 'icon.png');

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  console.log('Successfully updated assets/images/icon.png with OFM icon!');
} else {
  console.log('Source icon not found');
}
