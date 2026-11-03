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
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    );
  }
  async function verifiedUser() {
    if (!api) return null;
    // getUser() checks with Supabase rather than trusting a browser-owned user object.
    var response = await api.auth.getUser();
    if (response.error || !response.data || !response.data.user) return null;
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