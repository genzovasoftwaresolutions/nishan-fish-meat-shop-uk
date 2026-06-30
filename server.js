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

function loadAdminConfig() {
  try {
    return JSON.parse(fs.readFileSync(ADMIN_CONFIG_PATH, 'utf8'));
  } catch {
    return { username: 'admin', password: 'nishan2026' };
  }
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

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = sessions.get(token);
  if (!session || session.expires < Date.now()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function normalizeProduct(body, category, existingHandle) {
  const handle = existingHandle || body.handle || slugify(body.name);
  return {
    handle,
    name: String(body.name || '').trim(),
    category,
    price: Number(body.price),
    currency: body.currency || 'GBP',
    specification: String(body.specification || '').trim(),
    description: String(body.description || '').trim(),
    variety: Boolean(body.variety),
    images: Array.isArray(body.images) ? body.images.filter(Boolean) : [],
  };
}

app.use(express.json({ limit: '12mb' }));

const PAGE_ROUTES = {
  '/': 'fish.html',
  '/fish': 'fish.html',
  '/meat': 'meat.html',
  '/contact': 'contact.html',
  '/admin': 'admin/login.html',
  '/admin/login': 'admin/login.html',
  '/admin/dashboard': 'admin/dashboard.html',
};

Object.entries(PAGE_ROUTES).forEach(([route, file]) => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(ROOT, file));
  });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const config = loadAdminConfig();
  if (username === config.username && password === config.password) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { username, expires: Date.now() + 24 * 60 * 60 * 1000 });
    return res.json({ token, username });
  }
  res.status(401).json({ error: 'Invalid username or password' });
});

app.post('/api/admin/logout', authMiddleware, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/admin/me', authMiddleware, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = sessions.get(token);
  res.json({ username: session?.username || 'admin' });
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

  const product = normalizeProduct(req.body, category);
  if (!product.name || Number.isNaN(product.price)) {
    return res.status(400).json({ error: 'Name and price are required' });
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

  const updated = normalizeProduct(
    { ...products[index], ...req.body },
    category,
    products[index].handle
  );

  if (!updated.name || Number.isNaN(updated.price)) {
    return res.status(400).json({ error: 'Name and price are required' });
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
    const category = req.body.category === 'meat' ? 'meat' : 'fish';
    const dir = path.join(ROOT, 'nottinghill_export', 'images', category);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const base = slugify(path.basename(file.originalname, ext)) || 'product';
    cb(null, `${base}-${Date.now()}${ext}`);
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
  const category = req.body.category === 'meat' ? 'meat' : 'fish';
  res.json({ path: `nottinghill_export/images/${category}/${req.file.filename}` });
});

app.use(express.static(ROOT));

app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || 'Request failed' });
});

const server = app.listen(PORT, () => {
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
