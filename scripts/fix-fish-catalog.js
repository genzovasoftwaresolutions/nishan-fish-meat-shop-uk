const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FISH_PATH = path.join(ROOT, 'data', 'fish.json');
const IMG_DIR = path.join(ROOT, 'nottinghill_export', 'images', 'fish');
const IMG_PREFIX = 'nottinghill_export/images/fish/';

const MANUAL_IMAGE_HANDLES = {
  'thiruli-5-to-10': 'hake-steak-250g-1',
  'smoked-cod-roe': 'cod-fillet-200g',
};

const ROE_IMAGE_PATTERN = /roe|cod-cheeks|herring-roe|trout-roe|salmon-roe/i;

const BLOCKED_IMAGE = /goldfish|52386|shinygoldfish/i;

const CATEGORY_POOL_HANDLES = {
  prawns: [
    'medium-sized-prawns',
    'tiger-prawns',
    'cooked-atlantic-prawns',
    'copy-of-medium-tiger-prawns',
    'copy-of-red-prawns-mazara-del-valo-sold-each-1',
    'heiplog-brown-shrimp',
    'cooked-langoustines',
    'large-live-langoustines',
  ],
  crab: ['crab-meat-white', 'fresh-brown-crab-meat', 'cooked-crab-claws'],
  squid: ['squid'],
  lobster: ['cooked-whole-lobster', 'live-native-lobster'],
  shellfish: [
    'fresh-mussels-various-sizes',
    'maldon-rock-oysters',
    'fresh-scallops',
    'wild-loose-scallops',
    'razor-clams',
  ],
  fish: [
    'salmon-fillets',
    'seabass',
    'cod-fillet-200g',
    'dover-sole',
    'tuna-loin',
    'halibut-fillet-200g',
    'turbot-fillet-200g',
    'whole-seabass',
    'hake-fillet-200g',
    'mackeral',
    'red-mullet',
    'brill',
    'sword-loin',
    'john-dory-fillet-various-sizes',
    'whole-fresh-sardine',
    'farmed-seabass-fillets',
    'whole-skate-wing-various-sizes',
    'whole-fresh-and-wild-sea-bream',
    'lemon-sole-fillet-200g',
    'organic-salmon-fillets',
    'smoked-salmon',
    'sea-bream-fillet-200g',
  ],
};

const CATEGORY_IMAGE_PATTERN = {
  prawns: /prawn|shrimp|langoustine|carabinero/i,
  crab: /crab/i,
  squid: /squid|calamari/i,
  lobster: /lobster/i,
  shellfish: /mussel|oyster|scallop|clam|razor|whelk/i,
  fish: /fish|salmon|cod|seabass|sea-bass|sole|tuna|halibut|turbot|hake|mackerel|mullet|brill|sword|dory|sardine|skate|bream|roe|herring|trout|plaice|monk|grouper|snapper|bass|fillet|steak|loch|duart/i,
};

function classifyFish(product) {
  const text = `${product.name} ${product.handle}`.toLowerCase();
  if (/\b(prawns?|shrimps?|langoustines?|carabinero)\b/.test(text)) return 'prawns';
  if (/\bcrab\b/.test(text)) return 'crab';
  if (/\b(squid|calamari|needle-squid)\b/.test(text)) return 'squid';
  if (/\blobster\b/.test(text)) return 'lobster';
  if (/\b(oysters?|mussels?|scallops?|clams?|shellfish|whelks?|razor)\b/.test(text)) return 'shellfish';
  return 'fish';
}

function listImageFiles() {
  if (!fs.existsSync(IMG_DIR)) return [];
  return fs
    .readdirSync(IMG_DIR)
    .filter((file) => /\.(jpg|jpeg|png|webp|gif)$/i.test(file))
    .sort();
}

function imagesForHandle(handle, files) {
  const prefix = `${handle}-`;
  return files
    .filter((file) => file.startsWith(prefix) && !BLOCKED_IMAGE.test(file))
    .map((file) => `${IMG_PREFIX}${file}`);
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function isRoeProduct(product) {
  const text = `${product.name} ${product.handle}`.toLowerCase();
  return /\broe\b/.test(text);
}

function keywordFallbackHandle(product, subcategory) {
  const text = `${product.name} ${product.handle}`.toLowerCase();

  if (subcategory === 'prawns' || /\b(prawns?|shrimps?)\b/.test(text)) {
    if (/\bsmall\b/.test(text)) return 'medium-sized-prawns';
    if (/\b(xxl|large|jumbo)\b/.test(text)) return 'tiger-prawns';
    return 'tiger-prawns';
  }
  if (subcategory === 'squid' || /\bsquid\b/.test(text)) return 'squid';
  if (subcategory === 'crab' || /\bcrab\b/.test(text)) return 'crab-meat-white';
  if (subcategory === 'lobster' || /\blobster\b/.test(text)) return 'live-native-lobster';
  if (/\bmussel/.test(text)) return 'fresh-mussels-various-sizes';
  if (/\boyster/.test(text)) return 'maldon-rock-oysters';
  if (/\bscallop/.test(text)) return 'fresh-scallops';
  if (/\b(clam|razor)/.test(text)) return 'razor-clams';
  if (/\bsail[- ]?fish\b/.test(text)) return 'sword-loin';
  if (/\broe\b/.test(text)) return 'smoked-cod-roe';
  if (/\bsalmon\b/.test(text)) return 'salmon-fillets';
  if (/\bcod\b/.test(text)) return 'cod-fillet-200g';
  if (/\btuna\b/.test(text)) return 'tuna-loin';
  if (/\bsole\b/.test(text)) return 'dover-sole';
  if (/\bbass\b/.test(text)) return 'seabass';
  if (/\bbrill\b/.test(text)) return 'brill';
  if (/\bmackerel\b/.test(text)) return 'mackeral';

  return null;
}

function imageMatchesCategory(imagePath, subcategory, product = null) {
  if (!imagePath || BLOCKED_IMAGE.test(imagePath)) return false;
  if (product && isRoeImageForNonRoeProduct(imagePath, product)) return false;
  const pattern = CATEGORY_IMAGE_PATTERN[subcategory] || CATEGORY_IMAGE_PATTERN.fish;
  return pattern.test(imagePath);
}

function isRoeImageForNonRoeProduct(imagePath, product) {
  return ROE_IMAGE_PATTERN.test(imagePath) && !isRoeProduct(product);
}

function pickImages(product, subcategory, files) {
  const manualHandle = MANUAL_IMAGE_HANDLES[product.handle];
  if (manualHandle) {
    const manualImages = imagesForHandle(manualHandle, files);
    if (manualImages.length) return manualImages;
  }

  const ownImages = imagesForHandle(product.handle, files).filter((img) =>
    imageMatchesCategory(img, subcategory, product)
  );
  if (ownImages.length) return ownImages;

  const keywordHandle = keywordFallbackHandle(product, subcategory);
  if (keywordHandle) {
    const keywordImages = imagesForHandle(keywordHandle, files);
    if (keywordImages.length) return keywordImages;
  }

  const handles = CATEGORY_POOL_HANDLES[subcategory] || CATEGORY_POOL_HANDLES.fish;
  for (let offset = 0; offset < handles.length; offset += 1) {
    const handle = handles[(hashString(product.handle) + offset) % handles.length];
    const poolImages = imagesForHandle(handle, files).filter(
      (img) => !isRoeImageForNonRoeProduct(img, product)
    );
    if (poolImages.length) return poolImages;
  }

  return [];
}

function validateProduct(product) {
  const primary = product.images?.[0];
  if (!primary) return false;
  if (BLOCKED_IMAGE.test(primary)) return false;
  return imageMatchesCategory(primary, product.subcategory, product);
}

function main() {
  const files = listImageFiles();
  const fish = JSON.parse(fs.readFileSync(FISH_PATH, 'utf8'));

  const updated = fish.map((product) => {
    const subcategory = classifyFish(product);
    const images = pickImages(product, subcategory, files);
    return {
      ...product,
      subcategory,
      images,
    };
  });

  const invalid = updated.filter((product) => !validateProduct(product));
  if (invalid.length) {
    console.warn(`Warning: ${invalid.length} products still need photos:`);
    invalid.forEach((product) => {
      console.warn(` - ${product.name} (${product.subcategory})`);
    });
  }

  fs.writeFileSync(FISH_PATH, `${JSON.stringify(updated, null, 2)}\n`);

  const counts = {};
  updated.forEach((product) => {
    counts[product.subcategory] = (counts[product.subcategory] || 0) + 1;
  });

  console.log('Updated fish catalog with matching images.');
  console.log('Categories:', counts);
  console.log(`Valid image matches: ${updated.length - invalid.length}/${updated.length}`);
}

main();
