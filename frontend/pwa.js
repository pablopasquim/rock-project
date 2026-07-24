(() => {
  let installPrompt = null;
  const installButton = document.getElementById('pwa-install-btn');

  const hideInstallButton = () => {
    if (installButton) installButton.hidden = true;
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.hidden = false;
  });

  installButton?.addEventListener('click', async () => {
    if (!installPrompt) return;
    installButton.disabled = true;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installButton.disabled = false;
    hideInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    hideInstallButton();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .catch((error) => console.warn('Não foi possível registrar o modo instalável.', error));
    });
  }
})();
