import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const read=(path)=>fs.readFileSync(path,'utf8');const main=(path)=>execFileSync('git',['show','origin/main:'+path],{encoding:'utf8'});
const paths=execFileSync('git',['diff','--name-only','origin/main','HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const permitted=new Set([
 'passenger-station.html','assets/js/post-payment-badges.js','supabase/functions/post-payment-awards-read/index.ts',
 'supabase/migrations/20261106141500_g9_state_badge_isolated_foundation.sql',
 'supabase/migrations/20261106194000_g9_state_queue_ordering_and_indexes.sql',
 'supabase/migrations/20261106225000_g9_state_depot_customer_projection.sql',
 'tools/g9-release-tmp/verify-depot.mjs','tools/g9-release-tmp/verify-postpayment-browser.mjs',
 'tools/g9-release-tmp/verify-server-g9.mjs','tools/g9-release-tmp/verify-isolation.mjs',
 '.github/workflows/g9-release-gate-20261107.yml'
]);
for(const p of paths)assert.ok(permitted.has(p),'UNAPPROVED FILE '+p);
for(const p of ['account.html','assets/js/pj-auth.js','assets/js/pj-product.js','assets/css/pj-product.css',
 'assets/js/post-payment-cart-clear.js','assets/js/post-payment-awards-art.js','assets/js/post-payment-awards-read.js',
 'post-payment-badges.html','post-payment-badges-testing.html'])
 assert.equal(read(p),main(p),'shared/non-G9 source changed: '+p);
const station=read('passenger-station.html'),old=main('passenger-station.html');
function section(x,key){const start='&lt;section class=&quot;badge-category&quot; id=&quot;'+key+'&quot;&gt;';
 const a=x.indexOf(start);assert.ok(a>=0);const b=x.indexOf('&lt;/section&gt;',a);
 assert.ok(b>a);return x.slice(a,b+'&lt;/section&gt;'.length);
}
assert.equal(section(station,'loyalty'),section(old,'loyalty'),'FROZEN loyalty markup differs');
assert.ok(!station.includes('pj_loyalty_my_collection'),'Frozen loyalty RPC copied');
assert.ok(!station.includes('PJ Credits: '),'Frozen Credits display copied');
assert.ok(!station.includes('pj_loyalty_my_onboarding'),'Loyalty onboarding copied');
assert.equal((section(station,'states').match(/coin-badge-name&quot;&gt;[A-Za-z ]+&lt;\/div&gt;/g)||[]).length,50);
assert.equal((section(station,'states').match(/census-region-heading&quot;/g)||[]).length,4);
assert.equal((section(station,'states').match(/census-division-heading&quot;/g)||[]).length,9);
assert.ok(station.includes("const stateResult=results[11]"));
assert.ok(station.includes("auth.client.rpc('pj_state_my_collection')"));
assert.ok(station.includes('G9 secrets: show ONLY division awards'));
const reader=read('supabase/functions/post-payment-awards-read/index.ts'),base=main('supabase/functions/post-payment-awards-read/index.ts');
const baseOrigins=base.slice(base.indexOf('const allowedOrigins = '),base.indexOf(']);',base.indexOf('const allowedOrigins = '))+3);
assert.ok(reader.includes(baseOrigins),'Allowed production origins changed');
assert.ok(reader.includes('pj_state_purchase_credits')&&reader.includes('pj_state_secret_awards'));
assert.ok(!reader.includes('slubpfmpjgoupujptayy'),'TESTING HOST LEAK INTO PROD');
assert.ok(!/pj_credit|pj_loyalty|PJ Credits|Loyalty Bridge/i.test(reader));
assert.ok(read('assets/js/post-payment-badges.js').includes("response.data.state_processing === 'pending'"));
const mig=paths.filter(x=>x.startsWith('supabase/migrations/'));assert.equal(mig.length,3);
for(const p of mig)assert.ok(!/pj_credit_|pj_loyalty_|PJ Credits|Loyalty Bridge/i.test(read(p)));
console.log('PASS release boundary: only 6 G9 production payload files (+ temporary tests); frozen Loyalty markup preserved byte-for-byte, no frozen PJ Credits runtime, existing cart/auth/product untouched.');
