// ─── Chat Module ─────────────────────────────────────────────────────────────
const Chat = {
  _history: [],
  _isLoading: false,

  async render(container) {
    // Load suggestions and summary in parallel
    let suggestions = [];
    let summary = null;

    try {
      const [sugData, sumData] = await Promise.all([
        API.get('/api/chat/suggestions'),
        API.get(`/api/dashboard/summary?month=${State.currentMonth}`).catch(() => null),
      ]);
      suggestions = sugData.suggestions;
      summary = sumData;
    } catch (e) {
      suggestions = [
        'Onde estou gastando mais este mês?',
        'Como posso economizar agora?',
        'Analise meu saldo atual.',
      ];
    }

    // Build context-aware suggestions from real data
    const smartSuggestions = this._buildSmartSuggestions(suggestions, summary);

    container.innerHTML = `
      <div class="card chat-layout">
        <!-- Messages -->
        <div class="chat-messages" id="chat-messages">
          ${this._history.length === 0
            ? this._welcomeMessage(summary)
            : this._history.map(m => this._renderBubble(m)).join('')}
        </div>

        <!-- Suggestions (only on empty state) -->
        ${this._history.length === 0 ? `
        <div class="chat-suggestions" id="chat-suggestions">
          ${smartSuggestions.map(s => `
            <button class="suggestion-chip" onclick="Chat.sendSuggestion('${s.replace(/'/g, "\\'")}')">
              ${s}
            </button>
          `).join('')}
        </div>` : ''}

        <!-- Input -->
        <div class="chat-input-area">
          <input
            type="text"
            class="chat-input"
            id="chat-input"
            placeholder="Pergunte sobre suas finanças..."
            maxlength="500"
            autocomplete="off"
            onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();Chat.sendMessage();}"
          />
          <button class="btn btn-primary" id="chat-send-btn" onclick="Chat.sendMessage()" style="padding:10px 18px;" aria-label="Enviar">
            <i data-lucide="send" style="width:16px;height:16px;"></i>
          </button>
        </div>
      </div>
    `;
    lucide.createIcons();
    this._scrollToBottom();
  },

  // Build 3 data-driven suggestions (Marc Lou P14: steal copy from customers' reality)
  _buildSmartSuggestions(fallback, summary) {
    if (!summary) return fallback.slice(0, 3);

    const month = formatMonthLabel(State.currentMonth);
    const suggestions = [];

    if (summary.total_expenses > 0) {
      suggestions.push(`Por que meus gastos estão em ${formatCurrency(summary.total_expenses)} em ${month}?`);
    }
    if (summary.balance < 0) {
      suggestions.push(`Meu saldo está negativo em ${formatCurrency(Math.abs(summary.balance))}. O que fazer?`);
    } else {
      suggestions.push(`Como posso otimizar meu saldo de ${formatCurrency(summary.balance)}?`);
    }
    suggestions.push(`Onde posso cortar gastos este mês?`);

    return suggestions.slice(0, 3);
  },

  _welcomeMessage(summary) {
    // Pre-conversation data insights (RCD: show value before user has to ask)
    const insights = this._buildInsights(summary);

    return `
      <div class="chat-welcome">
        <!-- Rock Finance identity — mountain SVG icon -->
        <div class="chat-avatar">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M18 4L6 28H30L18 4Z" fill="white" opacity="0.9"/>
            <path d="M18 14L11 28H25L18 14Z" fill="#00b4d8" opacity="0.8"/>
            <circle cx="18" cy="10" r="2" fill="white" opacity="0.6"/>
          </svg>
        </div>
        <div>
          <div class="chat-welcome-title">Rock Advisor</div>
          <div class="chat-welcome-sub">
            Seu guia financeiro pessoal. Tenho acesso aos seus dados e posso ajudar você a entender para onde vai o seu dinheiro.
          </div>
        </div>
        ${insights.length ? `
        <div class="chat-insights">
          ${insights.map(i => `
            <div class="chat-insight-item">
              <span class="insight-dot"></span>
              ${i}
            </div>
          `).join('')}
        </div>` : ''}
      </div>
    `;
  },

  _buildInsights(summary) {
    if (!summary) return [];
    const items = [];
    const month = formatMonthLabel(State.currentMonth);

    if (summary.total_expenses > 0 && summary.total_income > 0) {
      const ratio = ((summary.total_expenses / summary.total_income) * 100).toFixed(0);
      items.push(`Você gastou <strong>${ratio}%</strong> da sua receita em ${month}.`);
    }
    if (summary.balance < 0) {
      items.push(`Seu saldo está <strong style="color:var(--expense)">negativo em ${formatCurrency(Math.abs(summary.balance))}</strong>. Pergunte-me como melhorar.`);
    } else if (summary.balance > 0) {
      items.push(`Você tem <strong style="color:var(--income)">${formatCurrency(summary.balance)}</strong> de saldo positivo em ${month}.`);
    }

    return items.slice(0, 2);
  },

  _renderBubble(msg) {
    const isUser = msg.role === 'user';
    const content = isUser ? msg.content : this._parseMarkdown(msg.content);
    return `
      <div style="display:flex;flex-direction:column;${isUser ? 'align-items:flex-end;' : 'align-items:flex-start;'}">
        <div class="chat-bubble ${msg.role} ${isUser ? '' : 'md'}">${content}</div>
      </div>
    `;
  },

  _parseMarkdown(text) {
    if (window.marked) return marked.parse(text);
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  },

  // 3 dots pulsing opacity (Emil: no infinite spinning, discrete processing)
  _typingIndicator() {
    return `
      <div id="typing-indicator" style="display:flex;align-items:flex-start;">
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
    if (messages) {
      requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
    }
  },

  async sendSuggestion(text) {
    const input = document.getElementById('chat-input');
    if (input) input.value = text;
    const suggestionsEl = document.getElementById('chat-suggestions');
    if (suggestionsEl) suggestionsEl.remove();
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
    if (sendBtn) sendBtn.disabled = true;

    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    // Remove welcome state
    const welcomeEl = messagesEl.querySelector('.chat-welcome');
    if (welcomeEl) welcomeEl.remove();

    messagesEl.insertAdjacentHTML('beforeend', `
      <div style="display:flex;flex-direction:column;align-items:flex-end;">
        <div class="chat-bubble user">${message}</div>
      </div>
    `);
    messagesEl.insertAdjacentHTML('beforeend', this._typingIndicator());
    this._scrollToBottom();

    try {
      const res = await API.post('/api/chat', {
        message,
        history: this._history,
      });

      this._history = res.history;
      document.getElementById('typing-indicator')?.remove();

      messagesEl.insertAdjacentHTML('beforeend', `
        <div style="display:flex;flex-direction:column;align-items:flex-start;">
          <div class="chat-bubble assistant md">${this._parseMarkdown(res.response)}</div>
        </div>
      `);
    } catch (err) {
      document.getElementById('typing-indicator')?.remove();
      messagesEl.insertAdjacentHTML('beforeend', `
        <div style="display:flex;flex-direction:column;align-items:flex-start;">
          <div class="chat-bubble assistant" style="color:var(--expense);">
            Erro ao conectar com o Rock Advisor. Tente novamente.
          </div>
        </div>
      `);
    } finally {
      this._isLoading = false;
      if (sendBtn) sendBtn.disabled = false;
      this._scrollToBottom();
      input?.focus();
    }
  },
};
