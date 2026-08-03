// Generazione/adattamento immagini per gli asset del Viaggio (OpenAI gpt-image-1).
// La chiave è letta da site/.env (OPENAI_API_KEY) — mai committarla.
//
// Uso:
//   node scripts/gen-image.mjs generate --prompt "..." --out public/viaggio/x.png
//        [--size 1024x1024|1024x1536|1536x1024|auto] [--quality low|medium|high] [--transparent]
//   node scripts/gen-image.mjs edit --image src1.png [--image src2.png] --prompt "..." --out out.png
//        [--size ...] [--quality ...] [--transparent]
//
// "edit" parte dai disegni reali (fedeltà allo stile dell'artista) e li adatta;
// "generate" crea elementi nuovi coerenti descritti nel prompt.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ENV_PATH = new URL('../.env', import.meta.url).pathname;
function loadKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    const m = readFileSync(ENV_PATH, 'utf8').match(/^OPENAI_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  console.error('OPENAI_API_KEY non trovata (site/.env)');
  process.exit(1);
}

const args = process.argv.slice(2);
const mode = args[0];
if (mode !== 'generate' && mode !== 'edit') {
  console.error('Modo richiesto: generate | edit');
  process.exit(1);
}
function opt(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
}
function optAll(name) {
  const out = [];
  for (let i = 0; i < args.length; i++) if (args[i] === '--' + name) out.push(args[i + 1]);
  return out;
}

const prompt = opt('prompt');
const out = opt('out');
const size = opt('size', 'auto');
const quality = opt('quality', 'medium');
const transparent = args.includes('--transparent');
if (!prompt || !out) {
  console.error('Servono --prompt e --out');
  process.exit(1);
}

const KEY = loadKey();

async function call(attempt = 1) {
  let res;
  if (mode === 'generate') {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        size,
        quality,
        n: 1,
        ...(transparent ? { background: 'transparent', output_format: 'png' } : {}),
      }),
    });
  } else {
    const images = optAll('image');
    if (!images.length) {
      console.error('edit richiede almeno un --image');
      process.exit(1);
    }
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', prompt);
    form.append('size', size);
    form.append('quality', quality);
    if (transparent) form.append('background', 'transparent');
    for (const img of images) {
      const buf = readFileSync(resolve(img));
      const type = img.endsWith('.png') ? 'image/png' : 'image/jpeg';
      form.append('image[]', new Blob([buf], { type }), img.split('/').pop());
    }
    res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}` },
      body: form,
    });
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const msg = body.error?.message ?? `HTTP ${res.status}`;
    if (attempt < 3 && (res.status >= 500 || res.status === 429)) {
      const wait = attempt * 15000;
      console.error(`tentativo ${attempt} fallito (${msg}), riprovo tra ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
      return call(attempt + 1);
    }
    console.error('ERRORE API:', msg);
    process.exit(2);
  }
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) {
    console.error('Risposta senza immagine');
    process.exit(2);
  }
  const dest = resolve(out);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(b64, 'base64'));
  console.log('OK →', dest);
}

await call();
