// ─── Transactions Module ──────────────────────────────────────────────────────
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
    // Reset dos filtros ao carregar para evitar estado antigo mantido
    this._activeType = '';
    this._activeCat = '';

    container.innerHTML = `
      <div class="card">
        <!-- Compact header: count + total -->
        <div class="transactions-header">
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:2px;">
              Transações — ${escapeHTML(formatMonthLabel(monthKey))}
            </div>
            <div class="transactions-meta" id="tx-meta-summary">Carregando...</div>
          </div>
          <button class="btn btn-primary" id="btn-tx-new" style="font-size:13px;padding:9px 16px;">
            <i data-lucide="plus" style="width:15px;height:15px;"></i>
            Nova Transação
          </button>
        </div>

        <!-- Filter chips (type) -->
        <div class="filter-chips" id="filter-chips" style="margin-bottom:14px;">
          <button class="filter-chip active" data-type="">Tudo</button>
          <button class="filter-chip" data-type="expense">Despesas</button>
          <button class="filter-chip" data-type="income">Receitas</button>
        </div>

        <!-- Category chips (populated after load) -->
        <div class="filter-chips" id="cat-chips" style="margin-bottom:16px;"></div>

        <div id="tx-list"><div class="loader"><div class="spinner"></div></div></div>
      </div>
    `;

    document.getElementById('btn-tx-new')?.addEventListener('click', () => App.openAddModal());

    document.querySelectorAll('#filter-chips .filter-chip').forEach(btn => {
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
      <button class="filter-chip" data-cat="${escapeHTML(c)}">
        ${escapeHTML(c.charAt(0).toUpperCase() + c.slice(1))}
      </button>
    `).join('');

    container.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this._setCatFilter(btn.dataset.cat, btn);
      });
    });
  },

  _setTypeFilter(type, btn) {
    this._activeType = type;
    document.querySelectorAll('#filter-chips .filter-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this._applyFilters();
  },

  _setCatFilter(cat, btn) {
    if (this._activeCat === cat) {
      this._activeCat = '';
      btn.classList.remove('active');
    } else {
      this._activeCat = cat;
      document.querySelectorAll('#cat-chips .filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
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
        ? `${transactions.length} transação(ões) · ${formatCurrency(totalExpenses)} em despesas`
        : 'Nenhum resultado';
    }

    if (!transactions.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <i data-lucide="receipt" style="width:28px;height:28px;"></i>
          </div>
          <h3>Nenhuma transação encontrada</h3>
          <p>Tente outro filtro ou adicione uma nova transação.</p>
          <button class="btn btn-primary" id="btn-tx-empty-new" style="margin-top:12px;">
            <i data-lucide="plus" style="width:15px;height:15px;"></i> Nova Transação
          </button>
        </div>`;
      document.getElementById('btn-tx-empty-new')?.addEventListener('click', () => App.openAddModal());
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
        <div style="margin-bottom:14px;">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;padding:0 2px;">
            ${formatDate(date)}
          </div>
          <div class="transactions-list">
            ${txs.map(tx => `
              <div class="transaction-item" id="tx-${tx.id}">
                <div class="tx-icon ${tx.type}">
                  <i data-lucide="${this._catIcon[tx.category] || 'package'}" style="width:18px;height:18px;"></i>
                </div>
                <div class="tx-info">
                  <div class="tx-desc">${escapeHTML(tx.description)}</div>
                  <div class="tx-meta">
                    <span class="badge ${tx.type}">${tx.type === 'expense' ? 'Despesa' : 'Receita'}</span>
                    · ${escapeHTML(tx.category)}
                  </div>
                </div>
                <div class="tx-amount ${tx.type}">
                  ${tx.type === 'expense' ? '-' : '+'}${formatCurrency(tx.amount)}
                </div>
                <div class="tx-actions">
                  <button class="btn-icon btn-edit-tx" data-tx='${JSON.stringify(tx).replace(/'/g, "&#39;")}' title="Editar">
                    <i data-lucide="pencil" style="width:13px;height:13px;"></i>
                  </button>
                  <button class="btn-icon btn-delete-tx" data-tx-id="${tx.id}" title="Excluir">
                    <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
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

  animateNewItem(id) {
    const el = document.getElementById(`tx-${id}`);
    if (el) {
      el.classList.add('tx-enter');
    }
  },
};

window.Transactions = Transactions;
