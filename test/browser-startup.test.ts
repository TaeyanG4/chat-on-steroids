import { beforeEach, expect, it, vi } from 'vitest';
const browser = vi.hoisted(() => ({ connected: false, present: false, lastSeenAt: null as number | null }));
const open = vi.hoisted(() => vi.fn(async (_url: string): Promise<string | null> => 'chrome'));
vi.mock('../src/main/bridge.js', () => ({ bridgeStatus: async () => ({ ...browser }), browserWakeConnected: () => browser.connected, startBridge: async () => true }));
vi.mock('../src/main/browser.js', () => ({ openInPreferredBrowser: open }));
vi.mock('../src/main/connection.js', () => ({ connect: vi.fn(), getStatus: vi.fn(), onStatusChange: vi.fn() }));
import { resetInputStartupForTests, wakeBrowserUrl } from '../src/main/session/start-input.js';
beforeEach(() => { resetInputStartupForTests(); browser.connected = false; browser.present = false; browser.lastSeenAt = null; open.mockReset().mockResolvedValue('chrome'); });

it('shares one successful absence episode across input and discovery retries', async () => {
  await Promise.all([wakeBrowserUrl('https://chatgpt.com/?cos-input=one'), wakeBrowserUrl('https://chatgpt.com/?cos-model-catalog=two', true)]);
  await wakeBrowserUrl('https://chatgpt.com/?cos-model-catalog=three', true);
  expect(open).toHaveBeenCalledTimes(1);
  browser.connected = true; browser.present = true; browser.lastSeenAt = 100;
  await wakeBrowserUrl('https://chatgpt.com/');
  browser.connected = false; browser.present = false;
  await wakeBrowserUrl('https://chatgpt.com/?cos-model-catalog=four', true);
  expect(open).toHaveBeenCalledTimes(2);
});
it('retries a rejected launch only after explicit retry and keeps successful retry shared', async () => {
  open.mockResolvedValueOnce(null);
  await expect(wakeBrowserUrl('https://chatgpt.com/')).rejects.toThrow(/not found/);
  await expect(wakeBrowserUrl('https://chatgpt.com/')).rejects.toThrow(/not found/);
  expect(open).toHaveBeenCalledTimes(1);
  await wakeBrowserUrl('https://chatgpt.com/', true);
  await wakeBrowserUrl('https://chatgpt.com/', true);
  expect(open).toHaveBeenCalledTimes(2);
});
it('waits for real absence after the wake channel closes with recent HTTP presence', async () => {
  browser.present = true; browser.lastSeenAt = Date.now(); browser.connected = true;
  await wakeBrowserUrl('https://chatgpt.com/?cos-model-catalog=discovery');
  expect(open).not.toHaveBeenCalled();
  browser.connected = false; // MV3 suspension or reconnect is not proof of browser absence
  await Promise.all([wakeBrowserUrl('https://chatgpt.com/?cos-input=first'), wakeBrowserUrl('https://chatgpt.com/?cos-input=second')]);
  expect(open).not.toHaveBeenCalled();
  browser.present = false;
  await wakeBrowserUrl('https://chatgpt.com/?cos-input=first');
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith('https://chatgpt.com/?cos-input=first');
});
it('starts model discovery without asking the OS to open its URL in a foreground window', async () => {
  await wakeBrowserUrl('https://chatgpt.com/?cos-model-catalog=one', true, true);
  expect(open).toHaveBeenCalledWith('https://chatgpt.com/?cos-model-catalog=one', { backgroundStartup: true });
});
