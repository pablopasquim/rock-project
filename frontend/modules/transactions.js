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
    this._activeType = State.pendingTransactionFilter || '';
    State.pendingTransactionFilter = '';
    this._activeCat = '';

    container.innerHTML = `
      <div class="panel-card transactions-panel">
        <!-- Compact Header -->
        <div class="module-header">
          <div>
            <h2 class="panel-title">Transações · ${escapeHTML(formatMonthLabel(monthKey))}</h2>
            <span class="tx-date" id="tx-meta-summary">Carregando extrato...</span>
          </div>
          <button class="btn-primary-cockpit" id="btn-tx-new">
            <i data-lucide="plus" style="width:16px;height:16px;"></i>
            <span>Nova Transação</span>
          </button>
        </div>

        <!-- Filter Chips Type -->
        <div class="filter-row" id="filter-chips" aria-label="Filtrar por tipo">
          <button class="topbar-btn filter-chip ${this._activeType ? '' : 'active'}" data-type="">Tudo</button>
          <button class="topbar-btn filter-chip ${this._activeType === 'expense' ? 'active' : ''}" data-type="expense">Despesas</button>
          <button class="topbar-btn filter-chip ${this._activeType === 'income' ? 'active' : ''}" data-type="income">Receitas</button>
        </div>

        <!-- Filter Chips Category -->
        <div class="filter-row category-filters" id="cat-chips" aria-label="Filtrar por categoria"></div>

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
    this._month = monthKey;
    this._allTransactions = [];
    await this._loadMore();
  },

  async _loadMore(cursor = '') {
    const month = this._month;
    const result = await API.get(`/api/transactions/page?month=${month}&limit=200${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    if (State.currentPage !== 'transactions' || month !== this._month) return;
    this._allTransactions.push(...result.items);
    this._nextCursor = result.next_cursor;
    this._buildCatChips(this._allTransactions);
    this._applyFilters();
  },

  _buildCatChips(txs) {
    const cats = [...new Set(txs.map(t => t.category))].sort();
    const container = document.getElementById('cat-chips');
    if (!container || !cats.length) return;

    container.innerHTML = cats.map(c => `
      <button class="topbar-btn filter-chip" data-cat="${escapeHTML(c)}">
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
      b.classList.remove('active');
    });
    btn.classList.add('active');
    this._applyFilters();
  },

  _setCatFilter(cat, btn) {
    if (this._activeCat === cat) {
      this._activeCat = '';
      btn.classList.remove('active');
    } else {
      this._activeCat = cat;
      document.querySelectorAll('#cat-chips .topbar-btn').forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
    }
    this._applyFilters();
  },

  _applyFilters() {
    let filtered = this._allTransactions;
    if (this._activeType) filtered = filtered.filter(t => t.type === this._activeType);
    if (this._activeCat)  filtered = filtered.filter(t => t.category === this._activeCat);
    this._render(filtered);
    if (this._nextCursor) {
      const list = document.getElementById('tx-list');
      const button = document.createElement('button');
      button.className = 'btn btn-secondary';
      button.textContent = 'Carregar mais transacoes (filtros aplicados aos itens carregados)';
      button.onclick = async () => { button.disabled = true; try { await this._loadMore(this._nextCursor); } catch (e) { button.disabled = false; toast(e.message, 'error'); } };
      list?.appendChild(button);
    }
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
        <div class="empty-state mascot-empty-state">
          <img class="empty-state-mascot" src="/image/mascot/advisor-thinking.webp" alt="" width="640" height="640" aria-hidden="true" />
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
        <section class="transaction-day">
          <div class="transaction-day-label">
            ${formatDate(date)}
          </div>
          <div class="recent-tx-list">
            ${txs.map(tx => `
              <div class="tx-item-compact transaction-row-interactive" id="tx-${tx.id}" data-tx='${escapeHTML(JSON.stringify(tx))}' role="button" tabindex="0" aria-label="Editar ${escapeHTML(tx.description)}">
                <div class="tx-item-left">
                  <div class="tx-icon-circle ${tx.type}">
                    <i data-lucide="${this._catIcon[tx.category] || 'package'}" style="width:18px;height:18px;"></i>
                  </div>
                  <div>
                    <div class="tx-desc">${escapeHTML(tx.description)}</div>
                    <div class="tx-date">${escapeHTML(tx.category)}</div>
                  </div>
                </div>
                <div class="tx-item-actions">
                  <div class="tx-amount ${tx.type}">
                    ${tx.type === 'expense' ? '-' : '+'}${formatCurrency(tx.amount)}
                  </div>
                  <button class="topbar-btn tx-action-btn btn-edit-tx" data-tx='${escapeHTML(JSON.stringify(tx))}' title="Editar" aria-label="Editar ${escapeHTML(tx.description)}">
                    <i data-lucide="pencil" style="width:14px;height:14px;"></i>
                  </button>
                  <button class="topbar-btn tx-action-btn btn-delete-tx" data-tx-id="${tx.id}" title="Excluir" aria-label="Excluir ${escapeHTML(tx.description)}">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </section>
      `).join('');

    container.querySelectorAll('.btn-edit-tx').forEach(btn => {
      btn.onclick = event => {
        event.stopPropagation();
        try {
          const txData = JSON.parse(btn.dataset.tx);
          App.openEditModal(txData);
        } catch (e) {
          console.error(e);
        }
      };
    });

    container.querySelectorAll('.btn-delete-tx').forEach(btn => {
      btn.onclick = event => {
        event.stopPropagation();
        App.deleteTransaction(btn.dataset.txId);
      };
    });

    container.querySelectorAll('.transaction-row-interactive').forEach(row => {
      const openEditor = () => {
        try {
          if (window.haptic) window.haptic();
          App.openEditModal(JSON.parse(row.dataset.tx));
        } catch (error) {
          console.error(error);
        }
      };
      row.addEventListener('click', event => {
        if (!event.target.closest('button')) openEditor();
      });
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openEditor();
        }
      });
    });

    if (window.lucide) lucide.createIcons();
  },
};

window.Transactions = Transactions;
