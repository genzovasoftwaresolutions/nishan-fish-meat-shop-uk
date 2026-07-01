const memoryImages = new Map();

async function getImageStore() {
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore({ name: 'nishan-images', consistency: 'strong' });
  } catch {
    return null;
  }
}

export async function saveImage(key, buffer, contentType) {
  const store = await getImageStore();
  if (store) {
    await store.set(key, buffer, { metadata: { contentType } });
    return;
  }
  memoryImages.set(key, { buffer, contentType });
}

export async function loadImage(key) {
  const store = await getImageStore();
  if (store) {
    const data = await store.get(key, { type: 'arrayBuffer' });
    if (!data) return null;
    let contentType = 'image/jpeg';
    try {
      const meta = await store.getMetadata(key);
      contentType = meta?.metadata?.contentType || contentType;
    } catch {
      /* metadata optional */
    }
    return { buffer: Buffer.from(data), contentType };
  }
  return memoryImages.get(key) || null;
}

export function extFromMime(mime) {
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  return map[String(mime || '').toLowerCase()] || '.jpg';
}

export function imageKey(category, filename) {
  return `${category}/${filename}`;
}

export function imagePublicPath(category, filename) {
  return `api/images/${category}/${filename}`;
}
