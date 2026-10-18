// sv common catalog. Keys mirror messages/common/en.ts; anything missing falls back to English.
import type { CommonCatalog } from "../../types";

const m: CommonCatalog = {
  "credit": "Hassen och Hussain Keder",
  "nav": {
    "product": "Produkt",
    "resources": "Resurser",
    "items": {
      "/features": "Allt i Keplar",
      "/": "Livedemo",
      "/app/create": "Skapa",
      "/docs": "Dokumentation",
      "/pricing": "Priser",
      "/download": "Ladda ner"
    },
    "signIn": "Logga in",
    "account": "Konto",
    "try": "Prova Keplar",
    "open": "Öppna Keplar",
    "openMenu": "Öppna menyn",
    "closeMenu": "Stäng menyn"
  },
  "footer": {
    "headings": {
      "Product": "Produkt",
      "Use Keplar": "Använd Keplar",
      "Learn": "Lär dig",
      "Company": "Företaget",
      "Legal": "Juridiskt"
    },
    "links": {
      "/features": "Allt i Keplar",
      "/showcase": "Skapelser i fokus",
      "/templates": "Gemenskapens galleri",
      "/pricing": "Priser",
      "/download": "Ladda ner",
      "/developers": "API och widget",
      "/docs": "Dokumentation",
      "/changelog": "Ändringslogg",
      "/roadmap": "Färdplan",
      "/security": "Säkerhet"
    }
  },
  "picker": {
    "label": "Språk",
    "choose": "Välj ett språk",
    "search": "Sök språk",
    "none": "Inget språk matchar sökningen.",
    "betaNote": "Betaspråk är delvis översatta; resten av sidan är kvar på engelska.",
    "close": "Stäng",
    "regions": {
      "europe": "Europa",
      "middleEast": "Mellanöstern",
      "africa": "Afrika",
      "southAsia": "Sydasien",
      "eastAsia": "Östasien",
      "southeastAsia": "Sydostasien",
      "centralAsia": "Centralasien och Kaukasus",
      "americas": "Amerika"
    }
  },
  "banner": {
    "text": "Keplar finns delvis på svenska (beta).",
    "switch": "Byt till svenska",
    "dismiss": "Nej tack"
  }
};

export default m;
