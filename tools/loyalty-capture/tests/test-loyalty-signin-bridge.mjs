import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const account=fs.readFileSync(path.join(root,'account.html'),'utf8');
const depot=fs.readFileSync(path.join(root,'passenger-station.html'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261104142500_pj_loyalty_authenticated_onboarding_gate.sql'),'utf8');
const exchange=fs.readFileSync(path.join(root,'supabase/migrations/20261104143000_pj_bridge_prelaunch_lock_and_exchange_quote.sql'),'utf8');
const auth=fs.readFileSync(path.join(root,'assets/js/pj-auth.js'),'utf8');

assert.equal((account.match(/api\.rpc\('pj_loyalty_my_onboarding'\)/g)||[]).length,1);
assert.ok(account.indexOf("api.rpc('pj_loyalty_my_onboarding')")>
  account.indexOf("await api.functions.invoke(matchFunction"));
assert.ok(account.indexOf("api.rpc('pj_loyalty_my_onboarding')")<
  account.indexOf("location.assign(from === 'post-payment'"));
assert.ok(account.includes("console.warn('Loyalty onboarding deferred; customer sign-in preserved."));

// Compile the account page script, without executing a live account session.
const scripts=[...account.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(x=>x[1]).filter(Boolean);
assert.equal(scripts.length,1);
new vm.Script(scripts[0],{filename:'account.html:inline'});
assert.ok(depot.includes("status==='prelaunch_locked'"));
assert.ok(migration.includes("v_customer:=auth.uid()"));
assert.ok(!migration.includes("p_customer_id uuid"));
assert.ok(migration.includes("if not v_gate.transfers_enabled"));
assert.ok(migration.includes("if not v_gate.nonmember_history_enabled")===false,
 'Nonmember history must be a separate controlled replay, not an automatic credit path');
assert.ok(exchange.includes("display_enabled boolean not null default false"));
assert.ok(exchange.includes("exchange_enabled boolean not null default false"));
assert.ok(exchange.includes("'exchange_possible',false"));
assert.ok(exchange.includes("tokens','[]'::jsonb"));
assert.ok(!exchange.includes("insert into public.pj_credit_ledger"));
assert.ok(!auth.includes('SUPABASE_SERVICE_ROLE_KEY'));
console.log('PASS: sign-in RPC after Phase 1 match, nonblocking navigation, locked Depot, exchange quote-only');
