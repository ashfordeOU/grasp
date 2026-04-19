// Content script — injected into github.com/owner/repo pages
// Detects GitHub repository pages and injects the Grasp sidebar toggle button

function isRepoPage(): boolean {
  // GitHub repo pages have the URL pattern: github.com/owner/repo
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts.length >= 2 && !['settings', 'explore', 'marketplace', 'notifications'].includes(parts[0]);
}

function getRepoFromUrl(): string | null {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return null;
}

function injectSidebarToggle(): void {
  if (document.querySelector('[data-grasp="sidebar-toggle"]')) return;

  const btn = document.createElement('button');
  btn.setAttribute('data-grasp', 'sidebar-toggle');
  btn.setAttribute('title', 'Open Grasp architecture view');
  btn.style.cssText = [
    'position: fixed',
    'right: 16px',
    'top: 80px',
    'z-index: 9999',
    'background: #0f2a2a',
    'color: #4fd1c5',
    'border: 1px solid #4fd1c5',
    'border-radius: 8px',
    'padding: 8px 12px',
    'font-size: 13px',
    'font-weight: 600',
    'cursor: pointer',
    'box-shadow: 0 2px 8px rgba(0,0,0,0.3)',
  ].join(';');
  btn.textContent = 'Grasp';

  btn.addEventListener('click', () => {
    const repo = getRepoFromUrl();
    chrome.runtime.sendMessage({ type: 'OPEN_GRASP', repo });
  });

  document.body.appendChild(btn);
}

if (isRepoPage()) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSidebarToggle);
  } else {
    injectSidebarToggle();
  }
}
