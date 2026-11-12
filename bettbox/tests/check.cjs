// Synthetic fixtures only: never read subscription URLs or credentials.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'MyClash-Local.js'), 'utf8');
const seed = () => ({
  proxies: [{ name: 'US Test', type: 'socks5', server: 'node.airport.example.com', port: 1080 }],
  hosts: { 'airport.example.com': 'entry.example.net' },
});
function run(input = seed(), options = {}) {
  const context = vm.createContext({ input, options });
  vm.runInContext(source + '\nObject.assign(ruleOptionsEnable, options); result = main(input);', context, { timeout: 5000 });
  return JSON.parse(JSON.stringify(context.result));
}
let count = 0;
function test(name, fn) { fn(); console.log('PASS ' + name); count++; }
function references(cfg) {
  const groups = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', ...cfg.proxies.map(p => p.name), ...cfg['proxy-groups'].map(g => g.name)]);
  for (const group of cfg['proxy-groups']) {
    for (const name of group.proxies || []) assert(groups.has(name), `${group.name} -> missing ${name}`);
    if (group['default-selected']) assert(group.proxies.includes(group['default-selected']));
  }
  for (const rule of cfg.rules) {
    const parts = rule.split(',');
    const target = parts[parts.length - (parts.at(-1) === 'no-resolve' ? 2 : 1)];
    assert(groups.has(target), `missing rule target ${target}`);
    for (const match of rule.matchAll(/RULE-SET,([^,)]+)/g)) assert(cfg['rule-providers'][match[1]], `missing ${match[1]}`);
  }
  for (const field of ['nameserver', 'default-nameserver', 'proxy-server-nameserver', 'direct-nameserver']) {
    for (const resolver of cfg.dns[field]) {
      assert(resolver.startsWith('https://'), `${field}: unencrypted resolver`);
      assert(groups.has(resolver.split('#')[1]), `${field}: invalid resolver outbound`);
    }
  }
  for (const key of Object.keys(cfg.dns['nameserver-policy'])) {
    if (key.startsWith('rule-set:')) for (const name of key.slice(9).split(',')) assert(cfg['rule-providers'][name]);
  }
  for (const key of cfg.dns['fake-ip-filter']) {
    if (key.startsWith('rule-set:')) assert(cfg['rule-providers'][key.slice(9)], `missing fake-IP provider ${key}`);
  }
}
test('full mode: all routing, DNS and group references resolve', () => references(run()));
test('minimal mode: Telegram falls back to default proxy', () => {
  const cfg = run(seed(), { 极简国内外分流模式: true }); references(cfg);
  assert(cfg.rules.includes('PROCESS-NAME,Telegram.exe,默认代理'));
  assert(cfg['proxy-groups'].some(g => g.name === '自动选择'));
});
test('Telegram group disabled: no dangling reference', () => references(run(seed(), { Telegram: false })));
test('all service options disabled: DNS still has every provider', () => {
  const keys = ['FCM','YouTube','Google','AI','GitHub','Microsoft','Apple','Telegram','Steam','TikTok','Twitter','Meta','Line','Netflix','Emby','PikPak','Spotify','Crypto','PayPal','Patreon','EHentai','AdBlock'];
  references(run(seed(), Object.fromEntries(keys.map(k => [k, false]))));
});
test('general queries stay on IP DoH via proxy, with no direct fallback', () => {
  const { dns, tun } = run();
  assert.deepEqual(dns.nameserver, ['https://1.1.1.1/dns-query#默认代理', 'https://8.8.8.8/dns-query#默认代理']);
  assert(!dns.fallback); assert(!/"system(?::\/\/)?"/.test(JSON.stringify(dns)));
  assert(dns['direct-nameserver'].every(s => s.endsWith('#DIRECT')));
  assert.equal(tun['strict-route'], true);
  assert.deepEqual(tun['dns-hijack'], ['any:53', 'tcp://any:53']);
});
test('broad subscription DNS policy cannot spill into business queries', () => {
  const input = seed(); input.dns = { 'nameserver-policy': { '+.com': ['10.20.0.53'] } };
  const cfg = run(input); const policy = cfg.dns['nameserver-policy'];
  assert(!Object.hasOwn(policy, '+.com'));
  assert.deepEqual(policy['node.airport.example.com'], ['10.20.0.53']);
  assert.deepEqual(cfg.dns['proxy-server-nameserver-policy']['+.com'], ['10.20.0.53']);
});
test('public DNS is not mistaken for airport private DNS', () => {
  const input = seed(); input.dns = { nameserver: ['https://one.one.one.one/dns-query', 'https://doh.360.cn/dns-query'] };
  assert(!run(input).dns['proxy-server-nameserver-policy']);
});
test('private DNS remains available to node domains', () => {
  const input = seed(); input.dns = { nameserver: ['10.20.0.53'] };
  const cfg = run(input);
  assert.deepEqual(cfg.dns['nameserver-policy']['node.airport.example.com'], ['10.20.0.53']);
  assert.deepEqual(cfg.hosts['airport.example.com'], 'entry.example.net');
});
test('hosts rewriting preserves airport node entry and custom hosts', () => {
  const input = seed(); input.hosts['node.airport.example.com'] = 'entry.airport.example.net';
  input.dns = { listen: '0.0.0.0:53', 'proxy-server-nameserver': ['127.0.0.1'] };
  const cfg = run(input);
  assert.equal(cfg.proxies[0].server, 'entry.airport.example.net');
  assert.equal(cfg.hosts['node.airport.example.com'], 'entry.airport.example.net');
});
test('game/Steam/Telegram custom routes and CN safety net survive merge', () => {
  const cfg = run();
  for (const rule of ['PROCESS-NAME,javaw.exe,直连','PROCESS-NAME,Minecraft.exe,直连','PROCESS-NAME,YuanShen.exe,直连','PROCESS-NAME,steamwebhelper.exe,默认代理','PROCESS-NAME,steam.exe,直连','PROCESS-NAME,Telegram.exe,Telegram','GEOSITE,cn,直连','GEOIP,CN,直连']) assert(cfg.rules.includes(rule), rule);
  assert(!cfg.rules.some(r => r.startsWith('GEOIP,SG,')));
});
test('Taiwan and residential groups work; chain proxy remains off by default', () => {
  const cfg = run({ proxies: [{ name: 'T\u200bW 家宽 Test', type: 'socks5', server: '192.0.2.1', port: 1080 }] });
  assert(cfg['proxy-groups'].some(g => g.name.includes('台湾')));
  assert(cfg['proxy-groups'].some(g => g.name.includes('家宽节点')));
  assert(!cfg['proxy-groups'].some(g => g.name.includes('链式')));
});
test('domain routing precedes service IP fallbacks; Synology remains direct', () => {
  const cfg = run();
  assert(cfg.rules.includes('RULE-SET,synology,直连'));
  const github = cfg.rules.indexOf('RULE-SET,github,GitHub');
  const googleIp = cfg.rules.indexOf('RULE-SET,google_ip,Google');
  assert(github >= 0 && googleIp > github);
  assert(cfg['rule-providers'].emby.url.includes('appshubcc/bett-rules@meta/geo/geosite/category-emby.mrs'));
});
test('both QUIC settings keep valid DNS and rule providers', () => {
  const enabled = run();
  const disabled = run(seed(), { 屏蔽代理QUIC流量: false });
  for (const cfg of [enabled, disabled]) {
    references(cfg);
    assert(!cfg['rule-providers'].cn_additional);
    assert(cfg.dns['fake-ip-filter'].includes('rule-set:cn'));
  }
  assert(enabled.rules.some(rule => rule.includes('(DST-PORT,443)') && rule.includes('(RULE-SET,cn)')));
  assert(!disabled.rules.some(rule => rule.includes('(DST-PORT,443)')));
});
test('mining routes precede Crypto and catch-all rules in full and minimal modes', () => {
  for (const options of [{}, { 极简国内外分流模式: true }]) {
    const cfg = run(seed(), options);
    references(cfg);
    assert.deepEqual(cfg.rules.slice(0, 2), [
      'DOMAIN-SUFFIX,kryptex.network,DIRECT',
      'PROCESS-NAME,SRBMiner-MULTI.exe,DIRECT',
    ]);
    assert(cfg.dns['fake-ip-filter'].includes('+.kryptex.network'));
    assert.deepEqual(cfg.dns['nameserver-policy']['+.kryptex.network'], cfg.dns['direct-nameserver']);
    assert(!cfg.rules.includes('DOMAIN-SUFFIX,kryptex.com,DIRECT'));
    assert(!cfg.rules.some(rule => rule.startsWith('DST-PORT,7048,')));
  }
});

if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(run(), null, 2));
console.log(`${count} checks passed`);
