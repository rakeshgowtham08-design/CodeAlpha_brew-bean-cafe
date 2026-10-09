// frontend/js/common.js
// Shared across every page: API wrapper, auth/session helpers, cart
// (persisted in localStorage per the spec), and nav rendering/behavior.

const API_BASE = '/api';

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

async function api(path, options = {}) {
  const token = localStorage.getItem('bb_token');
  const res = await fetch(API_BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function rupees(n) { return '₹' + Number(n).toFixed(0); }

function getUser() {
  try { return JSON.parse(localStorage.getItem('bb_user')); } catch { return null; }
}
function setSession(token, user) {
  localStorage.setItem('bb_token', token);
  localStorage.setItem('bb_user', JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem('bb_token');
  localStorage.removeItem('bb_user');
}

const Cart = {
  KEY: 'bb_cart',
  read() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  write(items) { localStorage.setItem(this.KEY, JSON.stringify(items)); window.dispatchEvent(new Event('bb-cart-changed')); },
  add(productId, qty = 1) {
    const items = this.read();
    const row = items.find((i) => i.productId === productId);
    if (row) row.qty += qty; else items.push({ productId, qty });
    this.write(items);
  },
  setQty(productId, qty) {
    let items = this.read();
    if (qty <= 0) items = items.filter((i) => i.productId !== productId);
    else items.forEach((i) => { if (i.productId === productId) i.qty = qty; });
    this.write(items);
  },
  remove(productId) { this.write(this.read().filter((i) => i.productId !== productId)); },
  clear() { this.write([]); },
  count() { return this.read().reduce((s, i) => s + i.qty, 0); },
};

// ---- Nav behavior shared by every page ----
function initNav() {
  const nav = document.querySelector('.nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 40);
    });
  }
  const hamburger = document.getElementById('hamburgerBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
  }

  const user = getUser();
  document.querySelectorAll('.nav-user-slot').forEach((el) => {
    el.href = user ? '/tracking.html' : '/login.html';
    el.title = user ? 'My Orders' : 'Login';
    el.textContent = user ? `👤 ${user.name.split(' ')[0]}` : '👤 Login';
  });
  document.querySelectorAll('.nav-logout').forEach((el) => {
    if (user) { el.style.display = ''; el.addEventListener('click', (e) => { e.preventDefault(); clearSession(); window.location.href = '/'; }); }
    else el.style.display = 'none';
  });

  updateCartBadge();
  window.addEventListener('bb-cart-changed', updateCartBadge);
}
function updateCartBadge() {
  document.querySelectorAll('.cart-badge').forEach((el) => { el.textContent = Cart.count(); });
}

// ---- Subtle scroll-reveal ----
function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  els.forEach((el) => io.observe(el));
}

document.addEventListener('DOMContentLoaded', () => { initNav(); initReveal(); });
