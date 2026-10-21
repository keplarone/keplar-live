// nl marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — Eén vraag. Meerdere intelligenties. Eén antwoord.",
      "description": "Keplar stuurt je vraag naar meerdere AI-modellen, vindt waar ze het oneens zijn, controleert en geeft je één samengevat antwoord. Gratis te proberen, zonder account."
    },
    "features": {
      "title": "Alles in Keplar",
      "description": "Alle functies van Keplar op één pagina, gegroepeerd naar doel: vragen stellen, bestanden lezen, sites en apps maken, samen bouwen, publiceren, de API en widget, en vertrouwen. Bij elke functie staat of die beschikbaar is, in bèta of binnenkort komt."
    },
    "pricing": {
      "title": "Prijzen: Free, Plus $45, Pro $99",
      "description": "Begin gratis met Keplar One. Keplar Plus kost $45 per maand, Keplar Pro $99 per maand, en Business-abonnementen zijn beschikbaar via ons salesteam. Verbruik dat je kunt zien, nooit verborgen."
    },
    "showcase": {
      "title": "Create-showcase: zo hoort een app gemaakt met Keplar eruit te zien",
      "description": "Acht demosites en -apps van het Keplar-team die laten zien wat Create wil bereiken: menukaarten, kasboeken, borden, agenda’s en redactionele pagina’s, elk met een eigen lettertype en kleurenpalet. Geen klantensites."
    },
    "roadmap": {
      "title": "Roadmap",
      "description": "Waar Keplar nu aan bouwt, wat in bèta is en nog wordt afgemaakt, en wat onlangs is uitgebracht. Geen datums die we niet kunnen halen."
    },
    "developers": {
      "title": "Keplar voor ontwikkelaars: API, insluitbare Ask, Teams",
      "description": "Vraag Keplar vanuit je eigen code met een Bearer-API-sleutel, of zet de Ask-widget op je site met één scripttag. OpenAPI-specificatie, streaming en limieten per abonnement helder uitgelegd."
    },
    "signin": {
      "title": "Inloggen",
      "description": "Log in bij Keplar."
    },
    "signup": {
      "title": "Maak je account aan",
      "description": "Maak een gratis Keplar-account aan."
    }
  },
  "status": {
    "live": "Beschikbaar",
    "beta": "Bèta",
    "soon": "Binnenkort"
  },
  "chapters": {
    "demoKicker": "Live demo",
    "demoTitle": "Probeer het hier. Zonder account.",
    "proof": "Gemaakt door {credit}. We bouwen in het openbaar: <changelog>wijzigingen</changelog>, <roadmap>roadmap</roadmap> en een <security>beveiligingspagina</security> die zegt wat wel en niet af is.",
    "showcaseNote": "De showcasedemo’s zijn gemaakt door het Keplar-team, het zijn geen klantensites. <link>Bekijk ze alle acht</link>",
    "closeTitle": "Vraag Keplar wat je maar wilt.",
    "closeCta": "Vraag Keplar wat je maar wilt",
    "closeSmall": "Gratis, zonder creditcard. <link>Alles in Keplar op één pagina</link>, met wat beschikbaar is, in bèta en binnenkort.",
    "voiceCaption": "Voice Live Create: praat, en de editor, terminal en preview bewegen mee. Pauzeer en het wacht; zeg ‘eigenlijk’ en het past zich aan.",
    "voiceLabel": "Voice Live Create: editor, terminal en live preview naast elkaar",
    "list": {
      "ask": {
        "label": "Vragen",
        "title": "Vraag Keplar wat je maar wilt.",
        "lede": "Eén vraag gaat naar meerdere AI-modellen. Keplar vergelijkt ze, laat zien waar ze het oneens zijn, controleert wat overeind blijft en schrijft één antwoord."
      },
      "understand": {
        "label": "Begrijpen",
        "title": "Het leest wat je het geeft.",
        "lede": "Sleep erin waar je vraag over gaat. Keplar leest het alleen voor die vraag en bewaart het bestand niet."
      },
      "create": {
        "label": "Create",
        "title": "Beschrijf het of zeg het. Krijg iets dat er niet gegenereerd uitziet.",
        "lede": "Create ontwerpt voor het bedrijf uit je briefing, schrijft de code, test elk scherm en weigert paarse gloed, kleurverloopvlekken en rasters van drie kaarten."
      },
      "together": {
        "label": "Samen bouwen",
        "title": "Bouw het met iemand, en met een criticus.",
        "lede": "Werk tegelijk aan hetzelfde project en krijg een tweede mening die niet de jouwe is."
      },
      "ship": {
        "label": "Publiceren",
        "title": "Publiceren in één stap. Terugdraaien in één stap.",
        "lede": "Je project gaat live op een Keplar-adres, met je eigen domein wanneer je dat wilt."
      },
      "platform": {
        "label": "Platform",
        "title": "Gebruik Keplar overal.",
        "lede": "Dezelfde engine, achter een API, in je browser, in een widget op je site en gedeeld binnen een team."
      },
      "trust": {
        "label": "Vertrouwen",
        "title": "Eerlijk over wat het doet, en over je gegevens.",
        "lede": "Wat we beschermen, hoe, en wat we nog niet hebben gedaan, zwart op wit. Geen keurmerken die we niet hebben verdiend."
      }
    },
    "items": {
      "demo": {
        "name": "Live demo",
        "line": "Stel op deze pagina een echte vraag. Zonder account."
      },
      "multi-model": {
        "name": "Meerdere modellen, één antwoord",
        "line": "Alleen de modellen die een vraag nodig heeft, bewering voor bewering vergeleken."
      },
      "disagreement": {
        "name": "Onenigheidskaart",
        "line": "Waar de modellen het eens zijn, waar ze uiteenlopen en waarom het antwoord die kant op ging."
      },
      "debate": {
        "name": "Debatmodus",
        "line": "Zie de modellen in rondes discussiëren voordat Keplar antwoordt."
      },
      "voice": {
        "name": "Spraakmodus",
        "line": "Stel je vraag hardop en hoor het antwoord voorgelezen. Keplar neemt je audio nooit op en slaat die niet op."
      },
      "live-research": {
        "name": "Live-onderzoek",
        "line": "In de desktopapp zoekt Keplar op het web en leest pagina’s op je computer, citeert daarna elke pagina en controleert de citaten.",
        "note": "Desktopapp 0.2.0 of nieuwer."
      },
      "images": {
        "name": "Afbeeldingen en screenshots",
        "line": "Grafieken, bonnetjes, whiteboards, interfaces. Alleen verstuurd naar modellen die kunnen zien."
      },
      "video": {
        "name": "Video",
        "line": "Keyframes worden in je browser genomen; de video zelf wordt niet geüpload."
      },
      "docs": {
        "name": "Documenten, code en data",
        "line": "PDF, tekst, CSV, JSON en broncode, gelezen als tekst."
      },
      "office": {
        "name": "Word, PowerPoint, Excel en audio",
        "line": "Office-bestanden veilig verwerkt; audio getranscribeerd."
      },
      "links": {
        "name": "Links",
        "line": "Plak een URL en Keplar leest de pagina via een beveiligde ophaalactie."
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "Praat en zie de editor, terminal en preview tegelijk ontstaan. Zeg ‘eigenlijk’ om van koers te veranderen.",
        "note": "Vereist een browser met spraakherkenning (Chrome, Edge, Safari)."
      },
      "showcase": {
        "name": "Showcase",
        "line": "Acht demo’s van het Keplar-team die de lat leggen waar Create aan moet voldoen."
      },
      "surprise": {
        "name": "Verras me",
        "line": "Eén druk op de knop: een concrete briefing, stijl en diepgang, voor je gebouwd."
      },
      "versions": {
        "name": "Versiegeschiedenis",
        "line": "Elke build is een versie. Zet er een terug of maak er een nieuw concept van."
      },
      "community": {
        "name": "Communitygalerij",
        "line": "Sites die mensen wilden delen. Liken, remixen, melden."
      },
      "anti-vibe": {
        "name": "Regels tegen generiek design",
        "line": "Een uitgeschreven beoordelingskader en een automatische controle die de bekende AI-look afwijzen voordat je die ziet."
      },
      "collab": {
        "name": "Realtime samenwerken",
        "line": "Nodig uit via een link en bewerk samen hetzelfde project: live cursors, volgmodus, een gedeelde terminal en preview.",
        "note": "Open een app in Create, daarna Live. Kijkers kijken mee; bewerkers typen."
      },
      "critic": {
        "name": "AI-criticus",
        "line": "Regels, axe-core in een echte browser en een apart model beoordelen je build en voeren de verbeteringen door die jij kiest."
      },
      "publish": {
        "name": "Publiceren met één klik",
        "line": "Publiceer een concept vanuit Create op een live adres."
      },
      "previews": {
        "name": "Previews",
        "line": "Elk concept heeft een privé previewlink voordat het live gaat."
      },
      "rollback": {
        "name": "Terugdraaien",
        "line": "Zet de vorige versie terug als een wijziging misgaat."
      },
      "domains": {
        "name": "Eigen domeinen",
        "line": "Koppel een domein dat van jou is; Keplar controleert de DNS en vertelt wat je moet aanpassen."
      },
      "ssl": {
        "name": "Automatische HTTPS",
        "line": "Certificaten worden uitgegeven en vernieuwd voor gekoppelde domeinen."
      },
      "api": {
        "name": "Publieke API",
        "line": "Bearer-sleutels, limieten per abonnement, OpenAPI-specificatie. Gratis sleutels gebruiken alleen gratis modellen."
      },
      "embed": {
        "name": "Insluitbare widget",
        "line": "Eén scripttag zet Keplar Ask op je site, beperkt tot de origins die jij toestaat."
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "Gedeelde werkruimtes met de rollen eigenaar, beheerder, bewerker en kijker.",
        "note": "Business-abonnement."
      },
      "referrals": {
        "name": "Verwijsprogramma",
        "line": "Nodig iemand uit; jullie krijgen allebei extra verbruik, nooit geld."
      },
      "roblox-studio": {
        "name": "Roblox Studio-modus",
        "line": "Een medebouwer in Roblox Studio: maps, UI, flipbook-effecten en Luau-scripts, met Keplar's studio model.",
        "note": "Desktopapp, vanaf Lite."
      },
      "roblox-cloud": {
        "name": "Roblox Cloud",
        "line": "Nachtelijke taken aan de scripts van je game, elke wijziging gecontroleerd door de Luau-analyzer en in Studio toegepast wanneer jij dat wilt.",
        "note": "Alleen scripts; het kan niet playtesten."
      },
      "blender": {
        "name": "Blender-modus",
        "line": "Modelleer, textureer met PBR-sets van Poly Haven, belicht en exporteer in Blender 4.2 of nieuwer.",
        "note": "Desktopapp 0.1.8 of nieuwer."
      },
      "blender-cloud": {
        "name": "Blender Cloud-rendering",
        "line": "Render een scène op de servers van Keplar terwijl je computer uit staat, en download daarna de frames en een MP4.",
        "note": "Desktopapp 0.1.10 of nieuwer."
      },
      "extension": {
        "name": "Browserextensie Keplar One",
        "line": "Stel vanuit Chrome of Edge een vraag over een selectie of een pagina, met je API-sleutel.",
        "note": "Ingediend bij de Chrome Web Store."
      },
      "lens": {
        "name": "Search with Keplar One",
        "line": "Sleep over tekst of een afbeelding op een pagina; het antwoord opent in een zijpaneel.",
        "note": "Onderdeel van de browserextensie."
      },
      "security": {
        "name": "Beveiliging",
        "line": "Versleuteling, leveranciers, bewaartermijnen, accountbeveiliging en hoe je een probleem meldt."
      },
      "changelog": {
        "name": "Wijzigingen",
        "line": "Wat er is uitgebracht, en wanneer."
      },
      "roadmap": {
        "name": "Roadmap",
        "line": "Waar we hierna aan bouwen, en wat nog niet beschikbaar is."
      }
    }
  },
  "featuresPage": {
    "kicker": "Alles in Keplar",
    "crumb": "Functies",
    "title": "Elke functie, en of je die vandaag al kunt gebruiken.",
    "lead": "<b>{live}</b> beschikbaar, <b>{beta}</b> in bèta, <b>{soon}</b> binnenkort. Bèta werkt, maar kan veranderen of beperkt zijn tot sommige abonnementen. Binnenkort is nog niet bruikbaar en wordt ook niet gelinkt alsof het dat wel is.",
    "sections": "Onderdelen",
    "thFeature": "Functie",
    "thWhat": "Wat het doet",
    "thStatus": "Status",
    "foot": "Wat er onlangs veranderde: <changelog>wijzigingen</changelog>. Wat eraan komt: <roadmap>roadmap</roadmap>. Klaar om het te proberen: <demo>stel een vraag op de homepage</demo>, zonder account."
  },
  "pricing": {
    "label": "Prijzen",
    "title": "Begin gratis. Upgrade wanneer je meer nodig hebt.",
    "lede": "Begin gratis voor alledaagse vragen. Upgrade voor premium modellen, Deep Research en het maken van sites, afbeeldingen en video. Heb je een bedrijf? Business is erop afgestemd. Het verbruik van Keplar wordt gemeten in credits, niet in ruwe tokens.",
    "tailored": "Afgestemd op je bedrijf",
    "custom": "Op maat",
    "cadence": {
      "forever": "voor altijd",
      "per month": "per maand",
      "custom": "op maat"
    },
    "perMonth": "{price}/mnd",
    "fine": "Op elk moment opzegbaar via je account. De betaling loopt via Whop. Credits worden elke maand vernieuwd en verbruikt naar gelang hoeveel modelwerk een vraag nodig heeft: eenvoudige vragen kosten heel weinig.",
    "tiers": {
      "free": {
        "summary": "Alledaagse vragen met Keplar-One, op gratis open modellen.",
        "features": [
          "Keplar-One-orkestratie",
          "Alleen gratis open modellen",
          "Kan trager zijn als gratis modellen druk zijn",
          "Hosts van gratis modellen kunnen prompts loggen",
          "Beperkte consensus",
          "Webzoeken alleen in de desktop-app (Live Research, bèta)",
          "Tot 50 vragen per dag (redelijk gebruik)",
          "Vragen over afbeeldingen en video met gratis vision-modellen",
          "Studiemodus: upload een pdf met tekst voor flashcards, quizzen en een plan (gratis modellen, lagere limieten)",
          "Opgeslagen chats en optioneel geheugen als je bent ingelogd"
        ],
        "cta": "Probeer Keplar"
      },
      "lite": {
        "summary": "De stap na Free: premium modellen voor alledaagse vragen, voor een lagere prijs.",
        "features": [
          "Premium modellen en Keplar-One-consensus",
          "2.400 credits per maand met een limiet per 5 uur en per week",
          "Hulp bij programmeren en bestandsanalyse",
          "Studiemodus op sterkere modellen",
          "Maak een kleine persoonlijke site (gratis keplar.site-adres)",
          "Afbeeldingen genereren, Slides, Deep Research, agents en eigen domeinen vanaf Plus",
          "Video is alleen bij Pro en Business"
        ],
        "cta": "Upgraden naar Lite"
      },
      "plus": {
        "summary": "Voor dagelijks gebruik: school, werk, gezondheidsvragen en grote beslissingen.",
        "features": [
          "Premium modellen en geavanceerde Keplar-One",
          "Ruimere consensus",
          "Deep Research voor grote beslissingen",
          "Hulp bij programmeren en bestandsanalyse",
          "Webzoeken alleen in de desktop-app (Live Research, bèta)",
          "Maak persoonlijke sites en apps",
          "Presentatiemaker met export naar PowerPoint en pdf (beeldideeën zijn tijdelijke plaatshouders)",
          "Studiemodus op sterkere modellen met hogere limieten",
          "Afbeeldingen genereren",
          "Meer context en voorrang bij gebruik"
        ],
        "cta": "Upgraden naar Plus"
      },
      "pro": {
        "summary": "Voor intensieve gebruikers en makers: veel meer verbruik, creatie en agents.",
        "features": [
          "Alles uit Plus",
          "Meer dan twee keer zoveel credits per maand",
          "Video genereren",
          "Presentatiemaker en studiemodus met de hoogste limieten",
          "Geavanceerde creatie",
          "Geavanceerde agents",
          "Meer context",
          "Hogere prioriteit en meer gelijktijdigheid"
        ],
        "cta": "Upgraden naar Pro"
      }
    },
    "seeAll": "Alles in {plan} bekijken",
    "showLess": "Minder tonen",
    "fitTitle": "Welk abonnement past bij je?",
    "fits": {
      "free": {
        "who": "Je wilt zien hoe het werkt.",
        "outcome": "Stel alledaagse vragen op gratis modellen, tot 50 per dag. Geen creditcard nodig.",
        "cta": "Vraag Keplar wat je maar wilt"
      },
      "plus": {
        "who": "Je gebruikt AI elke dag voor school, werk of grote beslissingen.",
        "outcome": "Premium modellen, Deep Research, Slides, afbeeldingen genereren en een eigen domein voor wat je bouwt.",
        "cta": "Upgraden naar Plus"
      },
      "pro": {
        "who": "Je bouwt en maakt veel.",
        "outcome": "Meer dan twee keer zoveel credits als Plus, video, meer projecten en agents, en hogere prioriteit.",
        "cta": "Upgraden naar Pro"
      }
    },
    "compareTitle": "Vergelijk alle abonnementen",
    "compareLede": "De volledige tabel, functie voor functie, met elke limiet die het product vandaag hanteert, staat op de Engelse prijspagina.",
    "compareLink": "Bekijk de volledige vergelijking (in het Engels)",
    "closingTitle": "Twijfel je nog? Begin gratis.",
    "closingLede": "Stel een echte vraag en zie waar de modellen het eens zijn en waar ze uiteenlopen. Geen creditcard nodig, en je kunt in de app upgraden wanneer je meer wilt.",
    "closingAsk": "Vraag Keplar wat je maar wilt",
    "closingCompare": "Hoe Keplar zich verhoudt"
  },
  "roadmap": {
    "kicker": "Roadmap",
    "title": "Waar we aan bouwen, en wat nog niet af is.",
    "lead": "Geen streefdatums: dingen komen uit als ze werken. Alles hieronder wordt nu gebouwd of is al bruikbaar in bèta, met bekende hiaten. Wat al is uitgebracht, staat bij de <changelog>wijzigingen</changelog>; de volledige lijst met status vind je bij <features>alles in Keplar</features>.",
    "nowNum": "Nu",
    "nowTitle": "In aanbouw",
    "nowLede": "Nog niet bruikbaar. Overal op de site aangeduid als Binnenkort.",
    "nextNum": "Hierna",
    "nextTitle": "Bètafuncties afmaken",
    "nextLede": "Deze werken vandaag al. Dit ontbreekt nog.",
    "doneNum": "Uitgebracht",
    "doneTitle": "Onlangs",
    "doneLede": "De laatste releases. De datums komen uit de commitgeschiedenis.",
    "englishNote": "De release notes zijn in het Engels.",
    "finishing": [
      {
        "feature": "Publieke API",
        "items": [
          "Sleutels op teamniveau",
          "Creditlimieten per sleutel",
          "Een officiële SDK",
          "Webhooks"
        ]
      },
      {
        "feature": "Insluitbare widget",
        "items": [
          "Ondertekende publisher-tokens",
          "Eigen styling"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "Limieten per lid en verbruiksoverzicht",
          "Eigendom overdragen",
          "Single sign-on"
        ]
      },
      {
        "feature": "Spraak",
        "items": [
          "Een alternatief voor browsers zonder spraakherkenning (Firefox)",
          "Een taalkeuze"
        ]
      },
      {
        "feature": "Broncontrole",
        "items": [
          "Broncontrole op het web aanzetten voor betaalde abonnementen na een live test"
        ]
      }
    ],
    "foot": "Mis je iets wat je nodig hebt? <feedback>Laat het ons weten</feedback>. Beveiligingsproblemen meld je op het adres op de <security>beveiligingspagina</security>."
  },
  "showcase": {
    "kicker": "Showcase",
    "title": "Geen paarse gloed. Geen raster van drie kaarten. Gebouwd voor het bedrijf uit de briefing.",
    "lead": "Create ontwerpt voor wat je beschrijft en weigert de patronen waardoor AI-sites op elkaar lijken. Deze demo’s laten zien welke breedte we ervan verwachten: een wijnkaart als een gedrukte kaart, een kasboek voor een koffiebranderij, een planbord voor een koeriersdienst.",
    "disclosure": "Showcasedemo’s gemaakt door het Keplar-team om te laten zien wat Create wil bereiken. Geen klantensites. Namen, prijzen en datums zijn voorbeeldinhoud.",
    "sites": "sites",
    "apps": "apps",
    "styles": "visuele stijlen",
    "industries": "branches",
    "contentNote": "Titels en beschrijvingen van de demo’s zijn in het Engels.",
    "galleryKicker": "Gemaakt door mensen die Keplar gebruiken",
    "gallery": "Communitygalerij",
    "yourTurn": "Jouw beurt",
    "openCreate": "Create openen"
  },
  "developers": {
    "kicker": "Ontwikkelaars",
    "title": "Bouw met Keplar.",
    "lede": "Eén verzoek stuurt een vraag naar meerdere modellen, vergelijkt ze en geeft één antwoord terug met een helder overzicht van waar ze het oneens waren. Roep het aan vanaf je server met een API-sleutel, of zet dezelfde Ask op je eigen site met één scripttag.",
    "getKey": "API-sleutel aanvragen",
    "widget": "Widget maken",
    "spec": "OpenAPI-specificatie",
    "endpoint": "Hoofdendpoint",
    "products": [
      {
        "name": "Publieke API",
        "text": "Bearer-sleutels, antwoorden als JSON of stream, overeenstemming en onenigheid in elk antwoord."
      },
      {
        "name": "Insluitbare Ask",
        "text": "Een aanpasbaar Ask-vak voor je documentatie of product. Inclusief lijst met toegestane origins en rate limits."
      },
      {
        "name": "Keplar for Teams",
        "text": "Gedeelde werkruimtes met de rollen beheerder, bewerker en kijker, uitnodigingen per e-mail of link."
      },
      {
        "name": "Verwijzingen",
        "text": "Deel je link. Jij en degene die je uitnodigt krijgen elk {n} verbruikscredits zodra die zich aanmeldt."
      }
    ],
    "platform": "Platform",
    "refTitle": "De volledige referentie",
    "refLede": "Abonnementen en limieten, de quickstart, het verzoek- en antwoordformaat, streaming, de widget, Teams-rollen, fouten en beveiligingsnotities staan op de Engelse ontwikkelaarspagina. Code, veldnamen en foutcodes zijn in elke taal hetzelfde.",
    "sections": [
      "Abonnementen en limieten",
      "Quickstart",
      "POST /api/v1/ask",
      "Streaming",
      "Insluitbare Ask-widget",
      "Keplar for Teams",
      "Fouten",
      "Beveiliging en privacy",
      "Nog niet beschikbaar"
    ],
    "refLink": "Open de volledige referentie (in het Engels)"
  },
  "auth": {
    "signinTitle": "Inloggen bij Keplar",
    "signinLead": "Ga verder met je gesprekken, projecten en abonnement.",
    "addTitle": "Account toevoegen",
    "addLead": "Log in met een ander account. Het account dat je nu gebruikt, blijft ingelogd op dit apparaat.",
    "checkoutLead": "Log in om door te gaan naar afrekenen. Daarna ga je meteen naar de betaling.",
    "expired": "{email} is uitgelogd. Log opnieuw in om het te gebruiken.",
    "signupTitle": "Maak je Keplar-account aan",
    "signupLead": "Voor huiswerk en grote beslissingen, reisplannen en zijprojecten, of voor je bedrijf. Free draait op gratis open modellen en je kunt altijd upgraden.",
    "invited": "Je bent uitgenodigd: zodra je e-mailadres is geverifieerd, krijgen jullie allebei extra verbruikstegoed (nooit geld). Details in de voorwaarden van het verwijsprogramma.",
    "signUp": "Registreren",
    "logIn": "Inloggen",
    "toggle": "Registreren of inloggen",
    "about": "Over Keplar",
    "panel": {
      "signin": {
        "eyebrow": "Welkom terug",
        "title": "Ga verder waar je gebleven was.",
        "lead": "Je gesprekken, projecten en abonnement wachten op je, op elk apparaat waarop je inlogt."
      },
      "signup": {
        "eyebrow": "Gratis account",
        "title": "Vertrouw niet langer op één AI.",
        "lead": "Free draait op gratis open modellen en je kunt altijd upgraden."
      }
    },
    "points": [
      "Vraagt de modellen die je vraag nodig heeft",
      "Laat zien waar ze het oneens zijn",
      "Eén antwoord, met de onenigheid zichtbaar"
    ]
  }
};

export default m;
