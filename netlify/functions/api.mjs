import {
  createAdminToken,
  createMemberToken,
  hashPassword,
  verifyPassword,
  verifyToken,
} from './lib/crypto-utils.mjs';
import { getAdminConfig, getJson, getJwtSecret, setJson } from './lib/store.mjs';
import { extFromMime, imageKey, imagePublicPath, loadImage, saveImage } from './lib/images.mjs';
import { parse as parseMultipart } from 'lambda-multipart-parser';

const DEFAULT_CATEGORIES = {
  meat: ['chicken', 'mutton', 'beef', 'duck', 'turkey'],
  fish: ['fish', 'prawns', 'crab', 'lobster', 'shellfish'],
};

function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function binaryResponse(statusCode, buffer, contentType, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      ...extraHeaders,
    },
    body: buffer.toString('base64'),
    isBase64Encoded: true,
  };
}

function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowed = [
    'https://nishanfishandmeatshop.netlify.app',
    'http://localhost:8888',
    'http://127.0.0.1:8888',
    'http://localhost:3456',
    'http://127.0.0.1:3456',
  ];
  if (allowed.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      Vary: 'Origin',
    };
  }
  return {};
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

function getBearerToken(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  return auth.replace(/^Bearer\s+/i, '').trim();
}

function getSession(event) {
  return verifyToken(getBearerToken(event), getJwtSecret());
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatSlugLabel(slug) {
  return String(slug || '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function readCategories() {
  const data = await getJson('categories');
  const fish = Array.isArray(data.fish)
    ? data.fish.map(slugify).filter(Boolean).filter((slug) => slug !== 'squid')
    : [...DEFAULT_CATEGORIES.fish];
  return {
    meat: Array.isArray(data.meat) ? data.meat.map(slugify).filter(Boolean) : [...DEFAULT_CATEGORIES.meat],
    fish,
  };
}

async function writeCategories(categories) {
  await setJson('categories', categories);
}

async function readProducts(category) {
  const products = await getJson(category === 'meat' ? 'meat' : 'fish');
  return products.map((product) => {
    let next = product;
    if (category === 'fish' && product.subcategory === 'squid') {
      next = { ...next, subcategory: 'fish' };
    }
    const images = sortProductImages(product.images);
    if (images.length !== (product.images || []).length || images.some((src, i) => src !== product.images?.[i])) {
      next = { ...next, images };
    }
    return next;
  });
}

function sortProductImages(images) {
  if (!Array.isArray(images)) return [];
  const list = [...new Set(images.map((src) => String(src || '').trim()).filter(Boolean))];
  const uploaded = list.filter((src) => src.includes('api/images/'));
  const other = list.filter((src) => !src.includes('api/images/'));
  return [...uploaded, ...other];
}

async function writeProducts(category, products) {
  await setJson(category === 'meat' ? 'meat' : 'fish', products);
}

async function findMemberByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const members = await getJson('members');
  return members.find((member) => member.email === normalized) || null;
}

async function createMember({ name, email, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const members = await getJson('members');
  const config = await getAdminConfig();

  if (members.some((member) => member.email === normalizedEmail)) {
    return { error: 'An account with this email already exists. Please sign in instead.' };
  }
  if (config.adminEmails.includes(normalizedEmail)) {
    return { error: 'An account with this email already exists. Please sign in instead.' };
  }

  const now = new Date().toISOString();
  const record = {
    email: normalizedEmail,
    name: String(name || '').trim(),
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now,
  };
  members.push(record);
  await setJson('members', members);
  return { member: record, isNew: true };
}

async function authenticateAdmin(loginId, password) {
  const config = await getAdminConfig();
  const adminEmails = config.adminEmails;
  const adminUsername = String(config.username || 'admin').trim().toLowerCase();
  const normalized = String(loginId || '').trim().toLowerCase();
  const isAdminEmailLogin = adminEmails.includes(normalized) && password === config.password;
  const isLegacyLogin = normalized === adminUsername && password === config.password;

  if (!isAdminEmailLogin && !isLegacyLogin) return null;

  const secret = getJwtSecret();
  const user = {
    email: isAdminEmailLogin ? normalized : adminEmails[0] || '',
    name: isAdminEmailLogin ? normalized.split('@')[0] : config.username,
    username: config.username,
  };

  return {
    token: createAdminToken(user, secret),
    user: { email: user.email, name: user.name },
  };
}

async function ensureSubcategory(category, slug) {
  const normalized = slugify(slug);
  if (!normalized || !['fish', 'meat'].includes(category)) return '';

  const categories = await readCategories();
  if (!categories[category].includes(normalized)) {
    categories[category].push(normalized);
    await writeCategories(categories);
  }
  return normalized;
}

async function resolveProductSubcategory(category, rawSubcategory) {
  const normalized = slugify(rawSubcategory);
  if (!normalized) return { error: 'Please choose a product variety' };

  const categories = await readCategories();
  const otherCategory = category === 'fish' ? 'meat' : 'fish';
  const otherLabel = category === 'fish' ? 'Meat & Poultry' : 'Fish & Seafood';
  const thisLabel = category === 'fish' ? 'Fish & Seafood' : 'Meat & Poultry';

  if (categories[otherCategory].includes(normalized)) {
    return {
      error: `"${formatSlugLabel(normalized)}" belongs to ${otherLabel}. Select "${otherLabel} page" above, or choose a ${thisLabel} variety.`,
    };
  }

  if (!categories[category].includes(normalized)) {
    return {
      error: `Add "${formatSlugLabel(normalized)}" as a ${thisLabel} variety first, then select it here.`,
    };
  }

  return { slug: normalized };
}

async function countProductsWithSubcategory(category, slug) {
  const products = await readProducts(category);
  return products.filter((product) => product.subcategory === slug).length;
}

async function removeSubcategory(category, slug) {
  const normalized = slugify(slug);
  if (!normalized || !['fish', 'meat'].includes(category)) {
    return { error: 'Invalid variety' };
  }

  const categories = await readCategories();
  if (!categories[category].includes(normalized)) {
    return { error: 'Variety not found' };
  }

  if (categories[category].length <= 1) {
    return { error: 'At least one variety must remain' };
  }

  const inUse = await countProductsWithSubcategory(category, normalized);
  if (inUse > 0) {
    return {
      error: `Cannot delete — ${inUse} product${inUse === 1 ? '' : 's'} still use this variety. Edit those products first.`,
    };
  }

  categories[category] = categories[category].filter((item) => item !== normalized);
  await writeCategories(categories);
  return { category, slug: normalized, items: categories[category] };
}

function normalizeProduct(body, category, existingHandle, subcategorySlug = '') {
  const handle = existingHandle || body.handle || slugify(body.name);
  return {
    handle,
    name: String(body.name || '').trim(),
    category,
    subcategory: subcategorySlug,
    price: Number(body.price),
    currency: body.currency || 'GBP',
    specification: String(body.specification || '').trim(),
    description: String(body.description || '').trim(),
    variety: Boolean(body.variety),
    images: sortProductImages(Array.isArray(body.images) ? body.images.filter(Boolean) : []),
  };
}

async function productHandleInCategory(category, handle) {
  const products = await readProducts(category);
  return products.some((product) => product.handle === handle);
}

function normalizePath(event) {
  const raw = event.path || '';
  const withoutFn = raw.replace(/^\/\.netlify\/functions\/api/, '/api');
  return withoutFn.replace(/\/+$/, '') || '/api';
}

function requireAdmin(session) {
  if (!session || session.role !== 'admin') {
    return jsonResponse(401, { error: 'Unauthorized' });
  }
  return null;
}

function requireMember(session) {
  if (!session || session.role !== 'member') {
    return jsonResponse(401, { error: 'Unauthorized' });
  }
  return null;
}

export async function handler(event) {
  const cors = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  const path = normalizePath(event);
  const method = event.httpMethod;
  const session = getSession(event);

  try {
    if (method === 'GET' && path === '/api/health') {
      return jsonResponse(200, { ok: true, service: 'nishan-fish-meat-shop-netlify' }, cors);
    }

    const imageMatch = path.match(/^\/api\/images\/(fish|meat)\/([^/]+)$/);
    if (method === 'GET' && imageMatch) {
      const category = imageMatch[1];
      const filename = decodeURIComponent(imageMatch[2]);
      if (!/^[a-z0-9._-]+$/i.test(filename)) {
        return jsonResponse(400, { error: 'Invalid filename' }, cors);
      }

      const stored = await loadImage(imageKey(category, filename));
      if (!stored) {
        return jsonResponse(404, { error: 'Image not found' }, cors);
      }

      return binaryResponse(200, stored.buffer, stored.contentType, cors);
    }

    if (method === 'POST' && path === '/api/auth/register') {
      const body = parseBody(event);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!name) return jsonResponse(400, { error: 'Please enter your name' }, cors);
      if (!isValidEmail(email)) return jsonResponse(400, { error: 'Please enter a valid email address' }, cors);
      if (password.length < 6) return jsonResponse(400, { error: 'Password must be at least 6 characters' }, cors);

      const result = await createMember({ name, email, password });
      if (result.error) {
        const status = result.error.includes('already exists') ? 409 : 400;
        return jsonResponse(status, { error: result.error }, cors);
      }

      const token = createMemberToken(result.member, getJwtSecret());
      return jsonResponse(
        201,
        {
          role: 'member',
          token,
          user: { email: result.member.email, name: result.member.name },
          isNew: true,
        },
        cors
      );
    }

    if (method === 'POST' && path === '/api/auth/login') {
      const body = parseBody(event);
      const loginId = String(body.email || body.login || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!loginId || !password) {
        return jsonResponse(401, { error: 'Invalid email or password' }, cors);
      }

      const adminAuth = await authenticateAdmin(loginId, password);
      if (adminAuth) {
        return jsonResponse(200, { role: 'admin', token: adminAuth.token, user: adminAuth.user }, cors);
      }

      if (!isValidEmail(loginId)) {
        return jsonResponse(401, { error: 'Invalid email or password' }, cors);
      }

      const member = await findMemberByEmail(loginId);
      if (!member || !verifyPassword(password, member.passwordHash)) {
        return jsonResponse(401, { error: 'Invalid email or password' }, cors);
      }

      const token = createMemberToken(member, getJwtSecret());
      return jsonResponse(
        200,
        { role: 'member', token, user: { email: member.email, name: member.name } },
        cors
      );
    }

    if (method === 'POST' && path === '/api/admin/login') {
      const body = parseBody(event);
      const loginId = String(body.email || body.username || body.login || '').trim().toLowerCase();
      const password = String(body.password || '');
      const adminAuth = await authenticateAdmin(loginId, password);

      if (adminAuth) {
        return jsonResponse(200, { role: 'admin', token: adminAuth.token, user: adminAuth.user }, cors);
      }

      return jsonResponse(401, { error: 'Invalid email or password' }, cors);
    }

    if (method === 'POST' && path === '/api/admin/logout') {
      const denied = requireAdmin(session);
      if (denied) return { ...denied, headers: { ...denied.headers, ...cors } };
      return jsonResponse(200, { ok: true }, cors);
    }

    if (method === 'POST' && path === '/api/member/logout') {
      const denied = requireMember(session);
      if (denied) return { ...denied, headers: { ...denied.headers, ...cors } };
      return jsonResponse(200, { ok: true }, cors);
    }

    if (method === 'GET' && path === '/api/admin/me') {
      const denied = requireAdmin(session);
      if (denied) return { ...denied, headers: { ...denied.headers, ...cors } };
      return jsonResponse(
        200,
        {
          username: session.username || session.email || 'admin',
          email: session.email || '',
          name: session.name || '',
          role: 'admin',
        },
        cors
      );
    }

    if (method === 'GET' && path === '/api/member/me') {
      const denied = requireMember(session);
      if (denied) return { ...denied, headers: { ...denied.headers, ...cors } };
      return jsonResponse(
        200,
        { email: session.email, name: session.name, role: 'member' },
        cors
      );
    }

    const categoryMatch = path.match(/^\/api\/categories\/(fish|meat)$/);
    if (method === 'GET' && categoryMatch) {
      const category = categoryMatch[1];
      const categories = await readCategories();
      return jsonResponse(200, { category, items: categories[category] }, cors);
    }

    const adminCategoryPost = path.match(/^\/api\/admin\/categories\/(fish|meat)$/);
    if (method === 'POST' && adminCategoryPost) {
      const denied = requireAdmin(session);
      if (denied) return { ...denied, headers: { ...denied.headers, ...cors } };

      const category = adminCategoryPost[1];
      const body = parseBody(event);
      const label = String(body.label || body.name || '').trim();
      if (!label) return jsonResponse(400, { error: 'Variety name is required' }, cors);

      const slug = await ensureSubcategory(category, label);
      const categories = await readCategories();
      return jsonResponse(201, { category, slug, items: categories[category] }, cors);
    }

    const adminCategoryDelete = path.match(/^\/api\/admin\/categories\/(fish|meat)\/([^/]+)$/);
    if (method === 'DELETE' && adminCategoryDelete) {
      const denied = requireAdmin(session);
      if (denied) return { ...denied, headers: { ...denied.headers, ...cors } };

      const category = adminCategoryDelete[1];
      const slug = decodeURIComponent(adminCategoryDelete[2]);
      const result = await removeSubcategory(category, slug);
      if (result.error) {
        const status = result.error.includes('not found') ? 404 : 409;
        return jsonResponse(status, { error: result.error }, cors);
      }
      return jsonResponse(200, result, cors);
    }

    const productsMatch = path.match(/^\/api\/products\/(fish|meat)$/);
    if (method === 'GET' && productsMatch) {
      const products = await readProducts(productsMatch[1]);
      return jsonResponse(200, products, cors);
    }

    const adminProductsMatch = path.match(/^\/api\/admin\/products\/(fish|meat)$/);
    if (method === 'GET' && adminProductsMatch) {
      const denied = requireAdmin(session);
      if (denied) return { ...denied, headers: { ...denied.headers, ...cors } };
      const products = await readProducts(adminProductsMatch[1]);
      return jsonResponse(200, products, cors);
    }

    if (method === 'POST' && adminProductsMatch) {
      const denied = requireAdmin(session);
      if (denied) return { ...denied, headers: { ...denied.headers, ...cors } };

      const category = adminProductsMatch[1];
      const body = parseBody(event);
      const rawSubcategory = body.subcategory !== undefined && body.subcategory !== null ? body.subcategory : '';
      const subcategoryResult = await resolveProductSubcategory(category, rawSubcategory);
      if (subcategoryResult.error) return jsonResponse(400, { error: subcategoryResult.error }, cors);

      const product = normalizeProduct(body, category, null, subcategoryResult.slug);
      if (!product.name || Number.isNaN(product.price)) {
        return jsonResponse(400, { error: 'Name and price are required' }, cors);
      }
      if (!product.images.length) {
        return jsonResponse(400, { error: 'Please upload at least one product image' }, cors);
      }

      const otherCategory = category === 'fish' ? 'meat' : 'fish';
      if (await productHandleInCategory(otherCategory, product.handle)) {
        return jsonResponse(
          409,
          {
            error: `A product with this name already exists on the ${otherCategory === 'fish' ? 'Fish & Seafood' : 'Meat & Poultry'} page.`,
          },
          cors
        );
      }

      const products = await readProducts(category);
      if (products.some((p) => p.handle === product.handle)) {
        return jsonResponse(409, { error: 'A product with this name already exists' }, cors);
      }

      products.push(product);
      await writeProducts(category, products);
      return jsonResponse(201, product, cors);
    }

    const adminProductItem = path.match(/^\/api\/admin\/products\/(fish|meat)\/([^/]+)$/);
    if (adminProductItem) {
      const category = adminProductItem[1];
      const handle = decodeURIComponent(adminProductItem[2]);

      if (method === 'PUT') {
        const denied = requireAdmin(session);
        if (denied) return { ...denied, headers: { ...denied.headers, ...cors } };

        const body = parseBody(event);
        const products = await readProducts(category);
        const index = products.findIndex((p) => p.handle === handle);
        if (index === -1) return jsonResponse(404, { error: 'Product not found' }, cors);

        const rawSubcategory =
          body.subcategory !== undefined && body.subcategory !== null ? body.subcategory : products[index].subcategory || '';
        const subcategoryResult = await resolveProductSubcategory(category, rawSubcategory);
        if (subcategoryResult.error) return jsonResponse(400, { error: subcategoryResult.error }, cors);

        const updated = normalizeProduct(
          { ...products[index], ...body },
          category,
          products[index].handle,
          subcategoryResult.slug
        );

        if (!updated.name || Number.isNaN(updated.price)) {
          return jsonResponse(400, { error: 'Name and price are required' }, cors);
        }
        if (!updated.images.length) {
          return jsonResponse(400, { error: 'Please upload at least one product image' }, cors);
        }

        products[index] = updated;
        await writeProducts(category, products);
        return jsonResponse(200, updated, cors);
      }

      if (method === 'DELETE') {
        const denied = requireAdmin(session);
        if (denied) return { ...denied, headers: { ...denied.headers, ...cors } };

        const products = await readProducts(category);
        const next = products.filter((p) => p.handle !== handle);
        if (next.length === products.length) return jsonResponse(404, { error: 'Product not found' }, cors);

        await writeProducts(category, next);
        return jsonResponse(200, { ok: true }, cors);
      }
    }

    if (method === 'POST' && path === '/api/admin/upload') {
      const denied = requireAdmin(session);
      if (denied) return { ...denied, headers: { ...denied.headers, ...cors } };

      const query = event.queryStringParameters || {};
      const category = query.category === 'meat' ? 'meat' : 'fish';
      const handle = slugify(query.handle || 'product') || 'product';

      let parsed;
      try {
        parsed = await parseMultipart(event);
      } catch {
        return jsonResponse(400, { error: 'Could not read uploaded image' }, cors);
      }

      const file =
        parsed.files?.find((f) => f.fieldname === 'image') ||
        parsed.files?.[0];

      if (!file?.content?.length) {
        return jsonResponse(400, { error: 'No image uploaded' }, cors);
      }

      const contentType = String(file.contentType || file.mimetype || 'image/jpeg').toLowerCase();
      if (!contentType.startsWith('image/')) {
        return jsonResponse(400, { error: 'Only image files are allowed' }, cors);
      }

      const buffer = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
      if (buffer.length > 8 * 1024 * 1024) {
        return jsonResponse(400, { error: 'Image too large (max 8MB)' }, cors);
      }

      const ext = extFromMime(contentType);
      const filename = `${handle}-${Date.now()}${ext}`;
      const key = imageKey(category, filename);

      await saveImage(key, buffer, contentType);

      return jsonResponse(200, { path: imagePublicPath(category, filename) }, cors);
    }

    return jsonResponse(404, { error: 'Not found' }, cors);
  } catch (err) {
    console.error('API error:', err);
    return jsonResponse(500, { error: err.message || 'Server error' }, cors);
  }
}
