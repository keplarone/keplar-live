// it client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "Una domanda.",
      "Più intelligenze.",
      "Una risposta."
    ],
    "sub": "Keplar usa più modelli di IA, confronta i loro punti di vista e ti dà una risposta chiara e sintetizzata.",
    "note": "I nomi dei modelli sono esempi di famiglie a cui Keplar può inoltrare le domande; quali modelli rispondono dipende dal tuo piano, dalla domanda e dalla disponibilità. I nomi appartengono ai rispettivi proprietari. Si apre nell’app; non viene inviato nulla finché non premi Invia.",
    "ask": "Chiedi qualsiasi cosa a Keplar",
    "questionLabel": "La tua domanda",
    "builtBy": "Creato da {credit}",
    "tryDemo": "Prova la demo dal vivo",
    "everything": "Tutto Keplar",
    "families": "Famiglie di modelli di esempio",
    "storyLabel": "Come funziona Keplar",
    "kickers": [
      "Chiedi",
      "Smista",
      "Rispondi",
      "Confronta",
      "Verifica",
      "Risposta"
    ],
    "index": [
      "Chiedi",
      "Domanda",
      "Smista",
      "Rispondi",
      "Confronta",
      "Verifica",
      "Risposta"
    ],
    "questionPrompt": "Quest’anno conviene comprare casa o continuare in affitto?",
    "questionCaption": "Una domanda entra nel sistema.",
    "distributionTitle": "Keplar-One decide a chi chiedere.",
    "distributionBody": "Non tutti i modelli, non ogni volta. Solo le intelligenze che servono a questa domanda, valutate per qualità, affidabilità, latenza e costo.",
    "routeNote": "I nomi sono esempi. Quali modelli rispondono dipende dal tuo piano, dalla domanda e dalla disponibilità. I nomi appartengono ai rispettivi proprietari.",
    "responsesTitle": "Ognuno risponde per conto suo.",
    "responsesBody": "Ragionamenti diversi. Prove diverse. Alcune risposte concordano. Altre no.",
    "respondNote": "Illustrazione, non un risultato dal vivo.",
    "agree": "5 concordano.",
    "dissent": "1 no.",
    "detected": "Disaccordo rilevato.",
    "follow": "Keplar indaga sul perché.",
    "disagreeNote": "Illustrazione con una domanda di esempio. I numeri sono un esempio, non un risultato dal vivo.",
    "verificationTitle": "Valutare, non votare.",
    "verificationBody": "Keplar soppesa le prove e il ragionamento dietro ogni risposta. Le prove collegate si raccolgono, le contraddizioni si separano, il rumore svanisce. La minoranza può avere ragione.",
    "verifySteps": [
      "Soppesare le prove",
      "Separare le contraddizioni",
      "Lasciar svanire il rumore"
    ],
    "closingTitle": "Una risposta.",
    "convergenceBody": "Sintetizzata da ciò che ha retto, mostrando accordi e disaccordi.",
    "closingSecondary": "Come funziona Keplar-One",
    "beats": {
      "question": {
        "text": "Tutto inizia con una domanda.",
        "short": "Tutto inizia con una domanda."
      },
      "minds": {
        "text": "Keplar interpella più menti insieme.",
        "short": "Più menti, insieme."
      },
      "disagree": {
        "text": "Trova dove non sono d’accordo.",
        "short": "Dove non concordano."
      },
      "verify": {
        "text": "Verifica cosa regge.",
        "short": "Cosa regge."
      },
      "answer": {
        "text": "E ti dà una risposta di cui puoi fidarti.",
        "short": "Una risposta affidabile."
      }
    }
  },
  "demo": {
    "samples": [
      "In un inverno freddo costa meno una pompa di calore o una caldaia a gas?",
      "Una startup di due persone dovrebbe costituirsi in Delaware?",
      "La creatina aiuta la memoria o solo i muscoli?"
    ],
    "stages": {
      "understand": "Comprensione della domanda",
      "select": "Scelta dei modelli da interpellare",
      "compare": "Confronto delle risposte",
      "disagree": "Ricerca dei disaccordi",
      "verify": "Verifica di ciò che regge",
      "synthesize": "Stesura di una risposta"
    },
    "dailyDemo": "Erano le {n} domande demo di oggi. Continua nell’app, gratis e senza carta.",
    "slowDown": "Un attimo: nella demo sono ammesse poche domande al minuto. Riprova tra poco.",
    "dailyFree": "Hai usato le domande gratuite di oggi. Registrati gratis per continuare o torna domani.",
    "tooBig": "Questa domanda richiede più di quanto consenta il piano gratuito. Provane una più breve.",
    "offline": "Impossibile raggiungere Keplar. Controlla la connessione e riprova.",
    "label": "La tua domanda",
    "placeholder": "Chiedi qualcosa che controlleresti due volte.",
    "asking": "Sto interpellando più modelli…",
    "ask": "Chiedi qualsiasi cosa a Keplar",
    "examples": "Domande di esempio",
    "idleHead": "Cosa vedrai",
    "disagreement": "Disaccordo",
    "fullCard": "Vedi la risposta completa",
    "signup": "Crea un account gratuito per conservare la cronologia",
    "left": "Ti restano {left} domande demo su {n} oggi",
    "metaTail": "modelli gratuiti · senza account",
    "models": "Modelli",
    "answered": "hanno risposto",
    "consensus": "Hanno risposto {responded} modelli su {consulted} · {agree} concordano",
    "disagreeCount": ", {n} in disaccordo"
  },
  "authForm": {
    "checkEmail": "Controlla la tua email",
    "sentVerify": "Abbiamo inviato un link di verifica a <b>{email}</b>. Aprilo e premi «Verifica e continua» per completare la creazione dell’account. Scade tra 24 ore.",
    "sentLink": "Abbiamo inviato un link di accesso a <b>{email}</b>. Aprilo e premi «Accedi». Scade tra 15 minuti.",
    "notThere": "Non è arrivata? Controlla lo spam o aspetta un minuto. Se hai già un account, l’email te lo dirà.",
    "sending": "Invio in corso…",
    "resendIn": "Invia di nuovo tra {n} s",
    "resend": "Invia di nuovo l’email",
    "differentEmail": "Usa un’altra email",
    "linkInstead": "Inviami invece un link di accesso",
    "link": "Inviami un link di accesso",
    "oauthConsent": "Continuando con Google o Microsoft confermi di avere almeno 13 anni, accetti i <terms>Termini</terms> e prendi atto dell’<privacy>Informativa sulla privacy</privacy>.",
    "or": "oppure usa la tua email",
    "name": "Nome",
    "optional": "(facoltativo)",
    "email": "Email",
    "password": "Password",
    "forgot": "Password dimenticata?",
    "confirm": "Conferma la password",
    "terms": "Ho almeno 13 anni (con il permesso di un genitore o tutore se ho meno di 18 anni), accetto i <terms>Termini</terms> e ho letto l’<privacy>Informativa sulla privacy</privacy>.",
    "remember": "Resta connesso su questo dispositivo",
    "unverified": "La tua email non è ancora verificata.",
    "resendVerify": "Invia di nuovo l’email di verifica",
    "creating": "Creazione dell’account…",
    "loggingIn": "Accesso in corso…",
    "create": "Crea account",
    "logIn": "Accedi",
    "noPassword": "Non serve una password. Ti inviamo un link monouso che conferma il tuo indirizzo.",
    "errEmail": "Inserisci un indirizzo email valido, ad esempio tu@esempio.com.",
    "errEmailEmpty": "Inserisci il tuo indirizzo email.",
    "errEmailAbove": "Inserisci la tua email qui sopra, poi premi di nuovo qui.",
    "errPassword": "Inserisci la password.",
    "errWeak": "Scegli una password più sicura.",
    "errMatch": "Le due password non coincidono.",
    "errTerms": "Accetta i Termini e l’Informativa sulla privacy per creare un account.",
    "errTooMany": "Troppe email di accesso richieste. Riprova tra qualche minuto.",
    "continueWith": "Continua con {name}",
    "opening": "Apertura di {name}…",
    "soon": "In arrivo",
    "passkey": "Accedi con una passkey",
    "passkeyWaiting": "In attesa del tuo dispositivo…"
  }
};

export default m;
