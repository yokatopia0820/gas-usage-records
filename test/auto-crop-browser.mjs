import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const photo = 'C:\\Users\\PC_User\\.codex\\codex-remote-attachments\\019ffbc3-cd61-7320-8841-fea18b4430d8\\96BFAE62-379D-49C7-93EE-DC3F49151195\\1-写真1.jpg';

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl); let nextId = 1; const pending = new Map();
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => { const message = JSON.parse(event.data); const resolve = pending.get(message.id); if (resolve) { pending.delete(message.id); resolve(message); } };
  return {
    async send(method, params = {}) {
      const id = nextId++; const response = await new Promise((resolve, reject) => { pending.set(id, resolve); socket.onerror = reject; socket.send(JSON.stringify({ id, method, params })); });
      if (response.error) throw new Error(response.error.message);
      return response.result;
    },
    close: () => socket.close(),
  };
}

test('upload automatically crops the LCD without a second tap or a blocking overlay', async () => {
  const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = pages.find(item => item.type === 'page' && item.url.includes('gas-usage-records'));
  assert.ok(page, 'a Chrome page for the deployed app is required');
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.navigate', { url: 'https://yokatopia0820.github.io/gas-usage-records/?v=2ddb129' });
  await new Promise(resolve => setTimeout(resolve, 1500));
  const document = await cdp.send('DOM.getDocument');
  const query = await cdp.send('DOM.querySelector', { nodeId: document.root.nodeId, selector: 'input[type=file]' });
  assert.ok(query.nodeId, 'file input is present');
  const described = await cdp.send('DOM.describeNode', { nodeId: query.nodeId });
  await cdp.send('DOM.setFileInputFiles', { backendNodeId: described.node.backendNodeId, files: [photo] });
  await new Promise(resolve => setTimeout(resolve, 1500));
  const value = await cdp.send('Runtime.evaluate', { expression: "JSON.stringify({ crop: !!document.querySelector('.crop-editor'), button: !!document.querySelector('.btn-read'), overlay: !!document.querySelector('.overlay'), weight: document.querySelector('.weight-edit')?.value, preview: !!document.querySelector('.lcd-preview img') })", returnByValue: true });
  cdp.close();
  const state = JSON.parse(value.result.value);
  assert.equal(state.crop, false, JSON.stringify(state));
  assert.equal(state.button, false);
  assert.equal(state.overlay, false);
  assert.equal(state.preview, true);
  assert.equal(state.weight, '');
});
