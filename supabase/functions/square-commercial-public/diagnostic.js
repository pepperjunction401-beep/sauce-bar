// Diagnostic output is allowlisted; never print raw errors, headers, JWTs or credentials.
const KNOWN_PRODUCT_IDS = new Set(["13-stars-dragons-breath","2-pig-mafia-steak-seasoning-14oz","ariston-black-cherry-infused-balsamic-vinegar","ariston-chili-infused-olive-oil","ariston-fig-infused-balsamic-vinegar","ariston-garlic-infused-olive-oil","ariston-lemon-infused-olive-oil","ariston-tuscan-herb-infused-olive-oil","ashley-foods-mad-dog-sriracha","ass-kickin-habanero-garlic-salt","cajohns-la-segadora-carolina-reaper","defcon-cluckwing","defcon-condition-2","defcon-condition-3","defcon-curbstomp","dirty-dicks-hot-tropical-hot-sauce","ghost-scream","heartbreaking-dawns-the-green","hells-kitchen-black-forest","hells-kitchen-black-westside-red","hells-kitchen-cinnamon-ghost","hells-kitchen-coconut-curry","high-river-sauces-foo-foo-mama-choo","high-river-sauces-hellacious","high-river-sauces-peppers-up","high-river-sauces-psych-sauce","high-river-sauces-rogue","high-river-sauces-taco-x","high-river-sauces-tears-of-the-sun","high-river-sauces-thunder-juice","melindas-chipotle-ketchup","melindas-mango-habanero","melindas-naga-jolokia-ketchup","melindas-original-naga-jolokia","melindas-scotch-bonnet-sauce","mikey-vs-gator-toes-bbq","mikey-vs-gator-toes-buffalo","mikey-vs-gator-toes-dill-pickle","mikey-vs-gator-toes-loco-spice","mikey-vs-gator-toes-spicy","mikey-vs-ghostly-garlic","mikey-vs-i-love-taco-sauce-hot","mikey-vs-jalapeno-dill-pickle","mikey-vs-reaper-jalapeno-dill-pickle","pepper-junction-all-purpose-spg-14oz","puckerbutt-puckerbutt-gator-sauce","rheds-deja-vu","rheds-lemon-drop","rheds-original","sauce-crafters-colon-cleaner-mustard","sauce-crafters-hogs-ass-garlic-habanero-sauce","sauce-crafters-mountain-man-fire-roasted-habanero","sauce-leopard-road-dawg-red-chili-garlic","stanky-honey-mango-habanero","stanky-sauce-clasico","suckelbusters-1836-14oz","sucklebusters-bamm-14oz","sucklebusters-bbq-chipotle","sucklebusters-clucker-dust-14oz","sucklebusters-hogwaller-14oz","sucklebusters-original-bbq","sweet-gs-smoked-cheddar-pretzels-sourdough","sweet-gs-smoked-cheddar-pretzels-spicy","the-spicy-shark-habanero-maple-syrup","walker-son-slap-ya-mama-cajun-hot","walker-son-slap-ya-mama-cajun-low-sodium","walker-son-slap-ya-mama-cajun-original","walker-son-slap-ya-mama-hot-sauce"]);
const SAFE_JWT_MESSAGES = new Set([
  "JWT expired",
  "JWT not yet valid",
  "JWT issued at future",
  "JWT not in audience",
  "Parsing claims failed",
  "The JWT 'exp' claim must be a number",
  "The JWT 'nbf' claim must be a number",
  "The JWT 'iat' claim must be a number",
  "The JWT 'aud' claim must be a string or an array of strings",
  "Empty JWT is sent in Authorization header",
  "JWT cryptographic operation failed",
  "JWT couldn't be decoded",
  "Server lacks JWT secret",
  "Anonymous access is disabled",
]);

export function commercialDiagnostic(query, error, productIds, timestamp) {
  const code = typeof error?.code === "string" && /^PGRST[0-9]{3}$/.test(error.code)
    ? error.code : "unclassified";
  const message = typeof error?.message === "string" && SAFE_JWT_MESSAGES.has(error.message)
    ? error.message : "[unrecognized message withheld]";
  const knownIds = productIds.filter(id => KNOWN_PRODUCT_IDS.has(id));
  return {
    event: "square-commercial-db-error",
    query,
    code,
    message,
    timestamp,
    product_ids: knownIds,
    unknown_product_count: productIds.length - knownIds.length,
  };
}
