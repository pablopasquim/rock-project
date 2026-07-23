// ─── API Client ────────────────────────────────────────────────────────────
const API_BASE = '';  // Same origin (FastAPI serves frontend)

const API = {
  async get(path) {
    const res = await fetch(API_BASE + path);
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  },
  async put(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  },
  async delete(path) {
    const res = await fetch(API_BASE + path, { method: 'DELETE' });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.status !== 204 ? res.json() : null;
  },
};

// ─── State ─────────────────────────────────────────────────────────────────
const State = {
  currentPage: 'dashboard',
  currentMonth: new Date().toISOString().slice(0, 7),  // "YYYY-MM"
  editingTxId: null,
  selectedType: 'expense',
  selectedCategory: '',
  categories: { expense: [], income: [] },
};

// ─── Toast ──────────────────────────────────────────────────────────────────
function toast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
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
  const [y, m] = monthKey.split('-');
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${names[parseInt(m) - 1]} ${y}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ─── Month Selector ─────────────────────────────────────────────────────────
async function initMonthSelector() {
  const select = document.getElementById('global-month-select');
  select.innerHTML = '';

  let months = [];
  try {
    const data = await API.get('/api/history/months');
    months = data.months || [];
  } catch (e) {
    console.error("Failed to load available months", e);
  }

  // Ensure current month is always available
  if (!months.includes(State.currentMonth)) {
    months.push(State.currentMonth);
  }

  // Sort descending (newest first)
  months.sort((a, b) => b.localeCompare(a));

  for (const key of months) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = formatMonthLabel(key);
    if (key === State.currentMonth) opt.selected = true;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    State.currentMonth = select.value;
    renderPage(State.currentPage);
  });
}

// ─── Router ─────────────────────────────────────────────────────────────────
const PAGE_META = {
  dashboard:    { title: 'Dashboard',    subtitle: 'Visão geral do seu mês' },
  transactions: { title: 'Transações',   subtitle: 'Adicione e gerencie suas transações' },
  history:      { title: 'Histórico',    subtitle: 'Navegue pelos seus meses anteriores' },
  chat:         { title: 'Rock Advisor',  subtitle: 'Seu guia financeiro com inteligência artificial' },
};

function navigate(page) {
  if (State.currentPage === page) return;
  State.currentPage = page;

  // Update nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Update topbar
  const meta = PAGE_META[page] || {};
  document.getElementById('page-title').textContent = meta.title || page;
  document.getElementById('page-subtitle').textContent = meta.subtitle || '';

  renderPage(page);
}

async function renderPage(page) {
  const content = document.getElementById('page-content');
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
        <h3>Erro ao carregar</h3>
        <p>${err.message}</p>
      </div>`;
  }

  // Reinit Lucide icons
  if (window.lucide) lucide.createIcons();
}

// ─── Modal ───────────────────────────────────────────────────────────────────
const App = {
  async openAddModal() {
    State.editingTxId = null;
    document.getElementById('modal-title').textContent = 'Nova Transação';
    document.getElementById('submit-btn').innerHTML = '<i data-lucide="check" style="width:16px;height:16px;"></i> Salvar';
    document.getElementById('transaction-form').reset();

    // Set today's date
    document.getElementById('tx-date').value = new Date().toISOString().slice(0, 10);

    State.selectedType = 'expense';
    App.setType('expense');
    State.selectedCategory = '';
    App.renderCategories();

    // Reset installments
    document.getElementById('installments-row').style.display = 'flex';
    document.getElementById('tx-is-installment').checked = false;
    document.getElementById('installments-qty-group').style.visibility = 'hidden';
    App.updateInstallmentOptions();

    document.getElementById('transaction-modal').style.display = 'flex';
    setTimeout(() => lucide.createIcons(), 50);
  },

  async openEditModal(tx) {
    State.editingTxId = tx.id;
    document.getElementById('modal-title').textContent = 'Editar Transação';
    document.getElementById('tx-amount').value = tx.amount;
    document.getElementById('tx-date').value = tx.date;
    document.getElementById('tx-description').value = tx.description;

    State.selectedType = tx.type;
    App.setType(tx.type);

    State.selectedCategory = tx.category;
    App.renderCategories();

    // Hide installments row for editing
    document.getElementById('installments-row').style.display = 'none';

    document.getElementById('transaction-modal').style.display = 'flex';
    setTimeout(() => lucide.createIcons(), 50);
  },

  closeModal() {
    document.getElementById('transaction-modal').style.display = 'none';
  },

  setType(type) {
    State.selectedType = type;
    document.getElementById('btn-type-expense').className = `type-btn ${type === 'expense' ? 'active expense' : ''}`;
    document.getElementById('btn-type-income').className = `type-btn ${type === 'income' ? 'active income' : ''}`;
    
    // Toggle installments row visibility
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
    
    // Store current selection if any
    const currentVal = select.value || "2";
    select.innerHTML = '';
    
    if (totalAmount <= 0) {
      select.innerHTML = '<option value="2">Digite o valor primeiro...</option>';
      return;
    }

    // Generate up to 24 installments
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
    // Map category icon names to Lucide icon names
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
      <button type="button" class="cat-btn ${State.selectedCategory === cat.id ? 'selected' : ''}"
        onclick="App.selectCategory('${cat.id}')">
        <i data-lucide="${iconMap[cat.icon] || 'package'}" style="width:20px;height:20px;"></i>
        <span>${cat.label || labels[cat.id] || cat.id}</span>
      </button>
    `).join('');
    document.getElementById('tx-category').value = State.selectedCategory;
    lucide.createIcons();
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
      lucide.createIcons();
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
      lucide.createIcons();
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

// ─── Init ─────────────────────────────────────────────────────────────────
async function init() {
  // Setup nav clicks
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });

  //  lucide.createIcons();

  // Theme logic
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = themeToggle.querySelector('i');
  
  // Installments logic
  document.getElementById('tx-amount').addEventListener('input', App.updateInstallmentOptions);
  
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
    themeIcon.setAttribute('data-lucide', 'sun');
  }

  themeToggle.addEventListener('click', () => {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.body.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
      themeIcon.setAttribute('data-lucide', 'moon');
    } else {
      document.body.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
      themeIcon.setAttribute('data-lucide', 'sun');
    }
    lucide.createIcons();
  });

  // Close modal on overlay click
  document.getElementById('transaction-modal').addEventListener('click', function(e) {
    if (e.target === this) App.closeModal();
  });

  // Load categories
  try {
    const data = await API.get('/api/transactions/categories');
    State.categories = data;
  } catch (e) {
    console.warn('Could not load categories', e);
  }

  await initMonthSelector();
  await renderPage('dashboard');
}

document.addEventListener('DOMContentLoaded', init);
