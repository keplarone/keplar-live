// nb common catalog. Keys mirror messages/common/en.ts; anything missing falls back to English.
import type { CommonCatalog } from "../../types";

const m: CommonCatalog = {
  "credit": "Hassen og Hussain Keder",
  "nav": {
    "product": "Produkt",
    "resources": "Ressurser",
    "items": {
      "/features": "Alt i Keplar",
      "/overview#demo": "Direkte demo",
      "/app/create": "Lag",
      "/docs": "Dokumentasjon",
      "/pricing": "Priser",
      "/download": "Last ned"
    },
    "signIn": "Logg inn",
    "account": "Konto",
    "try": "Prøv Keplar",
    "open": "Åpne Keplar",
    "openMenu": "Åpne meny",
    "closeMenu": "Lukk meny"
  },
  "footer": {
    "headings": {
      "Product": "Produkt",
      "Use Keplar": "Bruk Keplar",
      "Learn": "Lær",
      "Company": "Selskapet",
      "Legal": "Juridisk"
    },
    "links": {
      "/overview": "About Keplar",
      "/features": "Alt i Keplar",
      "/showcase": "Utstilling av kreasjoner",
      "/templates": "Fellesskapsgalleri",
      "/pricing": "Priser",
      "/download": "Last ned",
      "/developers": "API og widget",
      "/docs": "Dokumentasjon",
      "/changelog": "Endringslogg",
      "/roadmap": "Veikart",
      "/security": "Sikkerhet"
    }
  },
  "picker": {
    "label": "Språk",
    "choose": "Velg et språk",
    "search": "Søk etter språk",
    "none": "Ingen språk samsvarer med søket.",
    "betaNote": "Betaspråk er delvis oversatt; resten av siden forblir på engelsk.",
    "close": "Lukk",
    "regions": {
      "europe": "Europa",
      "middleEast": "Midtøsten",
      "africa": "Afrika",
      "southAsia": "Sør-Asia",
      "eastAsia": "Øst-Asia",
      "southeastAsia": "Sørøst-Asia",
      "centralAsia": "Sentral-Asia og Kaukasus",
      "americas": "Amerika"
    }
  },
  "banner": {
    "text": "Keplar finnes delvis på norsk (beta).",
    "switch": "Bytt til norsk",
    "dismiss": "Nei takk"
  }
};

export default m;
