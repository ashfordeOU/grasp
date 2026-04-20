// Content script — injected into github.com and gitlab.com repo pages
// Detects repository pages and injects the Grasp sidebar toggle button

const GITHUB_SKIP = ['settings', 'explore', 'marketplace', 'notifications'];
const GITLAB_SKIP = ['explore', 'help', 'users', 'dashboard', '-'];

function isRepoPage(): boolean {
  const host = window.location.hostname;
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (host === 'github.com') {
    return parts.length >= 2 && !GITHUB_SKIP.includes(parts[0]);
  }
  if (host === 'gitlab.com') {
    // GitLab: namespace/project or namespace/subgroup/project — skip top-level nav pages
    return parts.length >= 2 && !GITLAB_SKIP.includes(parts[0]);
  }
  return false;
}

function getRepoFromUrl(): { repo: string; isGitLab: boolean } | null {
  const host = window.location.hostname;
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return {
    repo: `${parts[0]}/${parts[1]}`,
    isGitLab: host === 'gitlab.com',
  };
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
    const info = getRepoFromUrl();
    chrome.runtime.sendMessage({ type: 'OPEN_GRASP', repo: info?.repo ?? null, isGitLab: info?.isGitLab ?? false });
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
