(() => {
  'use strict';

  const TOKEN_KEY = 'nishan_admin_token';
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const DEFAULT_CATEGORY_LISTS = {
    fish: ['fish', 'prawns', 'crab', 'squid', 'lobster', 'shellfish'],
    meat: ['chicken', 'mutton', 'beef', 'duck', 'turkey'],
  };

  let category = 'fish';
  let products = [];
  let searchQuery = '';
  let activeCategoryFilter = 'all';
  let editingHandle = null;
  let imagePaths = [];
  let categoryLists = { fish: [], meat: [] };

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function requireAuth() {
    if (!getToken()) {
      window.location.href = '/account';
      return false;
    }
    return true;
  }

  async function api(path, options = {}) {
    const res = await fetch(nishanApi(path), {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${getToken()}`,
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
    });

    const text = await res.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Server unavailable. Wait 30 seconds and try again.');
      }
    }

    if (res.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      window.location.href = '/account';
      throw new Error('Session expired');
    }
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  function formatPrice(price) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(price);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getPublishCategory() {
    const selected = document.querySelector('input[name="publishCategory"]:checked');
    return selected?.value === 'meat' ? 'meat' : 'fish';
  }

  function updatePublishNote(cat = getPublishCategory()) {
    const note = $('#publishNote');
    if (!note) return;
    note.textContent =
      cat === 'meat'
        ? 'This product will appear on the Meat page.'
        : 'This product will appear on the Fish page.';
    renderSubcategorySelect('', cat);
  }

  function formatCategoryLabel(slug) {
    return String(slug || '')
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  async function loadCategoryLists() {
    try {
      const [fishRes, meatRes] = await Promise.all([
        api('/api/categories/fish'),
        api('/api/categories/meat'),
      ]);
      categoryLists.fish = fishRes.items?.length ? fishRes.items : [...DEFAULT_CATEGORY_LISTS.fish];
      categoryLists.meat = meatRes.items?.length ? meatRes.items : [...DEFAULT_CATEGORY_LISTS.meat];
    } catch {
      categoryLists.fish = [...DEFAULT_CATEGORY_LISTS.fish];
      categoryLists.meat = [...DEFAULT_CATEGORY_LISTS.meat];
    }
  }

  function renderSubcategorySelect(selected = '', cat = getPublishCategory()) {
    const select = $('#subcategorySelect');
    if (!select) return;

    const items = categoryLists[cat] || [];
    select.innerHTML = items
      .map(
        (slug) =>
          `<option value="${escapeHtml(slug)}">${escapeHtml(formatCategoryLabel(slug))}</option>`
      )
      .join('');

    if (selected && items.includes(selected)) {
      select.value = selected;
    } else if (items.length) {
      select.value = items[0];
    }
  }

  async function addCustomVariety() {
    const input = $('#customSubcategory');
    const label = input?.value.trim();
    if (!label) return;

    const cat = getPublishCategory();
    const data = await api(`/api/admin/categories/${cat}`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    });

    categoryLists[cat] = data.items;
    renderSubcategorySelect(data.slug, cat);
    renderCategoryFilters();
    if (input) input.value = '';
  }

  async function deleteSelectedVariety() {
    const select = $('#subcategorySelect');
    const slug = select?.value;
    if (!slug) return;

    const cat = getPublishCategory();
    const label = formatCategoryLabel(slug);

    if (
      !confirm(
        `Delete variety "${label}"?\n\nIt will be removed from the shop filters. This cannot be undone.`
      )
    ) {
      return;
    }

    const data = await api(`/api/admin/categories/${cat}/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });

    categoryLists[cat] = data.items;
    renderSubcategorySelect('', cat);
    renderCategoryFilters();
  }

  function getMeatType(product) {
    const text = `${product.name} ${product.handle}`.toLowerCase();
    if (/\bturkey\b/.test(text)) return 'turkey';
    if (/\bduck\b/.test(text)) return 'duck';
    if (/\b(chicken|poussin|cornfed)\b/.test(text)) return 'chicken';
    if (/\b(lamb|mutton)\b/.test(text)) return 'mutton';
    if (
      /\b(beef|steak|ribeye|sirloin|fillet|brisket|ox\b)/.test(text) ||
      /\box\b/.test(text)
    ) {
      return 'beef';
    }
    return '';
  }

  function getFishType(product) {
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
    return category === 'meat' ? getMeatType(product) : getFishType(product);
  }

  function renderCategoryFilters() {
    const container = $('#adminCategoryFilters');
    if (!container) return;

    const items = categoryLists[category] || [];
    const allLabel = category === 'meat' ? 'All Meat' : 'All fish & seafood';

    container.innerHTML = [
      `<button type="button" class="filter-btn${activeCategoryFilter === 'all' ? ' active' : ''}" data-filter="all">${allLabel}</button>`,
      ...items.map(
        (slug) =>
          `<button type="button" class="filter-btn${activeCategoryFilter === slug ? ' active' : ''}" data-filter="${escapeHtml(slug)}">${escapeHtml(formatCategoryLabel(slug))}</button>`
      ),
    ].join('');

    container.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategoryFilter = btn.dataset.filter;
        renderCategoryFilters();
        renderTable();
      });
    });
  }

  function setCategoryFilter(value) {
    activeCategoryFilter = value;
    renderCategoryFilters();
    renderTable();
  }

  function setPublishCategory(value, locked = false) {
    const field = $('#publishField');
    document.querySelectorAll('input[name="publishCategory"]').forEach((input) => {
      input.checked = input.value === value;
    });
    field?.classList.toggle('is-locked', locked);
    updatePublishNote(value);
  }

  function productImageSrc(path, fallback = '/nottinghill_export/images/fish/salmon-fillets-1.jpg') {
    if (!path) return fallback;
    return typeof nishanAsset === 'function' ? nishanAsset(path) : `/${String(path).replace(/^\/+/, '')}`;
  }

  function renderImages() {
    const list = $('#imageList');
    if (!list) return;

    if (!imagePaths.length) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = imagePaths
      .map(
        (src, i) => {
          const imgSrc = productImageSrc(src);
          return `
      <div class="admin-image-item">
        <img src="${imgSrc}" alt="" loading="lazy">
        <button type="button" data-index="${i}" aria-label="Remove image">&times;</button>
      </div>`;
        }
      )
      .join('');

    list.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        imagePaths.splice(Number(btn.dataset.index), 1);
        renderImages();
      });
    });
  }

  function getFilteredProducts() {
    const q = searchQuery.trim().toLowerCase();

    return products.filter((p) => {
      const matchCategory =
        activeCategoryFilter === 'all' || getProductSubcategory(p) === activeCategoryFilter;
      if (!matchCategory) return false;

      if (!q) return true;

      const haystack = [p.name, p.description, p.specification, p.handle, getProductSubcategory(p)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  function renderTable() {
    const tbody = $('#productTableBody');
    const countEl = $('#productCount');
    const clearBtn = $('#clearSearchBtn');
    if (!tbody) return;

    const filtered = getFilteredProducts();
    const total = products.length;
    const showing = filtered.length;
    const hasSearch = Boolean(searchQuery.trim());
    const hasFilter = activeCategoryFilter !== 'all';

    if (hasSearch || hasFilter) {
      countEl.textContent = `Showing ${showing} of ${total} product${total === 1 ? '' : 's'}`;
      if (clearBtn) clearBtn.hidden = !hasSearch;
    } else {
      countEl.textContent = `${total} product${total === 1 ? '' : 's'}`;
      if (clearBtn) clearBtn.hidden = true;
    }

    if (!total) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="admin-table__empty">No products yet. Click Add Product.</td></tr>';
      return;
    }

    if (!showing) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="admin-table__empty">No products match your filter. Try another category or search term.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered
      .map((p) => {
        const img = productImageSrc(p.images?.[0]);
        const desc = p.description || p.specification || '—';
        const priceLabel = p.variety ? ' / kg' : '';
        return `
        <tr>
          <td><img class="admin-table__img" src="${img}" alt="${escapeHtml(p.name)}" loading="lazy"></td>
          <td><strong>${escapeHtml(p.name)}</strong></td>
          <td>${formatPrice(p.price)}${priceLabel}</td>
          <td><span class="admin-table__desc">${escapeHtml(desc)}</span></td>
          <td>
            <div class="admin-table__actions">
              <button type="button" class="admin-btn-icon" data-edit="${escapeHtml(p.handle)}">Edit</button>
              <button type="button" class="admin-btn-icon admin-btn-icon--danger" data-delete="${escapeHtml(p.handle)}">Delete</button>
            </div>
          </td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openModal(btn.dataset.edit));
    });

    tbody.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => deleteProduct(btn.dataset.delete));
    });
  }

  async function loadProducts() {
    const countEl = $('#productCount');
    try {
      products = await api(`/api/admin/products/${category}`);
      renderCategoryFilters();
      renderTable();
    } catch (err) {
      products = [];
      if (countEl) countEl.textContent = 'Could not load products. Please refresh the page.';
      const tbody = $('#productTableBody');
      if (tbody) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="admin-table__empty">Could not load products. Check your connection and refresh.</td></tr>';
      }
      throw err;
    }
  }

  function setSearchQuery(value) {
    searchQuery = value;
    const input = $('#productSearch');
    if (input && input.value !== value) input.value = value;
    renderTable();
  }

  function openModal(handle = null) {
    const modal = $('#productModal');
    const form = $('#productForm');
    editingHandle = handle;
    imagePaths = [];

    if (handle) {
      const product = products.find((p) => p.handle === handle);
      if (!product) return;

      $('#modalTitle').textContent = 'Edit Product';
      $('#editHandle').value = handle;
      form.name.value = product.name;
      form.price.value = product.price;
      form.specification.value = product.specification || '';
      form.description.value = product.description || '';
      form.variety.checked = !!product.variety;
      imagePaths = [...(product.images || [])];
      setPublishCategory(category, true);
      renderSubcategorySelect(product.subcategory || '', category);
    } else {
      $('#modalTitle').textContent = 'Add Product';
      $('#editHandle').value = '';
      form.reset();
      setPublishCategory(category, false);
      renderSubcategorySelect('', category);
    }

    $('#formError').hidden = true;
    renderImages();
    modal.showModal();
  }

  function closeModal() {
    $('#productModal')?.close();
    editingHandle = null;
    imagePaths = [];
  }

  async function saveProduct(e) {
    e.preventDefault();
    const form = $('#productForm');
    const errorEl = $('#formError');
    errorEl.hidden = true;

    const publishCategory = getPublishCategory();

    const payload = {
      name: form.name.value.trim(),
      price: Number(form.price.value),
      specification: form.specification.value.trim(),
      description: form.description.value.trim(),
      variety: form.variety.checked,
      subcategory: form.subcategory.value,
      images: imagePaths,
    };

    if (!payload.images.length) {
      errorEl.textContent = 'Please upload at least one product image before saving.';
      errorEl.hidden = false;
      return;
    }

    try {
      if (editingHandle) {
        await api(`/api/admin/products/${category}/${encodeURIComponent(editingHandle)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await api(`/api/admin/products/${publishCategory}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (publishCategory !== category) {
          category = publishCategory;
          $$('.admin-tab').forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.category === category);
          });
        }
      }

      closeModal();
      await loadProducts();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  }

  async function deleteProduct(handle) {
    const product = products.find((p) => p.handle === handle);
    if (!product) return;
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;

    await api(`/api/admin/products/${category}/${encodeURIComponent(handle)}`, {
      method: 'DELETE',
    });
    await loadProducts();
  }

  function getProductHandleForUpload() {
    const editHandle = $('#editHandle')?.value?.trim();
    if (editHandle) return editHandle;

    const name = $('#productForm')?.name?.value?.trim();
    if (name) {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }

    return 'new-product';
  }

  async function uploadImage(file) {
    const cat = getPublishCategory();
    const handle = getProductHandleForUpload();
    const formData = new FormData();
    formData.append('image', file);

    const data = await api(
      `/api/admin/upload?category=${encodeURIComponent(cat)}&handle=${encodeURIComponent(handle)}`,
      {
        method: 'POST',
        body: formData,
      }
    );

    imagePaths.push(data.path);
    renderImages();
  }

  async function uploadFiles(files) {
    const status = $('#uploadStatus');
    const imageFiles = [...files].filter((f) => f.type.startsWith('image/'));
    if (!imageFiles.length) {
      alert('Please choose an image file (JPG, PNG, or WEBP).');
      return;
    }

    if (status) status.hidden = false;
    try {
      for (const file of imageFiles) {
        await uploadImage(file);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      if (status) status.hidden = true;
    }
  }

  async function init() {
    if (!requireAuth()) return;

    try {
      const me = await api('/api/admin/me');
      $('#adminUser').textContent = `Signed in as ${me.username}`;
    } catch {
      return;
    }

    $$('.admin-tab').forEach((tab) => {
      tab.addEventListener('click', async () => {
        $$('.admin-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        category = tab.dataset.category;
        activeCategoryFilter = 'all';
        setSearchQuery('');
        await loadProducts();
      });
    });

    $('#productSearch')?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderTable();
    });

    $('#clearSearchBtn')?.addEventListener('click', () => setSearchQuery(''));

    $('#addProductBtn')?.addEventListener('click', () => openModal());
    $('#closeModalBtn')?.addEventListener('click', closeModal);
    $('#cancelModalBtn')?.addEventListener('click', closeModal);
    $('#productForm')?.addEventListener('submit', saveProduct);

    document.querySelectorAll('input[name="publishCategory"]').forEach((input) => {
      input.addEventListener('change', () => updatePublishNote());
    });

    $('#addVarietyBtn')?.addEventListener('click', async () => {
      try {
        await addCustomVariety();
      } catch (err) {
        alert(err.message);
      }
    });

    $('#deleteVarietyBtn')?.addEventListener('click', async () => {
      try {
        await deleteSelectedVariety();
      } catch (err) {
        alert(err.message);
      }
    });

    $('#customSubcategory')?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        try {
          await addCustomVariety();
        } catch (err) {
          alert(err.message);
        }
      }
    });

    $('#imageUpload')?.addEventListener('change', async (e) => {
      await uploadFiles(e.target.files || []);
      e.target.value = '';
    });

    const dropzone = $('#imageDropzone');
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
    dropzone?.addEventListener('dragleave', () => {
      dropzone.classList.remove('is-dragover');
    });
    dropzone?.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      await uploadFiles(e.dataTransfer?.files || []);
    });

    $('#logoutBtn')?.addEventListener('click', async () => {
      try {
        await api('/api/admin/logout', { method: 'POST' });
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem(TOKEN_KEY);
      window.location.href = '/account';
    });

    try {
      await loadCategoryLists();
      await loadProducts();
    } catch {
      /* loadProducts shows its own error state */
    }
  }

  init();
})();
