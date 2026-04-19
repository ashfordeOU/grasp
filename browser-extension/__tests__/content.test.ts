// Unit tests for content script logic
// We test the pure functions independently (browser globals mocked)

// Mock chrome API
const mockSendMessage = jest.fn();
global.chrome = {
  runtime: { sendMessage: mockSendMessage, onMessage: { addListener: jest.fn() } },
  tabs: { create: jest.fn() },
  action: { onClicked: { addListener: jest.fn() } },
} as unknown as typeof chrome;

// Mock DOM
Object.defineProperty(global, 'window', {
  value: { location: { pathname: '/ashfordeOU/grasp' } },
  writable: true,
});
Object.defineProperty(global, 'document', {
  value: {
    querySelector: jest.fn().mockReturnValue(null),
    createElement: jest.fn().mockReturnValue({
      setAttribute: jest.fn(),
      style: {} as CSSStyleDeclaration,
      addEventListener: jest.fn(),
      textContent: '',
    }),
    body: { appendChild: jest.fn() },
    readyState: 'complete',
  },
  writable: true,
});

test('manifest.json has required Manifest V3 fields', () => {
  const manifest = require('../manifest.json');
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.name).toContain('Grasp');
  expect(manifest.content_scripts).toBeDefined();
  expect(manifest.background.service_worker).toBeDefined();
});

test('manifest has github.com host permission', () => {
  const manifest = require('../manifest.json');
  expect(manifest.host_permissions).toContain('https://github.com/*');
});

test('manifest content script matches github.com/*/*', () => {
  const manifest = require('../manifest.json');
  expect(manifest.content_scripts[0].matches).toContain('https://github.com/*/*');
});
