// ─── Dashboard Module (Vibrant Purple Fintech Edition) ──────────────────────
const Dashboard = {
  charts: {},
  _lastEvolution: [],

  _catIcon: {
    alimentacao: 'utensils', transporte: 'car', moradia: 'home',
    lazer: 'gamepad-2', saude: 'heart-pulse', educacao: 'book-open',
    salario: 'briefcase', freelance: 'laptop', outros: 'package',
  },

  async render(container, monthKey) {
    const chartPeriodLabel = window.matchMedia('(max-width: 767px)').matches
      ? 'Evolução dos últimos 6 meses'
      : 'Evolução dos últimos 12 meses';

    container.innerHTML = `
      <div class="page-container">
        <!-- Fintech Grid: Hero Balance & Pair Stat Cards -->
        <div class="fintech-dashboard-grid" id="summary-grid">
          ${this._skeletonCards()}
        </div>

        <div class="mobile-quick-actions" aria-label="Atalhos">
          <button type="button" class="mobile-quick-action primary" id="dash-quick-add">
            <span class="mobile-quick-action-icon"><i data-lucide="plus"></i></span>
            <span>Adicionar</span>
          </button>
          <button type="button" class="mobile-quick-action" id="dash-quick-extract">
            <span class="mobile-quick-action-icon"><i data-lucide="arrow-left-right"></i></span>
            <span>Extrato</span>
          </button>
          <button type="button" class="mobile-quick-action" id="dash-quick-advisor">
            <span class="mobile-quick-action-icon"><i data-lucide="sparkles"></i></span>
            <span>Advisor</span>
          </button>
        </div>

        <!-- Dashboard Panels: Bar Chart Overview & Compact Recent List -->
        <div class="fintech-dashboard-grid" style="margin-top:24px;">
          <div class="panel-card evolution">
            <div class="panel-header">
              <div>
                <h3 class="panel-title">Evolução mensal</h3>
                <span class="tx-date">${chartPeriodLabel}</span>
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
    document.getElementById('dash-quick-add')?.addEventListener('click', () => App.openAddModal());
    document.getElementById('dash-quick-extract')?.addEventListener('click', () => openTransactions());
    document.getElementById('dash-quick-advisor')?.addEventListener('click', () => navigate('chat'));

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
      <div class="purple-hero-card dashboard-card-skeleton">
        <span class="skeleton-line skeleton-label"></span>
        <span class="skeleton-line skeleton-value"></span>
      </div>
      <div class="stat-pair-container">
        <div class="fintech-stat-card dashboard-card-skeleton"><span class="skeleton-line skeleton-value small"></span></div>
        <div class="fintech-stat-card dashboard-card-skeleton"><span class="skeleton-line skeleton-value small"></span></div>
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
            <div class="hero-balance-amount" data-sensitive data-value="${escapeHTML(formatCurrency(summary.balance))}">${formatCurrency(summary.balance)}</div>
          </div>
          <button class="hero-privacy-toggle" id="hero-privacy-toggle" type="button" aria-pressed="false" aria-label="Ocultar valores">
            <i data-lucide="eye" aria-hidden="true"></i>
          </button>
        </div>
        <div class="hero-card-footer">
          <button class="hero-month-btn" id="hero-prev-month" type="button" aria-label="Mês anterior">
            <i data-lucide="chevron-left"></i>
          </button>
          <span>${summary.transaction_count} movimentação(ões) no período</span>
          <button class="hero-month-btn" id="hero-next-month" type="button" aria-label="Próximo mês">
            <i data-lucide="chevron-right"></i>
          </button>
        </div>
      </div>

      <!-- Pair Stat Cards (Inspirados na Imagem: Income ↓ e Expense ↑) -->
      <div class="stat-pair-container">
        <button type="button" class="fintech-stat-card income dashboard-stat-link" id="dashboard-income-card" aria-label="Ver receitas no extrato">
          <div class="stat-card-circle-icon">
            <i data-lucide="arrow-down-left" style="width:22px;height:22px;"></i>
          </div>
          <div>
            <div class="stat-card-label">Receita</div>
            <div class="stat-card-amount" data-sensitive data-value="${escapeHTML(formatCurrency(summary.total_income))}">${formatCurrency(summary.total_income)}</div>
          </div>
          <i class="dashboard-card-arrow" data-lucide="arrow-up-right" aria-hidden="true"></i>
        </button>

        <button type="button" class="fintech-stat-card expense dashboard-stat-link" id="dashboard-expense-card" aria-label="Ver despesas no extrato">
          <div class="stat-card-circle-icon">
            <i data-lucide="arrow-up-right" style="width:22px;height:22px;"></i>
          </div>
          <div>
            <div class="stat-card-label">Despesa</div>
            <div class="stat-card-amount" data-sensitive data-value="${escapeHTML(formatCurrency(summary.total_expenses))}">${formatCurrency(summary.total_expenses)}</div>
          </div>
          <i class="dashboard-card-arrow" data-lucide="arrow-up-right" aria-hidden="true"></i>
        </button>
      </div>
    `;

    document.getElementById('dashboard-income-card')?.addEventListener('click', () => openTransactions('income'));
    document.getElementById('dashboard-expense-card')?.addEventListener('click', () => openTransactions('expense'));
    document.getElementById('hero-prev-month')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('hero-next-month')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('hero-privacy-toggle')?.addEventListener('click', () => this.togglePrivacy());

    const hero = grid.querySelector('.purple-hero-card');
    if (hero) {
      let touchStartX = 0;
      hero.addEventListener('touchstart', event => {
        touchStartX = event.changedTouches[0]?.clientX || 0;
      }, { passive: true });
      hero.addEventListener('touchend', event => {
        if (event.target.closest('button')) return;
        const delta = (event.changedTouches[0]?.clientX || 0) - touchStartX;
        if (Math.abs(delta) > 70) changeMonth(delta < 0 ? 1 : -1);
      }, { passive: true });
    }

    this.applyPrivacy();
  },

  applyPrivacy() {
    const hidden = localStorage.getItem('dashboard-values-hidden') === 'true';
    document.querySelectorAll('[data-sensitive]').forEach(element => {
      element.textContent = hidden ? '••••••' : element.dataset.value;
    });
    const button = document.getElementById('hero-privacy-toggle');
    if (button) {
      button.setAttribute('aria-pressed', String(hidden));
      button.setAttribute('aria-label', hidden ? 'Mostrar valores' : 'Ocultar valores');
      button.innerHTML = `<i data-lucide="${hidden ? 'eye-off' : 'eye'}" aria-hidden="true"></i>`;
    }
    if (window.lucide) lucide.createIcons();
  },

  togglePrivacy() {
    const hidden = localStorage.getItem('dashboard-values-hidden') !== 'true';
    localStorage.setItem('dashboard-values-hidden', String(hidden));
    if (window.haptic) window.haptic();
    this.applyPrivacy();
  },

  _renderBarChart(evolution) {
    const canvas = document.getElementById('chart-bar');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const visibleEvolution = isMobile ? evolution.slice(-6) : evolution;
    const labels = visibleEvolution.map(e => formatMonthLabel(e.month_key));
    this._lastEvolution = evolution;
    const styles = getComputedStyle(document.body);
    const incomeColor = styles.getPropertyValue('--income').trim() || '#168866';
    const expenseColor = styles.getPropertyValue('--expense').trim() || '#d64b65';
    const mutedColor = styles.getPropertyValue('--text-muted').trim() || '#718096';
    const gridColor = styles.getPropertyValue('--border').trim() || '#dfe5ee';

    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    this.charts.bar = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Receitas',
            data: visibleEvolution.map(e => e.income),
            backgroundColor: incomeColor,
            borderRadius: 8,
            barPercentage: 0.5,
            categoryPercentage: 0.6,
          },
          {
            label: 'Despesas',
            data: visibleEvolution.map(e => e.expenses),
            backgroundColor: expenseColor,
            borderRadius: 8,
            barPercentage: 0.5,
            categoryPercentage: 0.6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? false
          : { duration: 520, easing: 'easeOutQuart' },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: { color: mutedColor, font: { family: 'Inter', size: 12 }, boxWidth: 10, usePointStyle: true },
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
            ticks: { color: mutedColor, font: { family: 'Inter', size: 11 } }
          },
          y: {
            border: { display: false },
            ticks: {
              color: mutedColor,
              font: { family: 'Inter', size: 11 },
              callback: (v) => 'R$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)
            },
            grid: { color: gridColor }
          }
        },
      },
    });
  },

  refreshTheme() {
    if (this._lastEvolution.length && document.getElementById('chart-bar')) {
      this._renderBarChart(this._lastEvolution);
    }
  },

  _renderRecentTransactions(transactions) {
    const container = document.getElementById('recent-transactions');
    if (!container) return;
    if (!transactions.length) {
      container.innerHTML = `
        <div class="empty-state mascot-empty-state">
          <img class="empty-state-mascot" src="/image/mascot/advisor-thinking.webp" alt="" width="640" height="640" aria-hidden="true" />
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
