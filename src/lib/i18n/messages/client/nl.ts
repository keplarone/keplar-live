// nl client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "Eén vraag.",
      "Meerdere intelligenties.",
      "Eén antwoord."
    ],
    "sub": "Keplar gebruikt meerdere AI-modellen, vergelijkt hun perspectieven en geeft je één helder, samengevat antwoord.",
    "note": "Modelnamen zijn voorbeelden van families waar Keplar vragen naartoe kan sturen; welke modellen antwoorden hangt af van je abonnement, de vraag en de beschikbaarheid. Namen zijn van hun eigenaars. Opent in de app; er wordt niets verstuurd tot je op Versturen drukt.",
    "ask": "Vraag Keplar wat je maar wilt",
    "questionLabel": "Je vraag",
    "builtBy": "Gemaakt door {credit}",
    "tryDemo": "Probeer de live demo",
    "everything": "Alles in Keplar",
    "families": "Voorbeelden van modelfamilies",
    "storyLabel": "Hoe Keplar werkt",
    "kickers": [
      "Vragen",
      "Verdelen",
      "Antwoorden",
      "Vergelijken",
      "Controleren",
      "Antwoord"
    ],
    "index": [
      "Vragen",
      "Vraag",
      "Verdelen",
      "Antwoorden",
      "Vergelijken",
      "Controleren",
      "Antwoord"
    ],
    "questionPrompt": "Moet ik dit jaar een huis kopen of blijven huren?",
    "questionCaption": "Eén vraag komt het systeem binnen.",
    "distributionTitle": "Keplar-One bepaalt wie er gevraagd wordt.",
    "distributionBody": "Niet elk model, niet elke keer. Alleen de intelligenties die deze vraag nodig heeft, gewogen op kwaliteit, betrouwbaarheid, snelheid en kosten.",
    "routeNote": "Namen zijn voorbeelden. Welke modellen antwoorden hangt af van je abonnement, de vraag en de beschikbaarheid. Namen zijn van hun eigenaars.",
    "responsesTitle": "Elk antwoordt op zichzelf.",
    "responsesBody": "Andere redeneringen. Ander bewijs. Sommige antwoorden komen overeen. Andere niet.",
    "respondNote": "Illustratie, geen live resultaat.",
    "agree": "5 zijn het eens.",
    "dissent": "1 niet.",
    "detected": "Onenigheid gevonden.",
    "follow": "Keplar zoekt uit waarom.",
    "disagreeNote": "Illustratie met een voorbeeldvraag. De aantallen zijn een voorbeeld, geen live resultaat.",
    "verificationTitle": "Beoordelen, niet stemmen.",
    "verificationBody": "Keplar weegt het bewijs en de redenering achter elk antwoord. Samenhangend bewijs komt bij elkaar, tegenstrijdigheden worden gescheiden, ruis valt weg. De minderheid kan gelijk hebben.",
    "verifySteps": [
      "Het bewijs wegen",
      "Tegenstrijdigheden scheiden",
      "De ruis laten wegvallen"
    ],
    "closingTitle": "Eén antwoord.",
    "convergenceBody": "Samengesteld uit wat overeind bleef, met de overeenstemming en de onenigheid zichtbaar.",
    "closingSecondary": "Hoe Keplar-One werkt",
    "beats": {
      "question": {
        "text": "Het begint met een vraag.",
        "short": "Het begint met een vraag."
      },
      "minds": {
        "text": "Keplar vraagt meerdere breinen tegelijk.",
        "short": "Meerdere breinen, tegelijk."
      },
      "disagree": {
        "text": "Het vindt waar ze het oneens zijn.",
        "short": "Waar ze het oneens zijn."
      },
      "verify": {
        "text": "Het controleert wat overeind blijft.",
        "short": "Wat overeind blijft."
      },
      "answer": {
        "text": "En geeft je één antwoord dat je kunt vertrouwen.",
        "short": "Eén betrouwbaar antwoord."
      }
    }
  },
  "demo": {
    "samples": [
      "Is een warmtepomp of een cv-ketel op gas goedkoper in een koude winter?",
      "Moet een startup van twee mensen zich in Delaware vestigen?",
      "Helpt creatine het geheugen, of alleen de spieren?"
    ],
    "stages": {
      "understand": "De vraag begrijpen",
      "select": "Kiezen welke modellen we vragen",
      "compare": "Hun antwoorden vergelijken",
      "disagree": "Onenigheid zoeken",
      "verify": "Controleren wat overeind blijft",
      "synthesize": "Eén antwoord schrijven"
    },
    "dailyDemo": "Dat waren de {n} demovragen van vandaag. Ga verder in de app, gratis en zonder creditcard.",
    "slowDown": "Even geduld: in de demo kun je maar een paar vragen per minuut stellen. Probeer het zo opnieuw.",
    "dailyFree": "Je hebt de gratis vragen van vandaag gebruikt. Meld je gratis aan om door te gaan, of kom morgen terug.",
    "tooBig": "Deze vraag vraagt meer dan het gratis tegoed. Probeer een kortere.",
    "offline": "Keplar is niet bereikbaar. Controleer je verbinding en probeer het opnieuw.",
    "label": "Je vraag",
    "placeholder": "Vraag iets wat je twee keer zou checken.",
    "asking": "Meerdere modellen worden gevraagd…",
    "ask": "Vraag Keplar wat je maar wilt",
    "examples": "Voorbeeldvragen",
    "idleHead": "Wat je te zien krijgt",
    "disagreement": "Onenigheid",
    "fullCard": "Bekijk het volledige antwoord",
    "signup": "Maak een gratis account aan om je geschiedenis te bewaren",
    "left": "Nog {left} van {n} demovragen vandaag",
    "metaTail": "gratis modellen · geen account",
    "models": "Modellen",
    "answered": "hebben geantwoord",
    "consensus": "{responded} van {consulted} modellen hebben geantwoord · {agree} eens",
    "disagreeCount": ", {n} oneens"
  },
  "authForm": {
    "checkEmail": "Check je e-mail",
    "sentVerify": "We hebben een verificatielink gestuurd naar <b>{email}</b>. Open die en tik op ‘Verifiëren en doorgaan’ om je account af te maken. De link verloopt over 24 uur.",
    "sentLink": "We hebben een inloglink gestuurd naar <b>{email}</b>. Open die en tik op ‘Inloggen’. De link verloopt over 15 minuten.",
    "notThere": "Niet ontvangen? Kijk in je spammap of wacht even. Als je al een account hebt, staat dat in de e-mail.",
    "sending": "Versturen…",
    "resendIn": "Opnieuw versturen over {n} s",
    "resend": "E-mail opnieuw versturen",
    "differentEmail": "Ander e-mailadres gebruiken",
    "linkInstead": "Stuur me liever een inloglink",
    "link": "Stuur me een inloglink",
    "oauthConsent": "Door verder te gaan met Google of Microsoft bevestig je dat je minstens 13 jaar bent, ga je akkoord met de <terms>Voorwaarden</terms> en neem je kennis van het <privacy>Privacybeleid</privacy>.",
    "or": "of gebruik je e-mail",
    "name": "Naam",
    "optional": "(optioneel)",
    "email": "E-mail",
    "password": "Wachtwoord",
    "forgot": "Wachtwoord vergeten?",
    "confirm": "Bevestig wachtwoord",
    "terms": "Ik ben minstens 13 jaar (met toestemming van een ouder of voogd als ik jonger ben dan 18), ik ga akkoord met de <terms>Voorwaarden</terms> en ik heb het <privacy>Privacybeleid</privacy> gelezen.",
    "remember": "Ingelogd blijven op dit apparaat",
    "unverified": "Je e-mailadres is nog niet geverifieerd.",
    "resendVerify": "Verificatiemail opnieuw versturen",
    "creating": "Account aanmaken…",
    "loggingIn": "Inloggen…",
    "create": "Account aanmaken",
    "logIn": "Inloggen",
    "noPassword": "Geen wachtwoord nodig. We mailen je een eenmalige link die je adres bevestigt.",
    "errEmail": "Vul een geldig e-mailadres in, zoals jij@voorbeeld.nl.",
    "errEmailEmpty": "Vul je e-mailadres in.",
    "errEmailAbove": "Vul hierboven je e-mailadres in en tik dan opnieuw hier.",
    "errPassword": "Vul je wachtwoord in.",
    "errWeak": "Kies een sterker wachtwoord.",
    "errMatch": "De twee wachtwoorden komen niet overeen.",
    "errTerms": "Ga akkoord met de Voorwaarden en het Privacybeleid om een account aan te maken.",
    "errTooMany": "Te veel inlogmails aangevraagd. Probeer het over een paar minuten opnieuw.",
    "continueWith": "Doorgaan met {name}",
    "opening": "{name} openen…",
    "soon": "Binnenkort",
    "passkey": "Inloggen met een passkey",
    "passkeyWaiting": "Wachten op je apparaat…"
  }
};

export default m;
