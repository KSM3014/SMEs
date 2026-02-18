const fs = require('fs');
const d = JSON.parse(fs.readFileSync(__dirname + '/api_endpoints_v4.json', 'utf-8'));

console.log('Total:', d.length);
console.log('With endpoint:', d.filter(r => r.endpoint).length);
console.log('With baseUrl:', d.filter(r => r.baseUrl).length);
console.log('With ops:', d.filter(r => r.operations && r.operations.length > 0).length);
console.log('');

// Summary by provider
const providers = {};
d.forEach(r => {
  const p = r.name.split('_')[0];
  if (!providers[p]) providers[p] = { count: 0, withEp: 0, totalOps: 0 };
  providers[p].count++;
  if (r.endpoint || r.baseUrl) providers[p].withEp++;
  providers[p].totalOps += (r.operations ? r.operations.length : 0);
});

console.log('--- Summary by provider ---');
Object.entries(providers).sort((a, b) => b[1].count - a[1].count).forEach(([p, s]) => {
  console.log(`${p}: ${s.count} APIs, ${s.withEp} with EP, ${s.totalOps} ops total`);
});

console.log('');
console.log('--- All endpoints ---');
d.forEach((r, i) => {
  const ep = r.endpoint || r.baseUrl || '(NONE)';
  console.log(`${i + 1}. ${r.name.substring(0, 40)} | ${ep} | ops:${r.operations ? r.operations.length : 0} | fmt:${r.dataFormat}`);
});
