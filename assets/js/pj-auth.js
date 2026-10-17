/* Pepper Junction Phase 4 — browser-only Supabase Auth client.
   Publishable key only; this file must NEVER contain service-role credentials.
   Authentication is enabled only on first-party Pepper Junction or local development origins.
   External HTML previews remain visual previews, not places to enter credentials. */
(function () {
  'use strict';
  var host = window.location.hostname.toLowerCase();
  var firstParty = host === 'pepperjunction401.com' ||
    host === 'www.pepperjunction401.com' ||
    host === 'localhost' || host === '127.0.0.1';
  var api = null;
  if (firstParty && window.supabase && typeof window.supabase.createClient === 'function') {
    api = window.supabase.createClient(
      'https://cdbenwthxhypuuipyjlv.supabase.co',
      'sb_publishable_1VOvjHvVLszMI_Rrb-tfig_Ox_EitKr',
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