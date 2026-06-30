const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '../nottinghill_export/products.csv');
const varietiesPath = path.join(__dirname, '../data/fish-varieties.json');
const dataDir = path.join(__dirname, '../data');

// Local shop images — reliable, no broken external links
const LOCAL = 'nottinghill_export/images/fish';
const IMAGE_MAP = {
  anchovies: `${LOCAL}/whole-fresh-sardine-1.jpg`,
  mackerel: `${LOCAL}/mackeral-1.jpg`,
  sardine: `${LOCAL}/whole-fresh-sardine-1.jpg`,
  kingfish: `${LOCAL}/seabass-1.jpg`,
  tuna: `${LOCAL}/tuna-loin-1.jpg`,
  'red-snapper': `${LOCAL}/whole-fresh-and-wild-sea-bream-1.jpg`,
  cobia: `${LOCAL}/cod-fillet-200g-1.jpg`,
  barramundi: `${LOCAL}/farmed-seabass-fillets-1.jpg`,
  barracuda: `${LOCAL}/sword-loin-1.jpg`,
  grouper: `${LOCAL}/turbot-fillet-200g-1.jpg`,
  trevally: `${LOCAL}/seabass-2.jpg`,
  emperor: `${LOCAL}/john-dory-fillet-various-sizes-1.jpg`,
  sailfish: `${LOCAL}/sword-loin-2.jpg`,
  salmon: `${LOCAL}/salmon-fillets-1.jpg`,
  pomfret: `${LOCAL}/brill-1.jpg`,
  ray: `${LOCAL}/whole-skate-wing-various-sizes-1.jpg`,
  crab: `${LOCAL}/crab-meat-white-1.jpg`,
  squid: `${LOCAL}/squid-1.jpg`,
  'red-mullet': `${LOCAL}/red-mullet-1.jpg`,
  parrotfish: `${LOCAL}/whole-fresh-and-wild-sea-bream-2.jpg`,
  ribbonfish: `${LOCAL}/hake-fillet-200g-1.jpg`,
  shark: `${LOCAL}/tuna-loin-2.jpg`,
  milkfish: `${LOCAL}/whole-seabass-1.jpg`,
  prawns: `${LOCAL}/tiger-prawns-1.jpg`,
  'fish-generic': `${LOCAL}/cod-fillet-200g-1.jpg`,
};

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // skip
    } else if (c === '\n') {
      row.push(field);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  return rows;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function loadCsvProducts() {
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(raw);
  const headers = rows[0];
  const products = new Map();

  for (let i = 1; i < rows.length; i++) {
    const vals = rows[i];
    const row = {};
    headers.forEach((h, j) => {
      row[h] = vals[j] || '';
    });

    const handle = row.handle;
    if (!handle) continue;

    if (!products.has(handle)) {
      products.set(handle, {
        handle,
        name: row.name,
        category: row.category,
        price: parseFloat(row.price),
        currency: row.currency,
        specification: '',
        variety: false,
        images: [],
      });
    }

    const img = row.image_local_path.replace(/^images\//, 'nottinghill_export/images/');
    const product = products.get(handle);
    if (img && !product.images.includes(img)) {
      product.images.push(img);
    }
  }

  return [...products.values()];
}

function loadVarietyProducts() {
  const varieties = JSON.parse(fs.readFileSync(varietiesPath, 'utf-8'));
  const usedHandles = new Set();

  return varieties.map((item) => {
    let handle = slugify(`${item.name}-${item.specification}`);
    let suffix = 1;
    while (usedHandles.has(handle)) {
      handle = `${slugify(`${item.name}-${item.specification}`)}-${suffix++}`;
    }
    usedHandles.add(handle);

    const image = IMAGE_MAP[item.imageKey] || IMAGE_MAP['fish-generic'];

    return {
      handle,
      name: item.name,
      category: 'fish',
      price: item.price,
      currency: 'GBP',
      specification: item.specification,
      variety: true,
      images: [image],
    };
  });
}

const allProducts = loadCsvProducts();
const fishFromCsv = allProducts.filter((p) => p.category === 'fish');
const meatProducts = allProducts.filter((p) => p.category === 'meat');
const varietyProducts = loadVarietyProducts();
const fishProducts = [...fishFromCsv, ...varietyProducts];

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'fish.json'), JSON.stringify(fishProducts, null, 2));
fs.writeFileSync(path.join(dataDir, 'meat.json'), JSON.stringify(meatProducts, null, 2));
fs.writeFileSync(path.join(dataDir, 'products.json'), JSON.stringify(allProducts.concat(varietyProducts), null, 2));

console.log(`Fish: ${fishProducts.length} (${fishFromCsv.length} standard + ${varietyProducts.length} varieties)`);
console.log(`Meat: ${meatProducts.length}`);
