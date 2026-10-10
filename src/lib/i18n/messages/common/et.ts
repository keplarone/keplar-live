// et common catalog. Keys mirror messages/common/en.ts; anything missing falls back to English.
import type { CommonCatalog } from "../../types";

const m: CommonCatalog = {
  "credit": "Hassen ja Hussain Keder",
  "nav": {
    "product": "Toode",
    "resources": "Ressursid",
    "items": {
      "/features": "Kõik Keplaris",
      "/#demo": "Otsedemo",
      "/app/create": "Loo",
      "/enterprise": "Meeskonnad",
      "/docs": "Dokumentatsioon",
      "/pricing": "Hinnad",
      "/download": "Laadi alla"
    },
    "signIn": "Logi sisse",
    "account": "Konto",
    "try": "Proovi Keplarit",
    "open": "Ava Keplar",
    "openMenu": "Ava menüü",
    "closeMenu": "Sulge menüü"
  },
  "footer": {
    "headings": {
      "Product": "Toode",
      "Use Keplar": "Keplari kasutamine",
      "Learn": "Õpi",
      "Company": "Ettevõte",
      "Legal": "Õigusteave"
    },
    "links": {
      "/features": "Kõik Keplaris",
      "/showcase": "Loomingu vitriin",
      "/templates": "Kogukonna galerii",
      "/pricing": "Hinnad",
      "/download": "Laadi alla",
      "/developers": "API ja vidin",
      "/docs": "Dokumentatsioon",
      "/changelog": "Muudatuste logi",
      "/roadmap": "Tegevuskava",
      "/security": "Turvalisus"
    }
  },
  "picker": {
    "label": "Keel",
    "choose": "Vali keel",
    "search": "Otsi keeli",
    "none": "Otsingule ei vasta ükski keel.",
    "betaNote": "Beetakeeled on osaliselt tõlgitud; ülejäänud leht jääb inglise keelde.",
    "close": "Sulge",
    "regions": {
      "europe": "Euroopa",
      "middleEast": "Lähis-Ida",
      "africa": "Aafrika",
      "southAsia": "Lõuna-Aasia",
      "eastAsia": "Ida-Aasia",
      "southeastAsia": "Kagu-Aasia",
      "centralAsia": "Kesk-Aasia ja Kaukaasia",
      "americas": "Ameerika"
    }
  },
  "banner": {
    "text": "Keplar on osaliselt saadaval eesti keeles (beeta).",
    "switch": "Vaheta eesti keelele",
    "dismiss": "Ei, aitäh"
  }
};

export default m;
