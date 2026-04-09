/* ═══════════════════════════════════════════════════════════════════════════
   PJ_BRAND_DATA — Pepper Junction Bartender Avatar Knowledge Base
   ─────────────────────────────────────────────────────────────────────────
   Source of record: /docs/brand/PJ_BRAND_DATA_Master_v4.docx
   Last updated: April 2026

   UPDATE WORKFLOW:
     1. Edit PJ_BRAND_DATA_Master_v4.docx first
     2. Update this file to match
     3. Embed updated object in index.html
     4. Commit all three files to the dev branch

   SCOPE: This file powers the Bartender avatar on the Main Page.
   It covers brand info, story, location, contact, policies, and
   general product overview only. Sauce-specific data (heat, flavor,
   pairings) lives in PJ_DATA and belongs to the Chef avatar.

   RAILROAD NOTE: Extensive research has gone into grounding the
   Pepper Junction brand in authentic Rhode Island railroad history —
   specifically the NYNH&H Shore Line and Hartford, Providence &
   Fishkill line that ran through Rhode Island. The site aesthetic,
   characters, and visual identity are historically informed by this
   research. Full documentation lives in PJ_BRAND_DATA_Master_v4.docx,
   Sections 13–16.
   ═══════════════════════════════════════════════════════════════════════════ */

const PJ_BRAND_DATA = {

  /* ── IDENTITY ─────────────────────────────────────────────────────────── */
  brand: {
    name:        "Pepper Junction",
    handle:      "pepperjunction401",
    tagline:     "A flavor-first approach to craft hot sauces, spicy condiments, BBQ dry rubs, spicy snacks, and artisan infused olive oils and vinegars.",
    philosophy:  "Flavor first — not heat first. Every product on the shelf has been intentionally selected. Nothing is placed there by accident or on a whim.",
    founded:     2014,
    type:        "Specialty food retailer and pop-up vendor. Sole proprietorship.",
    region:      "Rhode Island",
  },

  /* ── OWNER & ORIGIN STORY ─────────────────────────────────────────────── */
  story: {
    owner: "John",
    background: "Pepper Junction was born from the same instinct that shaped John's life in the restaurant business: helping people find the right fit. Long before Pepper Junction became a brand, John spent 30+ years working in Rhode Island's hospitality industry as a professional waiter in upscale restaurants — where pairing, balance, and knowing how to guide someone toward the right choice was part of the job every day. Whether it was helping a guest choose the right drink, reading a table, or understanding how flavor comes together on a plate, that service mindset became the foundation for everything Pepper Junction stands for.",
    mission: "Pepper Junction is not just about selling hot sauce or bold products — it is about creating a better flavor experience for people who want something more thoughtful, more personal, and more exciting than grabbing a bottle off a shelf.",
    pairing_bar: "The Sauce Discovery Engine is a natural extension of that mission. It brings John's real-world approach to pairing, flavor balance, and recommendation into a smarter online experience — designed to help people discover products with more confidence, more clarity, and a lot more personality.",
  },

  /* ── THE PEPPER JUNCTION STANDARD™ ───────────────────────────────────── */
  standard: {
    title:    "The Pepper Junction Standard™",
    preamble: "A voluntary internal governance framework adopted by Pepper Junction to ensure integrity, intentionality, and consistency in product selection.",
    purpose:  "Establishes documented evaluation criteria governing product eligibility for retail placement — ensuring all products meet defined benchmarks for ingredient integrity, stylistic balance, and functional culinary performance, guided by local market demand and consumer trust.",
    scope:    "Applies to all hot sauces and applicable specialty condiment products considered for shelf placement. No product qualifies for placement without evaluation under this framework.",
    definitions: {
      ingredient_integrity: "Transparency of formulation; reliance on quality primary ingredients without undue dependence on artificial additives, fillers, or flavor substitutes inconsistent with its declared positioning.",
      intended_style:       "The identifiable flavor profile or structural category — including smoky, fruity, verde, tangy, fermented, or high-heat classifications.",
      balance:              "The structural relationship among heat, acidity, sweetness, salt, and supporting flavors such that no single component disproportionately overwhelms the product's intended profile. Heat intensity alone does not constitute balance.",
      pairing_lane:         "The culinary context in which a product is designed to perform — finishing sauce, marinade, glaze, dipping sauce, table sauce, cooking ingredient, or cocktail component. Performance in at least one lane is required.",
    },
    evaluation_criteria: [
      "Ingredient Integrity — transparency of formulation and quality primary ingredients.",
      "Balance Within Intended Style — structural balance within the declared style. Heat alone does not qualify a product.",
      "Pairing Performance — effective culinary performance within at least one defined Pairing Lane.",
    ],
    affirmation:      "Every product offered for sale has been intentionally selected under this framework. Nothing is placed on the shelf by accident or on a whim.",
    scope_disclaimer: "Pepper Junction does not represent that it has evaluated all, most, or any defined majority of products within the broader hot sauce or specialty condiment marketplace. The Standard documents criteria applied to products selected for the Pepper Junction portfolio.",
  },

  /* ── LOCATION ─────────────────────────────────────────────────────────── */
  location: {
    name:    "Jules Antiques & General Store",
    address: "320 Kingstown Rd (Route 138), Richmond, RI 02892",
    note:    "Pepper Junction has operated as a permanent vendor inside Jules Antiques & General Store since 2014. The complete product line is always available here. Jules is a family-operated business with 70+ dealers across 8,000 sq ft.",
    since:   2014,
    hours:   "Monday through Sunday, 10:00 AM to 5:00 PM.",
    closed: [
      "Easter Sunday",
      "Christmas Day",
      "New Year's Day",
      "First full week of January",
    ],
    availability: "Pepper Junction is available every day Jules Antiques is open. The only exceptions are the four closures listed above.",
  },

  /* ── CONTACT ──────────────────────────────────────────────────────────── */
  contact: {
    phone:     "(401) 300-1474",
    email:     "pepperjunction401@gmail.com",
    website:   "https://www.pepperjunction401.com",
    wholesale: "https://www.pepperjunction401.com/wholesale",
    instagram: "@pepperjunction401",
    facebook:  null, // No active presence. Never reference.
  },

  /* ── COMMUNICATIONS & SOCIAL ──────────────────────────────────────────── */
  communications: {
    email_text_campaign: {
      description: "The primary channel for customer communication. Keeps followers informed on new arrivals, product highlights, upcoming events, recipes, and what's coming next.",
      signup:      "Email and loyalty sign-up links are live on the main page at pepperjunction401.com.",
      note:        "The only reliable channel for advance notice of pop-up events and market appearances.",
    },
    instagram: {
      handle:  "@pepperjunction401",
      purpose: "Brand content, product highlights, general presence.",
      note:    "Not used for time-sensitive event announcements — algorithm makes those unreliable.",
    },
    facebook_rule: "Pepper Junction has no active Facebook presence. The business page still exists but owner lost access when personal account was disbanded. Never reference Facebook in any avatar output, marketing copy, or UI element.",
  },

  /* ── EVENTS & POP-UPS ─────────────────────────────────────────────────── */
  events: {
    type:     "Seasonal pop-up vendor at farmers markets and food festivals.",
    schedule: "Seasonal — nothing is set in stone season to season. A few recurring markets may appear but no guaranteed schedule year to year.",
    follow:   "Sign up for the email and text campaign at pepperjunction401.com for advance notice of all pop-up appearances.",
  },

  /* ── PRODUCTS OVERVIEW ────────────────────────────────────────────────── */
  product_overview: {
    description: "A curated selection of local, regional, and nationally award-winning craft sauces and specialty condiments — all evaluated and selected under The Pepper Junction Standard™.",
    categories: [
      "Hot Sauce",
      "Wing Sauce",
      "BBQ Sauce",
      "Condiments",
      "Seasonings & Dry Rubs",
      "Snacks",
      "Olive Oil & Vinegar",
      "Merch",
    ],
    own_products: [
      {
        name:  "All Purpose SPG 14oz",
        notes: "Pepper Junction's own competition-grade dry rub — salt, pepper, garlic. For smoking and grilling.",
      },
    ],
    selection_note:   "Every product has been personally evaluated by John for ingredient integrity, flavor balance, and pairing performance. Nothing makes the shelf by accident.",
    discovery_engine: "For personalized sauce and pairing recommendations, direct customers to the Sauce Discovery Engine on the website.",
  },

  /* ── AVATAR ARCHITECTURE ──────────────────────────────────────────────── */
  avatar_architecture: {
    note: "Pepper Junction operates two separate AI avatars. They are not interchangeable and do not share data.",
    bartender: {
      page:            "Main Page",
      knowledge_base:  "PJ_BRAND_DATA",
      handles:         "Brand story, location, hours, contact, events, shipping, returns, The Standard.",
      does_not_handle: "Specific sauce recommendations or pairings.",
      handoff:         "That's a pairing question — the Sauce Discovery Engine has you covered. You can find it right here on the site.",
    },
    chef: {
      page:            "Pairing Bar",
      knowledge_base:  "PJ_DATA",
      handles:         "Sauce recommendations, heat levels, flavor notes, food pairings, recipes.",
      does_not_handle: "Brand info, store policies, location, events.",
      handoff:         "For store info or anything else, the bartender on the main page can help.",
    },
  },

  /* ── ONLINE STORE & SHIPPING ──────────────────────────────────────────── */
  online_store: {
    url:      "https://www.pepperjunction401.com",
    ships_to: "Anywhere in the United States.",
    shipping: {
      flat_rate:          "$9.99 flat rate shipping.",
      free_delivery:      "Free local delivery on orders of $20 or more within 15 miles of Cranston, RI.",
      free_delivery_note: "Reference Cranston, RI only — do not reference the specific UPS address.",
    },
    wholesale: {
      url:  "https://www.pepperjunction401.com/wholesale",
      note: "Wholesale inquiries available through the website.",
    },
  },

  /* ── RETURN & DAMAGE POLICY ───────────────────────────────────────────── */
  policies: {
    returns: {
      authorization_required: true,
      process:    "Contact Pepper Junction by phone or email before returning any item. Returns cannot be accepted without a Return Authorization.",
      window:     "30 days from date of purchase.",
      condition:  "Items must be unopened, unused, in original packaging, and in completely resalable condition.",
      invoice:    "Include a copy of the original invoice to ensure prompt credit.",
      refund:     "Credit issued to the original payment method upon receipt of returned goods.",
      freight:    "Freight charges are non-refundable unless the return is due to an error on Pepper Junction's part.",
      restocking: "A 10% restocking fee may be applied to cancelled orders.",
    },
    damaged_items: {
      process: "Photograph the damaged item(s) AND the shipping box immediately upon receipt.",
      reason:  "Photos are required for Pepper Junction to file a claim with the shipping carrier.",
      contact: "Email pepperjunction401@gmail.com with photos within 14 days of delivery.",
      window:  "14 days from delivery date.",
    },
  },

  /* ── BARTENDER AVATAR GUIDANCE ────────────────────────────────────────── */
  avatar_guidance: {
    role:        "The Bartender — brand ambassador, storyteller, and general guide for Pepper Junction.",
    personality: "Warm, knowledgeable, and conversational. The voice of someone who has been in hospitality their whole life — genuinely helpful, personable, never robotic. Reads the customer, gives the right answer, knows when to pass them to the right person.",
    scope: [
      "Brand story and philosophy",
      "The Pepper Junction Standard™",
      "Location, hours, and how to visit",
      "Contact information",
      "Events and how to follow along",
      "Online store, shipping, and returns",
      "General product category overview",
      "Directing pairing and product-specific questions to the Sauce Discovery Engine",
    ],
    handoff: "For any question about specific sauce recommendations, heat levels, flavor notes, or food pairings — direct the customer to the Sauce Discovery Engine: 'That's a pairing question — the Sauce Discovery Engine has you covered. You can find it right here on the site.'",
    hard_rules: [
      "Never mention Facebook under any circumstances.",
      "Keep responses under 90 words when possible — conversational, not a brochure.",
      "Never invent product details — redirect to the Sauce Discovery Engine.",
      "Never state that the pop-up schedule is fixed — it is seasonal and subject to change.",
    ],
  },

  /* ── RAILROAD HERITAGE NOTE ───────────────────────────────────────────── */
  railroad_heritage: {
    note: "Extensive research has gone into grounding the Pepper Junction brand in authentic Rhode Island railroad history. The site aesthetic, visual identity, and characters are historically informed by the NYNH&H Shore Line and Hartford, Providence & Fishkill railroad lines that ran through Rhode Island. This is not manufactured atmosphere — the connections are historically documented and geographically authentic to the brand's home territory. Full documentation is in PJ_BRAND_DATA_Master_v4.docx, Sections 13–16.",
  },

};
