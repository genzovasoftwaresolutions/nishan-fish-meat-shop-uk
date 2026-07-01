import membersSeed from '../../../data/members.json' with { type: 'json' };
import fishSeed from '../../../data/fish.json' with { type: 'json' };
import meatSeed from '../../../data/meat.json' with { type: 'json' };
import categoriesSeed from '../../../data/shop-categories.json' with { type: 'json' };
import adminConfigSeed from '../../../data/admin-config.json' with { type: 'json' };

const memory = new Map();

const seeds = {
  members: membersSeed,
  fish: fishSeed,
  meat: meatSeed,
  categories: categoriesSeed,
  adminConfig: adminConfigSeed,
};

async function getBlobStore() {
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore({ name: 'nishan-shop', consistency: 'strong' });
  } catch {
    return null;
  }
}

export async function getJson(key) {
  const store = await getBlobStore();
  if (store) {
    const value = await store.get(key, { type: 'json' });
    if (value !== null) return value;
    const seed = seeds[key] ?? [];
    await store.setJSON(key, seed);
    return seed;
  }

  if (!memory.has(key)) {
    memory.set(key, seeds[key] ?? []);
  }
  return memory.get(key);
}

export async function setJson(key, value) {
  const store = await getBlobStore();
  if (store) {
    await store.setJSON(key, value);
    return;
  }
  memory.set(key, value);
}

export async function getAdminConfig() {
  const config = await getJson('adminConfig');
  const emails = Array.isArray(config.adminEmails)
    ? config.adminEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
    : ['admin@gmail.com'];
  if (!emails.includes('admin@gmail.com')) {
    emails.push('admin@gmail.com');
  }
  return {
    username: String(config.username || 'admin').trim(),
    password: String(config.password || process.env.ADMIN_PASSWORD || 'nishan2026'),
    adminEmails: emails,
  };
}

export function getJwtSecret() {
  return process.env.JWT_SECRET || process.env.ADMIN_PASSWORD || 'nishan2026-netlify-secret';
}
