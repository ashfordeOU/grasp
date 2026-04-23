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
    return parts.length >= 2 && !GITLAB_SKIP.includes(parts[0]);
  }
  return false;
}

function getRepoFromUrl(): { repo: string; isGitLab: boolean } | null {
  if (!isRepoPage()) return null;
  const host = window.location.hostname;
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return {
    repo: `${parts[0]}/${parts[1]}`,
    isGitLab: host === 'gitlab.com',
  };
}

const BTN_HTML = `<svg width="13" height="12" viewBox="0 0 13 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="flex-shrink:0;display:block"><circle cx="6.5" cy="1.5" r="1.5" fill="#4fd1c5"/><circle cx="1.5" cy="10" r="1.5" fill="#4fd1c5"/><circle cx="11.5" cy="10" r="1.5" fill="#4fd1c5"/><line x1="6.5" y1="3" x2="2.3" y2="8.6" stroke="#4fd1c5" stroke-width="1.1" stroke-linecap="round"/><line x1="6.5" y1="3" x2="10.7" y2="8.6" stroke="#4fd1c5" stroke-width="1.1" stroke-linecap="round"/></svg><span>Grasp</span>`;

function injectSidebarToggle(): void {
  if (document.querySelector('[data-grasp="sidebar-toggle"]')) return;

  const btn = document.createElement('button');
  btn.setAttribute('data-grasp', 'sidebar-toggle');
  btn.setAttribute('title', 'Open Grasp architecture view');
  const parsed = new DOMParser().parseFromString(BTN_HTML, 'text/html');
  Array.from(parsed.body.childNodes).forEach(n => btn.appendChild(document.importNode(n, true)));

  btn.style.cssText = [
    'position:fixed',
    'right:16px',
    'top:80px',
    'z-index:9999',
    'background:#0f2a2a',
    'color:#4fd1c5',
    'border:1px solid rgba(79,209,197,0.35)',
    'border-radius:20px',
    'padding:7px 13px 7px 10px',
    'font-size:12px',
    'font-weight:700',
    'cursor:pointer',
    'box-shadow:0 4px 16px rgba(0,0,0,0.4),0 0 0 1px rgba(79,209,197,0.08)',
    'display:flex',
    'align-items:center',
    'gap:5px',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'letter-spacing:0.02em',
    'transition:background 0.15s,box-shadow 0.15s,transform 0.15s',
    'line-height:1',
  ].join(';');

  btn.addEventListener('mouseenter', () => {
    btn.style.background = '#1a3d3d';
    btn.style.boxShadow = '0 6px 20px rgba(0,0,0,0.5),0 0 0 1px rgba(79,209,197,0.2)';
    btn.style.transform = 'translateY(-1px)';
  });

  btn.addEventListener('mouseleave', () => {
    btn.style.background = '#0f2a2a';
    btn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4),0 0 0 1px rgba(79,209,197,0.08)';
    btn.style.transform = 'translateY(0)';
  });

  btn.addEventListener('click', () => {
    const info = getRepoFromUrl();
    chrome.runtime.sendMessage({ type: 'OPEN_GRASP', repo: info?.repo ?? null, isGitLab: info?.isGitLab ?? false });
  });

  document.body.appendChild(btn);
}

// Respond to popup asking whether the current tab is a repo page
chrome.runtime.onMessage.addListener(
  (message: { type: string }, _sender, sendResponse) => {
    if (message.type === 'GET_REPO_INFO') {
      sendResponse(getRepoFromUrl());
    }
  }
);

if (isRepoPage()) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSidebarToggle);
  } else {
    injectSidebarToggle();
  }
}
