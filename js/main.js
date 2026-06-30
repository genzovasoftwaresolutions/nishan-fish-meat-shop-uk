(() => {
  'use strict';

  const WHATSAPP_NUMBER = '441895476737';
  const CART_KEY = 'nh_cart';
  const pageType = document.body.dataset.page || 'catalog';
  const pageCategory = document.body.dataset.category || '';
  const productsUrl = document.body.dataset.productsUrl || 'data/products.json';
  const staticProductsUrl =
    document.body.dataset.staticProductsUrl ||
    (pageCategory === 'meat' ? 'data/meat.json' : pageCategory === 'fish' ? 'data/fish.json' : '');

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to load ${url}: ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Expected JSON from ${url}`);
    }
    return res.json();
  }

  async function loadProductsForCategory(cat) {
    const apiUrl = cat === 'meat' ? '/api/products/meat' : '/api/products/fish';
    const staticUrl = cat === 'meat' ? 'data/meat.json' : 'data/fish.json';

    try {
      return await fetchJson(apiUrl);
    } catch (apiErr) {
      console.warn(`API unavailable for ${cat}, using static catalog`, apiErr);
      return fetchJson(staticUrl);
    }
  }

  async function loadCategoryItems(cat) {
    const defaults =
      cat === 'meat'
        ? ['chicken', 'mutton', 'beef', 'duck', 'turkey']
        : ['fish', 'prawns', 'crab', 'squid', 'lobster', 'shellfish'];

    try {
      const data = await fetchJson(`/api/categories/${cat}`);
      if (data.items?.length) return data.items;
    } catch {
      /* try static categories file */
    }

    try {
      const data = await fetchJson('data/shop-categories.json');
      if (Array.isArray(data[cat]) && data[cat].length) return data[cat];
    } catch {
      /* use defaults */
    }

    return defaults;
  }

  let products = [];
  let filtered = [];
  let activeFilter = 'all';
  let searchQuery = '';
  let sortBy = 'name-asc';
  let currentProduct = null;
  let modalQty = 1;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const productGrid = $('#productGrid');
  const productCount = $('#productCount');
  const noResults = $('#noResults');
  const searchInput = $('#searchInput');
  const sortSelect = $('#sortSelect');
  const productModal = $('#productModal');
  const cartDrawer = $('#cartDrawer');
  const cartBody = $('#cartBody');
  const cartEmpty = $('#cartEmpty');
  const cartFooter = $('#cartFooter');
  const cartCount = $('#cartCount');
  const cartTotal = $('#cartTotal');

  function formatPrice(price, currency = 'GBP') {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
    }).format(price);
  }

  function buildWhatsAppUrl(message) {
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }

  function getEnquireWhatsAppUrl() {
    return buildWhatsAppUrl(
      'Hello, I would like to enquire about your fresh fish and meat. Please could you help me?'
    );
  }

  function getOrderWhatsAppUrl(product, qty = 1) {
    const priceSuffix = product.variety ? ' / kg' : '';
    const spec = product.specification ? `\nSpecification: ${product.specification}` : '';
    const message = `Hello, I would like to order:\n\n${product.name}${spec}\nPrice: ${formatPrice(product.price)}${priceSuffix}\nQuantity: ${qty}\n\nPlease confirm availability. Thank you!`;
    return buildWhatsAppUrl(message);
  }

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartUI();
  }

  function getCartCount() {
    return getCart().reduce((sum, item) => sum + item.qty, 0);
  }

  function getCartTotal() {
    return getCart().reduce((sum, item) => sum + item.price * item.qty, 0);
  }

  function getProductImage(product) {
    const src = product?.images?.[0];
    return typeof src === 'string' && src.trim() ? src.trim() : '';
  }

  function renderProductCardImage(product) {
    const src = getProductImage(product);
    if (!src) {
      return '<div class="product-card__img product-card__img--placeholder" aria-hidden="true"></div>';
    }
    return `<img class="product-card__img" src="${src}" alt="${product.name}" loading="lazy">`;
  }

  function categoryLabel(cat) {
    return cat === 'fish' ? 'Fish & Seafood' : 'Meat & Poultry';
  }

  function productDescription(product) {
    if (product.description) {
      return product.description;
    }
    if (product.specification) {
      return `Specification: ${product.specification}. Freshly prepared by our fishmongers and packed to order. Prices per kg unless stated otherwise.`;
    }
    if (product.category === 'fish') {
      return 'Freshly prepared by our fishmongers. Sustainably sourced and packed to order for maximum freshness.';
    }
    return 'Premium quality from our artisan butchers. Carefully selected and prepared for the finest results.';
  }

  function getMeatType(product) {
    if (product.category !== 'meat') return '';
    const text = `${product.name} ${product.handle}`.toLowerCase();
    if (/\bturkey\b/.test(text)) return 'turkey';
    if (/\bduck\b/.test(text)) return 'duck';
    if (/\b(chicken|poussin|cornfed)\b/.test(text)) return 'chicken';
    if (/\b(lamb|mutton)\b/.test(text)) return 'mutton';
    if (
      /\b(beef|steak|ribeye|sirloin|rump|wagyu|brisket|bavette|onglet|chateaubriand|veal|scotch|ox cheek|ox tail|shin of beef|marrow)\b/.test(text) ||
      /\box\b/.test(text)
    ) {
      return 'beef';
    }
    return '';
  }

  function getFishType(product) {
    if (product.category !== 'fish') return '';
    const text = `${product.name} ${product.handle}`.toLowerCase();
    if (/\b(prawns?|shrimps?|langoustines?|carabinero)\b/.test(text)) return 'prawns';
    if (/\bcrab\b/.test(text)) return 'crab';
    if (/\b(squid|calamari|needle-squid)\b/.test(text)) return 'squid';
    if (/\blobster\b/.test(text)) return 'lobster';
    if (/\b(oysters?|mussels?|scallops?|clams?|shellfish|whelks?|razor)\b/.test(text)) return 'shellfish';
    return 'fish';
  }

  function getProductSubcategory(product) {
    if (product.subcategory) return product.subcategory;
    if (pageCategory === 'meat' || product.category === 'meat') return getMeatType(product);
    if (pageCategory === 'fish' || product.category === 'fish') return getFishType(product);
    return '';
  }

  function formatCategoryLabel(slug) {
    return String(slug || '')
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function matchesSubFilter(product) {
    if (activeFilter === 'all') return true;
    return getProductSubcategory(product) === activeFilter;
  }

  function applyFilters() {
    filtered = products.filter((p) => {
      const matchSub = matchesSubFilter(p);
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.specification && p.specification.toLowerCase().includes(q));
      return matchSub && matchSearch;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'price-asc':
          return a.price - b.price;
        case 'price-desc':
          return b.price - a.price;
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }

  function renderProducts() {
    if (!productGrid) return;

    applyFilters();
    if (productCount) {
      productCount.textContent = `${filtered.length} product${filtered.length !== 1 ? 's' : ''}`;
    }

    if (filtered.length === 0) {
      productGrid.innerHTML = '';
      if (noResults) noResults.hidden = false;
      return;
    }

    if (noResults) noResults.hidden = true;
    productGrid.innerHTML = filtered
      .map((p) => {
        const specLine = p.specification
          ? `<p class="product-card__spec">${p.specification}</p>`
          : '';
        const priceLabel = p.variety ? '<small>/ kg</small>' : '<small>each</small>';

        return `
      <article class="product-card" data-handle="${p.handle}">
        <div class="product-card__img-wrap">
          ${renderProductCardImage(p)}
        </div>
        <div class="product-card__body">
          <h3 class="product-card__name">${p.name}</h3>
          ${specLine}
          <div class="product-card__footer">
            <span class="product-card__price">${formatPrice(p.price)} ${priceLabel}</span>
            <a class="product-card__whatsapp" href="${getOrderWhatsAppUrl(p, 1)}" target="_blank" rel="noopener noreferrer" aria-label="Order ${p.name} on WhatsApp">Order on WhatsApp</a>
          </div>
        </div>
      </article>`;
      })
      .join('');

    productGrid.querySelectorAll('.product-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.product-card__whatsapp')) return;
        openModal(card.dataset.handle);
      });
    });
  }

  function openModal(handle) {
    if (!productModal) return;

    currentProduct = products.find((p) => p.handle === handle);
    if (!currentProduct) return;

    modalQty = 1;
    $('#qtyValue').textContent = '1';
    $('#modalCategory').textContent = categoryLabel(currentProduct.category);
    $('#modalTitle').textContent = currentProduct.name;

    const specEl = $('#modalSpec');
    if (currentProduct.specification) {
      specEl.textContent = currentProduct.specification;
      specEl.hidden = false;
    } else {
      specEl.hidden = true;
    }

    const priceSuffix = currentProduct.variety ? ' / kg' : '';
    $('#modalPrice').textContent = formatPrice(currentProduct.price) + priceSuffix;
    $('#modalDesc').textContent = productDescription(currentProduct);

    const mainImg = $('#modalImg');
    mainImg.src = currentProduct.images[0];
    mainImg.alt = currentProduct.name;

    const thumbs = $('#modalThumbs');
    thumbs.innerHTML = currentProduct.images
      .map(
        (src, i) =>
          `<img class="modal__thumb${i === 0 ? ' active' : ''}" src="${src}" alt="" data-index="${i}">`
      )
      .join('');

    thumbs.querySelectorAll('.modal__thumb').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        thumbs.querySelectorAll('.modal__thumb').forEach((t) => t.classList.remove('active'));
        thumb.classList.add('active');
        mainImg.src = currentProduct.images[Number(thumb.dataset.index)];
      });
    });

    productModal.showModal();
    updateModalWhatsAppLink();
  }

  function updateModalWhatsAppLink() {
    const btn = $('#whatsappOrderBtn');
    if (btn && currentProduct) {
      btn.href = getOrderWhatsAppUrl(currentProduct, modalQty);
    }
  }

  function closeModal() {
    if (productModal) productModal.close();
    currentProduct = null;
  }

  function addToCart(handle, qty = 1) {
    const product = products.find((p) => p.handle === handle);
    if (!product) {
      loadAllProductsForCart().then(() => {
        const p = allProductsCache.find((item) => item.handle === handle);
        if (p) addProductToCart(p, qty);
      });
      return;
    }
    addProductToCart(product, qty);
  }

  let allProductsCache = null;

  async function loadAllProductsForCart() {
    if (allProductsCache) return allProductsCache;
    try {
      const [fish, meat] = await Promise.all([
        loadProductsForCategory('fish'),
        loadProductsForCategory('meat'),
      ]);
      allProductsCache = [...fish, ...meat];
    } catch {
      allProductsCache = products;
    }
    return allProductsCache;
  }

  function addProductToCart(product, qty) {
    const cart = getCart();
    const existing = cart.find((item) => item.handle === product.handle);

    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        handle: product.handle,
        name: product.name,
        price: product.price,
        image: product.images[0],
        specification: product.specification || '',
        qty,
      });
    }

    saveCart(cart);
    openCart();
  }

  function removeFromCart(handle) {
    saveCart(getCart().filter((item) => item.handle !== handle));
  }

  function updateCartUI() {
    const cart = getCart();
    const count = getCartCount();
    if (cartCount) {
      cartCount.textContent = count;
      cartCount.style.display = count > 0 ? 'flex' : 'none';
    }

    if (!cartBody) return;

    if (cart.length === 0) {
      if (cartEmpty) cartEmpty.hidden = false;
      if (cartFooter) cartFooter.hidden = true;
      cartBody.querySelectorAll('.cart-item').forEach((el) => el.remove());
      return;
    }

    if (cartEmpty) cartEmpty.hidden = true;
    if (cartFooter) cartFooter.hidden = false;
    if (cartTotal) cartTotal.textContent = formatPrice(getCartTotal());

    cartBody.querySelectorAll('.cart-item').forEach((el) => el.remove());

    cart.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'cart-item';
      const spec = item.specification ? `<small>${item.specification}</small>` : '';
      el.innerHTML = `
        <img class="cart-item__img" src="${item.image}" alt="">
        <div class="cart-item__info">
          <p class="cart-item__name">${item.name}</p>
          ${spec}
          <div class="cart-item__meta">
            <span>${item.qty} × ${formatPrice(item.price)}</span>
            <strong>${formatPrice(item.price * item.qty)}</strong>
          </div>
          <button class="cart-item__remove" data-handle="${item.handle}">Remove</button>
        </div>`;
      cartBody.appendChild(el);

      el.querySelector('.cart-item__remove').addEventListener('click', () => {
        removeFromCart(item.handle);
      });
    });
  }

  function openCart() {
    if (!cartDrawer) return;
    cartDrawer.classList.add('open');
    cartDrawer.setAttribute('aria-hidden', 'false');
  }

  function closeCart() {
    if (!cartDrawer) return;
    cartDrawer.classList.remove('open');
    cartDrawer.setAttribute('aria-hidden', 'true');
  }

  function setActiveNavLink() {
    const current = location.pathname.split('/').pop() || 'fish.html';
    $$('.nav__link').forEach((link) => {
      const href = (link.getAttribute('href') || '').split('/').pop();
      link.classList.toggle('active', href === current);
    });
  }

  function initNav() {
    const header = $('#header');
    if (!header) return;

    setActiveNavLink();

    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 20);
    });

    const nav = $('#nav');
    const navOverlay = $('#navOverlay');
    const menuToggle = $('#menuToggle');

    const closeNav = () => {
      nav?.classList.remove('open');
      navOverlay?.classList.remove('is-visible');
      navOverlay?.setAttribute('hidden', '');
      menuToggle?.setAttribute('aria-expanded', 'false');
    };

    const openNav = () => {
      nav?.classList.add('open');
      navOverlay?.classList.add('is-visible');
      navOverlay?.removeAttribute('hidden');
      menuToggle?.setAttribute('aria-expanded', 'true');
    };

    $$('.nav__link').forEach((link) => {
      link.addEventListener('click', closeNav);
    });

    menuToggle?.addEventListener('click', () => {
      if (nav?.classList.contains('open')) {
        closeNav();
      } else {
        openNav();
      }
    });

    navOverlay?.addEventListener('click', closeNav);
  }

  function initFilters() {
    $$('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        renderProducts();
      });
    });

    searchInput?.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderProducts();
    });
  }

  async function initCategoryFilters() {
    const container = $('#categoryFilters');
    if (!container || (pageCategory !== 'fish' && pageCategory !== 'meat')) return;

    const items = await loadCategoryItems(pageCategory);

    const allLabel = pageCategory === 'meat' ? 'All Meat' : 'All fish & seafood';
    container.innerHTML = [
      `<button type="button" class="filter-btn active" data-filter="all">${allLabel}</button>`,
      ...items.map(
        (slug) =>
          `<button type="button" class="filter-btn" data-filter="${slug}">${formatCategoryLabel(slug)}</button>`
      ),
    ].join('');
  }

  function initModal() {
    if (!productModal) return;

    $('#modalClose')?.addEventListener('click', closeModal);
    productModal.addEventListener('click', (e) => {
      if (e.target === productModal) closeModal();
    });

    $('#qtyMinus')?.addEventListener('click', () => {
      if (modalQty > 1) {
        modalQty--;
        $('#qtyValue').textContent = modalQty;
        updateModalWhatsAppLink();
      }
    });

    $('#qtyPlus')?.addEventListener('click', () => {
      modalQty++;
      $('#qtyValue').textContent = modalQty;
      updateModalWhatsAppLink();
    });
  }

  function initWhatsApp() {
    const enquireBtn = $('#whatsappEnquireBtn');
    if (enquireBtn) {
      enquireBtn.href = getEnquireWhatsAppUrl();
    }
  }

  async function initAccountButton() {
    const btn = $('#accountBtn');
    const tooltip = $('#accountTooltip');
    if (!btn) return;

    const memberToken = sessionStorage.getItem('nishan_member_token');
    const adminToken = sessionStorage.getItem('nishan_admin_token');
    let user = null;

    try {
      if (adminToken) {
        const res = await fetch('/api/admin/me', {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.ok) user = await res.json();
      } else if (memberToken) {
        const res = await fetch('/api/member/me', {
          headers: { Authorization: `Bearer ${memberToken}` },
        });
        if (res.ok) user = await res.json();
        else sessionStorage.removeItem('nishan_member_token');
      }
    } catch {
      return;
    }

    if (!user) return;

    const displayName = user.name || user.email || 'Signed in';
    btn.classList.add('account-btn--signed-in');
    btn.setAttribute('title', displayName);
    btn.setAttribute('aria-label', `Signed in as ${displayName}`);

    if (tooltip) {
      tooltip.textContent = displayName;
      tooltip.hidden = false;
    }
  }

  async function initCatalog() {
    try {
      if (pageCategory === 'fish' || pageCategory === 'meat') {
        products = await loadProductsForCategory(pageCategory);
      } else if (staticProductsUrl) {
        products = await fetchJson(staticProductsUrl);
      } else {
        products = await fetchJson(productsUrl);
      }
      renderProducts();
    } catch (err) {
      if (productGrid) {
        productGrid.innerHTML =
          '<p class="no-results">Unable to load products right now. Please refresh the page.</p>';
      }
      console.error(err);
    }
  }

  function initHeroSlideshow() {
    const slideshow = $('#heroSlideshow');
    if (!slideshow) return;

    const slides = [...slideshow.querySelectorAll('.page-hero__slide')];
    const dots = [...slideshow.querySelectorAll('.page-hero__dot')];
    let current = 0;
    let timer;

    function goTo(index) {
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => slide.classList.toggle('active', i === current));
      dots.forEach((dot, i) => dot.classList.toggle('active', i === current));
    }

    function next() {
      goTo(current + 1);
    }

    function startAutoplay() {
      clearInterval(timer);
      timer = setInterval(next, 5000);
    }

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        goTo(Number(dot.dataset.slide));
        startAutoplay();
      });
    });

    goTo(0);
    startAutoplay();
  }

  async function init() {
    initNav();
    initWhatsApp();
    initHeroSlideshow();
    await initAccountButton();

    if (pageType === 'catalog') {
      await initCategoryFilters();
      initFilters();
      initModal();
      await initCatalog();
    }
  }

  init();
})();
