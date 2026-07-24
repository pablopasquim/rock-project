// ─── Chat Module (Rock Advisor) ─────────────────────────────────────────────
const Chat = {
  _history: [],
  _isLoading: false,
  _suggestions: [],
  _summary: null,

  async render(container) {
    try {
      const [sugData, sumData] = await Promise.all([
        API.get('/api/chat/suggestions'),
        API.get(`/api/dashboard/summary?month=${State.currentMonth}`).catch(() => null),
      ]);
      this._suggestions = sugData.suggestions || [];
      this._summary = sumData;
    } catch (e) {
      this._suggestions = ['Onde estou gastando mais?', 'Como economizar?', 'Analise meu saldo.'];
    }

    const smart = this._buildSmartSuggestions(this._suggestions, this._summary);

    container.innerHTML = `
      <div class="advisor-layout">

        <!-- Sidebar Info -->
        <aside class="advisor-sidebar">
          <div class="advisor-brand">
            <div class="advisor-avatar-lg">
              <img src="/image/mascot/advisor-thinking.webp" alt="" width="640" height="640" aria-hidden="true" />
            </div>
            <div>
              <div class="advisor-brand-name">Rock Advisor</div>
              <div class="advisor-brand-status">
                <span class="advisor-status-dot"></span>
                Inteligência Artificial
              </div>
            </div>
          </div>

          <p class="advisor-description">
            Tenho acesso completo aos seus dados financeiros e posso analisar seus gastos, tendências e te dar recomendações personalizadas.
          </p>

          ${this._summary ? this._renderInsightCards(this._summary) : ''}

          <div class="advisor-capabilities">
            <div class="advisor-cap-title">O que posso fazer</div>
            ${[
              ['bar-chart-2', 'Analisar gastos por categoria'],
              ['trending-up', 'Identificar tendências financeiras'],
              ['lightbulb', 'Sugerir formas de economizar'],
              ['target', 'Ajudar com metas financeiras'],
            ].map(([icon, text]) => `
              <div class="advisor-cap-item">
                <i data-lucide="${icon}" style="width:15px;height:15px;color:var(--primary);flex-shrink:0;"></i>
                <span>${text}</span>
              </div>
            `).join('')}
          </div>

          <button class="advisor-new-chat-btn" id="advisor-new-chat">
            <i data-lucide="plus" style="width:15px;height:15px;"></i>
            Nova Conversa
          </button>
        </aside>

        <!-- Chat Area -->
        <div class="advisor-chat-area">

          <!-- Chat Header -->
          <div class="advisor-chat-header">
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="advisor-avatar-sm">
                <svg width="18" height="18" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                  <path d="M18 4L6 28H30L18 4Z" fill="white" opacity="0.9"/>
                  <path d="M18 14L11 28H25L18 14Z" fill="#00b4d8" opacity="0.8"/>
                </svg>
              </div>
              <div>
                <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);">Rock Advisor</div>
                <div style="font-size:0.75rem;color:var(--income);display:flex;align-items:center;gap:4px;">
                  <span style="width:6px;height:6px;border-radius:50%;background:var(--income);display:inline-block;"></span>
                  Online · ${formatMonthLabel(State.currentMonth)}
                </div>
              </div>
            </div>
            <div class="advisor-header-actions">
              <button class="advisor-icon-btn" id="advisor-clear-btn" title="Limpar conversa" aria-label="Limpar conversa">
                <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
              </button>
            </div>
          </div>

          <!-- Messages -->
          <div class="advisor-messages" id="chat-messages">
            ${this._history.length === 0
              ? this._welcomeMessage(this._summary, smart)
              : this._history.map(m => this._renderBubble(m)).join('')}
          </div>

          <!-- Suggestions (only on empty state) -->
          ${this._history.length === 0 ? `
          <div class="advisor-suggestions" id="chat-suggestions">
            ${smart.map((s, idx) => `
              <button class="advisor-suggestion-chip" data-sug-idx="${idx}">
                <i data-lucide="zap" style="width:12px;height:12px;opacity:0.6;flex-shrink:0;"></i>
                ${escapeHTML(s)}
              </button>
            `).join('')}
          </div>` : ''}

          <!-- Input -->
          <div class="advisor-input-row">
            <div class="advisor-input-wrapper">
              <input
                type="text"
                class="advisor-input"
                id="chat-input"
                placeholder="Pergunte sobre seus gastos, tendências ou peça dicas..."
                maxlength="500"
                autocomplete="off"
              />
              <button class="advisor-send-btn" id="chat-send-btn" aria-label="Enviar mensagem">
                <i data-lucide="send" style="width:16px;height:16px;"></i>
              </button>
            </div>
            <div class="advisor-input-hint">Powered by Gemini AI · Seus dados são privados</div>
          </div>

        </div>
      </div>
    `;

    this._bindEvents(smart);
    if (window.lucide) lucide.createIcons();
    this._scrollToBottom();
  },

  _bindEvents(smart) {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const sugContainer = document.getElementById('chat-suggestions');
    const newChatBtn = document.getElementById('advisor-new-chat');
    const clearBtn = document.getElementById('advisor-clear-btn');

    if (input) {
      input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
      };
      // Live enable/disable send button
      input.oninput = () => {
        if (sendBtn) sendBtn.classList.toggle('active', input.value.trim().length > 0);
      };
    }

    if (sendBtn) sendBtn.onclick = () => this.sendMessage();

    if (sugContainer) {
      sugContainer.querySelectorAll('.advisor-suggestion-chip').forEach((chip, idx) => {
        chip.onclick = () => { if (smart[idx]) this.sendSuggestion(smart[idx]); };
      });
    }

    if (newChatBtn) newChatBtn.onclick = () => this._resetChat();
    if (clearBtn) clearBtn.onclick = () => this._resetChat();
  },

  _resetChat() {
    this._history = [];
    const content = document.getElementById('page-content');
    if (content) Chat.render(content);
  },

  _buildSmartSuggestions(fallback, summary) {
    if (!summary) return fallback.slice(0, 4);
    const month = formatMonthLabel(State.currentMonth);
    const s = [];
    if (summary.total_expenses > 0)
      s.push(`Por que meus gastos chegaram a ${formatCurrency(summary.total_expenses)} em ${month}?`);
    if (summary.balance < 0)
      s.push(`Meu saldo está negativo em ${formatCurrency(Math.abs(summary.balance))}. O que fazer?`);
    else
      s.push(`Como otimizar meu saldo de ${formatCurrency(summary.balance)}?`);
    s.push('Quais categorias devo cortar para economizar?');
    s.push('Faça uma análise completa do meu mês.');
    return s.slice(0, 4);
  },

  _renderInsightCards(summary) {
    if (!summary) return '';
    const month = formatMonthLabel(State.currentMonth);
    const balancePositive = summary.balance >= 0;

    return `
      <div class="advisor-insight-cards">
        <div class="advisor-insight-card income">
          <div class="aic-label">Receita ${month}</div>
          <div class="aic-value">${formatCurrency(summary.total_income)}</div>
        </div>
        <div class="advisor-insight-card expense">
          <div class="aic-label">Despesas ${month}</div>
          <div class="aic-value">${formatCurrency(summary.total_expenses)}</div>
        </div>
        <div class="advisor-insight-card ${balancePositive ? 'balance-pos' : 'balance-neg'}">
          <div class="aic-label">Saldo</div>
          <div class="aic-value">${formatCurrency(summary.balance)}</div>
        </div>
      </div>
    `;
  },

  _welcomeMessage(summary, smart) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

    return `
      <div class="advisor-welcome">
        <div class="advisor-welcome-avatar">
          <img src="/image/mascot/advisor-welcome.webp" alt="" width="640" height="640" aria-hidden="true" />
        </div>
        <div class="advisor-welcome-text">
          <div class="advisor-welcome-greeting">${greeting}! Sou o Rock Advisor 👋</div>
          <div class="advisor-welcome-sub">
            Analisei seus dados de <strong>${formatMonthLabel(State.currentMonth)}</strong> e estou pronto para te ajudar. O que gostaria de saber?
          </div>
        </div>
      </div>
    `;
  },

  _renderBubble(msg) {
    const isUser = msg.role === 'user';
    const content = isUser ? escapeHTML(msg.content) : this._parseMarkdown(msg.content);
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    if (isUser) {
      return `
        <div class="advisor-msg-row user">
          <div class="advisor-bubble user">${content}</div>
          <span class="advisor-bubble-time">${time}</span>
        </div>
      `;
    } else {
      return `
        <div class="advisor-msg-row assistant">
          <div class="advisor-avatar-xs">
            <svg width="14" height="14" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <path d="M18 4L6 28H30L18 4Z" fill="white" opacity="0.9"/>
              <path d="M18 14L11 28H25L18 14Z" fill="#00b4d8" opacity="0.8"/>
            </svg>
          </div>
          <div>
            <div class="advisor-bubble assistant md">${content}</div>
            <span class="advisor-bubble-time">${time}</span>
          </div>
        </div>
      `;
    }
  },

  _parseMarkdown(text) {
    if (!text) return '';
    if (!window.DOMPurify) return escapeHTML(text).replace(/\n/g, '<br>');
    const rawHtml = window.marked ? window.marked.parse(text) : escapeHTML(text).replace(/\n/g, '<br>');
    return window.DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li', 'code', 'pre', 'br', 'span', 'blockquote', 'h1', 'h2', 'h3'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    });
  },

  _typingIndicator() {
    return `
      <div id="typing-indicator" class="advisor-msg-row assistant">
        <div class="advisor-avatar-xs">
          <svg width="14" height="14" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <path d="M18 4L6 28H30L18 4Z" fill="white" opacity="0.9"/>
            <path d="M18 14L11 28H25L18 14Z" fill="#00b4d8" opacity="0.8"/>
          </svg>
        </div>
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    `;
  },

  _scrollToBottom() {
    const messages = document.getElementById('chat-messages');
    if (messages) requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
  },

  async sendSuggestion(text) {
    const input = document.getElementById('chat-input');
    if (input) input.value = text;
    const suggestionsEl = document.getElementById('chat-suggestions');
    if (suggestionsEl) { suggestionsEl.style.opacity = '0'; setTimeout(() => suggestionsEl.remove(), 200); }
    await this.sendMessage();
  },

  async sendMessage() {
    if (this._isLoading) return;

    const input = document.getElementById('chat-input');
    const message = input?.value?.trim();
    if (!message) return;

    input.value = '';
    this._isLoading = true;

    const sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.classList.remove('active'); }

    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    // Remove welcome screen
    const welcomeEl = messagesEl.querySelector('.advisor-welcome');
    if (welcomeEl) { welcomeEl.style.opacity = '0'; setTimeout(() => welcomeEl.remove(), 200); }

    // Insert user bubble with animation
    const userRowHtml = `
      <div class="advisor-msg-row user new-msg">
        <div class="advisor-bubble user">${escapeHTML(message)}</div>
        <span class="advisor-bubble-time">${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}</span>
      </div>
    `;
    messagesEl.insertAdjacentHTML('beforeend', userRowHtml);
    messagesEl.insertAdjacentHTML('beforeend', this._typingIndicator());
    this._scrollToBottom();

    // Trigger animation
    requestAnimationFrame(() => {
      messagesEl.querySelectorAll('.new-msg').forEach(el => el.classList.remove('new-msg'));
    });

    try {
      const res = await API.post('/api/chat', {
        message,
        month_key: State.currentMonth,
        history: this._history,
      });

      this._history = res.history;
      document.getElementById('typing-indicator')?.remove();

      const time = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
      messagesEl.insertAdjacentHTML('beforeend', `
        <div class="advisor-msg-row assistant new-msg">
          <div class="advisor-avatar-xs">
            <svg width="14" height="14" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <path d="M18 4L6 28H30L18 4Z" fill="white" opacity="0.9"/>
              <path d="M18 14L11 28H25L18 14Z" fill="#00b4d8" opacity="0.8"/>
            </svg>
          </div>
          <div>
            <div class="advisor-bubble assistant md">${this._parseMarkdown(res.response)}</div>
            <span class="advisor-bubble-time">${time}</span>
          </div>
        </div>
      `);
      requestAnimationFrame(() => {
        messagesEl.querySelectorAll('.new-msg').forEach(el => el.classList.remove('new-msg'));
      });

    } catch (err) {
      document.getElementById('typing-indicator')?.remove();
      const isRateLimit = err.message && err.message.includes('429');
      const errText = isRateLimit
        ? 'Você enviou muitas mensagens. Aguarde um minuto antes de tentar novamente.'
        : 'Não foi possível conectar com o Rock Advisor. Tente novamente.';

      messagesEl.insertAdjacentHTML('beforeend', `
        <div class="advisor-msg-row assistant">
          <div class="advisor-avatar-xs" style="background:var(--expense-bg);">
            <i data-lucide="alert-triangle" style="width:12px;height:12px;color:var(--expense);"></i>
          </div>
          <div class="advisor-bubble assistant" style="border-color:var(--expense);color:var(--expense);">
            ${escapeHTML(errText)}
          </div>
        </div>
      `);
      if (window.lucide) lucide.createIcons();
    } finally {
      this._isLoading = false;
      if (sendBtn) sendBtn.disabled = false;
      this._scrollToBottom();
      input?.focus();
    }
  },
};

window.Chat = Chat;
