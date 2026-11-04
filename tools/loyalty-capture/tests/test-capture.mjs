import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Entire test is offline: preload replaces global fetch before capture imports run.
const root=path.dirname(fileURLToPath(import.meta.url));
const capture=path.join(root,'..','square-loyalty-capture.mjs');
const mock=path.join(root,'mock-square.mjs');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pj-loyalty-test-'));
fs.chmodSync(scratch,0o700);
function invoke(folder,paused=false) {
 return spawnSync(process.execPath,['--import',mock,capture,'--out='+folder],{
  encoding:'utf8',
  env:{...process.env,SQUARE_LOYALTY_READ_TOKEN:'OFFLINE_FIXTURE_NOT_A_REAL_SECRET',
    FIXTURE_INACTIVE:paused?'1':'0'},
  timeout:15000
 });
}
try {
 const dest=path.join(scratch,'archive');
 const first=invoke(dest);
 assert.equal(first.status,0,first.stderr);
 const state=JSON.parse(fs.readFileSync(path.join(dest,'manifest.json'),'utf8'));
 assert.equal(state.status,'captured');
 assert.equal(state.streams.accounts.pages,2);
 assert.equal(state.streams.accounts.count,3);
 assert.ok(Object.values(state.streams).every(s=>s.complete));

 const audit=JSON.parse(fs.readFileSync(path.join(dest,'review.json'),'utf8'));
 assert.equal(audit.complete,true);
 assert.equal(audit.streams.accounts.totals.squareOutstanding,315);
 assert.equal(audit.streams.accounts.totals.squareLifetimeEarned,505);
 assert.equal(audit.streams.accounts.totals.pointsAboveCap,5);
 assert.equal(audit.streams.accounts.totals.accountsAbove275,1);
 assert.equal(audit.streams.rewards.issuedRewards,1);
 assert.equal(fs.statSync(dest).mode&0o077,0);

 const second=invoke(dest);
 assert.equal(second.status,0,second.stderr);
 const resumed=JSON.parse(fs.readFileSync(path.join(dest,'manifest.json'),'utf8'));
 assert.equal(resumed.streams.accounts.count,3,'repeated capture cannot double-count');

 const inactiveDir=path.join(scratch,'paused');
 const inactive=invoke(inactiveDir,true);
 assert.notEqual(inactive.status,0,'paused program must refuse capture');
 assert.equal(fs.existsSync(inactiveDir),false,'paused program must not persist data');
 console.log('PASS offline: Square mock pages, checkpoint, totals, 275 ceiling, rerun, pause refusal.');
} finally {
 fs.rmSync(scratch,{recursive:true,force:true});
}
