// ─── History Module ──────────────────────────────────────────────────────────
const History = {
  _currentMonth: null,
  _availableMonths: [],

  _catIcon: {
    alimentacao: 'utensils', transporte: 'car', moradia: 'home',
    lazer: 'gamepad-2', saude: 'heart-pulse', educacao: 'book-open',
    salario: 'briefcase', freelance: 'laptop', outros: 'package',
  },

  async render(container, monthKey) {
    this._currentMonth = monthKey;

    try {
      const data = await API.get('/api/history/months');
      this._availableMonths = data.months || [];
    } catch (e) {
      this._availableMonths = [];
    }

    container.innerHTML = `
      <div class="history-toolbar">
        <div class="month-nav">
          <button class="btn btn-secondary" id="btn-prev-month" aria-label="Mês anterior">
            <i data-lucide="chevron-left" style="width:16px;height:16px;"></i>
          </button>
          <span class="month-display" id="history-month-display">${escapeHTML(formatMonthLabel(this._currentMonth))}</span>
          <button class="btn btn-secondary" id="btn-next-month" aria-label="Próximo mês">
            <i data-lucide="chevron-right" style="width:16px;height:16px;"></i>
          </button>
        </div>
        <button class="btn btn-secondary" id="btn-export-csv">
          <i data-lucide="download" style="width:14px;height:14px;"></i>
          Exportar CSV
        </button>
      </div>
      <div id="history-content">
        <div class="loader"><div class="spinner"></div></div>
      </div>
    `;

    document.getElementById('btn-prev-month')?.addEventListener('click', () => this.prevMonth());
    document.getElementById('btn-next-month')?.addEventListener('click', () => this.nextMonth());
    document.getElementById('btn-export-csv')?.addEventListener('click', () => this.exportCSV());

    if (window.lucide) lucide.createIcons();
    await this._loadMonth(this._currentMonth);
  },

  async _loadMonth(monthKey) {
    const content = document.getElementById('history-content');
    if (!content) return;
    content.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;

    const [y, m] = monthKey.split('-');
    let prevYear = parseInt(y, 10), prevMonth = parseInt(m, 10) - 1;
    if (prevMonth === 0) { prevMonth = 12; prevYear--; }
    const prevKey = `${prevYear}-${String(prevMonth).padStart(2,'0')}`;

    const [detail, prevDetail] = await Promise.all([
      API.get(`/api/history/${y}/${parseInt(m, 10)}`).catch(() => null),
      API.get(`/api/history/${prevYear}/${prevMonth}`).catch(() => null),
    ]);

    if (!detail) {
      content.innerHTML = `
        <div class="empty-state mascot-empty-state" style="padding:48px 0;">
          <img class="empty-state-mascot" src="/image/mascot/advisor-thinking.webp" alt="" width="640" height="640" aria-hidden="true" />
          <h3>Sem dados em ${escapeHTML(formatMonthLabel(monthKey))}</h3>
          <p>Nenhuma transação registrada neste mês.</p>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    let insightHtml = '';
    if (prevDetail) {
      const expenseDiff = detail.total_expenses - prevDetail.total_expenses;
      const prevLabel = formatMonthLabel(prevKey);

      if (expenseDiff !== 0) {
        const direction = expenseDiff > 0 ? 'cresceram' : 'caíram';
        const color = expenseDiff > 0 ? 'var(--expense)' : 'var(--income)';
        const topCat = detail.by_category?.[0];
        const topCatMsg = topCat
          ? ` <strong>${escapeHTML(topCat.category)}</strong> foi sua maior categoria (${topCat.percentage}%).`
          : '';

        insightHtml = `
          <div class="history-insight">
            Seus gastos <strong style="color:${color}">${direction} ${formatCurrency(Math.abs(expenseDiff))}</strong>
            em relação a ${escapeHTML(prevLabel)}.${topCatMsg}
          </div>`;
      } else {
        insightHtml = `
          <div class="history-insight">
            Seus gastos ficaram <strong>estáveis</strong> em relação a ${escapeHTML(prevLabel)}.
          </div>`;
      }
    }

    const summaryHtml = `
      <div class="summary-grid" style="margin-bottom:20px;">
        <div class="summary-card income">
          <div class="summary-label">
            <i data-lucide="trending-up" style="width:14px;height:14px;color:var(--income);"></i>
            Receitas
          </div>
          <div class="summary-value">${formatCurrency(detail.total_income)}</div>
          ${prevDetail ? `<div class="summary-count">${this._diffBadge(detail.total_income - prevDetail.total_income)}</div>` : ''}
        </div>
        <div class="summary-card expense">
          <div class="summary-label">
            <i data-lucide="trending-down" style="width:14px;height:14px;color:var(--expense);"></i>
            Despesas
          </div>
          <div class="summary-value">${formatCurrency(detail.total_expenses)}</div>
          ${prevDetail ? `<div class="summary-count">${this._diffBadge(detail.total_expenses - prevDetail.total_expenses, true)}</div>` : ''}
        </div>
        <div class="summary-card">
          <div class="summary-label">
            <i data-lucide="wallet" style="width:14px;height:14px;color:var(--primary);"></i>
            Saldo
          </div>
          <div class="summary-value" style="color:${detail.balance >= 0 ? 'var(--income)' : 'var(--expense)'};">
            ${formatCurrency(detail.balance)}
          </div>
          ${prevDetail ? `<div class="summary-count">${this._diffBadge(detail.balance - prevDetail.balance)}</div>` : ''}
        </div>
      </div>`;

    const catsHtml = detail.by_category.length ? `
      <div class="card" style="margin-bottom:16px;">
        <div class="card-title">Gastos por Categoria</div>
        <div style="display:flex;flex-direction:column;gap:14px;">
          ${detail.by_category.map(cat => `
            <div>
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
                <span style="display:flex;align-items:center;gap:7px;color:var(--text-secondary);font-weight:500;">
                  <i data-lucide="${this._catIcon[cat.category] || 'package'}" style="width:14px;height:14px;"></i>
                  ${escapeHTML(cat.category)}
                </span>
                <span style="color:var(--expense);font-weight:600;">
                  ${formatCurrency(cat.total)}
                  <span style="color:var(--text-muted);font-weight:400;"> ${cat.percentage}%</span>
                </span>
              </div>
              <div class="history-bar-track">
                <div class="history-bar-fill" data-pct="${cat.percentage / 100}" style="width:${cat.percentage}%;"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>` : '';

    const totalExpenses = detail.transactions
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);

    const txHtml = `
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div class="card-title" style="margin-bottom:0;">Transações de ${escapeHTML(formatMonthLabel(monthKey))}</div>
          <span class="transactions-meta">${detail.transactions.length} itens · ${formatCurrency(totalExpenses)} em despesas</span>
        </div>
        ${detail.transactions.length ? `
        <div class="transactions-list">
          ${detail.transactions.map(tx => `
            <div class="transaction-item">
              <div class="tx-icon ${tx.type}">
                <i data-lucide="${this._catIcon[tx.category] || 'package'}" style="width:18px;height:18px;"></i>
              </div>
              <div class="tx-info">
                <div class="tx-desc">${escapeHTML(tx.description)}</div>
                <div class="tx-meta">${formatDate(tx.date)} · ${escapeHTML(tx.category)}</div>
              </div>
              <div class="tx-amount ${tx.type}">
                ${tx.type === 'expense' ? '-' : '+'}${formatCurrency(tx.amount)}
              </div>
              <div class="tx-actions">
                <button class="btn-icon btn-danger btn-delete-hist-tx" data-tx-id="${tx.id}" title="Excluir">
                  <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                </button>
              </div>
            </div>
          `).join('')}
        </div>` : `
        <div class="empty-state mascot-empty-state" style="padding:32px 0;">
          <img class="empty-state-mascot compact" src="/image/mascot/advisor-thinking.webp" alt="" width="640" height="640" aria-hidden="true" />
          <h3>Sem transações</h3>
          <p>Nenhuma transação registrada neste mês.</p>
        </div>`}
      </div>`;

    content.innerHTML = insightHtml + summaryHtml + catsHtml + txHtml;

    content.querySelectorAll('.btn-delete-hist-tx').forEach(btn => {
      btn.onclick = () => {
        App.deleteTransaction(btn.dataset.txId).then(() => this._loadMonth(monthKey));
      };
    });

    if (window.lucide) lucide.createIcons();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        content.querySelectorAll('.history-bar-fill').forEach(el => {
          el.classList.add('animate');
        });
      });
    });
  },

  _diffBadge(diff, invertColors = false) {
    const positive = invertColors ? diff <= 0 : diff >= 0;
    const cls = diff === 0 ? 'neutral' : (positive ? 'positive' : 'negative');
    if (diff === 0) return `<span class="diff-badge neutral">Sem alteração</span>`;
    const arrow = diff > 0 ? '↑' : '↓';
    return `<span class="diff-badge ${cls}">${arrow} ${formatCurrency(Math.abs(diff))}</span>`;
  },

  prevMonth() {
    const [y, m] = this._currentMonth.split('-');
    let nm = parseInt(m, 10) - 1, ny = parseInt(y, 10);
    if (nm === 0) { nm = 12; ny--; }
    this._currentMonth = `${ny}-${String(nm).padStart(2,'0')}`;
    State.currentMonth = this._currentMonth;
    const gs = document.getElementById('global-month-select');
    if (gs) gs.value = this._currentMonth;
    const display = document.getElementById('history-month-display');
    if (display) display.textContent = formatMonthLabel(this._currentMonth);
    this._loadMonth(this._currentMonth);
  },

  nextMonth() {
    const [y, m] = this._currentMonth.split('-');
    let nm = parseInt(m, 10) + 1, ny = parseInt(y, 10);
    if (nm === 13) { nm = 1; ny++; }
    this._currentMonth = `${ny}-${String(nm).padStart(2,'0')}`;
    State.currentMonth = this._currentMonth;
    const gs = document.getElementById('global-month-select');
    if (gs) gs.value = this._currentMonth;
    const display = document.getElementById('history-month-display');
    if (display) display.textContent = formatMonthLabel(this._currentMonth);
    this._loadMonth(this._currentMonth);
  },

  async exportCSV() {
    try {
      const headers = {};
      if (window.Auth && typeof window.Auth.getToken === 'function') {
        const token = await window.Auth.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/history/export?month=${this._currentMonth}`, { headers });
      if (!res.ok) {
        toast("Erro ao exportar CSV.", "error");
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transacoes_${this._currentMonth}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Erro ao exportar CSV:", err);
      toast("Falha ao exportar CSV", "error");
    }
  },
};

window.History = History;
