// ─── Transactions Module (Vibrant Purple Fintech Edition) ───────────────────
const Transactions = {
  _catIcon: {
    alimentacao: 'utensils', transporte: 'car', moradia: 'home',
    lazer: 'gamepad-2', saude: 'heart-pulse', educacao: 'book-open',
    salario: 'briefcase', freelance: 'laptop', outros: 'package',
  },
  _allTransactions: [],
  _activeType: '',
  _activeCat: '',

  async render(container, monthKey) {
    this._activeType = '';
    this._activeCat = '';

    container.innerHTML = `
      <div class="panel-card" style="padding:32px;">
        <!-- Compact Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
          <div>
            <h2 class="panel-title" style="font-size:1.2rem;">Transações · ${escapeHTML(formatMonthLabel(monthKey))}</h2>
            <span class="tx-date" id="tx-meta-summary">Carregando extrato...</span>
          </div>
          <button class="btn-primary-cockpit" id="btn-tx-new">
            <i data-lucide="plus" style="width:16px;height:16px;"></i>
            <span>Nova Transação</span>
          </button>
        </div>

        <!-- Filter Chips Type -->
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;" id="filter-chips">
          <button class="topbar-btn active" data-type="" style="width:auto;padding:6px 16px;border-radius:20px;background:var(--primary);color:#fff;border:none;">Tudo</button>
          <button class="topbar-btn" data-type="expense" style="width:auto;padding:6px 16px;border-radius:20px;">Despesas</button>
          <button class="topbar-btn" data-type="income" style="width:auto;padding:6px 16px;border-radius:20px;">Receitas</button>
        </div>

        <!-- Filter Chips Category -->
        <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;" id="cat-chips"></div>

        <div id="tx-list"><div class="loader"><div class="spinner"></div></div></div>
      </div>
    `;

    document.getElementById('btn-tx-new')?.addEventListener('click', () => App.openAddModal());

    document.querySelectorAll('#filter-chips .topbar-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._setTypeFilter(btn.dataset.type, btn);
      });
    });

    await this._load(monthKey);
    if (window.lucide) lucide.createIcons();
  },

  async _load(monthKey) {
    const txs = await API.get(`/api/transactions?month=${monthKey}&limit=200`);
    this._allTransactions = txs;
    this._buildCatChips(txs);
    this._render(txs);
  },

  _buildCatChips(txs) {
    const cats = [...new Set(txs.map(t => t.category))].sort();
    const container = document.getElementById('cat-chips');
    if (!container || !cats.length) return;

    container.innerHTML = cats.map(c => `
      <button class="topbar-btn" data-cat="${escapeHTML(c)}" style="width:auto;padding:4px 14px;font-size:0.8rem;border-radius:18px;">
        ${escapeHTML(c.charAt(0).toUpperCase() + c.slice(1))}
      </button>
    `).join('');

    container.querySelectorAll('.topbar-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._setCatFilter(btn.dataset.cat, btn);
      });
    });
  },

  _setTypeFilter(type, btn) {
    this._activeType = type;
    document.querySelectorAll('#filter-chips .topbar-btn').forEach(b => {
      b.style.background = 'var(--bg-surface)';
      b.style.color = 'var(--text-secondary)';
      b.style.border = '1px solid var(--border)';
    });
    btn.style.background = 'var(--primary)';
    btn.style.color = '#ffffff';
    btn.style.border = 'none';
    this._applyFilters();
  },

  _setCatFilter(cat, btn) {
    if (this._activeCat === cat) {
      this._activeCat = '';
      btn.style.background = 'var(--bg-surface)';
      btn.style.color = 'var(--text-secondary)';
    } else {
      this._activeCat = cat;
      document.querySelectorAll('#cat-chips .topbar-btn').forEach(b => {
        b.style.background = 'var(--bg-surface)';
        b.style.color = 'var(--text-secondary)';
      });
      btn.style.background = 'var(--primary)';
      btn.style.color = '#ffffff';
    }
    this._applyFilters();
  },

  _applyFilters() {
    let filtered = this._allTransactions;
    if (this._activeType) filtered = filtered.filter(t => t.type === this._activeType);
    if (this._activeCat)  filtered = filtered.filter(t => t.category === this._activeCat);
    this._render(filtered);
  },

  _render(transactions) {
    const container = document.getElementById('tx-list');
    if (!container) return;

    const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
    const metaEl = document.getElementById('tx-meta-summary');
    if (metaEl) {
      metaEl.textContent = transactions.length
        ? `${transactions.length} movimentações no período · ${formatCurrency(totalExpenses)} em despesas`
        : 'Nenhum resultado';
    }

    if (!transactions.length) {
      container.innerHTML = `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
          <h3>Nenhuma transação encontrada</h3>
          <p>Tente remover os filtros ou adicione uma nova transação.</p>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const grouped = {};
    transactions.forEach(tx => {
      if (!grouped[tx.date]) grouped[tx.date] = [];
      grouped[tx.date].push(tx);
    });

    container.innerHTML = Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, txs]) => `
        <div style="margin-bottom:18px;">
          <div style="font-size:0.8rem;color:var(--text-muted);font-weight:700;letter-spacing:0.04em;margin-bottom:10px;padding-left:4px;">
            ${formatDate(date)}
          </div>
          <div class="recent-tx-list">
            ${txs.map(tx => `
              <div class="tx-item-compact" id="tx-${tx.id}">
                <div class="tx-item-left">
                  <div class="tx-icon-circle ${tx.type}">
                    <i data-lucide="${this._catIcon[tx.category] || 'package'}" style="width:18px;height:18px;"></i>
                  </div>
                  <div>
                    <div class="tx-desc">${escapeHTML(tx.description)}</div>
                    <div class="tx-date">${escapeHTML(tx.category)}</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                  <div class="tx-amount ${tx.type}">
                    ${tx.type === 'expense' ? '-' : '+'}${formatCurrency(tx.amount)}
                  </div>
                  <button class="topbar-btn btn-edit-tx" data-tx='${JSON.stringify(tx).replace(/'/g, "&#39;")}' title="Editar" style="width:30px;height:30px;border:none;">
                    <i data-lucide="pencil" style="width:14px;height:14px;"></i>
                  </button>
                  <button class="topbar-btn btn-delete-tx" data-tx-id="${tx.id}" title="Excluir" style="width:30px;height:30px;border:none;color:var(--expense);">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');

    container.querySelectorAll('.btn-edit-tx').forEach(btn => {
      btn.onclick = () => {
        try {
          const txData = JSON.parse(btn.dataset.tx);
          App.openEditModal(txData);
        } catch (e) {
          console.error(e);
        }
      };
    });

    container.querySelectorAll('.btn-delete-tx').forEach(btn => {
      btn.onclick = () => App.deleteTransaction(btn.dataset.txId);
    });

    if (window.lucide) lucide.createIcons();
  },
};

window.Transactions = Transactions;
