// Temporary Testing-only Owner Dashboard login/verification page.
// Serves HTML only. All private data requires pj-owner-dashboard's server-side owner checks.
// Never deploy this function to Production or expose service keys to browser.
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Pepper Junction — Testing Owner Control Room</title>
<style>body{background:#152a20;color:#fff4d8;font:16px system-ui,sans-serif;margin:0}main{max-width:900px;margin:32px auto;padding:0 20px}h1{font-family:Georgia,serif;color:#f4d9a3}h2{margin-top:32px}input,button{font:inherit;padding:12px;border-radius:6px;border:1px solid #ad915d}input{width:100%;max-width:390px;box-sizing:border-box}button{background:#e1bb75;color:#16291e;font-weight:bold;cursor:pointer}button:disabled{opacity:.6}label{display:block;margin:12px 0 5px}article{background:#244333;border:1px solid #a58c5b;padding:18px;border-radius:9px}#metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px;margin-top:22px}strong.number{display:block;font-size:29px;margin-top:12px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #6b806b;padding:12px 4px;text-align:left;overflow-wrap:anywhere}a{color:#e1bb75}.notice{color:#e6c58f}#status{min-height:25px;margin:16px 0}</style></head><body><main><h1>Pepper Junction — Owner Control Room</h1><p class="notice">SUPABASE TESTING ONLY · This page is not the live Pepper Junction website.</p>
<section id="login"><form id="form"><label for="email">Owner email</label><input id="email" type="email" autocomplete="username" value="john@pepperjunction401.com" required><label for="pass">Testing account password</label><input id="pass" type="password" autocomplete="current-password" required><p><button id="signIn" type="submit">Sign in to Testing</button></p></form></section>
<p id="status" role="status" aria-live="polite">Sign in using your Supabase Testing owner account.</p>
<section id="content" hidden><button id="refresh" type="button">Refresh</button> <button id="signOut" type="button">Sign out</button><div id="metrics"><article>Registered passengers<strong id="registered" class="number">—</strong></article><article>Verified passengers<strong id="verified" class="number">—</strong></article><article>Flagged reviews<strong id="flags" class="number">—</strong></article></div><h2>Recent registrations</h2><table><thead><tr><th>Registered</th><th>Email</th><th>Status</th></tr></thead><tbody id="recent"></tbody></table><p id="updated"></p></section>
</main><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script>
(function(){'use strict';
const url='https://slubpfmpjgoupujptayy.supabase.co';
const publicKey='sb_publishable_Yqg6Y8-c2Kf_T6s9D-76WQ_aVqxLyTo';
const app=window.supabase.createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
const $=id=>document.getElementById(id),state=t=>{$('status').textContent=t;};
function text(id,value){$(id).textContent=String(value);}
async function load(){
 state('Verifying owner permissions…');$('content').hidden=true;
 const session=await app.auth.getSession();
 if(!session.data.session)throw Error('No active Testing session.');
 const result=await app.functions.invoke('pj-owner-dashboard',{body:{action:'summary'},headers:{Authorization:'Bearer '+session.data.session.access_token}});
 if(result.error||!result.data?.ok){const detail=result.data?.error||'Owner dashboard access denied.';throw Error(detail);}
 const d=result.data;text('registered',d.registeredCount);text('verified',d.verifiedCount);text('flags',d.flaggedCount);
 text('updated','Updated '+new Date(d.asOf).toLocaleString()+(d.complete?'':' · Account count is incomplete'));
 const body=$('recent');body.replaceChildren();
 for(const u of d.recent||[]){const row=document.createElement('tr');
 for(const v of [new Date(u.createdAt).toLocaleString(),u.email||'—',u.verified?'Verified':'Unverified']){
 const td=document.createElement('td');td.textContent=v;row.appendChild(td);}body.appendChild(row);}
 $('login').hidden=true;$('content').hidden=false;state('Testing owner access verified.');
}
$('form').onsubmit=async e=>{
 e.preventDefault();$('signIn').disabled=true;state('Signing in to Supabase Testing…');
 try{const result=await app.auth.signInWithPassword({email:$('email').value.trim(),password:$('pass').value});
 $('pass').value='';if(result.error)throw result.error;await load();}
 catch(err){state('Sign-in or owner authorization failed: '+(err.message||'Try again.'));await app.auth.signOut();$('login').hidden=false;}
 finally{$('signIn').disabled=false;}
};
$('refresh').onclick=async()=>{try{await load()}catch(e){state('Dashboard unavailable: '+e.message)}};
$('signOut').onclick=async()=>{await app.auth.signOut();$('content').hidden=true;$('login').hidden=false;state('Signed out of Testing.')};
})();
</script></body></html>`;
Deno.serve(req=>{
 if(req.method!=="GET")return new Response("Method not allowed",{status:405});
 const url=Deno.env.get("SUPABASE_URL")||"";
 if(!url.includes("slubpfmpjgoupujptayy"))return new Response("Not available outside Testing",{status:403});
 return new Response(PAGE,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","x-frame-options":"DENY","referrer-policy":"no-referrer"}});
});