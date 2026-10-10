// pl client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "Jedno pytanie.",
      "Wiele inteligencji.",
      "Jedna odpowiedź."
    ],
    "sub": "Keplar korzysta z wielu modeli AI, porównuje ich punkty widzenia i daje Ci jedną jasną, syntetyczną odpowiedź.",
    "note": "Nazwy modeli to przykłady rodzin, do których Keplar może kierować pytania; to, które modele odpowiedzą, zależy od Twojego planu, pytania i dostępności. Nazwy należą do ich właścicieli. Otwiera się w aplikacji; nic nie zostanie wysłane, dopóki nie naciśniesz Wyślij.",
    "ask": "Zapytaj Keplar o cokolwiek",
    "questionLabel": "Twoje pytanie",
    "builtBy": "Twórcy: {credit}",
    "tryDemo": "Wypróbuj demo na żywo",
    "everything": "Wszystko w Keplar",
    "families": "Przykładowe rodziny modeli",
    "storyLabel": "Jak działa Keplar",
    "kickers": [
      "Pytanie",
      "Kierowanie",
      "Odpowiedzi",
      "Porównanie",
      "Weryfikacja",
      "Odpowiedź"
    ],
    "index": [
      "Zapytaj",
      "Pytanie",
      "Kierowanie",
      "Odpowiedzi",
      "Porównanie",
      "Weryfikacja",
      "Odpowiedź"
    ],
    "questionPrompt": "Kupić mieszkanie w tym roku czy dalej wynajmować?",
    "questionCaption": "Jedno pytanie trafia do systemu.",
    "distributionTitle": "Keplar-One decyduje, kogo zapytać.",
    "distributionBody": "Nie każdy model i nie za każdym razem. Tylko te inteligencje, których potrzebuje to pytanie, dobrane pod kątem jakości, niezawodności, opóźnień i kosztu.",
    "routeNote": "Nazwy są przykładowe. To, które modele odpowiedzą, zależy od Twojego planu, pytania i dostępności. Nazwy należą do ich właścicieli.",
    "responsesTitle": "Każdy odpowiada samodzielnie.",
    "responsesBody": "Różne rozumowania. Różne dowody. Niektóre odpowiedzi się zgadzają. Inne nie.",
    "respondNote": "Ilustracja, nie wynik na żywo.",
    "agree": "5 się zgadza.",
    "dissent": "1 nie.",
    "detected": "Wykryto rozbieżność.",
    "follow": "Keplar sprawdza dlaczego.",
    "disagreeNote": "Ilustracja z przykładowym pytaniem. Liczby są przykładowe, to nie wynik na żywo.",
    "verificationTitle": "Ocena, nie głosowanie.",
    "verificationBody": "Keplar waży dowody i rozumowanie stojące za każdą odpowiedzią. Powiązane dowody się łączą, sprzeczności się rozdzielają, szum znika. Mniejszość może mieć rację.",
    "verifySteps": [
      "Zważ dowody",
      "Rozdziel sprzeczności",
      "Pozwól, by szum zniknął"
    ],
    "closingTitle": "Jedna odpowiedź.",
    "convergenceBody": "Zbudowana z tego, co się obroniło, z pokazaniem zgodności i rozbieżności.",
    "closingSecondary": "Jak działa Keplar-One",
    "beats": {
      "question": {
        "text": "Wszystko zaczyna się od pytania.",
        "short": "Wszystko zaczyna się od pytania."
      },
      "minds": {
        "text": "Keplar pyta kilka umysłów naraz.",
        "short": "Kilka umysłów naraz."
      },
      "disagree": {
        "text": "Znajduje miejsca, w których się nie zgadzają.",
        "short": "Gdzie się nie zgadzają."
      },
      "verify": {
        "text": "Sprawdza, co się broni.",
        "short": "Co się broni."
      },
      "answer": {
        "text": "I daje Ci jedną odpowiedź, której możesz zaufać.",
        "short": "Jedna wiarygodna odpowiedź."
      }
    }
  },
  "demo": {
    "samples": [
      "Czy w mroźną zimę taniej wychodzi pompa ciepła, czy kocioł gazowy?",
      "Czy dwuosobowy startup powinien zarejestrować się w Delaware?",
      "Czy kreatyna pomaga pamięci, czy tylko mięśniom?"
    ],
    "stages": {
      "understand": "Rozumienie pytania",
      "select": "Wybór modeli do zapytania",
      "compare": "Porównywanie odpowiedzi",
      "disagree": "Szukanie rozbieżności",
      "verify": "Sprawdzanie, co się broni",
      "synthesize": "Pisanie jednej odpowiedzi"
    },
    "dailyDemo": "To były dzisiejsze pytania demo ({n}). Kontynuuj w aplikacji, za darmo i bez karty.",
    "slowDown": "Chwileczkę: w demo można zadać tylko kilka pytań na minutę. Spróbuj ponownie za moment.",
    "dailyFree": "Wykorzystano dzisiejsze darmowe pytania. Zarejestruj się za darmo, aby kontynuować, albo wróć jutro.",
    "tooBig": "To pytanie wymaga więcej, niż obejmuje darmowy limit. Spróbuj krótszego.",
    "offline": "Nie udało się połączyć z Keplar. Sprawdź połączenie i spróbuj ponownie.",
    "label": "Twoje pytanie",
    "placeholder": "Zapytaj o coś, co warto sprawdzić dwa razy.",
    "asking": "Pytam kilka modeli…",
    "ask": "Zapytaj Keplar o cokolwiek",
    "examples": "Przykładowe pytania",
    "idleHead": "Co zobaczysz",
    "disagreement": "Rozbieżność",
    "fullCard": "Zobacz pełną odpowiedź",
    "signup": "Załóż darmowe konto, aby zachować historię",
    "left": "Pozostało pytań demo na dziś: {left} z {n}",
    "metaTail": "darmowe modele · bez konta",
    "models": "Modele",
    "answered": "odpowiedziało",
    "consensus": "Odpowiedziało {responded} z {consulted} modeli · zgodnych: {agree}",
    "disagreeCount": ", niezgodnych: {n}"
  },
  "authForm": {
    "checkEmail": "Sprawdź pocztę",
    "sentVerify": "Wysłaliśmy link weryfikacyjny na adres <b>{email}</b>. Otwórz go i naciśnij „Zweryfikuj i kontynuuj”, aby dokończyć zakładanie konta. Link wygaśnie za 24 godziny.",
    "sentLink": "Wysłaliśmy link do logowania na adres <b>{email}</b>. Otwórz go i naciśnij „Zaloguj się”. Link wygaśnie za 15 minut.",
    "notThere": "Nie ma wiadomości? Sprawdź spam albo poczekaj minutę. Jeśli masz już konto, napiszemy o tym w e-mailu.",
    "sending": "Wysyłanie…",
    "resendIn": "Wyślij ponownie za {n} s",
    "resend": "Wyślij e-mail ponownie",
    "differentEmail": "Użyj innego adresu e-mail",
    "linkInstead": "Wyślij mi zamiast tego link do logowania",
    "link": "Wyślij mi link do logowania",
    "oauthConsent": "Kontynuując przez Google lub Microsoft, potwierdzasz, że masz co najmniej 13 lat, akceptujesz <terms>Regulamin</terms> i przyjmujesz do wiadomości <privacy>Politykę prywatności</privacy>.",
    "or": "lub użyj adresu e-mail",
    "name": "Imię",
    "optional": "(opcjonalnie)",
    "email": "E-mail",
    "password": "Hasło",
    "forgot": "Nie pamiętasz hasła?",
    "confirm": "Potwierdź hasło",
    "terms": "Mam co najmniej 13 lat (a jeśli nie mam 18, mam zgodę rodzica lub opiekuna), akceptuję <terms>Regulamin</terms> i zapoznałem(-am) się z <privacy>Polityką prywatności</privacy>.",
    "remember": "Nie wylogowuj mnie na tym urządzeniu",
    "unverified": "Twój adres e-mail nie jest jeszcze zweryfikowany.",
    "resendVerify": "Wyślij ponownie e-mail weryfikacyjny",
    "creating": "Tworzenie konta…",
    "loggingIn": "Logowanie…",
    "create": "Utwórz konto",
    "logIn": "Zaloguj się",
    "noPassword": "Hasło nie jest potrzebne. Wyślemy Ci jednorazowy link, który potwierdzi Twój adres.",
    "errEmail": "Podaj prawidłowy adres e-mail, np. ty@przyklad.pl.",
    "errEmailEmpty": "Podaj adres e-mail.",
    "errEmailAbove": "Podaj adres e-mail powyżej, a potem naciśnij tu ponownie.",
    "errPassword": "Podaj hasło.",
    "errWeak": "Wybierz silniejsze hasło.",
    "errMatch": "Hasła nie są takie same.",
    "errTerms": "Zaakceptuj Regulamin i Politykę prywatności, aby utworzyć konto.",
    "errTooMany": "Zażądano zbyt wielu e-maili do logowania. Spróbuj ponownie za kilka minut.",
    "continueWith": "Kontynuuj przez {name}",
    "opening": "Otwieranie {name}…",
    "soon": "Wkrótce",
    "passkey": "Zaloguj się kluczem dostępu",
    "passkeyWaiting": "Czekam na Twoje urządzenie…"
  }
};

export default m;
