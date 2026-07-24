(() => {
  try {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.addEventListener('DOMContentLoaded', () => {
        document.body.setAttribute('data-theme', 'dark');
      }, { once: true });
    }
  } catch (_) {
    // The default light theme remains available when storage is blocked.
  }
})();
