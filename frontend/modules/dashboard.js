// ─── Dashboard Module (Vibrant Purple Fintech Edition) ──────────────────────
const Dashboard = {
  charts: {},

  _catIcon: {
    alimentacao: 'utensils', transporte: 'car', moradia: 'home',
    lazer: 'gamepad-2', saude: 'heart-pulse', educacao: 'book-open',
    salario: 'briefcase', freelance: 'laptop', outros: 'package',
  },

  async render(container, monthKey) {
    container.innerHTML = `
      <div class="page-container">
        <!-- Fintech Grid: Hero Balance & Pair Stat Cards -->
        <div class="fintech-dashboard-grid" id="summary-grid">
          ${this._skeletonCards()}
        </div>

        <!-- Dashboard Panels: Bar Chart Overview & Compact Recent List -->
        <div class="fintech-dashboard-grid" style="margin-top:24px;">
          <div class="panel-card evolution">
            <div class="panel-header">
              <div>
                <h3 class="panel-title">Estatística & Visão Geral</h3>
                <span class="tx-date">Evolução dos últimos 12 meses</span>
              </div>
            </div>
            <div class="chart-container" style="height:280px;">
              <canvas id="chart-bar"></canvas>
            </div>
          </div>

          <div class="panel-card recent-tx">
            <div class="panel-header">
              <h3 class="panel-title">Transações Recentes</h3>
              <button class="topbar-btn" id="btn-dash-view-all" style="width:auto;padding:0 12px;font-size:0.8rem;gap:6px;" title="Ver todas">
                <span>Ver todas</span>
                <i data-lucide="arrow-right" style="width:14px;height:14px;"></i>
              </button>
            </div>
            <div id="recent-transactions">
              <div class="loader"><div class="spinner"></div></div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-dash-view-all')?.addEventListener('click', () => navigate('transactions'));

    Object.values(this.charts).forEach(c => c.destroy());
    this.charts = {};

    const [summary, byCategory, evolution, transactions] = await Promise.all([
      API.get(`/api/dashboard/summary?month=${monthKey}`),
      API.get(`/api/dashboard/by-category?month=${monthKey}`),
      API.get('/api/dashboard/monthly-evolution?months=12'),
      API.get(`/api/transactions?month=${monthKey}&limit=6`),
    ]);

    this._renderSummaryCards(summary);
    this._renderBarChart(evolution);
    this._renderRecentTransactions(transactions);

    if (window.lucide) lucide.createIcons();
  },

  _skeletonCards() {
    return `
      <div class="purple-hero-card" style="opacity:0.6;">
        <span class="hero-balance-title">Saldo Disponível</span>
        <span class="hero-balance-amount">R$ ...</span>
      </div>
      <div class="stat-pair-container">
        <div class="fintech-stat-card income" style="opacity:0.6;"><span class="stat-card-amount">—</span></div>
        <div class="fintech-stat-card expense" style="opacity:0.6;"><span class="stat-card-amount">—</span></div>
      </div>
    `;
  },

  _renderSummaryCards(summary) {
    const grid = document.getElementById('summary-grid');
    if (!grid) return;

    grid.innerHTML = `
      <!-- Purple Hero Balance Card -->
      <div class="purple-hero-card">
        <div class="purple-hero-top">
          <div>
            <span class="hero-balance-title">Saldo Disponível · ${escapeHTML(formatMonthLabel(summary.month_key))}</span>
            <div class="hero-balance-amount">${formatCurrency(summary.balance)}</div>
          </div>
          <button class="topbar-btn" id="hero-quick-add" style="background:rgba(255,255,255,0.25);color:#ffffff;border:none;width:48px;height:48px;border-radius:16px;" title="Adicionar Transação">
            <i data-lucide="plus" style="width:24px;height:24px;"></i>
          </button>
        </div>
        <div style="font-size:0.85rem;opacity:0.85;font-weight:500;">
          ${summary.transaction_count} movimentação(ões) cadastradas neste período
        </div>
      </div>

      <!-- Pair Stat Cards (Inspirados na Imagem: Income ↓ e Expense ↑) -->
      <div class="stat-pair-container">
        <div class="fintech-stat-card income">
          <div class="stat-card-circle-icon">
            <i data-lucide="arrow-down-left" style="width:22px;height:22px;"></i>
          </div>
          <div>
            <div class="stat-card-label">Receita</div>
            <div class="stat-card-amount">${formatCurrency(summary.total_income)}</div>
          </div>
        </div>

        <div class="fintech-stat-card expense">
          <div class="stat-card-circle-icon">
            <i data-lucide="arrow-up-right" style="width:22px;height:22px;"></i>
          </div>
          <div>
            <div class="stat-card-label">Despesa</div>
            <div class="stat-card-amount">${formatCurrency(summary.total_expenses)}</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('hero-quick-add')?.addEventListener('click', () => App.openAddModal());
  },

  _renderBarChart(evolution) {
    const canvas = document.getElementById('chart-bar');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const labels = evolution.map(e => formatMonthLabel(e.month_key));

    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    this.charts.bar = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Receitas',
            data: evolution.map(e => e.income),
            backgroundColor: '#10b981',
            borderRadius: 8,
            barPercentage: 0.5,
            categoryPercentage: 0.6,
          },
          {
            label: 'Despesas',
            data: evolution.map(e => e.expenses),
            backgroundColor: '#2563eb',
            borderRadius: 8,
            barPercentage: 0.5,
            categoryPercentage: 0.6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: { color: '#8b5cf6', font: { family: 'Inter', size: 12 }, boxWidth: 10, usePointStyle: true },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            border: { display: false },
            grid: { display: false },
            ticks: { color: '#8b5cf6', font: { family: 'Inter', size: 11 } }
          },
          y: {
            border: { display: false },
            ticks: {
              color: '#8b5cf6',
              font: { family: 'Inter', size: 11 },
              callback: (v) => 'R$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)
            },
            grid: { color: 'rgba(139,92,246,0.1)' }
          }
        },
      },
    });
  },

  _renderRecentTransactions(transactions) {
    const container = document.getElementById('recent-transactions');
    if (!container) return;
    if (!transactions.length) {
      container.innerHTML = `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
          <h3>Nenhuma transação este mês</h3>
          <p>Clique em "+" para adicionar uma movimentação.</p>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = `
      <div class="recent-tx-list">
        ${transactions.map(tx => this._txItemCompact(tx)).join('')}
      </div>`;

    if (window.lucide) lucide.createIcons();
  },

  _txItemCompact(tx) {
    const icon = this._catIcon[tx.category] || 'package';
    return `
      <div class="tx-item-compact">
        <div class="tx-item-left">
          <div class="tx-icon-circle ${tx.type}">
            <i data-lucide="${icon}" style="width:18px;height:18px;"></i>
          </div>
          <div>
            <div class="tx-desc">${escapeHTML(tx.description)}</div>
            <div class="tx-date">${formatDate(tx.date)} · ${escapeHTML(tx.category)}</div>
          </div>
        </div>
        <div class="tx-amount ${tx.type}">
          ${tx.type === 'expense' ? '-' : '+'}${formatCurrency(tx.amount)}
        </div>
      </div>`;
  },
};

window.Dashboard = Dashboard;
