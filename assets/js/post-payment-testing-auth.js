/* Isolated Supabase Testing sign-in, limited to GitHub Pages Dev previews
 * and localhost. Does not modify the Production PJAuth client.
 * NEVER load on pepperjunction401.com or www.pepperjunction401.com.
 */
(function(){
  'use strict';
  var host=location.hostname.toLowerCase();
  var dev=host==='pepperjunction401-beep.github.io' || host==='localhost' || host==='127.0.0.1';
  var api=null;
  if(dev && window.supabase && typeof window.supabase.createClient==='function'){
    api=window.supabase.createClient(
      'https://slubpfmpjgoupujptayy.supabase.co',
      'sb_publishable_Yqg6Y8-c2Kf_T6s9D-76WQ_aVqxLyTo',
      {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,
        storageKey:'pj_postpay_isolated_testing_auth'}}
    );
  }
  window.PJPostPaymentTestingAuth=Object.freeze({client:api,enabled:!!api});
  function setMessage(message){
    var el=document.getElementById('postpay-test-auth-status');
    if(el)el.textContent=message;
  }
  document.addEventListener('DOMContentLoaded',function(){
    var panel=document.getElementById('postpay-test-auth-panel');
    var form=document.getElementById('postpay-test-auth-form');
    var logout=document.getElementById('postpay-test-signout');
    if(!panel||!form)return;
    panel.hidden=!api;
    if(!api)return;
    async function reflect(){
      var result=await api.auth.getUser();
      var user=!result.error&&result.data&&result.data.user;
      if(logout)logout.hidden=!user;
      setMessage(user?'Signed in to isolated Testing.':'Sign in with an existing isolated Testing account.');
    }
    form.addEventListener('submit',async function(ev){
      ev.preventDefault();
      var email=form.elements.namedItem('email');
      var password=form.elements.namedItem('password');
      if(!email||!password)return;
      var submit=form.querySelector('button[type=submit]');
      if(submit)submit.disabled=true;
      try{
        var result=await api.auth.signInWithPassword({email:email.value,password:password.value});
        password.value='';
        if(result.error)throw result.error;
        await reflect();
        if(window.PJPostPaymentReloadAwards)await window.PJPostPaymentReloadAwards();
      }catch(_){setMessage('Testing sign-in could not be verified. Check your Testing account credentials.');}
      finally{if(submit)submit.disabled=false;}
    });
    if(logout)logout.addEventListener('click',async function(){
      await api.auth.signOut({scope:'local'});
      await reflect();
      if(window.PJPostPaymentReloadAwards)await window.PJPostPaymentReloadAwards();
    });
    reflect().catch(function(){setMessage('Testing authentication is unavailable.');});
  });
})();
