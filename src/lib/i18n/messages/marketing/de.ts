// de marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — Eine Frage. Mehrere Intelligenzen. Eine Antwort.",
      "description": "Keplar schickt deine Frage an mehrere KI-Modelle, findet ihre Widersprüche, prüft nach und gibt dir eine zusammengeführte Antwort. Kostenlos testen, ohne Anmeldung."
    },
    "features": {
      "title": "Alles in Keplar",
      "description": "Alle Keplar-Funktionen auf einer Seite, gruppiert nach Zweck: Fragen stellen, Dateien lesen, Websites und Apps erstellen, gemeinsam bauen, veröffentlichen, API und Widget sowie Vertrauen. Bei jeder steht, ob sie verfügbar, in der Beta oder geplant ist."
    },
    "pricing": {
      "title": "Preise: Free, Plus $45, Pro $99",
      "description": "Starte kostenlos mit Keplar One. Keplar Plus kostet $45 pro Monat, Keplar Pro $99 pro Monat, Business-Tarife gibt es über unser Vertriebsteam. Nutzung, die du siehst – nie versteckt."
    },
    "showcase": {
      "title": "Create-Showcase: So sollte eine mit Keplar gebaute App aussehen",
      "description": "Acht Demo-Websites und -Apps vom Keplar-Team, die zeigen, was Create leisten soll: Speisekarten, Kassenbücher, Boards, Kalender und redaktionelle Seiten, jeweils mit eigener Schrift und Farbpalette. Keine Kundenseiten."
    },
    "roadmap": {
      "title": "Roadmap",
      "description": "Woran Keplar gerade baut, was in der Beta ist und noch fertiggestellt wird und was kürzlich erschienen ist. Keine Termine, die wir nicht halten können."
    },
    "developers": {
      "title": "Keplar für Entwickler: API, einbettbares Ask, Teams",
      "description": "Frag Keplar aus deinem eigenen Code mit einem Bearer-API-Schlüssel, oder bau das Ask-Widget mit einem einzigen Script-Tag in deine Website ein. OpenAPI-Spezifikation, Streaming, klar benannte Limits pro Tarif."
    },
    "signin": {
      "title": "Anmelden",
      "description": "Bei Keplar anmelden."
    },
    "signup": {
      "title": "Konto erstellen",
      "description": "Erstelle ein kostenloses Keplar-Konto."
    }
  },
  "status": {
    "live": "Verfügbar",
    "beta": "Beta",
    "soon": "Demnächst"
  },
  "chapters": {
    "demoKicker": "Live-Demo",
    "demoTitle": "Probier es hier aus. Ohne Konto.",
    "proof": "Entwickelt von {credit}. Öffentlich entwickelt: <changelog>Änderungsprotokoll</changelog>, <roadmap>Roadmap</roadmap> und eine <security>Sicherheitsseite</security>, die sagt, was erledigt ist und was nicht.",
    "showcaseNote": "Die Showcase-Demos stammen vom Keplar-Team, nicht von Kunden. <link>Alle acht ansehen</link>",
    "closeTitle": "Frag Keplar, was du willst.",
    "closeCta": "Frag Keplar, was du willst",
    "closeSmall": "Kostenlos, ohne Karte. <link>Alles in Keplar auf einer Seite</link> – mit dem, was verfügbar, in der Beta oder geplant ist.",
    "voiceCaption": "Voice Live Create: Sprich, und Editor, Terminal und Vorschau bewegen sich gemeinsam. Mach eine Pause, und es wartet; sag „eigentlich“, und es überarbeitet.",
    "voiceLabel": "Voice Live Create: Editor, Terminal und Live-Vorschau nebeneinander",
    "list": {
      "ask": {
        "label": "Fragen",
        "title": "Frag Keplar, was du willst.",
        "lede": "Eine Frage geht an mehrere KI-Modelle. Keplar vergleicht sie, zeigt ihre Widersprüche, prüft, was standhält, und schreibt eine Antwort."
      },
      "understand": {
        "label": "Verstehen",
        "title": "Es liest, was du ihm gibst.",
        "lede": "Leg das ab, worum es in deiner Frage geht. Keplar liest es nur für diese Frage und behält die Datei nicht."
      },
      "create": {
        "label": "Create",
        "title": "Beschreib es oder sag es. Und bekomm etwas, das nicht generiert aussieht.",
        "lede": "Create entwirft ein Design für das Geschäft aus deinem Briefing, schreibt den Code, testet jeden Bildschirm und verweigert lila Leuchten, Farbverlaufs-Kleckse und Drei-Karten-Raster."
      },
      "together": {
        "label": "Gemeinsam bauen",
        "title": "Bau es mit jemandem – und mit einem Kritiker.",
        "lede": "Arbeitet gleichzeitig am selben Projekt und hol dir eine zweite Meinung, die nicht deine eigene ist."
      },
      "ship": {
        "label": "Veröffentlichen",
        "title": "In einem Schritt veröffentlichen. In einem Schritt rückgängig machen.",
        "lede": "Dein Projekt geht unter einer Keplar-Adresse online, mit deiner eigenen Domain, wann immer du willst."
      },
      "platform": {
        "label": "Plattform",
        "title": "Nutze Keplar überall.",
        "lede": "Dieselbe Engine – hinter einer API, in deinem Browser, in einem Widget auf deiner Website und geteilt im Team."
      },
      "trust": {
        "label": "Vertrauen",
        "title": "Klar darüber, was es tut, und über deine Daten.",
        "lede": "Was wir schützen, wie, und was wir noch nicht getan haben – schriftlich festgehalten. Keine Siegel, die wir uns nicht verdient haben."
      }
    },
    "items": {
      "demo": {
        "name": "Live-Demo",
        "line": "Stell auf dieser Seite eine echte Frage. Ohne Konto."
      },
      "multi-model": {
        "name": "Mehrere Modelle, eine Antwort",
        "line": "Nur die Modelle, die eine Frage braucht, Aussage für Aussage verglichen."
      },
      "disagreement": {
        "name": "Widerspruchskarte",
        "line": "Wo die Modelle übereinstimmen, wo sie auseinandergehen und warum die Antwort so ausgefallen ist."
      },
      "debate": {
        "name": "Debattenmodus",
        "line": "Sieh zu, wie die Modelle in Runden diskutieren, bevor Keplar antwortet."
      },
      "voice": {
        "name": "Sprachmodus",
        "line": "Frag laut und hör dir die Antwort an. Keplar nimmt dein Audio nie auf und speichert es nicht."
      },
      "live-research": {
        "name": "Live-Recherche",
        "line": "In der Desktop-App durchsucht Keplar das Web und liest Seiten auf deinem Computer, zitiert dann jede Seite und prüft die Zitate.",
        "note": "Desktop-App 0.2.0 oder neuer."
      },
      "images": {
        "name": "Bilder und Screenshots",
        "line": "Diagramme, Belege, Whiteboards, Oberflächen. Nur an Modelle gesendet, die Bilder verstehen."
      },
      "video": {
        "name": "Video",
        "line": "Schlüsselbilder werden in deinem Browser entnommen; das Video selbst wird nicht hochgeladen."
      },
      "docs": {
        "name": "Dokumente, Code und Daten",
        "line": "PDF, Text, CSV, JSON und Quelldateien, als Text gelesen."
      },
      "office": {
        "name": "Word, PowerPoint, Excel und Audio",
        "line": "Office-Dateien sicher ausgelesen; Audio transkribiert."
      },
      "links": {
        "name": "Links",
        "line": "Füg eine URL ein, und Keplar liest die Seite über einen abgesicherten Abruf."
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "Sprich und sieh zu, wie Editor, Terminal und Vorschau gleichzeitig entstehen. Sag „eigentlich“, um umzusteuern.",
        "note": "Braucht einen Browser mit Spracherkennung (Chrome, Edge, Safari)."
      },
      "showcase": {
        "name": "Showcase",
        "line": "Acht Demos vom Keplar-Team, die den Maßstab für Create setzen."
      },
      "surprise": {
        "name": "Überrasch mich",
        "line": "Ein Klick: ein konkretes Briefing, ein Stil und eine Detailtiefe, für dich gebaut."
      },
      "versions": {
        "name": "Versionsverlauf",
        "line": "Jeder Build ist eine Version. Stell jede wieder her oder zweig sie als neuen Entwurf ab."
      },
      "community": {
        "name": "Community-Galerie",
        "line": "Websites, die andere teilen wollten. Liken, remixen, melden."
      },
      "anti-vibe": {
        "name": "Regeln gegen generisches Design",
        "line": "Ein schriftlicher Kriterienkatalog und eine automatische Prüfung, die den üblichen KI-Look aussortieren, bevor du ihn siehst."
      },
      "collab": {
        "name": "Zusammenarbeit in Echtzeit",
        "line": "Lade per Link ein und bearbeitet gemeinsam dasselbe Projekt: Live-Cursor, Folgemodus, geteiltes Terminal und geteilte Vorschau.",
        "note": "Öffne eine App in Create, dann Live. Zuschauende sehen zu, Bearbeitende tippen."
      },
      "critic": {
        "name": "KI-Kritiker",
        "line": "Regeln, axe-core in einem echten Browser und ein separates Modell prüfen deinen Build und wenden die Korrekturen an, die du auswählst."
      },
      "publish": {
        "name": "Veröffentlichen mit einem Klick",
        "line": "Veröffentliche einen Entwurf direkt aus Create unter einer Live-Adresse."
      },
      "previews": {
        "name": "Vorschauen",
        "line": "Jeder Entwurf hat einen privaten Vorschaulink, bevor er online geht."
      },
      "rollback": {
        "name": "Zurücksetzen",
        "line": "Stell die vorherige Version wieder her, wenn eine Änderung schiefgeht."
      },
      "domains": {
        "name": "Eigene Domains",
        "line": "Verbinde eine eigene Domain; Keplar prüft das DNS und sagt dir, was du ändern musst."
      },
      "ssl": {
        "name": "Automatisches HTTPS",
        "line": "Zertifikate werden für verbundene Domains ausgestellt und erneuert."
      },
      "api": {
        "name": "Öffentliche API",
        "line": "Bearer-Schlüssel, Limits pro Tarif, OpenAPI-Spezifikation. Kostenlose Schlüssel nutzen nur kostenlose Modelle."
      },
      "embed": {
        "name": "Einbettbares Widget",
        "line": "Ein Script-Tag bringt Keplar Ask auf deine Website, beschränkt auf die Origins, die du erlaubst."
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "Gemeinsame Arbeitsbereiche mit den Rollen Inhaber, Admin, Bearbeiter und Betrachter.",
        "note": "Business-Tarif."
      },
      "referrals": {
        "name": "Empfehlungsprogramm",
        "line": "Lade jemanden ein; ihr bekommt beide zusätzliche Nutzung, nie Geld."
      },
      "roblox-studio": {
        "name": "Roblox-Studio-Modus",
        "line": "Ein Co-Builder in Roblox Studio: Maps, UI, Flipbook-Effekte und Luau-Skripte, mit Keplar's studio model.",
        "note": "Desktop-App, ab Lite."
      },
      "roblox-cloud": {
        "name": "Roblox Cloud",
        "line": "Nächtliche Jobs an den Skripten deines Spiels, jede Änderung vom Luau-Analyzer geprüft, in Studio übernommen, wenn du willst.",
        "note": "Nur Skripte; kann nicht testspielen."
      },
      "blender": {
        "name": "Blender-Modus",
        "line": "Modellieren, mit PBR-Sets von Poly Haven texturieren, beleuchten und exportieren in Blender 4.2 oder neuer.",
        "note": "Desktop-App 0.1.8 oder neuer."
      },
      "blender-cloud": {
        "name": "Blender-Cloud-Rendering",
        "line": "Rendere eine Szene auf Keplars Servern, während dein Computer aus ist, und lade dann die Frames und ein MP4 herunter.",
        "note": "Desktop-App 0.1.10 oder neuer."
      },
      "extension": {
        "name": "Browsererweiterung Keplar One",
        "line": "Frag in Chrome oder Edge nach einer Markierung oder einer Seite, mit deinem API-Schlüssel.",
        "note": "Beim Chrome Web Store eingereicht."
      },
      "lens": {
        "name": "Search with Keplar One",
        "line": "Zieh über beliebigen Text oder ein Bild auf einer Seite; die Antwort öffnet sich in einer Seitenleiste.",
        "note": "Teil der Browsererweiterung."
      },
      "security": {
        "name": "Sicherheit",
        "line": "Verschlüsselung, Anbieter, Aufbewahrung, Kontoschutz und wie du ein Problem meldest."
      },
      "changelog": {
        "name": "Änderungsprotokoll",
        "line": "Was wann erschienen ist."
      },
      "roadmap": {
        "name": "Roadmap",
        "line": "Woran wir als Nächstes bauen und was noch nicht verfügbar ist."
      }
    }
  },
  "featuresPage": {
    "kicker": "Alles in Keplar",
    "crumb": "Funktionen",
    "title": "Jede Funktion – und ob du sie heute schon nutzen kannst.",
    "lead": "<b>{live}</b> verfügbar, <b>{beta}</b> in der Beta, <b>{soon}</b> demnächst. Beta funktioniert, kann sich aber ändern oder auf einige Tarife beschränkt sein. „Demnächst“ ist noch nicht nutzbar und wird auch nicht so verlinkt, als wäre es das.",
    "sections": "Bereiche",
    "thFeature": "Funktion",
    "thWhat": "Was sie tut",
    "thStatus": "Status",
    "foot": "Was sich kürzlich geändert hat: <changelog>Änderungsprotokoll</changelog>. Was als Nächstes kommt: <roadmap>Roadmap</roadmap>. Bereit zum Ausprobieren: <demo>Stell auf der Startseite eine Frage</demo>, ohne Konto."
  },
  "pricing": {
    "label": "Preise",
    "title": "Kostenlos starten. Upgraden, wenn du mehr brauchst.",
    "lede": "Starte kostenlos für Alltagsfragen. Upgrade für Premium-Modelle, Deep Research und das Erstellen von Websites, Bildern und Videos. Du führst ein Unternehmen? Business ist darauf zugeschnitten. Die Nutzung von Keplar wird in Credits gemessen, nicht in rohen Tokens.",
    "tailored": "Auf dein Unternehmen zugeschnitten",
    "custom": "Individuell",
    "cadence": {
      "forever": "für immer",
      "per month": "pro Monat",
      "custom": "individuell"
    },
    "perMonth": "{price}/Monat",
    "fine": "Jederzeit in deinem Konto kündbar. Die Zahlung wird über Whop abgewickelt. Credits erneuern sich jeden Monat und werden danach verbraucht, wie viel Modellarbeit eine Frage braucht: Einfache Fragen kosten sehr wenig.",
    "tiers": {
      "free": {
        "summary": "Alltagsfragen mit Keplar-One, auf kostenlosen offenen Modellen.",
        "features": [
          "Keplar-One-Orchestrierung",
          "Nur kostenlose offene Modelle",
          "Kann langsamer sein, wenn kostenlose Modelle ausgelastet sind",
          "Anbieter kostenloser Modelle können Prompts protokollieren",
          "Begrenzter Konsens",
          "Websuche nur in der Desktop-App (Live Research, Beta)",
          "Bis zu 50 Fragen pro Tag (Fair Use)",
          "Fragen zu Bildern und Videos mit kostenlosen Vision-Modellen",
          "Lernmodus: Lade ein textbasiertes PDF hoch für Karteikarten, Quizze und einen Lernplan (kostenlose Modelle, kleinere Limits)",
          "Gespeicherte Chats und optionales Gedächtnis, wenn du angemeldet bist"
        ],
        "cta": "Keplar testen"
      },
      "lite": {
        "summary": "Der nächste Schritt nach Free: Premium-Modelle für den Alltag, zu einem niedrigeren Preis.",
        "features": [
          "Premium-Modelle und Keplar-One-Konsens",
          "2.400 Credits pro Monat mit einem 5-Stunden- und einem Wochenlimit",
          "Hilfe beim Programmieren und Dateianalyse",
          "Lernmodus mit stärkeren Modellen",
          "Eine kleine persönliche Website erstellen (kostenlose keplar.site-Adresse)",
          "Bildgenerierung, Slides, Deep Research, Agenten und eigene Domains ab Plus",
          "Video gibt es nur bei Pro und Business"
        ],
        "cta": "Auf Lite upgraden"
      },
      "plus": {
        "summary": "Für die tägliche Nutzung: Schule, Arbeit, Gesundheitsfragen und große Entscheidungen.",
        "features": [
          "Premium-Modelle und erweitertes Keplar-One",
          "Größeres Konsens-Kontingent",
          "Deep Research für große Entscheidungen",
          "Hilfe beim Programmieren und Dateianalyse",
          "Websuche nur in der Desktop-App (Live Research, Beta)",
          "Persönliche Websites und Apps erstellen",
          "Präsentationen erstellen mit Export nach PowerPoint und PDF (Bildideen sind Platzhalter)",
          "Lernmodus mit stärkeren Modellen und höheren Limits",
          "Bildgenerierung",
          "Größerer Kontext und bevorzugte Nutzung"
        ],
        "cta": "Auf Plus upgraden"
      },
      "pro": {
        "summary": "Für Vielnutzer und Kreative: deutlich mehr Nutzung, Erstellung und Agenten.",
        "features": [
          "Alles aus Plus",
          "Mehr als doppelt so viele monatliche Credits",
          "Videogenerierung",
          "Präsentationen und Lernmodus mit den höchsten Limits",
          "Erweiterte Erstellung",
          "Erweiterte Agenten",
          "Größerer Kontext",
          "Höhere Priorität und mehr Parallelität"
        ],
        "cta": "Auf Pro upgraden"
      }
    },
    "seeAll": "Alles in {plan} ansehen",
    "showLess": "Weniger anzeigen",
    "fitTitle": "Welcher Tarif passt?",
    "fits": {
      "free": {
        "who": "Du willst sehen, wie es funktioniert.",
        "outcome": "Stell Alltagsfragen auf kostenlosen Modellen, bis zu 50 pro Tag. Keine Karte nötig.",
        "cta": "Frag Keplar, was du willst"
      },
      "plus": {
        "who": "Du nutzt KI jeden Tag für Schule, Arbeit oder große Entscheidungen.",
        "outcome": "Premium-Modelle, Deep Research, Slides, Bildgenerierung und eine eigene Domain für das, was du baust.",
        "cta": "Auf Plus upgraden"
      },
      "pro": {
        "who": "Du baust und erstellst viel.",
        "outcome": "Mehr als doppelt so viele Credits wie Plus, Video, mehr Projekte und Agenten und höhere Priorität.",
        "cta": "Auf Pro upgraden"
      }
    },
    "compareTitle": "Alle Tarife vergleichen",
    "compareLede": "Die vollständige Tabelle, Funktion für Funktion und mit jedem Limit, das das Produkt heute durchsetzt, findest du auf der englischen Preisseite.",
    "compareLink": "Vollständigen Vergleich ansehen (auf Englisch)",
    "closingTitle": "Noch unsicher? Starte kostenlos.",
    "closingLede": "Stell eine echte Frage und sieh, wo die Modelle übereinstimmen und wo sie auseinandergehen. Keine Karte nötig, und du kannst jederzeit in der App upgraden, wenn du mehr willst.",
    "closingAsk": "Frag Keplar, was du willst",
    "closingCompare": "Keplar im Vergleich"
  },
  "roadmap": {
    "kicker": "Roadmap",
    "title": "Woran wir bauen – und was noch nicht fertig ist.",
    "lead": "Keine Zieltermine: Dinge erscheinen, wenn sie funktionieren. Alles hier wird entweder gerade gebaut oder ist schon in der Beta nutzbar, mit bekannten Lücken. Was schon erschienen ist, steht im <changelog>Änderungsprotokoll</changelog>; die vollständige Liste mit Status findest du unter <features>Alles in Keplar</features>.",
    "nowNum": "Jetzt",
    "nowTitle": "In Arbeit",
    "nowLede": "Noch nicht nutzbar. Überall auf der Website als „Demnächst“ gekennzeichnet.",
    "nextNum": "Als Nächstes",
    "nextTitle": "Beta-Funktionen fertigstellen",
    "nextLede": "Diese funktionieren schon heute. Das fehlt noch.",
    "doneNum": "Erschienen",
    "doneTitle": "Kürzlich",
    "doneLede": "Die letzten Releases. Die Daten stammen aus dem Commit-Verlauf.",
    "englishNote": "Die Release Notes sind auf Englisch.",
    "finishing": [
      {
        "feature": "Öffentliche API",
        "items": [
          "Schlüssel auf Team-Ebene",
          "Credit-Limits pro Schlüssel",
          "Ein offizielles SDK",
          "Webhooks"
        ]
      },
      {
        "feature": "Einbettbares Widget",
        "items": [
          "Signierte Publisher-Tokens",
          "Eigenes Styling"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "Limits pro Mitglied und Nutzungsaufschlüsselung",
          "Inhaberwechsel",
          "Single Sign-on"
        ]
      },
      {
        "feature": "Sprache",
        "items": [
          "Eine Alternative für Browser ohne Spracherkennung (Firefox)",
          "Eine Sprachauswahl"
        ]
      },
      {
        "feature": "Quellenprüfung",
        "items": [
          "Websuche zur Quellenprüfung für bezahlte Tarife nach einem Live-Test aktivieren"
        ]
      }
    ],
    "foot": "Fehlt dir etwas? <feedback>Sag es uns</feedback>. Sicherheitsprobleme bitte an die Adresse auf der <security>Sicherheitsseite</security> melden."
  },
  "showcase": {
    "kicker": "Showcase",
    "title": "Kein lila Leuchten. Kein Drei-Karten-Raster. Gebaut für das Geschäft im Briefing.",
    "lead": "Create entwirft ein Design für das, was du beschreibst, und verweigert die Muster, durch die KI-Websites alle gleich aussehen. Diese Demos zeigen die Bandbreite, an der wir es messen: eine Weinkarte wie gedruckt, ein Kassenbuch für eine Rösterei, ein Dispositionsboard für einen Kurierdienst.",
    "disclosure": "Showcase-Demos vom Keplar-Team, die zeigen, was Create erreichen soll. Keine Kundenseiten. Namen, Preise und Daten darin sind Beispielinhalte.",
    "sites": "Websites",
    "apps": "Apps",
    "styles": "visuelle Stile",
    "industries": "Branchen",
    "contentNote": "Titel und Beschreibungen der Demos sind auf Englisch.",
    "galleryKicker": "Von Menschen gemacht, die Keplar nutzen",
    "gallery": "Community-Galerie",
    "yourTurn": "Du bist dran",
    "openCreate": "Create öffnen"
  },
  "developers": {
    "kicker": "Entwickler",
    "title": "Bau mit Keplar.",
    "lede": "Eine Anfrage schickt eine Frage an mehrere Modelle, vergleicht sie und liefert eine Antwort mit einem klaren Protokoll darüber, wo sie sich widersprochen haben. Ruf sie mit einem API-Schlüssel von deinem Server auf, oder setz dasselbe Ask mit einem einzigen Script-Tag auf deine Website.",
    "getKey": "API-Schlüssel holen",
    "widget": "Widget erstellen",
    "spec": "OpenAPI-Spezifikation",
    "endpoint": "Haupt-Endpoint",
    "products": [
      {
        "name": "Öffentliche API",
        "text": "Bearer-Schlüssel, Antworten als JSON oder Stream, Übereinstimmung und Widerspruch in jeder Antwort."
      },
      {
        "name": "Einbettbares Ask",
        "text": "Ein anpassbares Ask-Feld für deine Dokumentation oder dein Produkt. Origin-Allowlist und Rate-Limits inklusive."
      },
      {
        "name": "Keplar for Teams",
        "text": "Gemeinsame Arbeitsbereiche mit den Rollen Admin, Bearbeiter und Betrachter, Einladungen per E-Mail oder Link."
      },
      {
        "name": "Empfehlungen",
        "text": "Teile deinen Link. Du und die eingeladene Person bekommt jeweils {n} Nutzungs-Credits, sobald sie beitritt."
      }
    ],
    "platform": "Plattform",
    "refTitle": "Die vollständige Referenz",
    "refLede": "Tarife und Limits, Schnellstart, Anfrage- und Antwortformat, Streaming, Widget, Teams-Rollen, Fehler und Sicherheitshinweise stehen auf der englischen Entwicklerseite. Code, Feldnamen und Fehlercodes sind in jeder Sprache gleich.",
    "sections": [
      "Tarife und Limits",
      "Schnellstart",
      "POST /api/v1/ask",
      "Streaming",
      "Einbettbares Ask-Widget",
      "Keplar for Teams",
      "Fehler",
      "Sicherheit und Datenschutz",
      "Noch nicht verfügbar"
    ],
    "refLink": "Vollständige Referenz öffnen (auf Englisch)"
  },
  "auth": {
    "signinTitle": "Bei Keplar anmelden",
    "signinLead": "Mach mit deinen Unterhaltungen, Projekten und deinem Tarif weiter.",
    "addTitle": "Konto hinzufügen",
    "addLead": "Melde dich mit einem anderen Konto an. Das Konto, das du gerade nutzt, bleibt auf diesem Gerät angemeldet.",
    "checkoutLead": "Melde dich an, um zur Kasse zu gehen. Danach geht es direkt zur Zahlung.",
    "expired": "{email} wurde abgemeldet. Melde dich erneut an, um es zu nutzen.",
    "signupTitle": "Erstelle dein Keplar-Konto",
    "signupLead": "Für Hausaufgaben und große Entscheidungen, Reisepläne und Nebenprojekte oder für dein Unternehmen. Free läuft auf kostenlosen offenen Modellen, und du kannst jederzeit upgraden.",
    "invited": "Du wurdest eingeladen: Sobald deine E-Mail-Adresse bestätigt ist, bekommt ihr beide zusätzliche Nutzungs-Credits (nie Geld). Details in den Bedingungen des Empfehlungsprogramms.",
    "signUp": "Registrieren",
    "logIn": "Anmelden",
    "toggle": "Registrieren oder anmelden",
    "about": "Über Keplar",
    "panel": {
      "signin": {
        "eyebrow": "Willkommen zurück",
        "title": "Mach dort weiter, wo du aufgehört hast.",
        "lead": "Deine Unterhaltungen, Projekte und dein Tarif warten auf jedem Gerät, auf dem du dich anmeldest."
      },
      "signup": {
        "eyebrow": "Kostenloses Konto",
        "title": "Verlass dich nicht auf eine einzige KI.",
        "lead": "Free läuft auf kostenlosen offenen Modellen, und du kannst jederzeit upgraden."
      }
    },
    "points": [
      "Fragt die Modelle, die deine Frage braucht",
      "Zeigt dir, wo sie sich widersprechen",
      "Eine Antwort, mit sichtbaren Widersprüchen"
    ]
  }
};

export default m;
