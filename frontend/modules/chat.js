// ─── Chat Module (Rock Advisor) ─────────────────────────────────────────────
const Chat = {
  _history: [],
  _isLoading: false,

  async render(container) {
    let suggestions = [];
    let summary = null;

    try {
      const [sugData, sumData] = await Promise.all([
        API.get('/api/chat/suggestions'),
        API.get(`/api/dashboard/summary?month=${State.currentMonth}`).catch(() => null),
      ]);
      suggestions = sugData.suggestions || [];
      summary = sumData;
    } catch (e) {
      suggestions = [
        'Onde estou gastando mais este mês?',
        'Como posso economizar agora?',
        'Analise meu saldo atual.',
      ];
    }

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
          ${smartSuggestions.map((s, idx) => `
            <button class="suggestion-chip" data-sug-idx="${idx}">
              ${escapeHTML(s)}
            </button>
          `).join('')}
        </div>` : ''}

        <!-- Input -->
        <div class="chat-input-area">
          <input
            type="text"
            class="chat-input"
            id="chat-input"
            placeholder="Pergunte ao Rock Advisor..."
            maxlength="500"
            autocomplete="off"
          />
          <button class="btn btn-primary" id="chat-send-btn" style="padding:10px 18px;" aria-label="Enviar mensagem">
            <i data-lucide="send" style="width:16px;height:16px;"></i>
          </button>
        </div>
      </div>
    `;

    // Event listeners
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const sugContainer = document.getElementById('chat-suggestions');

    if (input) {
      input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      };
    }

    if (sendBtn) {
      sendBtn.onclick = () => this.sendMessage();
    }

    if (sugContainer) {
      sugContainer.querySelectorAll('.suggestion-chip').forEach((chip, idx) => {
        chip.onclick = () => {
          const text = smartSuggestions[idx];
          if (text) this.sendSuggestion(text);
        };
      });
    }

    if (window.lucide) lucide.createIcons();
    this._scrollToBottom();
  },

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
    const insights = this._buildInsights(summary);

    return `
      <div class="chat-welcome">
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
            Seu guia financeiro pessoal. Tenho acesso aos seus dados e posso ajudar você a entender suas finanças.
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
      items.push(`Seu saldo está <strong style="color:var(--expense)">negativo em ${formatCurrency(Math.abs(summary.balance))}</strong>.`);
    } else if (summary.balance > 0) {
      items.push(`Você tem <strong style="color:var(--income)">${formatCurrency(summary.balance)}</strong> de saldo em ${month}.`);
    }

    return items.slice(0, 2);
  },

  _renderBubble(msg) {
    const isUser = msg.role === 'user';
    const content = isUser ? escapeHTML(msg.content) : this._parseMarkdown(msg.content);
    return `
      <div style="display:flex;flex-direction:column;${isUser ? 'align-items:flex-end;' : 'align-items:flex-start;'}">
        <div class="chat-bubble ${msg.role} ${isUser ? '' : 'md'}">${content}</div>
      </div>
    `;
  },

  _parseMarkdown(text) {
    if (!text) return '';

    // Se DOMPurify NÃO estiver disponível, fazemos fallback de escape estrito sem usar o HTML do marked
    if (!window.DOMPurify) {
      return escapeHTML(text).replace(/\n/g, '<br>');
    }

    // Com DOMPurify disponível, fazemos parse com marked e sanitizamos restringindo a tags puras de texto
    const rawHtml = window.marked ? window.marked.parse(text) : escapeHTML(text).replace(/\n/g, '<br>');
    return window.DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li', 'code', 'pre', 'br', 'span', 'blockquote'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    });
  },

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

    const welcomeEl = messagesEl.querySelector('.chat-welcome');
    if (welcomeEl) welcomeEl.remove();

    messagesEl.insertAdjacentHTML('beforeend', `
      <div style="display:flex;flex-direction:column;align-items:flex-end;">
        <div class="chat-bubble user">${escapeHTML(message)}</div>
      </div>
    `);
    messagesEl.insertAdjacentHTML('beforeend', this._typingIndicator());
    this._scrollToBottom();

    try {
      const res = await API.post('/api/chat', {
        message,
        month_key: State.currentMonth,
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
      const isRateLimit = err.message && err.message.includes('429');
      const errText = isRateLimit
        ? "Você enviou muitas mensagens. Aguarde um minuto antes de tentar novamente."
        : "Não foi possível conectar com o Rock Advisor. Tente novamente.";

      messagesEl.insertAdjacentHTML('beforeend', `
        <div style="display:flex;flex-direction:column;align-items:flex-start;">
          <div class="chat-bubble assistant" style="color:var(--expense);">
            ⚠️ ${escapeHTML(errText)}
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

window.Chat = Chat;
