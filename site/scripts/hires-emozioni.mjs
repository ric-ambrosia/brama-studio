// Ri-ritaglio delle tele Emozioni ad ALTA RISOLUZIONE: rende le pagine 11-14 del
// PDF originale con mupdf (scala alta) e ritaglia le tele da lì, così non sono
// più sgranate. Uso: node scripts/hires-emozioni.mjs
import * as mupdf from 'mupdf';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const PDF = new URL('../../deploy/presentazione.pdf', import.meta.url).pathname;
const OUT = new URL('../public/portfolio/emozioni/', import.meta.url).pathname;

// tile in spazio-2304 (come i JPG delle pagine): [pdfPageIndex, nome, l, t, w, h]
const T = [
  [10, 'sollievo', 127, 345, 552, 770], [10, 'speranza', 840, 345, 552, 770], [10, 'felicita', 1553, 345, 550, 770],
  [11, 'vergogna', 736, 63, 391, 500], [11, 'risentimento', 1254, 63, 391, 500], [11, 'paura', 1771, 63, 391, 500],
  [11, 'terrore', 224, 661, 362, 477], [11, 'rabbia', 736, 661, 362, 477], [11, 'invidia', 1248, 661, 362, 477], [11, 'solitudine', 1760, 661, 362, 477],
  [12, 'gratitudine', 736, 63, 391, 500], [12, 'orgoglio', 1254, 63, 391, 500], [12, 'compassione', 1771, 63, 391, 500],
  [12, 'esperienza-estetica', 224, 661, 362, 477], [12, 'anticipazione', 736, 661, 362, 477], [12, 'amore', 1248, 661, 362, 477], [12, 'confort', 1760, 661, 362, 477],
  [13, 'senso-di-colpa', 736, 63, 391, 500], [13, 'frustrazione', 1254, 63, 391, 500], [13, 'ansia', 1771, 63, 391, 500],
  [13, 'vergogna-2', 224, 661, 362, 477], [13, 'rimorso', 736, 661, 362, 477], [13, 'gelosia', 1248, 661, 362, 477], [13, 'tristezza', 1760, 661, 362, 477],
];

const SCALE = 4.6; // ~4700px di larghezza pagina → tele nitide
const doc = mupdf.Document.openDocument(readFileSync(PDF), 'application/pdf');

// render delle 4 pagine una volta sola
const pageBuf = {};
const ratio = {};
for (const idx of [10, 11, 12, 13]) {
  const page = doc.loadPage(idx);
  const pix = page.toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceRGB, false, true);
  pageBuf[idx] = Buffer.from(pix.asPNG());
  ratio[idx] = pix.getWidth() / 2304; // per scalare le coordinate dallo spazio-2304
  console.log(`page ${idx + 1}: ${pix.getWidth()}x${pix.getHeight()} (ratio ${ratio[idx].toFixed(2)})`);
}

for (const [idx, name, l, t, w, h] of T) {
  const r = ratio[idx];
  const ix = w * 0.075, iy = h * 0.075; // inset 7.5% (via i bordi bianchi)
  const L = Math.round((l + ix) * r), Tp = Math.round((t + iy) * r);
  const Wd = Math.round((w - 2 * ix) * r), Ht = Math.round((h - 2 * iy) * r);
  await sharp(pageBuf[idx])
    .extract({ left: L, top: Tp, width: Wd, height: Ht })
    .resize({ width: 900, withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toFile(OUT + name + '.jpg');
}
console.log('Ri-ritagliate', T.length, 'tele ad alta risoluzione.');
