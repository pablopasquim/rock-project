// ─── Utility: Safe HTML Escape ───────────────────────────────────────────────
function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── API Client (Authenticated) ─────────────────────────────────────────────
const API_BASE = '';

const API = {
  async _getHeaders(customHeaders = {}) {
    const headers = { 'Content-Type': 'application/json', ...customHeaders };
    if (window.Auth && typeof window.Auth.getToken === 'function') {
      const token = await window.Auth.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return headers;
  },

  _handleStatus(res) {
    if (res.status === 401) {
      if (window.Auth) window.Auth.logout();
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    if (res.status === 403) {
      toast("Seu e-mail não está autorizado a acessar este sistema.", "error");
      throw new Error("Acesso não autorizado para este e-mail.");
    }
    if (!res.ok) {
      throw new Error(`Erro na requisição (${res.status})`);
    }
  },

  async get(path) {
    const headers = await this._getHeaders();
    const res = await fetch(API_BASE + path, { headers });
    this._handleStatus(res);
    return res.json();
  },

  async post(path, body) {
    const headers = await this._getHeaders();
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    this._handleStatus(res);
    return res.json();
  },

  async put(path, body) {
    const headers = await this._getHeaders();
    const res = await fetch(API_BASE + path, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    this._handleStatus(res);
    return res.json();
  },

  async delete(path) {
    const headers = await this._getHeaders();
    const res = await fetch(API_BASE + path, { method: 'DELETE', headers });
    this._handleStatus(res);
    return res.status !== 204 ? res.json() : null;
  },
};

// ─── State ─────────────────────────────────────────────────────────────────
const State = {
  currentPage: 'dashboard',
  currentMonth: new Date().toLocaleDateString('sv').slice(0, 7),  // "YYYY-MM" local
  editingTxId: null,
  selectedType: 'expense',
  selectedCategory: '',
  categories: { expense: [], income: [] },
  lastFocusedElement: null,
};

// ─── Toast ──────────────────────────────────────────────────────────────────
function toast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${escapeHTML(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(40px)';
    el.style.transition = 'opacity 250ms var(--ease-out), transform 250ms var(--ease-out)';
    setTimeout(() => el.remove(), 260);
  }, duration);
}

// ─── Month Utilities ────────────────────────────────────────────────────────
function formatMonthLabel(monthKey) {
  if (!monthKey || typeof monthKey !== 'string') return '';
  const [y, m] = monthKey.split('-');
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const mIdx = parseInt(m, 10) - 1;
  return `${names[mIdx] || m} ${y}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ─── Month Selector ─────────────────────────────────────────────────────────
async function initMonthSelector() {
  const select = document.getElementById('global-month-select');
  if (!select) return;
  select.innerHTML = '';

  let months = [];
  try {
    const data = await API.get('/api/history/months');
    months = data.months || [];
  } catch (e) {
    console.warn("Failed to load available months", e);
  }

  if (!months.includes(State.currentMonth)) {
    months.push(State.currentMonth);
  }

  months.sort((a, b) => b.localeCompare(a));

  for (const key of months) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = formatMonthLabel(key);
    if (key === State.currentMonth) opt.selected = true;
    select.appendChild(opt);
  }

  select.onchange = () => {
    State.currentMonth = select.value;
    renderPage(State.currentPage);
  };
}

// ─── Router ─────────────────────────────────────────────────────────────────
const PAGE_META = {
  dashboard:    { title: 'Dashboard',    subtitle: 'Visão geral do seu mês' },
  transactions: { title: 'Transações',   subtitle: 'Adicione e gerencie suas transações' },
  history:      { title: 'Histórico',    subtitle: 'Navegue pelos seus meses anteriores' },
  chat:         { title: 'Rock Advisor', subtitle: 'Seu guia financeiro com inteligência artificial' },
};

function navigate(page) {
  if (State.currentPage === page) return;
  State.currentPage = page;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  const meta = PAGE_META[page] || {};
  document.getElementById('page-title').textContent = meta.title || page;
  document.getElementById('page-subtitle').textContent = meta.subtitle || '';

  renderPage(page);
}

async function renderPage(page) {
  const content = document.getElementById('page-content');
  if (!content) return;
  content.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;

  try {
    switch (page) {
      case 'dashboard':    await Dashboard.render(content, State.currentMonth); break;
      case 'transactions': await Transactions.render(content, State.currentMonth); break;
      case 'history':      await History.render(content, State.currentMonth); break;
      case 'chat':         await Chat.render(content); break;
      default:             content.innerHTML = '<p>Página não encontrada</p>';
    }
  } catch (err) {
    console.error(err);
    content.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <h3>Ocorreu um erro</h3>
        <p>Não foi possível carregar as informações. Tente novamente.</p>
      </div>`;
  }

  if (window.lucide) lucide.createIcons();
}

// ─── Modal App Controller ────────────────────────────────────────────────────
const App = {
  async openAddModal() {
    State.lastFocusedElement = document.activeElement;
    State.editingTxId = null;
    document.getElementById('modal-title').textContent = 'Nova Transação';
    document.getElementById('submit-btn').innerHTML = '<i data-lucide="check" style="width:16px;height:16px;"></i> Salvar';
    document.getElementById('transaction-form').reset();

    // Data local correta (YYYY-MM-DD local)
    document.getElementById('tx-date').value = new Date().toLocaleDateString('sv');

    State.selectedType = 'expense';
    App.setType('expense');
    State.selectedCategory = '';
    App.renderCategories();

    document.getElementById('installments-row').style.display = 'flex';
    document.getElementById('tx-is-installment').checked = false;
    document.getElementById('installments-qty-group').style.visibility = 'hidden';
    App.updateInstallmentOptions();

    const modal = document.getElementById('transaction-modal');
    modal.style.display = 'flex';
    document.getElementById('tx-amount').focus();
    setTimeout(() => lucide.createIcons(), 50);
  },

  async openEditModal(tx) {
    State.lastFocusedElement = document.activeElement;
    State.editingTxId = tx.id;
    document.getElementById('modal-title').textContent = 'Editar Transação';
    document.getElementById('tx-amount').value = tx.amount;
    document.getElementById('tx-date').value = tx.date;
    document.getElementById('tx-description').value = tx.description;

    State.selectedType = tx.type;
    App.setType(tx.type);

    State.selectedCategory = tx.category;
    App.renderCategories();

    document.getElementById('installments-row').style.display = 'none';

    const modal = document.getElementById('transaction-modal');
    modal.style.display = 'flex';
    document.getElementById('tx-amount').focus();
    setTimeout(() => lucide.createIcons(), 50);
  },

  closeModal() {
    const modal = document.getElementById('transaction-modal');
    modal.style.display = 'none';
    if (State.lastFocusedElement && typeof State.lastFocusedElement.focus === 'function') {
      State.lastFocusedElement.focus();
    }
  },

  setType(type) {
    State.selectedType = type;
    document.getElementById('btn-type-expense').className = `type-btn ${type === 'expense' ? 'active expense' : ''}`;
    document.getElementById('btn-type-income').className = `type-btn ${type === 'income' ? 'active income' : ''}`;
    
    if (!State.editingTxId) {
      document.getElementById('installments-row').style.display = type === 'expense' ? 'flex' : 'none';
      if (type === 'income') {
        document.getElementById('tx-is-installment').checked = false;
        document.getElementById('installments-qty-group').style.visibility = 'hidden';
      }
    }

    State.selectedCategory = '';
    App.renderCategories();
  },

  toggleInstallments() {
    const isChecked = document.getElementById('tx-is-installment').checked;
    document.getElementById('installments-qty-group').style.visibility = isChecked ? 'visible' : 'hidden';
    if (isChecked) App.updateInstallmentOptions();
  },

  updateInstallmentOptions() {
    const amountInput = document.getElementById('tx-amount').value;
    const totalAmount = parseFloat(amountInput) || 0;
    const select = document.getElementById('tx-installments');
    
    const currentVal = select.value || "2";
    select.innerHTML = '';
    
    if (totalAmount <= 0) {
      select.innerHTML = '<option value="2">Digite o valor primeiro...</option>';
      return;
    }

    for (let i = 2; i <= 24; i++) {
      const instValue = totalAmount / i;
      const formattedValue = formatCurrency(instValue);
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${i}x de ${formattedValue}`;
      select.appendChild(opt);
    }
    select.value = currentVal <= 24 ? currentVal : "2";
  },

  renderCategories() {
    const grid = document.getElementById('category-grid');
    const cats = State.categories[State.selectedType] || [];
    const iconMap = {
      utensils: 'utensils', car: 'car', home: 'home', 'gamepad-2': 'gamepad-2',
      'heart-pulse': 'heart-pulse', 'book-open': 'book-open',
      'more-horizontal': 'more-horizontal', briefcase: 'briefcase', laptop: 'laptop',
    };
    const labels = {
      alimentacao:'Alimentação', transporte:'Transporte', moradia:'Moradia',
      lazer:'Lazer', saude:'Saúde', educacao:'Educação',
      salario:'Salário', freelance:'Freelance', outros:'Outros',
    };
    grid.innerHTML = cats.map(cat => `
      <button type="button" class="cat-btn ${State.selectedCategory === cat.id ? 'selected' : ''}" data-cat-id="${cat.id}">
        <i data-lucide="${iconMap[cat.icon] || 'package'}" style="width:20px;height:20px;"></i>
        <span>${escapeHTML(cat.label || labels[cat.id] || cat.id)}</span>
      </button>
    `).join('');

    grid.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        App.selectCategory(btn.dataset.catId);
      });
    });

    document.getElementById('tx-category').value = State.selectedCategory;
    if (window.lucide) lucide.createIcons();
  },

  selectCategory(id) {
    State.selectedCategory = id;
    document.getElementById('tx-category').value = id;
    App.renderCategories();
  },

  async submitTransaction(e) {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>';

    const payload = {
      type:        State.selectedType,
      amount:      parseFloat(document.getElementById('tx-amount').value),
      date:        document.getElementById('tx-date').value,
      description: document.getElementById('tx-description').value.trim(),
      category:    State.selectedCategory,
    };

    if (!State.editingTxId && State.selectedType === 'expense' && document.getElementById('tx-is-installment').checked) {
      payload.installments = parseInt(document.getElementById('tx-installments').value, 10) || 2;
    }

    if (!payload.category) {
      toast('Selecione uma categoria', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="check" style="width:16px;height:16px;"></i> Salvar';
      if (window.lucide) lucide.createIcons();
      return;
    }

    try {
      if (State.editingTxId) {
        await API.put(`/api/transactions/${State.editingTxId}`, payload);
        toast('Transação atualizada!', 'success');
      } else {
        await API.post('/api/transactions', payload);
        toast('Transação adicionada!', 'success');
      }
      App.closeModal();
      renderPage(State.currentPage);
    } catch (err) {
      toast('Erro ao salvar transação', 'error');
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="check" style="width:16px;height:16px;"></i> Salvar';
      if (window.lucide) lucide.createIcons();
    }
  },

  async deleteTransaction(id) {
    if (!confirm('Confirmar exclusão desta transação?')) return;
    try {
      await API.delete(`/api/transactions/${id}`);
      toast('Transação excluída', 'success');
      renderPage(State.currentPage);
    } catch (err) {
      toast('Erro ao excluir', 'error');
    }
  },
};

window.App = App;

// ─── Setup Event Listeners & Auth Init ───────────────────────────────────────
window.onAppInit = async function() {
  try {
    const data = await API.get('/api/transactions/categories');
    State.categories = data;
  } catch (e) {
    console.warn('Could not load categories', e);
  }
  await initMonthSelector();
  await renderPage('dashboard');
};

document.addEventListener('DOMContentLoaded', () => {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });

  // Login form submit
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const btn = document.getElementById('login-btn');
      const errEl = document.getElementById('login-error-msg');

      if (errEl) errEl.style.display = 'none';
      btn.disabled = true;

      try {
        await window.Auth.login(email, password);
      } catch (err) {
        if (errEl) {
          errEl.textContent = "E-mail ou senha inválidos. Tente novamente.";
          errEl.style.display = 'block';
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (window.Auth) window.Auth.logout();
    });
  }

  // Topbar Add Transaction button
  const addTxBtn = document.getElementById('btn-add-transaction');
  if (addTxBtn) addTxBtn.addEventListener('click', () => App.openAddModal());

  // Modal type buttons & form
  document.getElementById('btn-type-expense')?.addEventListener('click', () => App.setType('expense'));
  document.getElementById('btn-type-income')?.addEventListener('click', () => App.setType('income'));
  document.getElementById('tx-is-installment')?.addEventListener('change', () => App.toggleInstallments());
  document.getElementById('tx-amount')?.addEventListener('input', () => App.updateInstallmentOptions());
  document.getElementById('transaction-form')?.addEventListener('submit', (e) => App.submitTransaction(e));
  document.getElementById('modal-close-btn')?.addEventListener('click', () => App.closeModal());
  document.getElementById('btn-cancel-modal')?.addEventListener('click', () => App.closeModal());

  // Close modal on overlay click or Escape key
  const modalOverlay = document.getElementById('transaction-modal');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) App.closeModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('transaction-modal');
      if (modal && modal.style.display === 'flex') {
        App.closeModal();
      }
    }
  });

  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    const themeIcon = themeToggle.querySelector('i');
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
      document.body.setAttribute('data-theme', 'dark');
      if (themeIcon) themeIcon.setAttribute('data-lucide', 'sun');
    }

    themeToggle.addEventListener('click', () => {
      const isDark = document.body.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        if (themeIcon) themeIcon.setAttribute('data-lucide', 'moon');
      } else {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        if (themeIcon) themeIcon.setAttribute('data-lucide', 'sun');
      }
      if (window.lucide) lucide.createIcons();
    });
  }

  // Inicializa o módulo Auth
  if (window.Auth) window.Auth.init();
});
