// Background service worker — handles messages from content scripts
// and communicates with the local grasp-mcp-server

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'OPEN_GRASP') {
    const repo: string = message.repo ?? '';
    chrome.tabs.create({
      url: `https://ashfordeOU.github.io/grasp?repo=${encodeURIComponent(repo)}`,
    });
    sendResponse({ ok: true });
  }
  return true; // keep the message channel open
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'https://ashfordeOU.github.io/grasp' });
});
