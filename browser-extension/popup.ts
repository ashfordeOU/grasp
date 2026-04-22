interface RepoInfo {
  repo: string;
  isGitLab: boolean;
}

function openRepo(repo: string, isGitLab: boolean): void {
  chrome.runtime.sendMessage({ type: 'OPEN_GRASP', repo, isGitLab }, () => window.close());
}

function parseRepoFromInput(raw: string): RepoInfo | null {
  const val = raw.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!val) return null;
  const segments = val.split('/').filter(Boolean);
  const hasHost = segments[0]?.includes('.');

  if (hasHost) {
    const host = segments[0].toLowerCase();
    const owner = segments[1];
    const repoName = segments[2];
    if (!owner || !repoName) return null;
    if (host === 'github.com') return { repo: `${owner}/${repoName}`, isGitLab: false };
    if (host === 'gitlab.com') return { repo: `${owner}/${repoName}`, isGitLab: true };
    // Self-hosted: preserve full host/owner/repo so background can build the right URL
    const isGitLab = host.includes('gitlab');
    return { repo: `${host}/${owner}/${repoName}`, isGitLab };
  }

  const [owner, repoName] = segments;
  if (owner && repoName) return { repo: `${owner}/${repoName}`, isGitLab: false };
  return null;
}

function showRepo(repo: string, isGitLab: boolean): void {
  (document.getElementById('view-repo') as HTMLElement).style.display = '';
  (document.getElementById('repo-name') as HTMLElement).textContent = repo;
  document.getElementById('btn-open-repo')!.addEventListener('click', () => openRepo(repo, isGitLab));
}

function enableOnHost(tabId: number, host: string, btn: HTMLButtonElement): void {
  chrome.permissions.request(
    { origins: [`https://${host}/*`, `http://${host}/*`] },
    (granted) => {
      if (!granted) return;

      // Inject content script immediately into the current tab
      chrome.scripting.executeScript({ target: { tabId }, files: ['dist/content.js'] });

      // Register for all future page loads on this host
      chrome.scripting.registerContentScripts([{
        id: `host-${host}`,
        matches: [`https://${host}/*/*`, `http://${host}/*/*`],
        js: ['dist/content.js'],
        runAt: 'document_idle',
      }]).catch(() => {}); // silently ignore if already registered

      btn.textContent = '✓ Grasp button enabled on this site';
      btn.classList.add('enabled');
      btn.disabled = true;
    }
  );
}

function showManual(tabId?: number): void {
  (document.getElementById('view-manual') as HTMLElement).style.display = '';
  const input = document.getElementById('repo-input') as HTMLInputElement;
  const btn = document.getElementById('btn-open-app') as HTMLButtonElement;
  const enableBtn = document.getElementById('btn-enable-host') as HTMLButtonElement;

  btn.addEventListener('click', () => {
    const parsed = parseRepoFromInput(input.value);
    openRepo(parsed?.repo ?? '', parsed?.isGitLab ?? false);
  });
  input.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') btn.click(); });
  input.focus();

  // Detect if the current tab is a custom Git host and offer to enable the floating button
  if (tabId != null) {
    chrome.scripting.executeScript(
      { target: { tabId }, func: () => window.location.hostname }
    ).then((results) => {
      const host = (results?.[0]?.result as string | undefined)?.toLowerCase();
      if (!host || host === 'github.com' || host === 'gitlab.com') return;
      // Unknown host — offer to enable
      enableBtn.style.display = '';
      enableBtn.textContent = `Enable Grasp button on ${host} →`;
      enableBtn.addEventListener('click', () => enableOnHost(tabId, host, enableBtn));
    }).catch(() => {}); // page may have scripting blocked — silently skip
  }
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId == null) { showManual(); return; }

    chrome.tabs.sendMessage(tabId, { type: 'GET_REPO_INFO' }, (response: RepoInfo | null) => {
      if (chrome.runtime.lastError || !response?.repo) {
        showManual(tabId);
      } else {
        showRepo(response.repo, response.isGitLab);
      }
    });
  });
});
