// ─── Transactions Module ──────────────────────────────────────────────────────
const Transactions = {
  _catIcon: {
    alimentacao: 'utensils', transporte: 'car', moradia: 'home',
    lazer: 'gamepad-2', saude: 'heart-pulse', educacao: 'book-open',
    salario: 'briefcase', freelance: 'laptop', outros: 'package',
  },
  _allTransactions: [],

  async render(container, monthKey) {
    container.innerHTML = `
      <div class="card">
        <!-- Compact header: count + total -->
        <div class="transactions-header">
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:2px;">
              Transações — ${formatMonthLabel(monthKey)}
            </div>
            <div class="transactions-meta" id="tx-meta-summary">Carregando...</div>
          </div>
          <button class="btn btn-primary" onclick="App.openAddModal()" style="font-size:13px;padding:9px 16px;">
            <i data-lucide="plus" style="width:15px;height:15px;"></i>
            Nova Transação
          </button>
        </div>

        <!-- Filter chips (type) -->
        <div class="filter-chips" id="filter-chips" style="margin-bottom:14px;">
          <button class="filter-chip active" data-type="" onclick="Transactions._setTypeFilter('', this)">Tudo</button>
          <button class="filter-chip" data-type="expense" onclick="Transactions._setTypeFilter('expense', this)">Despesas</button>
          <button class="filter-chip" data-type="income" onclick="Transactions._setTypeFilter('income', this)">Receitas</button>
        </div>

        <!-- Category chips (populated after load) -->
        <div class="filter-chips" id="cat-chips" style="margin-bottom:16px;"></div>

        <div id="tx-list"><div class="loader"><div class="spinner"></div></div></div>
      </div>
    `;

    await this._load(monthKey);
    lucide.createIcons();
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
      <button class="filter-chip" data-cat="${c}" onclick="Transactions._setCatFilter('${c}', this)">
        ${c.charAt(0).toUpperCase() + c.slice(1)}
      </button>
    `).join('');
  },

  _activeType: '',
  _activeCat: '',

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

    // Update meta summary
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
          <button class="btn btn-primary" style="margin-top:12px;" onclick="App.openAddModal()">
            <i data-lucide="plus" style="width:15px;height:15px;"></i> Nova Transação
          </button>
        </div>`;
      lucide.createIcons();
      return;
    }

    // Group by date
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
                  <div class="tx-desc">${tx.description}</div>
                  <div class="tx-meta">
                    <span class="badge ${tx.type}">${tx.type === 'expense' ? 'Despesa' : 'Receita'}</span>
                    · ${tx.category}
                  </div>
                </div>
                <div class="tx-amount ${tx.type}">
                  ${tx.type === 'expense' ? '-' : '+'}${formatCurrency(tx.amount)}
                </div>
                <div class="tx-actions">
                  <button class="btn-icon" title="Editar" onclick='App.openEditModal(${JSON.stringify(tx)})'>
                    <i data-lucide="pencil" style="width:13px;height:13px;"></i>
                  </button>
                  <button class="btn-icon btn-danger" title="Excluir" onclick="App.deleteTransaction('${tx.id}')">
                    <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');

    lucide.createIcons();
  },

  // Called by App after a new transaction is added — entrance animation
  animateNewItem(id) {
    const el = document.getElementById(`tx-${id}`);
    if (el) {
      el.classList.add('tx-enter');
    }
  },
};
