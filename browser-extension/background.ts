// Background service worker — handles messages from content scripts

const APP_URL = 'https://ashfordeOU.github.io/grasp';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'OPEN_GRASP') {
    const repo: string = message.repo ?? '';
    const isGitLab: boolean = message.isGitLab ?? false;
    const params = new URLSearchParams({ repo });
    if (isGitLab) params.set('gitlab', '1');
    chrome.tabs.create({ url: `${APP_URL}?${params}` });
    sendResponse({ ok: true });
  }
  return true; // keep the message channel open
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: APP_URL });
});
