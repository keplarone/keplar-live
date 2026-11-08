// it marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — Una domanda. Più intelligenze. Una risposta.",
      "description": "Keplar invia la tua domanda a più modelli di IA, trova dove non sono d’accordo, verifica e ti dà un’unica risposta sintetizzata. Prova gratis, senza registrazione."
    },
    "features": {
      "title": "Tutto Keplar",
      "description": "Tutte le funzioni di Keplar in una pagina, raggruppate per scopo: fare domande, leggere file, creare siti e app, costruire insieme, pubblicare, l’API e il widget, e la fiducia. Per ognuna è indicato se è disponibile, in beta o in arrivo."
    },
    "pricing": {
      "title": "Prezzi: Free, Plus $45, Pro $99",
      "description": "Inizia gratis con Keplar One. Keplar Plus costa $45 al mese, Keplar Pro $99 al mese e i piani Business sono disponibili tramite il nostro team commerciale. Un utilizzo che vedi, mai nascosto."
    },
    "showcase": {
      "title": "Vetrina di Create: come dovrebbe essere un’app creata con Keplar",
      "description": "Otto siti e app dimostrativi realizzati dal team di Keplar per mostrare la gamma a cui punta Create: menu, registri, bacheche, calendari e pagine editoriali, ognuno con la propria tipografia e palette. Non sono siti di clienti."
    },
    "roadmap": {
      "title": "Roadmap",
      "description": "Cosa sta costruendo Keplar adesso, cosa è in beta e ancora in rifinitura, e cosa è uscito di recente. Nessuna data che non possiamo rispettare."
    },
    "developers": {
      "title": "Keplar per sviluppatori: API, Ask incorporabile, Teams",
      "description": "Interroga Keplar dal tuo codice con una chiave API Bearer, oppure aggiungi il widget Ask al tuo sito con un solo tag script. Specifica OpenAPI, streaming e limiti per piano spiegati chiaramente."
    },
    "signin": {
      "title": "Accedi",
      "description": "Accedi a Keplar."
    },
    "signup": {
      "title": "Crea il tuo account",
      "description": "Crea un account Keplar gratuito."
    }
  },
  "status": {
    "live": "Disponibile",
    "beta": "Beta",
    "soon": "In arrivo"
  },
  "chapters": {
    "demoKicker": "Demo dal vivo",
    "demoTitle": "Provalo qui. Senza account.",
    "proof": "Creato da {credit}. Sviluppato alla luce del sole: <changelog>novità</changelog>, <roadmap>roadmap</roadmap> e una <security>pagina sulla sicurezza</security> che dice cosa è fatto e cosa no.",
    "showcaseNote": "Le demo della vetrina sono realizzate dal team di Keplar, non sono siti di clienti. <link>Vedile tutte e otto</link>",
    "closeTitle": "Chiedi qualsiasi cosa a Keplar.",
    "closeCta": "Chiedi qualsiasi cosa a Keplar",
    "closeSmall": "Gratis, senza carta. <link>Tutto Keplar in una pagina</link>, con cosa è disponibile, in beta e in arrivo.",
    "voiceCaption": "Voice Live Create: parla, e editor, terminale e anteprima si muovono insieme. Fai una pausa e aspetta; di’ «anzi» e corregge.",
    "voiceLabel": "Voice Live Create: editor, terminale e anteprima dal vivo affiancati",
    "list": {
      "ask": {
        "label": "Chiedi",
        "title": "Chiedi qualsiasi cosa a Keplar.",
        "lede": "Una domanda va a più modelli di IA. Keplar li confronta, mostra dove non concordano, verifica cosa regge e scrive una risposta."
      },
      "understand": {
        "label": "Comprendi",
        "title": "Legge quello che gli dai.",
        "lede": "Trascina qui ciò su cui stai facendo la domanda. Keplar lo legge solo per quella domanda e non conserva il file."
      },
      "create": {
        "label": "Create",
        "title": "Descrivilo o dillo a voce. Ottieni qualcosa che non sembra generato.",
        "lede": "Create progetta un design per l’attività descritta nel tuo brief, scrive il codice, testa ogni schermata e rifiuta bagliori viola, macchie sfumate e griglie a tre schede."
      },
      "together": {
        "label": "Costruire insieme",
        "title": "Costruiscilo con qualcuno, e con un critico.",
        "lede": "Lavorate sullo stesso progetto nello stesso momento e ottieni un secondo parere che non sia il tuo."
      },
      "ship": {
        "label": "Pubblica",
        "title": "Pubblica in un passaggio. Annulla in un passaggio.",
        "lede": "Il tuo progetto va online su un indirizzo Keplar, con il tuo dominio quando vuoi."
      },
      "platform": {
        "label": "Piattaforma",
        "title": "Usa Keplar ovunque.",
        "lede": "Lo stesso motore, dietro un’API, nel tuo browser, dentro un widget sul tuo sito e condiviso in un team."
      },
      "trust": {
        "label": "Fiducia",
        "title": "Chiaro su ciò che fa e sui tuoi dati.",
        "lede": "Cosa proteggiamo, come e cosa non abbiamo ancora fatto, nero su bianco. Nessun bollino che non ci siamo guadagnati."
      }
    },
    "items": {
      "demo": {
        "name": "Demo dal vivo",
        "line": "Fai una vera domanda in questa pagina. Senza account."
      },
      "multi-model": {
        "name": "Più modelli, una risposta",
        "line": "Solo i modelli che servono alla domanda, confrontati affermazione per affermazione."
      },
      "disagreement": {
        "name": "Mappa dei disaccordi",
        "line": "Dove i modelli concordano, dove si dividono e perché la risposta è andata in quella direzione."
      },
      "debate": {
        "name": "Modalità dibattito",
        "line": "Guarda i modelli discutere a turni prima che Keplar risponda."
      },
      "voice": {
        "name": "Modalità voce",
        "line": "Chiedi a voce alta e ascolta la risposta. Keplar non registra né conserva mai il tuo audio."
      },
      "live-research": {
        "name": "Ricerca dal vivo",
        "line": "Nell’app desktop, Keplar cerca sul web e legge le pagine sul tuo computer, poi cita ognuna e controlla le citazioni.",
        "note": "App desktop 0.2.0 o successiva."
      },
      "images": {
        "name": "Immagini e screenshot",
        "line": "Grafici, scontrini, lavagne, interfacce. Inviati solo ai modelli in grado di vedere."
      },
      "video": {
        "name": "Video",
        "line": "I fotogrammi chiave vengono estratti nel tuo browser; il video non viene caricato."
      },
      "docs": {
        "name": "Documenti, codice e dati",
        "line": "PDF, testo, CSV, JSON e file sorgente, letti come testo."
      },
      "office": {
        "name": "Word, PowerPoint, Excel e audio",
        "line": "File di Office analizzati in sicurezza; audio trascritto."
      },
      "links": {
        "name": "Link",
        "line": "Incolla un URL e Keplar legge la pagina tramite un recupero protetto."
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "Parla e guarda editor, terminale e anteprima costruirsi insieme. Di’ «anzi» per cambiare rotta.",
        "note": "Richiede un browser con riconoscimento vocale (Chrome, Edge, Safari)."
      },
      "showcase": {
        "name": "Vetrina",
        "line": "Otto demo del team di Keplar che fissano il livello richiesto a Create."
      },
      "surprise": {
        "name": "Sorprendimi",
        "line": "Un tocco: un brief preciso, uno stile e un livello di dettaglio, costruiti per te."
      },
      "versions": {
        "name": "Cronologia delle versioni",
        "line": "Ogni build è una versione. Ripristinane una qualsiasi o trasformala in una nuova bozza."
      },
      "community": {
        "name": "Galleria della community",
        "line": "Siti che le persone hanno scelto di condividere. Metti mi piace, remixa, segnala."
      },
      "anti-vibe": {
        "name": "Regole di design anti-generico",
        "line": "Una griglia di criteri scritta e un controllo automatico che scartano il solito aspetto da IA prima che tu lo veda."
      },
      "collab": {
        "name": "Collaborazione in tempo reale",
        "line": "Invita con un link e modificate insieme lo stesso progetto: cursori dal vivo, modalità segui, terminale e anteprima condivisi.",
        "note": "Apri un’app in Create, poi Live. Chi guarda osserva; chi modifica scrive."
      },
      "critic": {
        "name": "Critico IA",
        "line": "Regole, axe-core in un browser reale e un modello separato esaminano il tuo progetto, poi applicano le correzioni che scegli."
      },
      "publish": {
        "name": "Pubblicazione con un clic",
        "line": "Pubblica una bozza su un indirizzo online direttamente da Create."
      },
      "previews": {
        "name": "Anteprime",
        "line": "Ogni bozza ha un link di anteprima privato prima di andare online."
      },
      "rollback": {
        "name": "Ripristino",
        "line": "Torna alla versione precedente se una modifica va storta."
      },
      "domains": {
        "name": "Domini personalizzati",
        "line": "Collega un dominio di tua proprietà; Keplar controlla il DNS e ti dice cosa cambiare."
      },
      "ssl": {
        "name": "HTTPS automatico",
        "line": "I certificati vengono emessi e rinnovati per i domini collegati."
      },
      "api": {
        "name": "API pubblica",
        "line": "Chiavi Bearer, limiti per piano, specifica OpenAPI. Le chiavi gratuite usano solo modelli gratuiti."
      },
      "embed": {
        "name": "Widget incorporabile",
        "line": "Un tag script porta Keplar Ask sul tuo sito, limitato alle origini che consenti."
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "Spazi condivisi con i ruoli di proprietario, amministratore, editor e lettore.",
        "note": "Piano Business."
      },
      "referrals": {
        "name": "Programma inviti",
        "line": "Invita un amico: ricevete entrambi utilizzo extra, mai denaro."
      },
      "roblox-studio": {
        "name": "Modalità Roblox Studio",
        "line": "Un co-costruttore dentro Roblox Studio: mappe, UI, effetti flipbook e script Luau, con Keplar's studio model.",
        "note": "App desktop, da Lite in su."
      },
      "roblox-cloud": {
        "name": "Roblox Cloud",
        "line": "Lavori notturni sugli script del tuo gioco, ogni modifica verificata dall’analizzatore di Luau e applicata in Studio quando lo decidi tu.",
        "note": "Solo script; non può fare playtest."
      },
      "blender": {
        "name": "Modalità Blender",
        "line": "Modella, texturizza con set PBR di Poly Haven, illumina ed esporta in Blender 4.2 o successivo.",
        "note": "App desktop 0.1.8 o successiva."
      },
      "blender-cloud": {
        "name": "Rendering Blender Cloud",
        "line": "Renderizza una scena sui server di Keplar a computer spento, poi scarica i fotogrammi e un MP4.",
        "note": "App desktop 0.1.10 o successiva."
      },
      "extension": {
        "name": "Estensione browser Keplar One",
        "line": "Chiedi di una selezione o di una pagina da Chrome o Edge, con la tua chiave API.",
        "note": "Inviata al Chrome Web Store."
      },
      "lens": {
        "name": "Search with Keplar One",
        "line": "Trascina su qualsiasi testo o immagine di una pagina; la risposta si apre in un pannello laterale.",
        "note": "Parte dell’estensione browser."
      },
      "security": {
        "name": "Sicurezza",
        "line": "Crittografia, fornitori, conservazione, protezione dell’account e come segnalare un problema."
      },
      "changelog": {
        "name": "Novità",
        "line": "Cosa è uscito e quando."
      },
      "roadmap": {
        "name": "Roadmap",
        "line": "Cosa costruiremo dopo e cosa non è ancora disponibile."
      }
    }
  },
  "featuresPage": {
    "kicker": "Tutto Keplar",
    "crumb": "Funzioni",
    "title": "Ogni funzione, e se puoi usarla oggi.",
    "lead": "<b>{live}</b> disponibili, <b>{beta}</b> in beta, <b>{soon}</b> in arrivo. Le funzioni in beta funzionano, ma possono cambiare o essere limitate ad alcuni piani. Quelle in arrivo non sono ancora utilizzabili e non hanno link come se lo fossero.",
    "sections": "Sezioni",
    "thFeature": "Funzione",
    "thWhat": "Cosa fa",
    "thStatus": "Stato",
    "foot": "Cosa è cambiato di recente: <changelog>novità</changelog>. Cosa arriva: <roadmap>roadmap</roadmap>. Pronto a provarlo? <demo>Fai una domanda nella home page</demo>, senza account."
  },
  "pricing": {
    "label": "Prezzi",
    "title": "Inizia gratis. Passa a un piano superiore quando ti serve di più.",
    "lede": "Inizia gratis per le domande di tutti i giorni. Passa a un piano superiore per modelli premium, Deep Research e la creazione di siti, immagini e video. Hai un’attività? Business è su misura per te. L’utilizzo di Keplar si misura in crediti, non in token grezzi.",
    "tailored": "Su misura per la tua attività",
    "custom": "Personalizzato",
    "cadence": {
      "forever": "per sempre",
      "per month": "al mese",
      "custom": "personalizzato"
    },
    "perMonth": "{price}/mese",
    "fine": "Disdici quando vuoi dal tuo account. Il pagamento è gestito da Whop. I crediti si rinnovano ogni mese e vengono usati in base a quanto lavoro dei modelli richiede una domanda: le domande semplici costano pochissimo.",
    "tiers": {
      "free": {
        "summary": "Domande di tutti i giorni con Keplar-One, su modelli aperti gratuiti.",
        "features": [
          "Orchestrazione Keplar-One",
          "Solo modelli aperti gratuiti",
          "Può essere più lento quando i modelli gratuiti sono occupati",
          "I fornitori dei modelli gratuiti possono registrare i prompt",
          "Consenso limitato",
          "Ricerca web solo nell’app desktop (Live Research, beta)",
          "Fino a 50 domande al giorno (uso corretto)",
          "Domande su immagini e video con modelli di visione gratuiti",
          "Modalità Studio: carica un PDF testuale per ottenere flashcard, quiz e un piano (modelli gratuiti, limiti inferiori)",
          "Chat salvate e memoria facoltativa con l’accesso"
        ],
        "cta": "Prova Keplar"
      },
      "lite": {
        "summary": "Il passo successivo a Free: modelli premium per tutti i giorni, a un prezzo più basso.",
        "features": [
          "Modelli premium e consenso Keplar-One",
          "2.400 crediti al mese con un limite di 5 ore e uno settimanale",
          "Aiuto con il codice e analisi dei file",
          "Modalità Studio con modelli più potenti",
          "Crea un piccolo sito personale (indirizzo keplar.site gratuito)",
          "Generazione di immagini, Slides, Deep Research, agenti e domini personalizzati da Plus in su",
          "Il video è solo per Pro e Business"
        ],
        "cta": "Passa a Lite"
      },
      "plus": {
        "summary": "Per l’uso quotidiano: scuola, lavoro, domande sulla salute e grandi decisioni.",
        "features": [
          "Modelli premium e Keplar-One avanzato",
          "Margine di consenso più ampio",
          "Deep Research per le grandi decisioni",
          "Aiuto con il codice e analisi dei file",
          "Ricerca web solo nell’app desktop (Live Research, beta)",
          "Crea siti e app personali",
          "Creatore di presentazioni con esportazione in PowerPoint e PDF (le idee per le immagini sono segnaposto)",
          "Modalità Studio con modelli più potenti e limiti più alti",
          "Generazione di immagini",
          "Contesto più ampio e utilizzo prioritario"
        ],
        "cta": "Passa a Plus"
      },
      "pro": {
        "summary": "Per chi lo usa intensamente e per i creativi: molto più utilizzo, creazione e agenti.",
        "features": [
          "Tutto ciò che offre Plus",
          "Più del doppio dei crediti mensili",
          "Generazione di video",
          "Creatore di presentazioni e modalità Studio con i limiti più alti",
          "Creazione avanzata",
          "Agenti avanzati",
          "Contesto più ampio",
          "Priorità e concorrenza maggiori"
        ],
        "cta": "Passa a Pro"
      }
    },
    "seeAll": "Vedi tutto ciò che include {plan}",
    "showLess": "Mostra meno",
    "fitTitle": "Quale piano fa per te?",
    "fits": {
      "free": {
        "who": "Vuoi vedere come funziona.",
        "outcome": "Fai domande di tutti i giorni su modelli gratuiti, fino a 50 al giorno. Nessuna carta richiesta.",
        "cta": "Chiedi qualsiasi cosa a Keplar"
      },
      "plus": {
        "who": "Usi l’IA ogni giorno per studio, lavoro o grandi decisioni.",
        "outcome": "Modelli premium, Deep Research, Slides, generazione di immagini e un dominio personalizzato per ciò che costruisci.",
        "cta": "Passa a Plus"
      },
      "pro": {
        "who": "Costruisci e crei molto.",
        "outcome": "Più del doppio dei crediti di Plus, video, più progetti e agenti e priorità più alta.",
        "cta": "Passa a Pro"
      }
    },
    "compareTitle": "Confronta tutti i piani",
    "compareLede": "La tabella completa, funzione per funzione, con tutti i limiti applicati oggi dal prodotto, si trova nella pagina dei prezzi in inglese.",
    "compareLink": "Vedi il confronto completo (in inglese)",
    "closingTitle": "Non sei ancora sicuro? Inizia gratis.",
    "closingLede": "Fai una domanda vera e guarda dove i modelli concordano e dove si dividono. Nessuna carta richiesta, e puoi passare a un piano superiore dall’app quando vuoi di più.",
    "closingAsk": "Chiedi qualsiasi cosa a Keplar",
    "closingCompare": "Keplar a confronto"
  },
  "roadmap": {
    "kicker": "Roadmap",
    "title": "Cosa stiamo costruendo, e cosa non è ancora pronto.",
    "lead": "Nessuna data obiettivo: le cose escono quando funzionano. Tutto ciò che trovi qui sotto è in costruzione o già utilizzabile in beta, con lacune note. Per ciò che è uscito, vedi le <changelog>novità</changelog>; per l’elenco completo con lo stato, vedi <features>tutto Keplar</features>.",
    "nowNum": "Ora",
    "nowTitle": "In costruzione",
    "nowLede": "Non ancora utilizzabile. Indicato come In arrivo in tutto il sito.",
    "nextNum": "Poi",
    "nextTitle": "Completamento delle funzioni in beta",
    "nextLede": "Funzionano già oggi. Ecco cosa manca ancora.",
    "doneNum": "Uscito",
    "doneTitle": "Di recente",
    "doneLede": "Le ultime versioni. Le date provengono dalla cronologia dei commit.",
    "englishNote": "Le note di rilascio sono in inglese.",
    "finishing": [
      {
        "feature": "API pubblica",
        "items": [
          "Chiavi a livello di team",
          "Tetti di crediti per chiave",
          "Un SDK ufficiale",
          "Webhook"
        ]
      },
      {
        "feature": "Widget incorporabile",
        "items": [
          "Token publisher firmati",
          "Stile personalizzato"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "Tetti per membro e dettaglio dell’utilizzo",
          "Trasferimento della proprietà",
          "Single sign-on"
        ]
      },
      {
        "feature": "Voce",
        "items": [
          "Un’alternativa per i browser senza riconoscimento vocale (Firefox)",
          "Un selettore della lingua"
        ]
      },
      {
        "feature": "Verifica delle fonti",
        "items": [
          "Attivare la verifica delle fonti web sui piani a pagamento dopo un test dal vivo"
        ]
      }
    ],
    "foot": "Ti manca qualcosa? <feedback>Faccelo sapere</feedback>. I problemi di sicurezza vanno segnalati all’indirizzo indicato nella <security>pagina sulla sicurezza</security>."
  },
  "showcase": {
    "kicker": "Vetrina",
    "title": "Niente bagliori viola. Niente griglia a tre schede. Costruito per l’attività del brief.",
    "lead": "Create progetta un design per ciò che descrivi, poi rifiuta gli schemi che rendono tutti uguali i siti fatti con l’IA. Queste demo mostrano la gamma che gli chiediamo: una carta dei vini composta come un menu stampato, il registro di una torrefazione, la bacheca di smistamento di un servizio di corrieri.",
    "disclosure": "Demo della vetrina realizzate dal team di Keplar per mostrare a cosa punta Create. Non sono siti di clienti. Nomi, prezzi e date al loro interno sono contenuti di esempio.",
    "sites": "siti",
    "apps": "app",
    "styles": "stili visivi",
    "industries": "settori",
    "contentNote": "Titoli e descrizioni delle demo sono in inglese.",
    "galleryKicker": "Creato da persone che usano Keplar",
    "gallery": "Galleria della community",
    "yourTurn": "Tocca a te",
    "openCreate": "Apri Create"
  },
  "developers": {
    "kicker": "Sviluppatori",
    "title": "Costruisci con Keplar.",
    "lede": "Una sola richiesta invia una domanda a più modelli, li confronta e restituisce una risposta con un resoconto chiaro di dove non erano d’accordo. Chiamala dal tuo server con una chiave API, oppure metti lo stesso Ask sul tuo sito con un solo tag script.",
    "getKey": "Ottieni una chiave API",
    "widget": "Crea un widget",
    "spec": "Specifica OpenAPI",
    "endpoint": "Endpoint principale",
    "products": [
      {
        "name": "API pubblica",
        "text": "Chiavi Bearer, risposte in JSON o in streaming, accordi e disaccordi in ogni risposta."
      },
      {
        "name": "Ask incorporabile",
        "text": "Un campo Ask personalizzabile per la tua documentazione o il tuo prodotto. Elenco di origini consentite e limiti di frequenza inclusi."
      },
      {
        "name": "Keplar for Teams",
        "text": "Spazi condivisi con i ruoli di amministratore, editor e lettore, inviti via email o link."
      },
      {
        "name": "Inviti",
        "text": "Condividi il tuo link. Tu e la persona che inviti ricevete {n} crediti di utilizzo a testa quando si iscrive."
      }
    ],
    "platform": "Piattaforma",
    "refTitle": "Il riferimento completo",
    "refLede": "Piani e limiti, guida rapida, formato di richiesta e risposta, streaming, widget, ruoli di Teams, errori e note sulla sicurezza si trovano nella pagina per sviluppatori in inglese. Codice, nomi dei campi e codici di errore sono gli stessi in ogni lingua.",
    "sections": [
      "Piani e limiti",
      "Guida rapida",
      "POST /api/v1/ask",
      "Streaming",
      "Widget Ask incorporabile",
      "Keplar for Teams",
      "Errori",
      "Sicurezza e privacy",
      "Non ancora disponibile"
    ],
    "refLink": "Apri il riferimento completo (in inglese)"
  },
  "auth": {
    "signinTitle": "Accedi a Keplar",
    "signinLead": "Riprendi le tue conversazioni, i tuoi progetti e il tuo piano.",
    "addTitle": "Aggiungi un account",
    "addLead": "Accedi con un altro account. L’account che stai usando resta connesso su questo dispositivo.",
    "checkoutLead": "Accedi per procedere al pagamento. Subito dopo andrai direttamente al pagamento.",
    "expired": "{email} è stato disconnesso. Accedi di nuovo per usarlo.",
    "signupTitle": "Crea il tuo account Keplar",
    "signupLead": "Per i compiti e le grandi decisioni, i viaggi e i progetti personali, o per gestire un’attività. Free funziona con modelli aperti gratuiti e puoi passare a un piano superiore in qualsiasi momento.",
    "invited": "Un amico ti ha invitato: quando la tua email sarà verificata, riceverete entrambi crediti di utilizzo extra (mai denaro). Dettagli nei termini del programma inviti.",
    "signUp": "Registrati",
    "logIn": "Accedi",
    "toggle": "Registrati o accedi",
    "about": "Informazioni su Keplar",
    "panel": {
      "signin": {
        "eyebrow": "Bentornato",
        "title": "Riprendi da dove avevi lasciato.",
        "lead": "Le tue conversazioni, i tuoi progetti e il tuo piano ti aspettano su ogni dispositivo da cui accedi."
      },
      "signup": {
        "eyebrow": "Account gratuito",
        "title": "Smetti di fidarti di una sola IA.",
        "lead": "Free funziona con modelli aperti gratuiti e puoi passare a un piano superiore in qualsiasi momento."
      }
    },
    "points": [
      "Interpella i modelli che servono alla tua domanda",
      "Ti mostra dove non concordano",
      "Una risposta, con i disaccordi in vista"
    ]
  }
};

export default m;
