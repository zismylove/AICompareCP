const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('background/grok-websocket-auth.js', 'utf8');
const base = 'chrome-extension://test/iframe/iframe.html';
const listeners = {};
let tabs = [{ id: 7, url: base }, { id: 8, url: 'https://grok.com/' }, { id: 9, url: base + '?q=1' }];
let cookies = [{ name: 'sso', value: 'fake-auth', secure: true },
  { name: 'sso-rw', value: 'fake-write', secure: true },
  { name: 'sso', value: 'wrong-partition', secure: true, partitionKey: {} },
  { name: 'unrelated', value: 'excluded', secure: true }];
let rules = [{ id: 999 }, { id: 1405 }];
const changes = [];
const event = name => ({ addListener: fn => { listeners[name] = fn; } });
const chrome = {
  runtime: { id: 'test', getURL: () => 'chrome-extension://session-uuid/iframe/iframe.html', onMessage: event('message') },
  tabs: { query: async () => tabs, onUpdated: event('updated'), onRemoved: event('removed') },
  cookies: { getAllCookieStores: async () => [{ id: '0', tabIds: [7, 8] }, { id: '1', tabIds: [9] }],
    getAll: async ({ storeId }) => storeId === '0' ? cookies : [], onChanged: event('cookie') },
  declarativeNetRequest: { getSessionRules: async () => rules,
    updateSessionRules: async change => {
      changes.push(change);
      rules = rules.filter(r => !change.removeRuleIds.includes(r.id)).concat(change.addRules);
    } }
};
const settle = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  vm.runInNewContext(source, { chrome, console });
  await settle();
  let rule = rules.find(r => r.id === 1400);
  assert.deepEqual(Array.from(rule.condition.tabIds), [7]);
  assert.equal(rule.action.requestHeaders[0].value, 'sso=fake-auth; sso-rw=fake-write');
  assert.equal(rule.action.requestHeaders[0].operation, 'append');
  const pattern = new RegExp(rule.condition.regexFilter);
  assert.ok(pattern.test('wss://grok.com/ws/mgw/?uid=123'));
  for (const url of ['wss://evil.test/ws/mgw/', 'wss://grok.com.evil.test/ws/mgw/', 'ws://grok.com/ws/mgw/', 'wss://grok.com/other']) assert.ok(!pattern.test(url));
  assert.ok(!rules.some(r => r.id === 1405));
  let denied;
  listeners.message({type:'PREPARE_GROK_CONNECTION'}, {id:'test',frameId:1,tab:{id:7},url:'https://grok.com/'}, x=>denied=x);
  assert.equal(denied.success, false);
  const ready = await new Promise(resolve => listeners.message({type:'PREPARE_GROK_CONNECTION'}, {id:'test',frameId:0,tab:{id:7},url:base}, resolve));
  assert.equal(ready.success, true);
  const pageReady = await new Promise(resolve => listeners.message({type:'PREPARE_GROK_CONNECTION'}, {id:'test',url:base}, resolve));
  assert.equal(pageReady.success, true);
  cookies = [];
  listeners.cookie({cookie:{name:'sso',domain:'.grok.com'}});
  await settle();
  assert.ok(!rules.some(r => r.id === 1400), 'logout must clear credentials');
  cookies = [{ name:'sso', value:'new-session', secure:true }];
  listeners.cookie({cookie:{name:'sso',domain:'.grok.com'}});
  await settle();
  assert.ok(rules.find(r=>r.id===1400).action.requestHeaders[0].value.includes('new-session'));
  tabs = tabs.filter(t=>t.id!==7);
  listeners.removed(7);
  await settle();
  assert.deepEqual(rules.map(r=>r.id),[999]);
  console.log('PASS: endpoint/tab/store scope, partition filtering, logout/login, readiness, stale rule cleanup');
})();
