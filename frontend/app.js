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
  _controller: new AbortController(),
  _session: 0,
  cancelReads() { this._controller.abort(); this._controller = new AbortController(); },
  resetSession() { this._session++; this.cancelReads(); },
  async _fetch(path, options = {}) {
    const session = this._session;
    const signal = options.method && options.method !== 'GET'
      ? AbortSignal.timeout(35000)
      : AbortSignal.any([this._controller.signal, AbortSignal.timeout(35000)]);
    const response = await fetch(API_BASE + path, { ...options, signal, cache: 'no-store' });
    if (session !== this._session) throw new DOMException('Sessao encerrada', 'AbortError');
    return response;
  },
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

  async _handleStatus(res) {
    if (res.status === 401) {
      if (window.Auth) window.Auth.logout();
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    if (res.status === 403) {
      toast("Seu e-mail não está autorizado a acessar este sistema.", "error");
      if (window.Auth) window.Auth.logout();
      throw new Error("Acesso não autorizado para este e-mail.");
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = typeof body.detail === 'string' ? body.detail : 'Verifique os campos e tente novamente.';
      throw new Error(`${detail} (${res.status})`);
    }
  },

  async get(path) {
    const headers = await this._getHeaders();
    const res = await this._fetch(path, { headers });
    await this._handleStatus(res);
    return res.json();
  },

  async post(path, body, customHeaders = {}) {
    const headers = await this._getHeaders(customHeaders);
    const res = await this._fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    await this._handleStatus(res);
    return res.json();
  },

  async put(path, body) {
    const headers = await this._getHeaders();
    const res = await this._fetch(path, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    await this._handleStatus(res);
    return res.json();
  },

  async delete(path) {
    const headers = await this._getHeaders();
    const res = await this._fetch(path, { method: 'DELETE', headers });
    await this._handleStatus(res);
    return res.status !== 204 ? res.json() : null;
  },
};

// ─── State ─────────────────────────────────────────────────────────────────
const State = {
  currentPage: 'dashboard',
  currentMonth: new Date().toLocaleDateString('sv').slice(0, 7),  // "YYYY-MM" local
  pendingTransactionFilter: '',
  editingTxId: null,
  editingVersion: 0,
  createAttempt: null,
  selectedType: 'expense',
  selectedCategory: '',
  categories: { expense: [], income: [] },
  lastFocusedElement: null,
  profileLastFocusedElement: null,
};

function haptic(duration = 10) {
  if (window.matchMedia('(pointer: coarse)').matches && navigator.vibrate) {
    navigator.vibrate(duration);
  }
}

window.haptic = haptic;

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

window.toast = toast;

// ─── Month Utilities ────────────────────────────────────────────────────────
function formatMonthLabel(monthKey) {
  if (!monthKey || typeof monthKey !== 'string') return '';
  const [y, m] = monthKey.split('-');
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
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
// ─── Router ─────────────────────────────────────────────────────────────────
const PAGE_META = {
  dashboard: { title: 'Início', subtitle: 'Visão geral do seu mês' },
  transactions: { title: 'Transações', subtitle: 'Adicione e gerencie suas transações' },
  history: { title: 'Histórico', subtitle: 'Navegue pelos seus meses anteriores' },
  chat: { title: 'Rock Advisor', subtitle: 'Seu guia financeiro com inteligência artificial' },
};

function pageSkeleton(page) {
  if (page === 'dashboard') {
    return `
      <div class="page-skeleton dashboard-skeleton" aria-label="Carregando visão financeira" aria-busy="true">
        <div class="skeleton-block skeleton-hero"></div>
        <div class="skeleton-pair">
          <div class="skeleton-block skeleton-stat"></div>
          <div class="skeleton-block skeleton-stat"></div>
        </div>
        <div class="skeleton-block skeleton-panel"></div>
      </div>`;
  }

  return `
    <div class="page-skeleton" aria-label="Carregando conteúdo" aria-busy="true">
      <div class="skeleton-block skeleton-heading"></div>
      <div class="skeleton-block skeleton-row"></div>
      <div class="skeleton-block skeleton-row"></div>
      <div class="skeleton-block skeleton-row"></div>
    </div>`;
}

function changeMonth(step) {
  const [year, month] = State.currentMonth.split('-').map(Number);
  const next = new Date(year, month - 1 + step, 1);
  State.currentMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;

  haptic();
  renderPage(State.currentPage);
}

function openTransactions(type = '') {
  State.pendingTransactionFilter = type;
  navigate('transactions');
}

window.changeMonth = changeMonth;
window.openTransactions = openTransactions;

function navigate(page) {
  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(el => {
    const isActive = el.dataset.page === page;
    el.classList.toggle('active', isActive);
    if (isActive) {
      el.setAttribute('aria-current', 'page');
    } else {
      el.removeAttribute('aria-current');
    }
  });

  const meta = PAGE_META[page] || {};
  document.getElementById('page-title').textContent = meta.title || page;
  document.getElementById('page-subtitle').textContent = meta.subtitle || '';

  if (State.currentPage === page) return;
  State.currentPage = page;
  renderPage(page);
}

let renderGeneration = 0;
async function renderPage(page) {
  const generation = ++renderGeneration;
  API.cancelReads();
  const content = document.getElementById('page-content');
  if (!content) return;
  content.setAttribute('aria-busy', 'true');
  content.classList.remove('page-ready');
  content.classList.add('page-loading');
  content.innerHTML = pageSkeleton(page);

  try {
    switch (page) {
      case 'dashboard': await Dashboard.render(content, State.currentMonth); break;
      case 'transactions': await Transactions.render(content, State.currentMonth); break;
      case 'history': await History.render(content, State.currentMonth); break;
      case 'chat': await Chat.render(content); break;
      default: content.innerHTML = '<p>Página não encontrada</p>';
    }
  } catch (err) {
    if (generation !== renderGeneration || err.name === "AbortError") return;
    console.error(err.name);
    content.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <h3>Ocorreu um erro</h3>
        <p>Não foi possível carregar as informações. Tente novamente.</p>
      </div>`;
  }

  if (generation !== renderGeneration) return;
  content.classList.remove('page-loading');
  content.removeAttribute('aria-busy');
  requestAnimationFrame(() => content.classList.add('page-ready'));
  if (window.lucide) lucide.createIcons();
}

// ─── Modal App Controller ────────────────────────────────────────────────────
const App = {
  async openAddModal() {
    State.lastFocusedElement = document.activeElement;
    State.editingTxId = null;
    State.createAttempt = null;
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
    document.getElementById('app')?.setAttribute('inert', '');
    requestAnimationFrame(() => document.getElementById('modal-close-btn')?.focus());
    document.body.classList.add('modal-open');
    modal.querySelector('.modal-content')?.scrollTo({ top: 0 });
    if (window.matchMedia('(min-width: 768px)').matches) {
      document.getElementById('tx-amount').focus();
    }
    setTimeout(() => lucide.createIcons(), 50);
  },

  async openEditModal(tx) {
    State.lastFocusedElement = document.activeElement;
    State.editingTxId = tx.id;
    State.editingVersion = tx.version || 0;
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
    document.getElementById('app')?.setAttribute('inert', '');
    requestAnimationFrame(() => document.getElementById('modal-close-btn')?.focus());
    document.body.classList.add('modal-open');
    modal.querySelector('.modal-content')?.scrollTo({ top: 0 });
    if (window.matchMedia('(min-width: 768px)').matches) {
      document.getElementById('tx-amount').focus();
    }
    setTimeout(() => lucide.createIcons(), 50);
  },

  closeModal() {
    const modal = document.getElementById('transaction-modal');
    modal.style.display = 'none';
    document.getElementById('app')?.removeAttribute('inert');
    document.body.classList.remove('modal-open');
    if (State.lastFocusedElement && typeof State.lastFocusedElement.focus === 'function') {
      State.lastFocusedElement.focus();
    }
  },

  syncProfileTheme() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const label = document.getElementById('profile-theme-label');
    const icon = document.getElementById('profile-theme-icon');
    if (label) label.textContent = isDark ? 'Usar modo claro' : 'Usar modo escuro';
    if (icon) icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    if (window.lucide) lucide.createIcons();
  },

  openProfileSheet() {
    const sheet = document.getElementById('mobile-profile-sheet');
    if (!sheet) return;
    State.profileLastFocusedElement = document.activeElement;
    document.getElementById('profile-sheet-actions').hidden = false;
    document.getElementById('profile-logout-confirm').hidden = true;
    sheet.hidden = false;
    document.body.classList.add('modal-open');
    document.querySelector('.main-wrapper')?.setAttribute('inert', '');
    document.querySelector('.mobile-nav')?.setAttribute('inert', '');
    App.syncProfileTheme();
    requestAnimationFrame(() => document.getElementById('profile-sheet-close')?.focus());
  },

  closeProfileSheet() {
    const sheet = document.getElementById('mobile-profile-sheet');
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    document.body.classList.remove('modal-open');
    document.querySelector('.main-wrapper')?.removeAttribute('inert');
    document.querySelector('.mobile-nav')?.removeAttribute('inert');
    if (State.profileLastFocusedElement && typeof State.profileLastFocusedElement.focus === 'function') {
      State.profileLastFocusedElement.focus();
    }
  },

  showLogoutConfirmation() {
    document.getElementById('profile-sheet-actions').hidden = true;
    const confirmation = document.getElementById('profile-logout-confirm');
    confirmation.hidden = false;
    if (window.haptic) window.haptic();
    requestAnimationFrame(() => document.getElementById('profile-logout-cancel')?.focus());
  },

  hideLogoutConfirmation() {
    document.getElementById('profile-sheet-actions').hidden = false;
    document.getElementById('profile-logout-confirm').hidden = true;
    requestAnimationFrame(() => document.getElementById('profile-logout-action')?.focus());
  },

  async confirmLogout() {
    const button = document.getElementById('profile-logout-confirm-btn');
    button.disabled = true;
    button.textContent = 'Saindo...';
    try {
      if (window.haptic) window.haptic(18);
      if (window.Auth) await window.Auth.logout();
      App.closeProfileSheet();
    } finally {
      button.disabled = false;
      button.textContent = 'Sair da conta';
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
      alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
      lazer: 'Lazer', saude: 'Saúde', educacao: 'Educação',
      salario: 'Salário', freelance: 'Freelance', outros: 'Outros',
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
    haptic();
    document.getElementById('tx-category').value = id;
    App.renderCategories();
  },

  async submitTransaction(e) {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>';

    const payload = {
      type: State.selectedType,
      amount: parseFloat(document.getElementById('tx-amount').value),
      date: document.getElementById('tx-date').value,
      description: document.getElementById('tx-description').value.trim(),
      category: State.selectedCategory,
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
        await API.put(`/api/transactions/${State.editingTxId}`, { ...payload, expected_version: State.editingVersion });
        toast('Transação atualizada!', 'success');
      } else {
        const fingerprint = JSON.stringify(payload);
        if (!State.createAttempt || State.createAttempt.fingerprint !== fingerprint) {
          State.createAttempt = { fingerprint, key: crypto.randomUUID() };
        }
        await API.post('/api/transactions', payload, { 'Idempotency-Key': State.createAttempt.key });
        State.createAttempt = null;
        toast('Transação adicionada!', 'success');
      }
      haptic(18);
      App.closeModal();
      renderPage(State.currentPage);
    } catch (err) {
      if (err.name !== 'AbortError') toast(err.message || 'Erro ao salvar transacao', 'error');
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
      haptic(18);
      renderPage(State.currentPage);
    } catch (err) {
      toast('Erro ao excluir', 'error');
    }
  },
};

window.App = App;

// ─── Setup Event Listeners & Auth Init ───────────────────────────────────────
window.onAppInit = async function () {
  State.currentPage = 'dashboard';
  State.pendingTransactionFilter = '';
  document.querySelectorAll('[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === 'dashboard');
    if (el.dataset.page === 'dashboard') el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  try {
    const data = await API.get('/api/transactions/categories');
    State.categories = data;
  } catch (e) {
    console.warn('Could not load categories', e);
  }
  await renderPage('dashboard');
};

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }

  const typingText = document.querySelector('[data-typing-text]');
  if (typingText) {
    const fullText = typingText.dataset.typingText || '';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      typingText.textContent = fullText;
      typingText.classList.add('is-complete');
    } else {
      let characterIndex = 0;

      const typeNextCharacter = () => {
        characterIndex += 1;
        typingText.textContent = fullText.slice(0, characterIndex);

        if (characterIndex >= fullText.length) {
          typingText.classList.add('is-complete');
          return;
        }

        const currentCharacter = fullText[characterIndex - 1];
        const delay = currentCharacter === ',' ? 190 : currentCharacter === ' ' ? 24 : 38;
        window.setTimeout(typeNextCharacter, delay);
      };

      window.setTimeout(typeNextCharacter, 420);
    }
  }

  // Navigation
  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(el => {
    if (el.classList.contains('active')) {
      el.setAttribute('aria-current', 'page');
    }
    el.addEventListener('click', (e) => {
      e.preventDefault();
      haptic();
      navigate(el.dataset.page);
    });
  });

  // Login form submit
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (window.Auth && window.Auth.isDevBypass) {
        window.Auth._showMainApp();
        return;
      }

      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const btn = document.getElementById('login-btn');
      const errEl = document.getElementById('login-error-msg');
      const originalButtonContent = btn.innerHTML;

      if (errEl) errEl.style.display = 'none';
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = '<span class="login-btn-spinner" aria-hidden="true"></span><span>Verificando acesso...</span>';

      try {
        await window.Auth.login(email, password);
      } catch (err) {
        console.error("Erro no login Firebase:", err);
        let errorText = "Erro ao realizar login. Tente novamente.";
        const code = err.code || "";

        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
          errorText = "E-mail ou senha incorretos. Verifique se a conta foi cadastrada e tente novamente.";
        } else if (code === 'auth/invalid-api-key') {
          errorText = "FIREBASE_API_KEY inválida. Verifique o arquivo backend/.env";
        } else if (code === 'auth/user-disabled') {
          errorText = "Esta conta de usuário foi desativada.";
        } else if (err.message) {
          errorText = err.message;
        }

        if (errEl) {
          errEl.textContent = errorText;
          errEl.style.display = 'block';
        }
      } finally {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.innerHTML = originalButtonContent;
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }

  // Click direct no botão de login em Dev Bypass
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', (e) => {
      if (window.Auth && window.Auth.isDevBypass) {
        e.preventDefault();
        window.Auth._showMainApp();
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

  // Mobile FAB button
  const mobileFab = document.getElementById('btn-mobile-fab');
  if (mobileFab) mobileFab.addEventListener('click', () => App.openAddModal());

  document.getElementById('mobile-profile-btn')?.addEventListener('click', () => App.openProfileSheet());
  document.getElementById('profile-sheet-close')?.addEventListener('click', () => App.closeProfileSheet());
  document.getElementById('profile-theme-action')?.addEventListener('click', () => {
    document.getElementById('theme-toggle')?.click();
    App.syncProfileTheme();
  });
  document.getElementById('profile-logout-action')?.addEventListener('click', () => App.showLogoutConfirmation());
  document.getElementById('profile-logout-cancel')?.addEventListener('click', () => App.hideLogoutConfirmation());
  document.getElementById('profile-logout-confirm-btn')?.addEventListener('click', () => App.confirmLogout());

  const profileSheet = document.getElementById('mobile-profile-sheet');
  if (profileSheet) {
    profileSheet.addEventListener('click', event => {
      if (event.target === profileSheet) App.closeProfileSheet();
    });

    profileSheet.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const focusable = [...profileSheet.querySelectorAll('button:not([hidden]):not([disabled])')]
        .filter(element => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    const profileHeader = profileSheet.querySelector('.profile-sheet-header');
    let profileTouchStartY = 0;
    profileHeader?.addEventListener('touchstart', event => {
      profileTouchStartY = event.changedTouches[0]?.clientY || 0;
    }, { passive: true });
    profileHeader?.addEventListener('touchend', event => {
      const touchEndY = event.changedTouches[0]?.clientY || 0;
      if (touchEndY - profileTouchStartY > 72) App.closeProfileSheet();
    }, { passive: true });
  }

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

  const modalHeader = document.querySelector('.modal-header');
  if (modalHeader) {
    let touchStartY = 0;
    modalHeader.addEventListener('touchstart', (event) => {
      touchStartY = event.changedTouches[0]?.clientY || 0;
    }, { passive: true });
    modalHeader.addEventListener('touchend', (event) => {
      const touchEndY = event.changedTouches[0]?.clientY || 0;
      if (touchEndY - touchStartY > 72) {
        haptic();
        App.closeModal();
      }
    }, { passive: true });
  }

  document.getElementById('transaction-modal')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const elements = [...event.currentTarget.querySelectorAll('button, input, select, textarea, [tabindex="0"]')]
      .filter(el => !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const first = elements[0], last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const profileSheet = document.getElementById('mobile-profile-sheet');
      if (profileSheet && !profileSheet.hidden) {
        App.closeProfileSheet();
        return;
      }
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
    const savedTheme = document.body.getAttribute('data-theme') || 'light';
    if (savedTheme === 'dark') {
      document.body.setAttribute('data-theme', 'dark');
      if (themeIcon) themeIcon.setAttribute('data-lucide', 'sun');
    }

    themeToggle.addEventListener('click', () => {
      const isDark = document.body.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        if (themeIcon) themeIcon.setAttribute('data-lucide', 'moon');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        if (themeIcon) themeIcon.setAttribute('data-lucide', 'sun');
      }
      if (window.Dashboard && typeof window.Dashboard.refreshTheme === 'function') {
        window.Dashboard.refreshTheme();
      }
      if (window.lucide) lucide.createIcons();
    });
  }

  // Inicializa o módulo Auth
  if (window.Auth) window.Auth.init();
});

window.resetFinanceSession = function () {
  ++renderGeneration;
  API.resetSession();
  Chat._history = [];
  Chat._summary = null;
  Chat._isLoading = false;
  Transactions._allTransactions = [];
  Dashboard._lastEvolution = [];
  Object.values(Dashboard.charts).forEach(chart => chart.destroy());
  Dashboard.charts = {};
  State.createAttempt = null;
  State.editingTxId = null;
  State.lastFocusedElement = null;
  App.closeModal();
  App.closeProfileSheet();
  document.getElementById('transaction-form')?.reset();
  document.getElementById('page-content')?.replaceChildren();
};
