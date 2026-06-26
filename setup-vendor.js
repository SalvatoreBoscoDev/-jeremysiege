// Copies the browser libraries Hunt for Jeremy needs into public/vendor.
// Run automatically by `npm run setup`; safe to run anytime after `npm install`.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vendor = path.join(__dirname, 'public', 'vendor');
fs.mkdirSync(vendor, { recursive: true });
const copies = [
  ['node_modules/three/build/three.module.js', 'three.module.js'],
  ['node_modules/qrcode-generator/dist/qrcode.js', 'qrcode.js'],
];
for (const [src, dest] of copies) {
  const from = path.join(__dirname, src);
  const to = path.join(vendor, dest);
  if (fs.existsSync(from)) { fs.copyFileSync(from, to); console.log('vendored', dest); }
  else if (fs.existsSync(to)) { console.log('ok (already present):', dest); }
  else { console.error('MISSING', src, '- run `npm install` first'); }
}
console.log('Vendor setup complete.');
