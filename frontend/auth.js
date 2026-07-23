// ─── Frontend Auth Module (Firebase Modular SDK) ─────────────────────────────

const Auth = {
  user: null,
  idToken: null,
  isDevBypass: false,
  firebaseAuth: null,

  async init() {
    try {
      // 1. Busca configurações públicas do Firebase do backend
      const res = await fetch('/api/config/firebase');
      if (!res.ok) throw new Error(`Falha ao obter config: ${res.status}`);
      const config = await res.json();

      this.isDevBypass = !!config.devBypass;

      if (this.isDevBypass) {
        console.warn("⚠️ Modo Dev Bypass Ativo (Desenvolvimento Local)");
        this._showDevBypassBadge();
        this.user = { email: "dev@rockfinance.local", uid: "dev-bypass-uid" };
        this.idToken = "dev-bypass-token";
        this._showMainApp();
        return;
      }

      // 2. Se não for dev bypass, inicializa Firebase Web SDK Modular via ES Modules
      if (!config.apiKey || !config.projectId) {
        console.error("Configurações do Firebase não encontradas no servidor.");
        this._showLoginError("Configurações do Firebase não encontradas. Verifique o arquivo .env");
        return;
      }

      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');

      const app = initializeApp(config);
      this.firebaseAuth = getAuth(app);
      this._signOutFunc = signOut;
      this._signInFunc = signInWithEmailAndPassword;

      // 3. Ouve mudanças no estado de autenticação (restaura sessão)
      onAuthStateChanged(this.firebaseAuth, async (user) => {
        if (user) {
          this.user = user;
          this.idToken = await user.getIdToken();
          this._updateUserUI();
          this._showMainApp();
        } else {
          this.user = null;
          this.idToken = null;
          this._showLoginScreen();
        }
      });

    } catch (err) {
      console.error("Erro na inicialização da autenticação:", err);
      this._showLoginError("Erro ao inicializar o sistema de login.");
    }
  },

  async login(email, password) {
    if (this.isDevBypass) {
      this._showMainApp();
      return;
    }
    if (!this.firebaseAuth || !this._signInFunc) {
      throw new Error("Sistema de autenticação não inicializado.");
    }
    const userCredential = await this._signInFunc(this.firebaseAuth, email, password);
    this.user = userCredential.user;
    this.idToken = await this.user.getIdToken();
    return this.user;
  },

  async logout() {
    if (this.isDevBypass) {
      alert("Dev Bypass ativo. Para desativar, altere AUTH_DEV_BYPASS=false no .env e reinicie o servidor.");
      return;
    }
    if (this.firebaseAuth && this._signOutFunc) {
      await this._signOutFunc(this.firebaseAuth);
    }
    this.user = null;
    this.idToken = null;
    this._showLoginScreen();
  },

  async getToken() {
    if (this.isDevBypass) return "dev-bypass-token";
    if (this.user && typeof this.user.getIdToken === 'function') {
      // Força a renovação se estiver prestes a expirar
      this.idToken = await this.user.getIdToken(/* forceRefresh */ false);
    }
    return this.idToken;
  },

  _showMainApp() {
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('app');
    if (loginScreen) loginScreen.style.display = 'none';
    if (mainApp) mainApp.style.display = 'flex';
    if (window.onAppInit) window.onAppInit();
  },

  _showLoginScreen() {
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('app');
    if (loginScreen) loginScreen.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
  },

  _showDevBypassBadge() {
    const badge = document.getElementById('dev-bypass-badge');
    if (badge) badge.style.display = 'inline-flex';
    const emailEl = document.getElementById('user-email-display');
    if (emailEl) emailEl.textContent = 'dev@rockfinance.local (Modo Dev)';
  },

  _updateUserUI() {
    const emailEl = document.getElementById('user-email-display');
    if (emailEl && this.user) {
      emailEl.textContent = this.user.email;
    }
  },

  _showLoginError(msg) {
    const errorEl = document.getElementById('login-error-msg');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }
  }
};

window.Auth = Auth;
