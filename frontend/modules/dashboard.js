// ─── Dashboard Module ───────────────────────────────────────────────────────
const Dashboard = {
  charts: {},

  _catIcon: {
    alimentacao: 'utensils', transporte: 'car', moradia: 'home',
    lazer: 'gamepad-2', saude: 'heart-pulse', educacao: 'book-open',
    salario: 'briefcase', freelance: 'laptop', outros: 'package',
  },

  async render(container, monthKey) {
    container.innerHTML = `
      <div class="summary-grid" id="summary-grid">
        ${this._skeletonCards()}
      </div>
      <div class="charts-grid">
        <div class="card">
          <div class="card-title">Gastos por Categoria</div>
          <div class="chart-container">
            <canvas id="chart-donut"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Evolução — Últimos 12 Meses</div>
          <div class="chart-container" style="height:260px;">
            <canvas id="chart-line"></canvas>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <span>Transações Recentes</span>
          <button class="btn btn-secondary" id="btn-dash-view-all" style="font-size:12px;padding:6px 14px;">Ver todas →</button>
        </div>
        <div id="recent-transactions"><div class="loader"><div class="spinner"></div></div></div>
      </div>
    `;

    document.getElementById('btn-dash-view-all')?.addEventListener('click', () => navigate('transactions'));

    Object.values(this.charts).forEach(c => c.destroy());
    this.charts = {};

    const [summary, byCategory, evolution, transactions] = await Promise.all([
      API.get(`/api/dashboard/summary?month=${monthKey}`),
      API.get(`/api/dashboard/by-category?month=${monthKey}`),
      API.get('/api/dashboard/monthly-evolution?months=12'),
      API.get(`/api/transactions?month=${monthKey}&limit=8`),
    ]);

    this._renderSummaryCards(summary);
    this._renderDonutChart(byCategory);
    this._renderLineChart(evolution);
    this._renderRecentTransactions(transactions);

    if (window.lucide) lucide.createIcons();
  },

  _skeletonCards() {
    return `
      <div class="card-primary" style="opacity:0.5;">
        <div class="balance-hero-label">Saldo do Mês</div>
        <div class="balance-hero-value">—</div>
      </div>
      <div class="summary-card income">
        <div class="summary-label">Receitas</div>
        <div class="summary-value" style="color:var(--text-muted)">—</div>
      </div>
      <div class="summary-card expense">
        <div class="summary-label">Despesas</div>
        <div class="summary-value" style="color:var(--text-muted)">—</div>
      </div>
    `;
  },

  _renderSummaryCards(summary) {
    const grid = document.getElementById('summary-grid');
    if (!grid) return;

    const balanceColor = summary.balance >= 0 ? '#10b981' : '#f43f5e';
    const balanceLabel = summary.balance >= 0 ? 'positivo' : 'negativo';

    grid.innerHTML = `
      <div class="card-primary">
        <div class="balance-hero-label">
          <i data-lucide="wallet" style="width:14px;height:14px;"></i>
          Saldo de ${escapeHTML(formatMonthLabel(summary.month_key))}
        </div>
        <div class="balance-hero-value" style="color:${balanceColor};">
          ${formatCurrency(summary.balance)}
        </div>
        <div class="balance-hero-sub">${summary.transaction_count} transação(ões) · saldo ${balanceLabel}</div>
      </div>
      <div class="summary-card income">
        <div class="summary-label">
          <i data-lucide="trending-up" style="width:14px;height:14px;color:var(--income);"></i>
          Receitas
        </div>
        <div class="summary-value">${formatCurrency(summary.total_income)}</div>
      </div>
      <div class="summary-card expense">
        <div class="summary-label">
          <i data-lucide="trending-down" style="width:14px;height:14px;color:var(--expense);"></i>
          Despesas
        </div>
        <div class="summary-value">${formatCurrency(summary.total_expenses)}</div>
      </div>
    `;
  },

  _renderDonutChart(byCategory) {
    const canvas = document.getElementById('chart-donut');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const colors = [
      '#00b4d8','#10b981','#7c3aed','#f59e0b','#f43f5e',
      '#06b6d4','#8b5cf6','#ec4899','#14b8a6','#a855f7',
    ];

    if (!byCategory.length) {
      canvas.parentElement.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i data-lucide="pie-chart" style="width:28px;height:28px;"></i></div>
          <h3>Sem despesas este mês</h3>
          <p>Adicione uma transação para ver o gráfico</p>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    this.charts.donut = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: byCategory.map(c => c.category),
        datasets: [{
          data: byCategory.map(c => c.total),
          backgroundColor: colors.slice(0, byCategory.length),
          borderColor: 'transparent',
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        animation: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#64748b',
              font: { family: 'Inter', size: 12 },
              padding: 12,
              boxWidth: 10,
              boxHeight: 10,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${formatCurrency(ctx.parsed)} (${byCategory[ctx.dataIndex].percentage}%)`,
            },
          },
        },
      },
    });
  },

  _renderLineChart(evolution) {
    const canvas = document.getElementById('chart-line');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const labels = evolution.map(e => formatMonthLabel(e.month_key));

    const gradientIncome = ctx.createLinearGradient(0, 0, 0, 260);
    gradientIncome.addColorStop(0, 'rgba(16,185,129,0.25)');
    gradientIncome.addColorStop(1, 'rgba(16,185,129,0)');

    const gradientExpense = ctx.createLinearGradient(0, 0, 0, 260);
    gradientExpense.addColorStop(0, 'rgba(244,63,94,0.25)');
    gradientExpense.addColorStop(1, 'rgba(244,63,94,0)');

    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    this.charts.line = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Receitas',
            data: evolution.map(e => e.income),
            borderColor: '#10b981',
            backgroundColor: gradientIncome,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#10b981',
            fill: true,
            tension: 0.4,
          },
          {
            label: 'Despesas',
            data: evolution.map(e => e.expenses),
            borderColor: '#f43f5e',
            backgroundColor: gradientExpense,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#f43f5e',
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { color: '#64748b', font: { family: 'Inter', size: 12 }, boxWidth: 12 },
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
            ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } }
          },
          y: {
            border: { display: false },
            ticks: {
              color: '#64748b',
              font: { family: 'Inter', size: 11 },
              callback: (v) => 'R$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)
            },
            grid: { color: 'rgba(148,163,184,0.15)' }
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
          <div class="empty-state-icon"><i data-lucide="inbox" style="width:28px;height:28px;"></i></div>
          <h3>Nenhuma transação</h3>
          <p>Clique em "Nova Transação" para começar a registrar seus gastos e receitas.</p>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const totalExpenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);

    container.innerHTML = `
      <div class="transactions-meta" style="margin-bottom:10px;">
        ${transactions.length} transação(ões) · ${formatCurrency(totalExpenses)} em despesas
      </div>
      <div class="transactions-list">
        ${transactions.map(tx => this._txItem(tx)).join('')}
      </div>`;

    container.querySelectorAll('.btn-delete-tx').forEach(btn => {
      btn.onclick = () => App.deleteTransaction(btn.dataset.txId);
    });

    if (window.lucide) lucide.createIcons();
  },

  _txItem(tx) {
    const icon = this._catIcon[tx.category] || 'package';
    return `
      <div class="transaction-item">
        <div class="tx-icon ${tx.type}">
          <i data-lucide="${icon}" style="width:18px;height:18px;"></i>
        </div>
        <div class="tx-info">
          <div class="tx-desc">${escapeHTML(tx.description)}</div>
          <div class="tx-meta">${formatDate(tx.date)} · ${escapeHTML(tx.category)}</div>
        </div>
        <div class="tx-amount ${tx.type}">
          ${tx.type === 'expense' ? '-' : '+'}${formatCurrency(tx.amount)}
        </div>
        <div class="tx-actions">
          <button class="btn-icon btn-delete-tx" data-tx-id="${tx.id}" title="Excluir">
            <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
          </button>
        </div>
      </div>`;
  },
};

window.Dashboard = Dashboard;
