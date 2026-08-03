// Pipeline immagini brama v2 — genera varianti AVIF/WebP responsive.
// Gli originali JPEG in public/images restano al loro posto (URL stabili);
// le varianti finiscono in public/images/gen/<nome>-<w>.{avif,webp}.
// Uso: npm run images
import { readdir, mkdir, stat } from 'node:fs/promises';
import { join, parse } from 'node:path';
import sharp from 'sharp';

const SRC = new URL('../public/images', import.meta.url).pathname;
const OUT = join(SRC, 'gen');
const WIDTHS = [600, 1200, 2000];
const SKIP = new Set(['favicon-32.png', 'favicon-192.png', 'signature.png', 'og-image.jpg']);

await mkdir(OUT, { recursive: true });

const files = (await readdir(SRC)).filter(
  (f) => /\.(jpe?g|png)$/i.test(f) && !SKIP.has(f)
);

for (const file of files) {
  const src = join(SRC, file);
  if (!(await stat(src)).isFile()) continue;
  const { name } = parse(file);
  const meta = await sharp(src).metadata();
  for (const w of WIDTHS) {
    if (meta.width && meta.width < w * 0.8) continue; // non fare upscale
    for (const fmt of ['avif', 'webp']) {
      const dest = join(OUT, `${name}-${w}.${fmt}`);
      try {
        await stat(dest); // esiste già → salta (build incrementale)
      } catch {
        await sharp(src)
          .resize({ width: w, withoutEnlargement: true })
          [fmt]({ quality: fmt === 'avif' ? 55 : 78 })
          .toFile(dest);
        console.log('✓', dest.replace(SRC, 'images'));
      }
    }
  }
}
console.log('Pipeline immagini completata.');
