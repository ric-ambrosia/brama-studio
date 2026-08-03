// ─────────────────────────────────────────────────────────────────────────────
// MONDI · lib/fit.js — fitDistance() + loader/cache texture CONDIVISO.
// Contratto: §1.6 (opera-plane), §2.2 (ctx.loadTexture), §3 (refcount memoria).
//
// - fitDistance: distanza camera per cui un piano w×h riempie `fraction` del
//   viewport sul lato vincolante (usata dall'engine per il dwell a p=0.5).
// - createTextureCache: unico modo ammesso di caricare texture. Dedup per URL,
//   refcount, downscale a maxSize (budget tier), stima memoria per ?debug=1.
//   Accetta una LISTA di candidati (AVIF → WebP → thumbs → originale): il primo
//   che carica vince, i 404 successivi non si ripagano (risultato cacheato).
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

const DEG2RAD = Math.PI / 180;

/**
 * Distanza a cui un piano `width`×`height` (unità mondo) riempie `fraction`
 * del viewport sul lato vincolante, per la camera prospettica data.
 */
export function fitDistance(width, height, camera, fraction = 0.75) {
  const tanV = Math.tan(camera.fov * 0.5 * DEG2RAD);
  const dH = height / (2 * fraction * tanV);
  const dW = width / (2 * fraction * tanV * camera.aspect);
  return Math.max(dH, dW);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img: ' + url));
    img.src = url;
  });
}

/**
 * Cache condivisa di texture con refcount.
 * API:
 *   keyFor(urlOrList, maxSize)  → chiave stabile
 *   acquire(urlOrList, maxSize) → Promise<THREE.Texture> (refs++)
 *   release(key)                → refs--; a 0 dispose reale
 *   stats()                     → { count, bytes }
 *   disposeAll()
 */
export function createTextureCache({ anisotropy = 4 } = {}) {
  const entries = new Map();

  function keyFor(urlOrList, maxSize = 2048) {
    const urls = Array.isArray(urlOrList) ? urlOrList : [urlOrList];
    return urls.join('|') + '@' + maxSize;
  }

  function acquire(urlOrList, maxSize = 2048) {
    const urls = Array.isArray(urlOrList) ? urlOrList : [urlOrList];
    const key = keyFor(urls, maxSize);
    let e = entries.get(key);
    if (e) {
      e.refs++;
      return e.promise;
    }
    e = { refs: 1, texture: null, bytes: 0, promise: null };
    e.promise = (async () => {
      let img = null;
      let lastErr = null;
      for (const u of urls) {
        try { img = await loadImage(u); break; }
        catch (err) { lastErr = err; }
      }
      if (!img) throw lastErr || new Error('texture: nessun candidato caricabile');

      let tex;
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (Math.max(w, h) > maxSize) {
        // downscale su canvas per rispettare il budget texture del tier
        const scale = maxSize / Math.max(w, h);
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const cnv = document.createElement('canvas');
        cnv.width = cw;
        cnv.height = ch;
        cnv.getContext('2d').drawImage(img, 0, 0, cw, ch);
        tex = new THREE.CanvasTexture(cnv);
        e.bytes = cw * ch * 4 * 1.33;
      } else {
        tex = new THREE.Texture(img);
        e.bytes = w * h * 4 * 1.33;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = anisotropy;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      e.texture = tex;
      return tex;
    })();
    // se il load fallisce del tutto, togli l'entry (permette retry)
    e.promise.catch(() => { entries.delete(key); });
    entries.set(key, e);
    return e.promise;
  }

  function release(key) {
    const e = entries.get(key);
    if (!e) return;
    e.refs--;
    if (e.refs <= 0) {
      if (e.texture) e.texture.dispose();
      entries.delete(key);
    }
  }

  function stats() {
    let bytes = 0;
    let count = 0;
    entries.forEach((e) => {
      if (e.texture) { bytes += e.bytes; count++; }
    });
    return { count, bytes };
  }

  function disposeAll() {
    entries.forEach((e) => { if (e.texture) e.texture.dispose(); });
    entries.clear();
  }

  return { keyFor, acquire, release, stats, disposeAll };
}
