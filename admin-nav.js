(function () {
  const NAV_ITEMS = [
    { href: '/admin', label: 'Dashboard', paths: ['/admin'] },
    { href: '/config', label: 'Voice Settings', paths: ['/config', '/config.html'] },
    { href: '/avatar-config', label: 'Avatar', paths: ['/avatar-config'] },
    { href: '/video-pairs', label: 'Video Pairs', paths: ['/video-pairs'] },
    { href: '/account-config', label: 'Account Profiles', paths: ['/account-config'] },
    { href: '/conversations', label: 'Conversations', paths: ['/conversations'] },
    { href: '/game-plays', label: 'Game Plays', paths: ['/game-plays'] },
    { href: '/games/config.html', label: 'Game Assets', paths: ['/games/config.html'] },
  ];

  const currentPath = location.pathname;

  function isActive(item) {
    return item.paths.some((p) => currentPath === p || currentPath.endsWith(p));
  }

  function buildNavHtml() {
    const links = NAV_ITEMS.map((item) => {
      const cls = isActive(item) ? ' class="active"' : '';
      return `<a href="${item.href}"${cls}>${item.label}</a>`;
    }).join('');

    return `
      <aside class="admin-sidebar" id="admin-sidebar">
        <div class="admin-sidebar-brand">
          <strong>Uncle Tommy CMS</strong>
          <span>admin / admin</span>
        </div>
        <nav class="admin-sidebar-nav" aria-label="Admin sections">
          ${links}
        </nav>
        <div class="admin-sidebar-footer">
          <a href="/">Voice App</a>
          <button type="button" class="logout-btn" id="admin-logout-btn">Log out</button>
        </div>
      </aside>`;
  }

  document.body.insertAdjacentHTML('afterbegin', buildNavHtml());
  document.body.classList.add('admin-page');

  const centered = getComputedStyle(document.body).display === 'flex'
    && getComputedStyle(document.body).alignItems === 'center';
  if (centered) {
    document.body.classList.add('admin-page--centered');
  }

  document.getElementById('admin-logout-btn').addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (_) { /* ignore */ }
    location.href = '/admin/login';
  });
})();
