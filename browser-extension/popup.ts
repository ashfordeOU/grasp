interface RepoInfo {
  repo: string;
  isGitLab: boolean;
}

function openRepo(repo: string, isGitLab: boolean): void {
  chrome.runtime.sendMessage({ type: 'OPEN_GRASP', repo, isGitLab }, () => {
    window.close();
  });
}

function parseRepoFromInput(raw: string): RepoInfo | null {
  const val = raw.trim().replace(/^https?:\/\//, '');
  const isGitLab = val.startsWith('gitlab.com/');
  const stripped = val.replace(/^(github\.com|gitlab\.com)\//, '');
  const [owner, name] = stripped.split('/');
  if (owner && name) return { repo: `${owner}/${name}`, isGitLab };
  return null;
}

function showRepo(repo: string, isGitLab: boolean): void {
  (document.getElementById('view-repo') as HTMLElement).style.display = '';
  (document.getElementById('repo-name') as HTMLElement).textContent = repo;
  document.getElementById('btn-open-repo')!.addEventListener('click', () => {
    openRepo(repo, isGitLab);
  });
}

function showManual(): void {
  (document.getElementById('view-manual') as HTMLElement).style.display = '';
  const input = document.getElementById('repo-input') as HTMLInputElement;
  const btn = document.getElementById('btn-open-app') as HTMLButtonElement;
  btn.addEventListener('click', () => {
    const parsed = parseRepoFromInput(input.value);
    openRepo(parsed?.repo ?? '', parsed?.isGitLab ?? false);
  });
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') btn.click();
  });
  input.focus();
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId == null) { showManual(); return; }
    chrome.tabs.sendMessage(tabId, { type: 'GET_REPO_INFO' }, (response: RepoInfo | null) => {
      if (chrome.runtime.lastError || !response?.repo) {
        showManual();
      } else {
        showRepo(response.repo, response.isGitLab);
      }
    });
  });
});
