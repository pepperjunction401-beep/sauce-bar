/* Pepper Junction Phase 4 — browser-only Supabase Auth client.
   Publishable key only; this file must NEVER contain service-role credentials.
   Authentication is enabled only on first-party Pepper Junction or local development origins.
   External HTML previews remain visual previews, not places to enter credentials. */
(function () {
  'use strict';
  var host = window.location.hostname.toLowerCase();
  // Explicit environment boundary: local Sauce-Bar-Dev testing uses
  // isolated Supabase Testing. Live Pepper Junction domains use Production.
  // Never use Netlify or an external preview to establish customer sessions.
  var isLocalDev = host === 'localhost' || host === '127.0.0.1';
  var isLiveDomain = host === 'pepperjunction401.com' ||
    host === 'www.pepperjunction401.com';
  var firstParty = isLocalDev || isLiveDomain;
  var api = null;
  if (firstParty && window.supabase && typeof window.supabase.createClient === 'function') {
    api = window.supabase.createClient(
      isLocalDev ? 'https://slubpfmpjgoupujptayy.supabase.co' : 'https://cdbenwthxhypuuipyjlv.supabase.co',
      isLocalDev ? 'sb_publishable_Yqg6Y8-c2Kf_T6s9D-76WQ_aVqxLyTo' : 'sb_publishable_1VOvjHvVLszMI_Rrb-tfig_Ox_EitKr',
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
        // Match the checkout's browser-tab session boundary; do not persist
        // customer credentials in localStorage between browser sessions.
        storage: window.sessionStorage } }
    );
  }
  async function verifiedUser() {
    if (!api) return null;
    // Restore the current tab's Supabase session (refreshing tokens if needed)
    // before asking the server to verify customer identity.
    var restored = await api.auth.getSession();
    if (restored.error) throw restored.error;
    if (!restored.data || !restored.data.session) return null;
    // A network/server verification failure is NOT proof of sign-out.
    // Only a missing or explicitly rejected session should prompt login.
    var response = await api.auth.getUser();
    if (response.error) {
      if (response.error.status === 401 || response.error.status === 403) return null;
      throw response.error;
    }
    if (!response.data || !response.data.user) return null;
    var u = response.data.user;
    return u.email && u.email_confirmed_at ? u : null;
  }
  function destination() { return 'passenger-station.html'; }
  function loginLocation() { return 'account.html?return=station'; }
  window.PJAuth = Object.freeze({
    client: api,
    firstParty: firstParty,
    enabled: !!api,
    verifiedUser: verifiedUser,
    destination: destination,
    loginLocation: loginLocation,
    signOut: async function () {
      if (!api) throw new Error('Authentication is unavailable on this preview.');
      return api.auth.signOut({scope:'local'});
    }
  });
})();