import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const sizes = [
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'masked-icon.svg', size: 512 }
];

async function generateIcons() {
  try {
    const baseIcon = path.join(publicDir, 'icon.svg');

    // Check if base icon exists
    if (!fs.existsSync(baseIcon)) {
      console.error('Base icon (icon.svg) not found in public directory');
      process.exit(1);
    }

    for (const { name, size } of sizes) {
      const outputPath = path.join(publicDir, name);

      if (name.endsWith('.svg')) {
        // For SVG, just copy the file
        await sharp(baseIcon)
          .resize(size, size)
          .toFile(outputPath);
      } else {
        // For PNG files
        await sharp(baseIcon)
          .resize(size, size)
          .png()
          .toFile(outputPath);
      }

      console.log(`Generated ${name}`);
    }

    // Generate favicon.ico
    await sharp(baseIcon)
      .resize(32, 32)
      .toFile(path.join(publicDir, 'favicon.ico'));

    console.log('Generated favicon.ico');
    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();