// hr common catalog. Keys mirror messages/common/en.ts; anything missing falls back to English.
import type { CommonCatalog } from "../../types";

const m: CommonCatalog = {
  "credit": "Hassen i Hussain Keder",
  "nav": {
    "product": "Proizvod",
    "resources": "Resursi",
    "items": {
      "/features": "Sve u Keplaru",
      "/overview#demo": "Demo uživo",
      "/app/create": "Izradi",
      "/docs": "Dokumentacija",
      "/pricing": "Cijene",
      "/download": "Preuzimanje"
    },
    "signIn": "Prijava",
    "account": "Račun",
    "try": "Isprobajte Keplar",
    "open": "Otvorite Keplar",
    "openMenu": "Otvori izbornik",
    "closeMenu": "Zatvori izbornik"
  },
  "footer": {
    "headings": {
      "Product": "Proizvod",
      "Use Keplar": "Korištenje Keplara",
      "Learn": "Učenje",
      "Company": "Tvrtka",
      "Legal": "Pravno"
    },
    "links": {
      "/overview": "About Keplar",
      "/features": "Sve u Keplaru",
      "/showcase": "Izlog izrada",
      "/templates": "Galerija zajednice",
      "/pricing": "Cijene",
      "/download": "Preuzimanje",
      "/developers": "API i widget",
      "/docs": "Dokumentacija",
      "/changelog": "Popis promjena",
      "/roadmap": "Plan razvoja",
      "/security": "Sigurnost"
    }
  },
  "picker": {
    "label": "Jezik",
    "choose": "Odaberite jezik",
    "search": "Pretraži jezike",
    "none": "Nijedan jezik ne odgovara pretrazi.",
    "betaNote": "Beta jezici djelomično su prevedeni; ostatak stranice ostaje na engleskom.",
    "close": "Zatvori",
    "regions": {
      "europe": "Europa",
      "middleEast": "Bliski istok",
      "africa": "Afrika",
      "southAsia": "Južna Azija",
      "eastAsia": "Istočna Azija",
      "southeastAsia": "Jugoistočna Azija",
      "centralAsia": "Središnja Azija i Kavkaz",
      "americas": "Amerike"
    }
  },
  "banner": {
    "text": "Keplar je djelomično dostupan na hrvatskom (beta).",
    "switch": "Prebaci na hrvatski",
    "dismiss": "Ne, hvala"
  }
};

export default m;
