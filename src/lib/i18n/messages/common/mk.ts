// mk common catalog. Keys mirror messages/common/en.ts; anything missing falls back to English.
import type { CommonCatalog } from "../../types";

const m: CommonCatalog = {
  "credit": "Hassen и Hussain Keder",
  "nav": {
    "product": "Производ",
    "resources": "Ресурси",
    "items": {
      "/features": "Сè во Keplar",
      "/overview#demo": "Демо во живо",
      "/app/create": "Создај",
      "/docs": "Документација",
      "/pricing": "Цени",
      "/download": "Преземи"
    },
    "signIn": "Најава",
    "account": "Сметка",
    "try": "Пробајте го Keplar",
    "open": "Отворете го Keplar",
    "openMenu": "Отвори мени",
    "closeMenu": "Затвори мени"
  },
  "footer": {
    "headings": {
      "Product": "Производ",
      "Use Keplar": "Користење на Keplar",
      "Learn": "Учење",
      "Company": "Компанија",
      "Legal": "Правни информации"
    },
    "links": {
      "/overview": "About Keplar",
      "/features": "Сè во Keplar",
      "/showcase": "Излог на креации",
      "/templates": "Галерија на заедницата",
      "/pricing": "Цени",
      "/download": "Преземи",
      "/developers": "API и виџет",
      "/docs": "Документација",
      "/changelog": "Дневник на промени",
      "/roadmap": "Патоказ",
      "/security": "Безбедност"
    }
  },
  "picker": {
    "label": "Јазик",
    "choose": "Изберете јазик",
    "search": "Пребарај јазици",
    "none": "Ниеден јазик не одговара на пребарувањето.",
    "betaNote": "Бета јазиците се делумно преведени; остатокот од страницата останува на англиски.",
    "close": "Затвори",
    "regions": {
      "europe": "Европа",
      "middleEast": "Блиски Исток",
      "africa": "Африка",
      "southAsia": "Јужна Азија",
      "eastAsia": "Источна Азија",
      "southeastAsia": "Југоисточна Азија",
      "centralAsia": "Централна Азија и Кавказ",
      "americas": "Америките"
    }
  },
  "banner": {
    "text": "Keplar е делумно достапен на македонски (бета).",
    "switch": "Префрли на македонски",
    "dismiss": "Не, благодарам"
  }
};

export default m;
