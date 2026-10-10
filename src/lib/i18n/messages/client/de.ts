// de client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "Eine Frage.",
      "Mehrere Intelligenzen.",
      "Eine Antwort."
    ],
    "sub": "Keplar nutzt mehrere KI-Modelle, vergleicht ihre Sichtweisen und gibt dir eine klare, zusammengeführte Antwort.",
    "note": "Die Modellnamen sind Beispiele für Modellfamilien, an die Keplar Fragen weiterleiten kann; welche Modelle antworten, hängt von deinem Tarif, der Frage und der Verfügbarkeit ab. Die Namen gehören ihren Inhabern. Öffnet sich in der App; nichts wird gesendet, bevor du auf Senden drückst.",
    "ask": "Frag Keplar, was du willst",
    "questionLabel": "Deine Frage",
    "builtBy": "Entwickelt von {credit}",
    "tryDemo": "Live-Demo ausprobieren",
    "everything": "Alles in Keplar",
    "families": "Beispielhafte Modellfamilien",
    "storyLabel": "So funktioniert Keplar",
    "kickers": [
      "Fragen",
      "Verteilen",
      "Antworten",
      "Vergleichen",
      "Prüfen",
      "Antwort"
    ],
    "index": [
      "Fragen",
      "Frage",
      "Verteilen",
      "Antworten",
      "Vergleichen",
      "Prüfen",
      "Antwort"
    ],
    "questionPrompt": "Soll ich dieses Jahr eine Wohnung kaufen oder weiter zur Miete wohnen?",
    "questionCaption": "Eine Frage gelangt ins System.",
    "distributionTitle": "Keplar-One entscheidet, wen es fragt.",
    "distributionBody": "Nicht jedes Modell, nicht jedes Mal. Nur die Intelligenzen, die diese Frage braucht, abgewogen nach Qualität, Zuverlässigkeit, Latenz und Kosten.",
    "routeNote": "Die Namen sind Beispiele. Welche Modelle antworten, hängt von deinem Tarif, der Frage und der Verfügbarkeit ab. Die Namen gehören ihren Inhabern.",
    "responsesTitle": "Jedes antwortet für sich.",
    "responsesBody": "Unterschiedliche Begründungen. Unterschiedliche Belege. Manche Antworten stimmen überein. Andere nicht.",
    "respondNote": "Illustration, kein Live-Ergebnis.",
    "agree": "5 stimmen überein.",
    "dissent": "1 nicht.",
    "detected": "Widerspruch erkannt.",
    "follow": "Keplar geht der Sache nach.",
    "disagreeNote": "Illustration mit einer Beispielfrage. Die Zahlen sind ein Beispiel, kein Live-Ergebnis.",
    "verificationTitle": "Bewerten statt abstimmen.",
    "verificationBody": "Keplar wägt die Belege und die Begründung hinter jeder Antwort ab. Zusammengehörige Belege bündeln sich, Widersprüche treten hervor, Rauschen fällt weg. Die Minderheit kann recht haben.",
    "verifySteps": [
      "Belege abwägen",
      "Widersprüche trennen",
      "Rauschen wegfallen lassen"
    ],
    "closingTitle": "Eine Antwort.",
    "convergenceBody": "Zusammengeführt aus dem, was standhält, mit sichtbarer Übereinstimmung und sichtbaren Widersprüchen.",
    "closingSecondary": "So funktioniert Keplar-One",
    "beats": {
      "question": {
        "text": "Alles beginnt mit einer Frage.",
        "short": "Alles beginnt mit einer Frage."
      },
      "minds": {
        "text": "Keplar fragt mehrere Köpfe gleichzeitig.",
        "short": "Mehrere Köpfe, gleichzeitig."
      },
      "disagree": {
        "text": "Es findet heraus, wo sie sich widersprechen.",
        "short": "Wo sie sich widersprechen."
      },
      "verify": {
        "text": "Es prüft, was standhält.",
        "short": "Was standhält."
      },
      "answer": {
        "text": "Und gibt dir eine Antwort, der du vertrauen kannst.",
        "short": "Eine Antwort, der du vertraust."
      }
    }
  },
  "demo": {
    "samples": [
      "Ist in einem kalten Winter eine Wärmepumpe oder eine Gasheizung günstiger im Betrieb?",
      "Sollte ein Startup mit zwei Personen in Delaware gegründet werden?",
      "Hilft Kreatin dem Gedächtnis oder nur den Muskeln?"
    ],
    "stages": {
      "understand": "Frage wird verstanden",
      "select": "Modelle werden ausgewählt",
      "compare": "Antworten werden verglichen",
      "disagree": "Widersprüche werden gesucht",
      "verify": "Es wird geprüft, was standhält",
      "synthesize": "Eine Antwort wird geschrieben"
    },
    "dailyDemo": "Das waren die {n} Demo-Fragen für heute. Mach in der App weiter, kostenlos und ohne Karte.",
    "slowDown": "Einen Moment: In der Demo sind nur wenige Fragen pro Minute möglich. Versuch es gleich noch einmal.",
    "dailyFree": "Du hast die kostenlosen Fragen für heute aufgebraucht. Registriere dich kostenlos, um weiterzumachen, oder komm morgen wieder.",
    "tooBig": "Diese Frage braucht mehr als das kostenlose Kontingent. Versuch es mit einer kürzeren.",
    "offline": "Keplar ist nicht erreichbar. Prüf deine Verbindung und versuch es erneut.",
    "label": "Deine Frage",
    "placeholder": "Frag etwas, das du zweimal prüfen würdest.",
    "asking": "Mehrere Modelle werden gefragt…",
    "ask": "Frag Keplar, was du willst",
    "examples": "Beispielfragen",
    "idleHead": "Das wirst du sehen",
    "disagreement": "Widerspruch",
    "fullCard": "Vollständige Antwort ansehen",
    "signup": "Erstelle ein kostenloses Konto, um deinen Verlauf zu behalten",
    "left": "Noch {left} von {n} Demo-Fragen heute",
    "metaTail": "kostenlose Modelle · ohne Konto",
    "models": "Modelle",
    "answered": "haben geantwortet",
    "consensus": "{responded} von {consulted} Modellen haben geantwortet · {agree} stimmen überein",
    "disagreeCount": ", {n} widersprechen"
  },
  "authForm": {
    "checkEmail": "Sieh in dein Postfach",
    "sentVerify": "Wir haben einen Bestätigungslink an <b>{email}</b> gesendet. Öffne ihn und tippe auf „Bestätigen und weiter“, um dein Konto fertig einzurichten. Er läuft in 24 Stunden ab.",
    "sentLink": "Wir haben einen Anmeldelink an <b>{email}</b> gesendet. Öffne ihn und tippe auf „Anmelden“. Er läuft in 15 Minuten ab.",
    "notThere": "Nichts angekommen? Sieh im Spam-Ordner nach oder warte eine Minute. Falls du schon ein Konto hast, steht das in der E-Mail.",
    "sending": "Wird gesendet…",
    "resendIn": "Erneut senden in {n} s",
    "resend": "E-Mail erneut senden",
    "differentEmail": "Andere E-Mail-Adresse verwenden",
    "linkInstead": "Stattdessen einen Anmeldelink senden",
    "link": "Anmeldelink per E-Mail senden",
    "oauthConsent": "Wenn du mit Google oder Microsoft fortfährst, bestätigst du, dass du mindestens 13 Jahre alt bist, stimmst den <terms>Nutzungsbedingungen</terms> zu und nimmst die <privacy>Datenschutzerklärung</privacy> zur Kenntnis.",
    "or": "oder mit E-Mail fortfahren",
    "name": "Name",
    "optional": "(optional)",
    "email": "E-Mail",
    "password": "Passwort",
    "forgot": "Passwort vergessen?",
    "confirm": "Passwort bestätigen",
    "terms": "Ich bin mindestens 13 Jahre alt (unter 18 mit Erlaubnis eines Elternteils oder Erziehungsberechtigten), stimme den <terms>Nutzungsbedingungen</terms> zu und habe die <privacy>Datenschutzerklärung</privacy> gelesen.",
    "remember": "Auf diesem Gerät angemeldet bleiben",
    "unverified": "Deine E-Mail-Adresse ist noch nicht bestätigt.",
    "resendVerify": "Bestätigungs-E-Mail erneut senden",
    "creating": "Konto wird erstellt…",
    "loggingIn": "Anmeldung läuft…",
    "create": "Konto erstellen",
    "logIn": "Anmelden",
    "noPassword": "Kein Passwort nötig. Wir schicken dir einen einmaligen Link, der deine Adresse bestätigt.",
    "errEmail": "Gib eine gültige E-Mail-Adresse ein, zum Beispiel du@beispiel.de.",
    "errEmailEmpty": "Gib deine E-Mail-Adresse ein.",
    "errEmailAbove": "Gib oben deine E-Mail-Adresse ein und tippe dann erneut hier.",
    "errPassword": "Gib dein Passwort ein.",
    "errWeak": "Wähle ein sichereres Passwort.",
    "errMatch": "Die beiden Passwörter stimmen nicht überein.",
    "errTerms": "Akzeptiere die Nutzungsbedingungen und die Datenschutzerklärung, um ein Konto zu erstellen.",
    "errTooMany": "Zu viele Anmelde-E-Mails angefordert. Versuch es in ein paar Minuten erneut.",
    "continueWith": "Weiter mit {name}",
    "opening": "{name} wird geöffnet…",
    "soon": "Demnächst",
    "passkey": "Mit Passkey anmelden",
    "passkeyWaiting": "Warte auf dein Gerät…"
  }
};

export default m;
