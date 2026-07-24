(() => {
  let installPrompt = null;
  const installButton = document.getElementById('pwa-install-btn');
  const installBanner = document.getElementById('pwa-install-banner');
  const bannerButton = document.getElementById('pwa-install-banner-btn');
  const bannerDismiss = document.getElementById('pwa-install-banner-dismiss');
  const bannerDescription = document.getElementById('pwa-install-banner-description');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  let fallbackInstructions = false;

  const wasDismissed = () => {
    try {
      return window.sessionStorage.getItem('pwa-install-dismissed') === 'true';
    } catch {
      return false;
    }
  };

  const hideInstallUi = () => {
    if (installButton) installButton.hidden = true;
    if (installBanner) installBanner.hidden = true;
  };

  const showInstallUi = ({ fallback = false } = {}) => {
    if (isStandalone) return;
    fallbackInstructions = fallback;
    if (installButton) installButton.hidden = false;
    if (installBanner && isMobile && !wasDismissed()) installBanner.hidden = false;

    if (bannerButton) bannerButton.textContent = fallback ? 'Como instalar' : 'Instalar';
    if (bannerDescription) {
      bannerDescription.textContent = fallback
        ? (isIos ? 'Use Compartilhar e Adicionar à Tela de Início' : 'Use o menu do navegador para instalar')
        : 'Acesse direto pela tela inicial';
    }
    if (window.lucide) window.lucide.createIcons();
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    showInstallUi();
  });

  const requestInstall = async () => {
    if (!installPrompt || fallbackInstructions) {
      const message = isIos
        ? 'No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.'
        : 'No Chrome, abra o menu ⋮ e toque em Instalar app ou Adicionar à tela inicial.';
      if (typeof window.toast === 'function') window.toast(message, 'info', 6500);
      if (bannerDescription) bannerDescription.textContent = message;
      return;
    }

    if (installButton) installButton.disabled = true;
    if (bannerButton) bannerButton.disabled = true;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    if (installButton) installButton.disabled = false;
    if (bannerButton) bannerButton.disabled = false;
    hideInstallUi();
  };

  installButton?.addEventListener('click', requestInstall);
  bannerButton?.addEventListener('click', requestInstall);

  // iOS does not expose beforeinstallprompt. Keep an explicit install entry
  // visible so the user can always reach the browser-specific instructions.
  if (isMobile && !isStandalone) {
    showInstallUi({ fallback: true });
  }

  bannerDismiss?.addEventListener('click', () => {
    if (installBanner) installBanner.hidden = true;
    try {
      window.sessionStorage.setItem('pwa-install-dismissed', 'true');
    } catch {
      // Storage pode estar indisponível em navegação privada.
    }
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    hideInstallUi();
    if (typeof window.toast === 'function') {
      window.toast('Rock Finance instalado com sucesso!', 'success');
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .catch((error) => console.warn('Não foi possível registrar o modo instalável.', error));

    });
  }
})();
