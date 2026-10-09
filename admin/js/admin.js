const API_BASE = '/api';
const STATUSES = ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
const STATUS_LABEL = { confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready', out_for_delivery: 'Out for delivery', delivered: 'Delivered' };
const PAGE_SIZE = 25;
const state = {
  user: null,
  page: { orders: 1, products: 1, inventory: 1, customers: 1 },
  products: [],
  orders: [],
  customers: [],
  categories: [],
  editingProduct: null,
  overview: null,
  toastTimer: null,
  searchTimer: null,
};

const money = value => '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const pretty = value => STATUS_LABEL[value] || String(value || '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
const formatDate = value => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value)) : '—';
const formatDateTime = value => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const query = values => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== '' && value !== null && value !== undefined) params.set(key, value); });
  return params.toString();
};

async function api(path, options = {}) {
  const token = localStorage.getItem('bb_admin_token');
  const response = await fetch(API_BASE + path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && token) {
    localStorage.removeItem('bb_admin_token');
    localStorage.removeItem('bb_admin_user');
    document.getElementById('dashboard').hidden = true;
    document.getElementById('authScreen').hidden = false;
    showAlert('authAlert', data.error || 'Your administrator session expired. Please sign in again.');
  }
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
function showAlert(id, message) {
  const element = document.getElementById(id);
  if (!element) return;
  element.replaceChildren();
  const alert = document.createElement('div');
  alert.className = 'alert';
  alert.setAttribute('role', 'alert');
  alert.textContent = message;
  element.append(alert);
}
function clearAlert(id) { const element = document.getElementById(id); if (element) element.replaceChildren(); }
function toast(message) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => element.classList.remove('show'), 2600);
}
function setRowMessage(id, columns, message) {
  document.getElementById(id).innerHTML = `<tr><td class="empty-cell" colspan="${columns}">${escapeHtml(message)}</td></tr>`;
}
function statusBadge(status) { return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(pretty(status))}</span>`; }
function paginationMarkup(key, pagination) {
  if (!pagination || pagination.pages <= 1) return `<span>${pagination?.total || 0} records</span>`;
  return `<span>${pagination.total} records · Page ${pagination.page} of ${pagination.pages}</span><button type="button" data-page="${key}" data-target="${pagination.page - 1}" aria-label="Previous page" ${pagination.page <= 1 ? 'disabled' : ''}>←</button><button type="button" data-page="${key}" data-target="${pagination.page + 1}" aria-label="Next page" ${pagination.page >= pagination.pages ? 'disabled' : ''}>→</button>`;
}
function drawPagination(id, key, pagination) { document.getElementById(id).innerHTML = paginationMarkup(key, pagination); }

async function adminLogin(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  clearAlert('authAlert');
  try {
    const result = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: document.getElementById('aEmail').value.trim(), password: document.getElementById('aPassword').value }),
    });
    if (result.user.role !== 'admin') throw new Error('This account does not have administrator access.');
    localStorage.setItem('bb_admin_token', result.token);
    localStorage.setItem('bb_admin_user', JSON.stringify(result.user));
    await openDashboard();
  } catch (error) {
    showAlert('authAlert', error.message);
  } finally {
    button.disabled = false;
  }
}
function adminLogout() {
  localStorage.removeItem('bb_admin_token');
  localStorage.removeItem('bb_admin_user');
  state.user = null;
  document.getElementById('dashboard').hidden = true;
  document.getElementById('authScreen').hidden = false;
  document.getElementById('aPassword').value = '';
  clearAlert('authAlert');
}
async function openDashboard() {
  try {
    const result = await api('/auth/me');
    if (result.user.role !== 'admin') throw new Error('This account does not have administrator access.');
    state.user = result.user;
    localStorage.setItem('bb_admin_user', JSON.stringify(result.user));
    document.getElementById('authScreen').hidden = true;
    document.getElementById('dashboard').hidden = false;
    document.getElementById('adminName').textContent = result.user.name || 'Administrator';
    document.getElementById('adminAvatar').textContent = (result.user.name || 'A').trim().charAt(0).toUpperCase();
    document.getElementById('welcomeName').textContent = (result.user.name || 'Admin').trim().split(/\s+/)[0];
    document.getElementById('settingsName').textContent = result.user.name || '—';
    document.getElementById('settingsEmail').textContent = result.user.email || '—';
    document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full' }).format(new Date());
    await Promise.all([loadOverview(), loadCategories(), loadProducts(), loadOrders(), loadCustomers()]);
  } catch (error) {
    adminLogout();
    showAlert('authAlert', error.message);
  }
}
function switchView(name) {
  const section = document.getElementById(`view-${name}`);
  if (!section) return;
  document.querySelectorAll('.view').forEach(view => { view.classList.toggle('active', view === section); view.hidden = view !== section; });
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  const label = ({ overview: 'Dashboard', orders: 'Orders', products: 'Products', categories: 'Categories', inventory: 'Inventory', customers: 'Customers', analytics: 'Analytics & reports', settings: 'Settings' })[name];
  document.getElementById('pageTitle').textContent = label;
  document.getElementById('crumbTitle').textContent = label.toUpperCase();
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('mobileMenu').setAttribute('aria-expanded', 'false');
  if (name === 'orders') loadOrders();
  if (name === 'products') loadProducts();
  if (name === 'categories') loadCategories();
  if (name === 'inventory') loadInventory();
  if (name === 'customers') loadCustomers();
  if (name === 'analytics') loadAnalytics();
}
async function refreshAll() {
  await Promise.all([loadOverview(), loadCategories(), loadProducts(), loadOrders(), loadCustomers()]);
  toast('Dashboard data refreshed');
}

function renderStats(containerId, items) {
  document.getElementById(containerId).innerHTML = items.map(item => `<article class="stat-card"><div class="label">${escapeHtml(item.label)}</div><div class="value">${escapeHtml(item.value)}</div><div class="trend">${escapeHtml(item.note)}</div></article>`).join('');
}
function renderChart(id, rows, key) {
  const chart = document.getElementById(id);
  if (!rows?.length) { chart.innerHTML = '<p class="empty-cell">No records for this period.</p>'; return; }
  const maximum = Math.max(1, ...rows.map(row => Number(row[key] || 0)));
  chart.style.setProperty('--bar-count', rows.length);
  chart.innerHTML = rows.map((row, index) => {
    const height = Math.max(3, Number(row[key] || 0) / maximum * 100);
    const date = new Date(`${row.date}T12:00:00Z`);
    const showLabel = rows.length <= 14 || index === 0 || index === rows.length - 1 || index % Math.ceil(rows.length / 8) === 0;
    const label = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
    return `<div class="chart-bar" style="--height:${height}%" data-tip="${escapeHtml(label)} · ${escapeHtml(money(row[key]))}" title="${escapeHtml(label)} · ${escapeHtml(money(row[key]))}"><i style="--height:${height}%"></i><span>${showLabel ? escapeHtml(label) : ''}</span></div>`;
  }).join('');
}
function renderBestSellers(id, products) {
  const target = document.getElementById(id);
  target.innerHTML = products?.length ? products.map((product, index) => `<div class="best-row"><span class="best-rank">${index + 1}</span><span><strong>${escapeHtml(product._id || product.name)}</strong><small>Units ordered</small></span><strong>${Number(product.qty || 0)}</strong></div>`).join('') : '<p class="empty-cell">No sales in this period.</p>';
}
function renderStatuses(id, counts) {
  document.getElementById(id).innerHTML = STATUSES.map(status => `<div class="status-item"><i class="status-dot" aria-hidden="true"></i><strong>${escapeHtml(pretty(status))}</strong><span>${Number(counts?.[status] || 0)}</span></div>`).join('');
}
function statsQuery(days) {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (Number(days) - 1));
  return query({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
}
async function loadOverview() {
  clearAlert('globalAlert');
  try {
    const days = document.getElementById('overviewRange').value;
    const stats = await api(`/orders/stats/summary?${statsQuery(days)}`);
    state.overview = stats;
    renderStats('statGrid', [
      { label: "Today's revenue", value: money(stats.todayRevenue), note: `${stats.todayOrders} orders today` },
      { label: 'All orders', value: stats.totalOrders, note: 'Stored orders' },
      { label: 'Pending orders', value: stats.pendingOrders, note: 'Not yet delivered' },
      { label: 'Completed orders', value: stats.completedOrders, note: 'Delivered' },
      { label: 'Customers', value: stats.customers, note: 'Registered customer accounts' },
      { label: 'Low-stock products', value: stats.lowStockProducts, note: 'Fewer than 10 in stock' },
    ]);
    document.getElementById('pendingNavCount').textContent = stats.pendingOrders || '';
    renderChart('overviewChart', stats.daily, 'revenue');
    renderStatuses('statusBreakdown', stats.statusCounts);
    renderBestSellers('topProducts', stats.topProducts);
    document.getElementById('revenueNote').textContent = `${stats.range.orders} orders in selected period. ${stats.revenueNote}`;
    renderRecentOrders(stats.recentOrders || []);
  } catch (error) { showAlert('globalAlert', error.message); }
}
function renderRecentOrders(orders) {
  const target = document.getElementById('recentOrdersBody');
  target.innerHTML = orders.length ? orders.map(order => `<tr><td><button class="order-ref" type="button" data-order-detail="${escapeHtml(order._id)}">#${escapeHtml(order._id.slice(-6).toUpperCase())}</button></td><td>${escapeHtml(order.customer?.name || order.user?.name || 'Customer')}</td><td>${money(order.total)}</td><td>${statusBadge(order.status)}</td><td>${escapeHtml(formatDateTime(order.createdAt))}</td></tr>`).join('') : '<tr><td class="empty-cell" colspan="5">No orders have been placed yet.</td></tr>';
}

function orderParams(page) {
  return query({ page, limit: PAGE_SIZE, search: document.getElementById('orderSearch').value.trim(), status: document.getElementById('orderStatusFilter').value, from: document.getElementById('orderFrom').value, to: document.getElementById('orderTo').value });
}
async function loadOrders() {
  const target = document.getElementById('ordersBody');
  target.innerHTML = '<tr><td class="loading-row" colspan="7">Loading orders…</td></tr>';
  try {
    const data = await api(`/orders?${orderParams(state.page.orders)}`);
    state.orders = data.orders;
    renderOrders(data.orders);
    drawPagination('ordersPagination', 'orders', data.pagination);
  } catch (error) { setRowMessage('ordersBody', 7, error.message); }
}
function validNextStatuses(order) {
  if (order.status === 'confirmed') return ['preparing'];
  if (order.status === 'preparing') return ['ready'];
  if (order.status === 'ready') return order.deliveryOption === 'pickup' ? ['delivered'] : ['out_for_delivery'];
  if (order.status === 'out_for_delivery') return ['delivered'];
  return [];
}
function renderOrders(orders) {
  document.getElementById('ordersBody').innerHTML = orders.length ? orders.map(order => {
    const itemCount = order.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
    const allowed = validNextStatuses(order);
    const statusControl = `<select class="status-select" data-order-status="${escapeHtml(order._id)}" aria-label="Update status for order ${escapeHtml(order._id.slice(-6))}" ${allowed.length ? '' : 'disabled'}><option value="${escapeHtml(order.status)}">${escapeHtml(pretty(order.status))}</option>${allowed.map(status => `<option value="${status}">${escapeHtml(pretty(status))}</option>`).join('')}</select>`;
    return `<tr><td><button class="order-ref" type="button" data-order-detail="${escapeHtml(order._id)}">#${escapeHtml(order._id.slice(-6).toUpperCase())}</button></td><td><div class="customer-cell"><strong>${escapeHtml(order.customer?.name || order.user?.name || 'Customer')}</strong><small>${escapeHtml(order.customer?.email || order.user?.email || '')}</small></div></td><td>${itemCount} items</td><td><strong>${money(order.total)}</strong></td><td>${escapeHtml(pretty(order.paymentMethod || 'cod'))}</td><td>${statusControl}</td><td>${escapeHtml(formatDateTime(order.createdAt))}</td></tr>`;
  }).join('') : '<tr><td class="empty-cell" colspan="7">No orders match these filters.</td></tr>';
}
async function changeOrderStatus(select) {
  const id = select.dataset.orderStatus;
  const status = select.value;
  select.disabled = true;
  try {
    await api(`/orders/${encodeURIComponent(id)}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
    toast(`Order moved to ${pretty(status).toLowerCase()}`);
    await Promise.all([loadOrders(), loadOverview()]);
  } catch (error) { toast(error.message); await loadOrders(); }
}
async function showOrder(id) {
  const dialog = document.getElementById('orderDialog');
  const details = document.getElementById('orderDetails');
  document.getElementById('orderDialogTitle').textContent = `Order #${id.slice(-6).toUpperCase()}`;
  details.innerHTML = '<p class="loading-row">Loading order…</p>';
  dialog.showModal();
  try {
    const { order } = await api(`/orders/${encodeURIComponent(id)}`);
    const lines = (order.items || []).map(item => `<div class="detail-line"><span>${escapeHtml(item.name)} × ${Number(item.quantity)}</span><span>${money(item.price * item.quantity)}</span></div>`).join('');
    details.innerHTML = `<div class="detail-grid"><div class="detail-block"><small>Customer</small><strong>${escapeHtml(order.customer?.name || order.user?.name || 'Customer')}</strong></div><div class="detail-block"><small>Status</small><strong>${escapeHtml(pretty(order.status))}</strong></div><div class="detail-block"><small>Email / phone</small><strong>${escapeHtml(order.customer?.email || '—')}<br>${escapeHtml(order.customer?.phone || '—')}</strong></div><div class="detail-block"><small>Placed / payment</small><strong>${escapeHtml(formatDateTime(order.createdAt))}<br>${escapeHtml(pretty(order.paymentMethod))}</strong></div><div class="detail-block"><small>Delivery</small><strong>${escapeHtml(pretty(order.deliveryOption))}${order.address ? `<br>${escapeHtml([order.address.house, order.address.street, order.address.city, order.address.state, order.address.pincode].filter(Boolean).join(', '))}` : ''}</strong></div></div><h3>Items</h3>${lines || '<p class="empty-cell">No item details.</p>'}<div class="detail-total"><span>Total</span><span>${money(order.total)}</span></div>`;
  } catch (error) { details.textContent = error.message; }
}

async function loadCategories() {
  document.getElementById('categoriesGrid').innerHTML = '<p class="panel empty-cell">Loading categories…</p>';
  try {
    const result = await api('/products/categories');
    state.categories = result.categories || [];
    const counts = result.counts || {};
    const options = state.categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    document.getElementById('productCategoryFilter').innerHTML = '<option value="">All categories</option>' + options;
    document.getElementById('categoryOptions').innerHTML = options;
    document.getElementById('categoriesGrid').innerHTML = state.categories.length ? state.categories.map(category => `<article class="category-card"><div class="category-card-head"><div><h3>${escapeHtml(category)}</h3><p>${Number(counts[category] || 0)} menu ${counts[category] === 1 ? 'product' : 'products'}</p></div><span class="brand-icon" aria-hidden="true">☕</span></div><button class="button button-light button-small" type="button" data-category-view="${escapeHtml(category)}">View products</button><button class="text-button" type="button" data-category-rename="${escapeHtml(category)}">Rename</button></article>`).join('') : '<div class="panel empty-cell">No categories yet. Add one while creating a product.</div>';
  } catch (error) {
    document.getElementById('categoriesGrid').innerHTML = `<div class="panel empty-cell"><p>${escapeHtml(error.message)}</p><button class="button button-light button-small" type="button" data-action="refresh-categories">Retry</button></div>`;
  }
}
function productParams(page) { return query({ page, limit: PAGE_SIZE, search: document.getElementById('productSearch').value.trim(), category: document.getElementById('productCategoryFilter').value }); }
async function loadProducts() {
  const target = document.getElementById('productsBody');
  target.innerHTML = '<tr><td class="loading-row" colspan="6">Loading products…</td></tr>';
  try {
    const result = await api(`/products?${productParams(state.page.products)}`);
    state.products = result.products;
    renderProducts(result.products);
    drawPagination('productsPagination', 'products', result.pagination);
  } catch (error) { setRowMessage('productsBody', 6, error.message); }
}
function renderProducts(products) {
  document.getElementById('productsBody').innerHTML = products.length ? products.map(product => `<tr><td><div class="product-cell"><img src="${escapeHtml(product.image)}" alt=""><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.badge || (product.isVeg ? 'Vegetarian' : 'Non-vegetarian'))}</small></span></div></td><td>${escapeHtml(product.category)}</td><td><strong>${money(product.price)}</strong></td><td class="${product.stock < 10 ? (product.stock === 0 ? 'stock-out' : 'stock-low') : 'stock-good'}">${Number(product.stock)}</td><td>★ ${Number(product.rating || 0).toFixed(1)}</td><td><div class="product-actions"><button class="icon-action" type="button" data-product-edit="${escapeHtml(product._id)}" aria-label="Edit ${escapeHtml(product.name)}" title="Edit">✎</button><button class="icon-action danger" type="button" data-product-delete="${escapeHtml(product._id)}" aria-label="Delete ${escapeHtml(product.name)}" title="Delete">×</button></div></td></tr>`).join('') : '<tr><td class="empty-cell" colspan="6">No products match this search.</td></tr>';
}
function openProductForm(product = null, category = '') {
  state.editingProduct = product?._id || null;
  document.getElementById('productDialogTitle').textContent = product ? 'Edit product' : 'Add product';
  document.getElementById('pfName').value = product?.name || '';
  document.getElementById('pfCategory').value = product?.category || category;
  document.getElementById('pfDescription').value = product?.description || '';
  document.getElementById('pfPrice').value = product?.price ?? '';
  document.getElementById('pfStock').value = product?.stock ?? 0;
  document.getElementById('pfImage').value = product?.image || '';
  document.getElementById('pfRating').value = product?.rating ?? 4.5;
  document.getElementById('pfBadge').value = product?.badge || '';
  document.getElementById('pfIsVeg').checked = product?.isVeg !== false;
  clearAlert('productFormAlert');
  document.getElementById('productDialog').showModal();
  document.getElementById('pfName').focus();
}
async function saveProduct(event) {
  event.preventDefault();
  const button = document.getElementById('saveProductBtn');
  button.disabled = true;
  clearAlert('productFormAlert');
  const payload = {
    name: document.getElementById('pfName').value.trim(),
    category: document.getElementById('pfCategory').value.trim(),
    description: document.getElementById('pfDescription').value.trim(),
    price: Number(document.getElementById('pfPrice').value),
    stock: Number(document.getElementById('pfStock').value),
    image: document.getElementById('pfImage').value.trim(),
    rating: Number(document.getElementById('pfRating').value),
    badge: document.getElementById('pfBadge').value,
    isVeg: document.getElementById('pfIsVeg').checked,
  };
  const wasEditing = Boolean(state.editingProduct);
  try {
    await api(wasEditing ? `/products/${encodeURIComponent(state.editingProduct)}` : '/products', { method: wasEditing ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    document.getElementById('productDialog').close();
    toast(wasEditing ? 'Product updated' : 'Product added');
    await Promise.all([loadProducts(), loadCategories()]);
  } catch (error) { showAlert('productFormAlert', error.message); }
  finally { button.disabled = false; }
}
async function deleteProduct(id) {
  const product = state.products.find(item => item._id === id);
  if (!window.confirm(`Delete ${product?.name || 'this product'}? Existing order snapshots will remain.`)) return;
  try {
    await api(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast('Product deleted');
    await Promise.all([loadProducts(), loadCategories()]);
  } catch (error) { toast(error.message); }
}
async function newCategory() {
  const name = window.prompt('New category name');
  if (name === null) return;
  const normalized = name.trim();
  if (!normalized || normalized.length > 60) { toast('Category name must be 1–60 characters'); return; }
  if (state.categories.some(category => category.toLowerCase() === normalized.toLowerCase())) { toast('That category already exists'); return; }
  switchView('products');
  openProductForm(null, normalized);
}
async function renameCategory(from) {
  const to = window.prompt(`Rename “${from}” to`, from);
  if (to === null) return;
  try {
    const result = await api('/products/categories', { method: 'PATCH', body: JSON.stringify({ from, to: to.trim() }) });
    toast(`${result.renamed} products updated`);
    await Promise.all([loadCategories(), loadProducts()]);
  } catch (error) { toast(error.message); }
}

function inventoryParams(page) { return query({ page, limit: PAGE_SIZE, search: document.getElementById('inventorySearch').value.trim(), stock: document.getElementById('inventoryFilter').value === 'all' ? '' : document.getElementById('inventoryFilter').value }); }
async function loadInventory() {
  const target = document.getElementById('inventoryBody');
  target.innerHTML = '<tr><td class="loading-row" colspan="4">Loading inventory…</td></tr>';
  try {
    const [result, summary] = await Promise.all([
      api(`/products?${inventoryParams(state.page.inventory)}`),
      api('/products/inventory/summary'),
    ]);
    const products = result.products || [];
    renderStats('inventorySummary', [
      { label: 'Products', value: summary.total, note: 'Entire catalog' },
      { label: 'Low stock', value: summary.lowStock, note: `1–${summary.lowStockThreshold - 1} units` },
      { label: 'Out of stock', value: summary.outOfStock, note: 'No units available' },
    ]);
    document.getElementById('inventoryBody').innerHTML = products.length ? products.map(product => `<tr><td><div class="product-cell"><img src="${escapeHtml(product.image)}" alt=""><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product._id.slice(-6))}</small></span></div></td><td>${escapeHtml(product.category)}</td><td class="${product.stock < 10 ? (product.stock === 0 ? 'stock-out' : 'stock-low') : 'stock-good'}">${Number(product.stock)}</td><td><form class="stock-editor" data-stock-form="${escapeHtml(product._id)}"><input name="stock" type="number" min="0" step="1" value="${Number(product.stock)}" aria-label="New stock for ${escapeHtml(product.name)}" required><button class="button button-light button-small" type="submit">Save</button></form></td></tr>`).join('') : '<tr><td class="empty-cell" colspan="4">No inventory items match this filter.</td></tr>';
    drawPagination('inventoryPagination', 'inventory', result.pagination);
  } catch (error) { setRowMessage('inventoryBody', 4, error.message); }
}
async function updateStock(form) {
  const id = form.dataset.stockForm;
  const stock = Number(new FormData(form).get('stock'));
  const button = form.querySelector('button');
  if (!Number.isInteger(stock) || stock < 0) { toast('Stock must be a non-negative whole number'); return; }
  button.disabled = true;
  try {
    await api(`/products/${encodeURIComponent(id)}/stock`, { method: 'PATCH', body: JSON.stringify({ stock }) });
    toast('Stock updated');
    await Promise.all([loadInventory(), loadOverview()]);
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
}

function customerParams(page) { return query({ page, limit: PAGE_SIZE, search: document.getElementById('customerSearch').value.trim() }); }
async function loadCustomers() {
  const target = document.getElementById('customersBody');
  target.innerHTML = '<tr><td class="loading-row" colspan="7">Loading customers…</td></tr>';
  try {
    const result = await api(`/auth/customers?${customerParams(state.page.customers)}`);
    state.customers = result.customers || [];
    target.innerHTML = state.customers.length ? state.customers.map(customer => `<tr><td><div class="customer-cell"><strong>${escapeHtml(customer.name)}</strong><small>Joined ${escapeHtml(formatDate(customer.createdAt))}</small></div></td><td>${escapeHtml(customer.email)}</td><td>${escapeHtml(customer.phone || '—')}</td><td>${Number(customer.orderCount || 0)}</td><td>${money(customer.totalSpent)}</td><td>${escapeHtml(formatDate(customer.lastOrderAt))}</td><td><button class="button button-light button-small" type="button" data-customer-history="${escapeHtml(customer.email)}" data-customer-name="${escapeHtml(customer.name)}">History</button></td></tr>`).join('') : '<tr><td class="empty-cell" colspan="7">No customer accounts match this search.</td></tr>';
    drawPagination('customersPagination', 'customers', result.pagination);
  } catch (error) { setRowMessage('customersBody', 7, error.message); }
}
async function showCustomerHistory(email, name) {
  const dialog = document.getElementById('customerDialog');
  const target = document.getElementById('customerOrders');
  document.getElementById('customerDialogTitle').textContent = name;
  target.innerHTML = '<p class="loading-row">Loading order history…</p>';
  dialog.showModal();
  try {
    const result = await api(`/orders?${query({ search: email, page: 1, limit: 50 })}`);
    target.innerHTML = result.orders.length ? result.orders.map(order => `<div class="detail-line"><span><strong>#${escapeHtml(order._id.slice(-6).toUpperCase())}</strong><br><small>${escapeHtml(formatDateTime(order.createdAt))} · ${escapeHtml(pretty(order.status))}</small></span><strong>${money(order.total)}</strong></div>`).join('') : '<p class="empty-cell">No orders on record for this customer.</p>';
  } catch (error) { target.textContent = error.message; }
}

function analyticsDates(days = 30) {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
async function loadAnalytics() {
  const from = document.getElementById('analyticsFrom').value;
  const to = document.getElementById('analyticsTo').value;
  if (!from || !to || from > to) { showAlert('globalAlert', 'Choose a valid start and end date.'); return; }
  clearAlert('globalAlert');
  try {
    const stats = await api(`/orders/stats/summary?${query({ from, to })}`);
    renderStats('analyticsStats', [
      { label: 'Revenue', value: money(stats.revenue), note: `${stats.range.orders} orders in range` },
      { label: 'Orders', value: stats.range.orders, note: `${formatDate(stats.range.from)} – ${formatDate(stats.range.to)}` },
      { label: 'Average order', value: money(stats.range.orders ? stats.revenue / stats.range.orders : 0), note: 'Revenue divided by orders' },
      { label: 'Delivered', value: stats.statusCounts?.delivered || 0, note: 'All-time delivered orders' },
    ]);
    renderChart('analyticsChart', stats.daily, 'revenue');
    renderBestSellers('analyticsBestSellers', stats.topProducts);
    renderStatuses('analyticsStatuses', stats.statusCounts);
    document.getElementById('analyticsRangeLabel').textContent = `${formatDate(stats.range.from)} – ${formatDate(stats.range.to)}`;
    document.getElementById('analyticsRevenueNote').textContent = stats.revenueNote;
  } catch (error) { showAlert('globalAlert', error.message); }
}

function closeDialog(id) { document.getElementById(id).close(); }
function bindEvents() {
  document.getElementById('loginForm').addEventListener('submit', adminLogin);
  document.getElementById('logoutBtn').addEventListener('click', adminLogout);
  document.getElementById('sideNav').addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) switchView(button.dataset.view); });
  document.querySelectorAll('[data-view-link]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.viewLink)));
  document.getElementById('mobileMenu').addEventListener('click', event => {
    const sidebar = document.getElementById('sidebar');
    const expanded = sidebar.classList.toggle('open');
    event.currentTarget.setAttribute('aria-expanded', String(expanded));
  });
  document.getElementById('addProductBtn').addEventListener('click', () => openProductForm());
  document.getElementById('productForm').addEventListener('submit', saveProduct);
  document.getElementById('overviewRange').addEventListener('change', loadOverview);
  document.getElementById('applyAnalytics').addEventListener('click', loadAnalytics);
  document.getElementById('orderStatusFilter').innerHTML += STATUSES.map(status => `<option value="${status}">${escapeHtml(pretty(status))}</option>`).join('');
  document.getElementById('orderSearch').addEventListener('input', () => debounceLoad('orders'));
  document.getElementById('orderStatusFilter').addEventListener('change', () => { state.page.orders = 1; loadOrders(); });
  ['orderFrom', 'orderTo'].forEach(id => document.getElementById(id).addEventListener('change', () => { state.page.orders = 1; loadOrders(); }));
  document.getElementById('clearOrderFilters').addEventListener('click', () => {
    document.getElementById('orderSearch').value = '';
    document.getElementById('orderStatusFilter').value = '';
    document.getElementById('orderFrom').value = '';
    document.getElementById('orderTo').value = '';
    state.page.orders = 1;
    loadOrders();
  });
  document.getElementById('productSearch').addEventListener('input', () => debounceLoad('products'));
  document.getElementById('productCategoryFilter').addEventListener('change', () => { state.page.products = 1; loadProducts(); });
  document.getElementById('clearProductFilters').addEventListener('click', () => {
    document.getElementById('productSearch').value = '';
    document.getElementById('productCategoryFilter').value = '';
    state.page.products = 1;
    loadProducts();
  });
  document.getElementById('inventorySearch').addEventListener('input', () => debounceLoad('inventory'));
  document.getElementById('inventoryFilter').addEventListener('change', () => { state.page.inventory = 1; loadInventory(); });
  document.getElementById('customerSearch').addEventListener('input', () => debounceLoad('customers'));
  document.getElementById('clearCustomerSearch').addEventListener('click', () => { document.getElementById('customerSearch').value = ''; state.page.customers = 1; loadCustomers(); });
  document.getElementById('toast').addEventListener('click', event => event.currentTarget.classList.remove('show'));
  document.body.addEventListener('click', event => {
    const closeButton = event.target.closest('[data-close]');
    if (closeButton) closeDialog(closeButton.dataset.close);
    const pageButton = event.target.closest('[data-page]');
    if (pageButton && !pageButton.disabled) { state.page[pageButton.dataset.page] = Number(pageButton.dataset.target); ({ orders: loadOrders, products: loadProducts, inventory: loadInventory, customers: loadCustomers })[pageButton.dataset.page](); }
    const detailButton = event.target.closest('[data-order-detail]');
    if (detailButton) showOrder(detailButton.dataset.orderDetail);
    const editButton = event.target.closest('[data-product-edit]');
    if (editButton) openProductForm(state.products.find(product => product._id === editButton.dataset.productEdit));
    const deleteButton = event.target.closest('[data-product-delete]');
    if (deleteButton) deleteProduct(deleteButton.dataset.productDelete);
    const categoryButton = event.target.closest('[data-category-view]');
    if (categoryButton) { switchView('products'); document.getElementById('productCategoryFilter').value = categoryButton.dataset.categoryView; state.page.products = 1; loadProducts(); }
    const renameButton = event.target.closest('[data-category-rename]');
    if (renameButton) renameCategory(renameButton.dataset.categoryRename);
    const customerButton = event.target.closest('[data-customer-history]');
    if (customerButton) showCustomerHistory(customerButton.dataset.customerHistory, customerButton.dataset.customerName);
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === 'refresh') refreshAll();
      if (action === 'refresh-orders') loadOrders();
      if (action === 'refresh-products') { loadProducts(); loadInventory(); }
      if (action === 'refresh-customers') loadCustomers();
      if (action === 'refresh-categories') loadCategories();
      if (action === 'new-category') newCategory();
      if (action === 'logout') adminLogout();
    }
  });
  document.body.addEventListener('change', event => {
    if (event.target.matches('[data-order-status]') && event.target.value) changeOrderStatus(event.target);
  });
  document.body.addEventListener('submit', event => {
    if (event.target.matches('[data-stock-form]')) { event.preventDefault(); updateStock(event.target); }
  });
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  }));
}
function debounceLoad(section) {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => { state.page[section] = 1; ({ orders: loadOrders, products: loadProducts, inventory: loadInventory, customers: loadCustomers })[section](); }, 250);
}

bindEvents();
const defaultRange = analyticsDates(30);
document.getElementById('analyticsFrom').value = defaultRange.from;
document.getElementById('analyticsTo').value = defaultRange.to;
if (localStorage.getItem('bb_admin_token')) openDashboard();
