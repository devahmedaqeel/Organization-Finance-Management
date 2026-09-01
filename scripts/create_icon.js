const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create a crisp 1024x1024 RGBA standard PNG for OFM App
const width = 1024;
const height = 1024;

// Build raw uncompressed RGBA pixel buffer
// Each row starts with 1 filter byte (0 = None), followed by width * 4 bytes
const rowSize = 1 + width * 4;
const rawBuffer = Buffer.alloc(rowSize * height);

for (let y = 0; y < height; y++) {
  const rowOffset = y * rowSize;
  rawBuffer[rowOffset] = 0; // Filter type 0 (None)

  for (let x = 0; x < width; x++) {
    const pxOffset = rowOffset + 1 + x * 4;

    // Background: Premium deep navy gradient (#0F172A to #1E293B)
    const t = (x + y) / (width + height);
    let r = Math.round(15 + t * 15);
    let g = Math.round(23 + t * 18);
    let b = Math.round(42 + t * 17);
    let a = 255;

    // Center emblem coords (normalized -1 to 1)
    const nx = (x - width / 2) / (width / 2);
    const ny = (y - height / 2) / (height / 2);
    const dist = Math.sqrt(nx * nx + ny * ny);

    // Glowing circle emblem background
    if (dist < 0.72) {
      r = Math.round(30 + (1 - dist) * 20);
      g = Math.round(41 + (1 - dist) * 35);
      b = Math.round(59 + (1 - dist) * 70);
    }

    // Bar chart element 1 (Emerald Green #10B981)
    if (x >= 280 && x <= 380 && y >= 460 && y <= 720) {
      r = 16; g = 185; b = 129;
    }
    // Bar chart element 2 (Sky Blue #0EA5E9)
    if (x >= 420 && x <= 520 && y >= 340 && y <= 720) {
      r = 14; g = 165; b = 233;
    }
    // Bar chart element 3 (Violet/Indigo #8B5CF6)
    if (x >= 560 && x <= 660 && y >= 240 && y <= 720) {
      r = 139; g = 92; b = 246;
    }
    // Trend arrow / line cap
    if (y >= 210 && y <= 240 && x >= 550 && x <= 670) {
      r = 245; g = 158; b = 11;
    }

    rawBuffer[pxOffset] = r;
    rawBuffer[pxOffset + 1] = g;
    rawBuffer[pxOffset + 2] = b;
    rawBuffer[pxOffset + 3] = a;
  }
}

// Compress scanlines with standard zlib DEFLATE
const compressedData = zlib.deflateSync(rawBuffer, { level: 9 });

// CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.slice(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// Standard PNG Signature
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// IHDR Chunk: width(4), height(4), bit depth(1=8), color type(1=6 RGBA), compression(1=0), filter(1=0), interlace(1=0)
const ihdrData = Buffer.alloc(13);
ihdrData.writeUInt32BE(width, 0);
ihdrData.writeUInt32BE(height, 4);
ihdrData[8] = 8; // 8 bits per channel
ihdrData[9] = 6; // RGBA
ihdrData[10] = 0; // Deflate
ihdrData[11] = 0; // Filter
ihdrData[12] = 0; // Non-interlaced
const ihdrChunk = makeChunk('IHDR', ihdrData);

// IDAT Chunk
const idatChunk = makeChunk('IDAT', compressedData);

// IEND Chunk
const iendChunk = makeChunk('IEND', Buffer.alloc(0));

const finalPng = Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);

const targets = [
  path.join(__dirname, '..', 'assets', 'images', 'icon.png'),
  path.join(__dirname, '..', 'public', 'favicon.ico'),
  path.join(__dirname, '..', 'public', 'favicon.png'),
  path.join(__dirname, '..', 'public', 'icon.png'),
];

targets.forEach(t => {
  const dir = path.dirname(t);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(t, finalPng);
  console.log('Written clean icon to:', t);
});

console.log('Successfully generated valid standard 1024x1024 PNG and browser favicons! Size:', finalPng.length, 'bytes');
