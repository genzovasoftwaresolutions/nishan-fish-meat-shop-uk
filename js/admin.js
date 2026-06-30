(() => {
  'use strict';

  const TOKEN_KEY = 'nishan_admin_token';
  const $ = (sel) => document.querySelector(sel);

  let category = 'fish';
  let products = [];
  let searchQuery = '';
  let editingHandle = null;
  let imagePaths = [];

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function requireAuth() {
    if (!getToken()) {
      window.location.href = '/admin/login';
      return false;
    }
    return true;
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${getToken()}`,
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
    });

    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      window.location.href = '/admin/login';
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

  function updatePublishNote() {
    const note = $('#publishNote');
    if (!note) return;
    const cat = getPublishCategory();
    note.textContent =
      cat === 'meat'
        ? 'This product will appear on the Meat page.'
        : 'This product will appear on the Fish page.';
  }

  function setPublishCategory(value, locked = false) {
    const field = $('#publishField');
    document.querySelectorAll('input[name="publishCategory"]').forEach((input) => {
      input.checked = input.value === value;
    });
    field?.classList.toggle('is-locked', locked);
    updatePublishNote();
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
        (src, i) => `
      <div class="admin-image-item">
        <img src="../${src}" alt="">
        <button type="button" data-index="${i}" aria-label="Remove image">&times;</button>
      </div>`
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
    if (!q) return products;

    return products.filter((p) => {
      const haystack = [p.name, p.description, p.specification, p.handle]
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

    if (searchQuery.trim()) {
      countEl.textContent = `Showing ${showing} of ${total} product${total === 1 ? '' : 's'}`;
      if (clearBtn) clearBtn.hidden = false;
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
        '<tr><td colspan="5" class="admin-table__empty">No products match your search. Try a different name.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered
      .map((p) => {
        const img = p.images?.[0]
          ? `../${p.images[0]}`
          : '../nottinghill_export/images/fish/salmon-fillets-1.jpg';
        const desc = p.description || p.specification || '—';
        const priceLabel = p.variety ? ' / kg' : '';
        return `
        <tr>
          <td><img class="admin-table__img" src="${img}" alt=""></td>
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
    products = await api(`/api/admin/products/${category}`);
    renderTable();
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
    } else {
      $('#modalTitle').textContent = 'Add Product';
      $('#editHandle').value = '';
      form.reset();
      setPublishCategory(category, false);
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
      images: imagePaths,
    };

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

  async function uploadImage(file) {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('category', getPublishCategory());

    const data = await api('/api/admin/upload', {
      method: 'POST',
      body: formData,
    });

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
      input.addEventListener('change', updatePublishNote);
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
      window.location.href = '/admin/login';
    });

    await loadProducts();
  }

  const $$ = (sel) => document.querySelectorAll(sel);

  init();
})();
