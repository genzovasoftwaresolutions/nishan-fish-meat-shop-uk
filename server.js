const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3456;
const ROOT = __dirname;
const sessions = new Map();

const ADMIN_CONFIG_PATH = path.join(ROOT, 'data', 'admin-config.json');
const MEMBERS_PATH = path.join(ROOT, 'data', 'members.json');
const CATEGORIES_PATH = path.join(ROOT, 'data', 'shop-categories.json');
const DEFAULT_ADMIN_EMAILS = ['hirthicksofficial@gmail.com'];
const DEFAULT_CATEGORIES = {
  meat: ['chicken', 'mutton', 'beef', 'duck', 'turkey'],
  fish: ['fish', 'prawns', 'crab', 'squid', 'lobster', 'shellfish'],
};
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function loadAdminConfig() {
  try {
    return JSON.parse(fs.readFileSync(ADMIN_CONFIG_PATH, 'utf8'));
  } catch {
    return { username: 'admin', password: 'nishan2026', adminEmails: DEFAULT_ADMIN_EMAILS };
  }
}

function loadAdminEmails() {
  const config = loadAdminConfig();
  const emails = Array.isArray(config.adminEmails) ? config.adminEmails : DEFAULT_ADMIN_EMAILS;
  return emails.map((email) => String(email).trim().toLowerCase()).filter(Boolean);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT_OPTIONS).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  try {
    const attempt = crypto.scryptSync(password, salt, 64, SCRYPT_OPTIONS).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
  } catch {
    return false;
  }
}

function readMembers() {
  try {
    return JSON.parse(fs.readFileSync(MEMBERS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeMembers(members) {
  fs.mkdirSync(path.dirname(MEMBERS_PATH), { recursive: true });
  fs.writeFileSync(MEMBERS_PATH, `${JSON.stringify(members, null, 2)}\n`);
}

function findMemberByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return readMembers().find((member) => member.email === normalized) || null;
}

function createMember({ name, email, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const members = readMembers();
  if (members.some((member) => member.email === normalizedEmail)) {
    return { error: 'An account with this email already exists' };
  }
  if (loadAdminEmails().includes(normalizedEmail)) {
    return { error: 'This email is reserved for admin sign in. Use Admin Sign In instead.' };
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
  writeMembers(members);
  return { member: record, isNew: true };
}

function createMemberSession(member) {
  return createSessionToken({
    role: 'member',
    email: member.email,
    name: member.name,
    expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });
}

function createAdminSession({ email, name, username }) {
  return createSessionToken({
    role: 'admin',
    email: email || loadAdminEmails()[0] || '',
    name: name || username || 'Admin',
    username: username || '',
    expires: Date.now() + 24 * 60 * 60 * 1000,
  });
}

function authenticateAdmin(loginId, password) {
  const config = loadAdminConfig();
  const adminEmails = loadAdminEmails();
  const adminUsername = String(config.username || 'admin').trim().toLowerCase();
  const normalized = String(loginId || '').trim().toLowerCase();
  const isAdminEmailLogin = adminEmails.includes(normalized) && password === config.password;
  const isLegacyLogin = normalized === adminUsername && password === config.password;

  if (!isAdminEmailLogin && !isLegacyLogin) {
    return null;
  }

  const token = createAdminSession({
    email: isAdminEmailLogin ? normalized : adminEmails[0] || '',
    name: isAdminEmailLogin ? normalized.split('@')[0] : config.username,
    username: config.username,
  });

  return {
    token,
    user: {
      email: isAdminEmailLogin ? normalized : adminEmails[0] || '',
      name: isAdminEmailLogin ? normalized.split('@')[0] : config.username,
    },
  };
}

function getSession(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function createSessionToken(sessionData) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, sessionData);
  return token;
}

function productsPath(category) {
  const file = category === 'meat' ? 'meat.json' : 'fish.json';
  return path.join(ROOT, 'data', file);
}

function readProducts(category) {
  return JSON.parse(fs.readFileSync(productsPath(category), 'utf8'));
}

function writeProducts(category, products) {
  fs.writeFileSync(productsPath(category), `${JSON.stringify(products, null, 2)}\n`);
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function readCategories() {
  try {
    const data = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf8'));
    return {
      meat: Array.isArray(data.meat) ? data.meat.map(slugify).filter(Boolean) : [...DEFAULT_CATEGORIES.meat],
      fish: Array.isArray(data.fish) ? data.fish.map(slugify).filter(Boolean) : [...DEFAULT_CATEGORIES.fish],
    };
  } catch {
    return {
      meat: [...DEFAULT_CATEGORIES.meat],
      fish: [...DEFAULT_CATEGORIES.fish],
    };
  }
}

function writeCategories(categories) {
  fs.mkdirSync(path.dirname(CATEGORIES_PATH), { recursive: true });
  fs.writeFileSync(CATEGORIES_PATH, `${JSON.stringify(categories, null, 2)}\n`);
}

function ensureSubcategory(category, slug) {
  const normalized = slugify(slug);
  if (!normalized || !['fish', 'meat'].includes(category)) {
    return '';
  }

  const categories = readCategories();
  if (!categories[category].includes(normalized)) {
    categories[category].push(normalized);
    writeCategories(categories);
  }
  return normalized;
}

function formatSlugLabel(slug) {
  return String(slug || '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function resolveProductSubcategory(category, rawSubcategory) {
  const normalized = slugify(rawSubcategory);
  if (!normalized) {
    return { error: 'Please choose a product variety' };
  }

  const categories = readCategories();
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

function countProductsWithSubcategory(category, slug) {
  return readProducts(category).filter((product) => product.subcategory === slug).length;
}

function removeSubcategory(category, slug) {
  const normalized = slugify(slug);
  if (!normalized || !['fish', 'meat'].includes(category)) {
    return { error: 'Invalid variety' };
  }

  const categories = readCategories();
  if (!categories[category].includes(normalized)) {
    return { error: 'Variety not found' };
  }

  if (categories[category].length <= 1) {
    return { error: 'At least one variety must remain' };
  }

  const inUse = countProductsWithSubcategory(category, normalized);
  if (inUse > 0) {
    return {
      error: `Cannot delete — ${inUse} product${inUse === 1 ? '' : 's'} still use this variety. Edit those products first.`,
    };
  }

  categories[category] = categories[category].filter((item) => item !== normalized);
  writeCategories(categories);
  return { category, slug: normalized, items: categories[category] };
}

function authMiddleware(req, res, next) {
  const session = getSession(req);
  if (!session || session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.session = session;
  next();
}

function memberAuthMiddleware(req, res, next) {
  const session = getSession(req);
  if (!session || session.role !== 'member') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.session = session;
  next();
}

function normalizeProduct(body, category, existingHandle, existingProduct = null, subcategorySlug = '') {
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
    images: Array.isArray(body.images) ? body.images.filter(Boolean) : [],
  };
}

function productHandleInCategory(category, handle) {
  return readProducts(category).some((product) => product.handle === handle);
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'https://nishanfishandmeatshop.netlify.app,http://localhost:3456,http://127.0.0.1:3456')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '12mb' }));

const PAGE_ROUTES = {
  '/': 'fish.html',
  '/fish': 'fish.html',
  '/meat': 'meat.html',
  '/contact': 'contact.html',
  '/account': 'account.html',
  '/admin': 'account.html',
  '/admin/login': 'account.html',
  '/admin/dashboard': 'admin/dashboard.html',
};

Object.entries(PAGE_ROUTES).forEach(([route, file]) => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(ROOT, file));
  });
});

app.post('/api/auth/register', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!name) {
    return res.status(400).json({ error: 'Please enter your name' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const result = createMember({ name, email, password });
  if (result.error) {
    return res.status(result.error.includes('already exists') ? 409 : 400).json({ error: result.error });
  }

  const token = createMemberSession(result.member);
  return res.status(201).json({
    role: 'member',
    token,
    user: { email: result.member.email, name: result.member.name },
    isNew: true,
  });
});

app.post('/api/auth/login', (req, res) => {
  const loginId = String(req.body?.email || req.body?.login || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!loginId || !password) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const adminAuth = authenticateAdmin(loginId, password);
  if (adminAuth) {
    return res.json({ role: 'admin', token: adminAuth.token, user: adminAuth.user });
  }

  if (!isValidEmail(loginId)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const member = findMemberByEmail(loginId);
  if (!member || !verifyPassword(password, member.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = createMemberSession(member);
  return res.json({
    role: 'member',
    token,
    user: { email: member.email, name: member.name },
  });
});

app.post('/api/admin/login', (req, res) => {
  const loginId = String(req.body?.email || req.body?.username || req.body?.login || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const adminAuth = authenticateAdmin(loginId, password);

  if (adminAuth) {
    return res.json({ role: 'admin', token: adminAuth.token, user: adminAuth.user });
  }

  res.status(401).json({ error: 'Invalid email or password' });
});

app.post('/api/admin/logout', authMiddleware, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  sessions.delete(token);
  res.json({ ok: true });
});

app.post('/api/member/logout', memberAuthMiddleware, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/admin/me', authMiddleware, (req, res) => {
  res.json({
    username: req.session.username || req.session.email || 'admin',
    email: req.session.email || '',
    name: req.session.name || '',
    role: 'admin',
  });
});

app.get('/api/member/me', memberAuthMiddleware, (req, res) => {
  res.json({
    email: req.session.email,
    name: req.session.name,
    role: 'member',
  });
});

app.get('/api/categories/:category', (req, res) => {
  const { category } = req.params;
  if (!['fish', 'meat'].includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }
  res.set('Cache-Control', 'no-store');
  const categories = readCategories();
  res.json({ category, items: categories[category] });
});

app.post('/api/admin/categories/:category', authMiddleware, (req, res) => {
  const { category } = req.params;
  if (!['fish', 'meat'].includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }

  const label = String(req.body?.label || req.body?.name || '').trim();
  if (!label) {
    return res.status(400).json({ error: 'Variety name is required' });
  }

  const slug = ensureSubcategory(category, label);
  res.status(201).json({ category, slug, items: readCategories()[category] });
});

app.delete('/api/admin/categories/:category/:slug', authMiddleware, (req, res) => {
  const { category, slug } = req.params;
  if (!['fish', 'meat'].includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }

  const result = removeSubcategory(category, slug);
  if (result.error) {
    return res.status(result.error.includes('not found') ? 404 : 409).json({ error: result.error });
  }

  res.json(result);
});

app.get('/api/products/:category', (req, res) => {
  const { category } = req.params;
  if (!['fish', 'meat'].includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }
  res.set('Cache-Control', 'no-store');
  res.json(readProducts(category));
});

app.get('/api/admin/products/:category', authMiddleware, (req, res) => {
  const { category } = req.params;
  if (!['fish', 'meat'].includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }
  res.json(readProducts(category));
});

app.post('/api/admin/products/:category', authMiddleware, (req, res) => {
  const { category } = req.params;
  if (!['fish', 'meat'].includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }

  const rawSubcategory =
    req.body?.subcategory !== undefined && req.body?.subcategory !== null
      ? req.body.subcategory
      : '';
  const subcategoryResult = resolveProductSubcategory(category, rawSubcategory);
  if (subcategoryResult.error) {
    return res.status(400).json({ error: subcategoryResult.error });
  }

  const product = normalizeProduct(req.body, category, null, null, subcategoryResult.slug);
  if (!product.name || Number.isNaN(product.price)) {
    return res.status(400).json({ error: 'Name and price are required' });
  }
  if (!product.images.length) {
    return res.status(400).json({ error: 'Please upload at least one product image' });
  }

  const otherCategory = category === 'fish' ? 'meat' : 'fish';
  if (productHandleInCategory(otherCategory, product.handle)) {
    return res.status(409).json({
      error: `A product with this name already exists on the ${otherCategory === 'fish' ? 'Fish & Seafood' : 'Meat & Poultry'} page.`,
    });
  }

  const products = readProducts(category);
  if (products.some((p) => p.handle === product.handle)) {
    return res.status(409).json({ error: 'A product with this name already exists' });
  }

  products.push(product);
  writeProducts(category, products);
  res.status(201).json(product);
});

app.put('/api/admin/products/:category/:handle', authMiddleware, (req, res) => {
  const { category, handle } = req.params;
  if (!['fish', 'meat'].includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }

  const products = readProducts(category);
  const index = products.findIndex((p) => p.handle === handle);
  if (index === -1) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const rawSubcategory =
    req.body?.subcategory !== undefined && req.body?.subcategory !== null
      ? req.body.subcategory
      : products[index].subcategory || '';
  const subcategoryResult = resolveProductSubcategory(category, rawSubcategory);
  if (subcategoryResult.error) {
    return res.status(400).json({ error: subcategoryResult.error });
  }

  const updated = normalizeProduct(
    { ...products[index], ...req.body },
    category,
    products[index].handle,
    products[index],
    subcategoryResult.slug
  );

  if (!updated.name || Number.isNaN(updated.price)) {
    return res.status(400).json({ error: 'Name and price are required' });
  }
  if (!updated.images.length) {
    return res.status(400).json({ error: 'Please upload at least one product image' });
  }

  products[index] = updated;
  writeProducts(category, products);
  res.json(updated);
});

app.delete('/api/admin/products/:category/:handle', authMiddleware, (req, res) => {
  const { category, handle } = req.params;
  if (!['fish', 'meat'].includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }

  const products = readProducts(category);
  const next = products.filter((p) => p.handle !== handle);
  if (next.length === products.length) {
    return res.status(404).json({ error: 'Product not found' });
  }

  writeProducts(category, next);
  res.json({ ok: true });
});

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const category = req.query.category === 'meat' ? 'meat' : 'fish';
    const dir = path.join(ROOT, 'nottinghill_export', 'images', category);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const handle = slugify(req.query.handle || path.basename(file.originalname, ext)) || 'product';
    cb(null, `${handle}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

app.post('/api/admin/upload', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }
  const category = req.query.category === 'meat' ? 'meat' : 'fish';
  res.json({ path: `nottinghill_export/images/${category}/${req.file.filename}` });
});

app.use(express.static(ROOT));

app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || 'Request failed' });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'nishan-fish-meat-shop' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Nishan site running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. The site may already be running at http://localhost:${PORT}`);
    console.error('Stop the other server first, then run npm start again.');
    process.exit(1);
  }
  throw err;
});
