// pl marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — Jedno pytanie. Wiele inteligencji. Jedna odpowiedź.",
      "description": "Keplar wysyła Twoje pytanie do wielu modeli AI, znajduje rozbieżności, weryfikuje i daje Ci jedną syntetyczną odpowiedź. Wypróbuj za darmo, bez rejestracji."
    },
    "features": {
      "title": "Wszystko w Keplar",
      "description": "Wszystkie funkcje Keplar na jednej stronie, pogrupowane według zastosowania: zadawanie pytań, czytanie plików, tworzenie stron i aplikacji, wspólna praca, publikowanie, API i widżet oraz zaufanie. Przy każdej widać, czy działa, jest w becie, czy pojawi się wkrótce."
    },
    "pricing": {
      "title": "Cennik: Free, Plus $45, Pro $99",
      "description": "Zacznij za darmo z Keplar One. Keplar Plus kosztuje $45 miesięcznie, Keplar Pro $99 miesięcznie, a plany Business są dostępne przez nasz zespół sprzedaży. Zużycie, które widzisz, nigdy ukryte."
    },
    "showcase": {
      "title": "Galeria Create: jak powinna wyglądać aplikacja zbudowana w Keplar",
      "description": "Osiem demonstracyjnych stron i aplikacji przygotowanych przez zespół Keplar, pokazujących zakres, do którego dąży Create: karty menu, księgi, tablice, kalendarze i strony redakcyjne, każda z własną typografią i paletą. To nie są strony klientów."
    },
    "roadmap": {
      "title": "Plan rozwoju",
      "description": "Nad czym Keplar pracuje teraz, co jest w becie i wciąż jest dopracowywane, oraz co ostatnio wydaliśmy. Bez terminów, których nie możemy dotrzymać."
    },
    "developers": {
      "title": "Keplar dla programistów: API, osadzany Ask, Teams",
      "description": "Pytaj Keplar z własnego kodu za pomocą klucza API Bearer albo umieść widżet Ask na swojej stronie jednym tagiem script. Specyfikacja OpenAPI, streaming i jasno opisane limity dla każdego planu."
    },
    "signin": {
      "title": "Zaloguj się",
      "description": "Zaloguj się do Keplar."
    },
    "signup": {
      "title": "Utwórz konto",
      "description": "Utwórz darmowe konto Keplar."
    }
  },
  "status": {
    "live": "Dostępne",
    "beta": "Beta",
    "soon": "Wkrótce"
  },
  "chapters": {
    "demoKicker": "Demo na żywo",
    "demoTitle": "Wypróbuj tutaj. Bez konta.",
    "proof": "Twórcy: {credit}. Budujemy jawnie: <changelog>lista zmian</changelog>, <roadmap>plan rozwoju</roadmap> i <security>strona o bezpieczeństwie</security>, która mówi, co jest gotowe, a co nie.",
    "showcaseNote": "Dema w galerii przygotował zespół Keplar, to nie są strony klientów. <link>Zobacz wszystkie osiem</link>",
    "closeTitle": "Zapytaj Keplar o cokolwiek.",
    "closeCta": "Zapytaj Keplar o cokolwiek",
    "closeSmall": "Za darmo, bez karty. <link>Wszystko w Keplar na jednej stronie</link>, z informacją, co działa, co jest w becie, a co pojawi się wkrótce.",
    "voiceCaption": "Voice Live Create: mów, a edytor, terminal i podgląd zmieniają się razem. Zrób pauzę, a poczeka; powiedz „właściwie”, a poprawi.",
    "voiceLabel": "Voice Live Create: edytor, terminal i podgląd na żywo obok siebie",
    "list": {
      "ask": {
        "label": "Pytaj",
        "title": "Zapytaj Keplar o cokolwiek.",
        "lede": "Jedno pytanie trafia do kilku modeli AI. Keplar je porównuje, pokazuje rozbieżności, sprawdza, co się broni, i pisze jedną odpowiedź."
      },
      "understand": {
        "label": "Rozumienie",
        "title": "Czyta to, co mu dasz.",
        "lede": "Upuść tu to, o co pytasz. Keplar przeczyta to tylko na potrzeby tego pytania i nie zachowa pliku."
      },
      "create": {
        "label": "Create",
        "title": "Opisz albo powiedz. Dostań coś, co nie wygląda na wygenerowane.",
        "lede": "Create projektuje wygląd dla firmy z Twojego briefu, pisze kod, testuje każdy ekran i odrzuca fioletową poświatę, gradientowe plamy i siatki z trzech kart."
      },
      "together": {
        "label": "Wspólna praca",
        "title": "Buduj z kimś, i z krytykiem.",
        "lede": "Pracujcie nad tym samym projektem w tym samym czasie i zyskaj drugą opinię, która nie jest Twoja."
      },
      "ship": {
        "label": "Publikacja",
        "title": "Publikuj jednym krokiem. Cofaj jednym krokiem.",
        "lede": "Twój projekt trafia do sieci pod adresem Keplar, a gdy zechcesz, pod Twoją własną domeną."
      },
      "platform": {
        "label": "Platforma",
        "title": "Korzystaj z Keplar wszędzie.",
        "lede": "Ten sam silnik: za API, w Twojej przeglądarce, w widżecie na Twojej stronie i współdzielony w zespole."
      },
      "trust": {
        "label": "Zaufanie",
        "title": "Szczerze o tym, co robi, i o Twoich danych.",
        "lede": "Co chronimy, jak i czego jeszcze nie zrobiliśmy, czarno na białym. Żadnych odznak, na które nie zapracowaliśmy."
      }
    },
    "items": {
      "demo": {
        "name": "Demo na żywo",
        "line": "Zadaj prawdziwe pytanie na tej stronie. Bez konta."
      },
      "multi-model": {
        "name": "Wiele modeli, jedna odpowiedź",
        "line": "Tylko modele, których potrzebuje pytanie, porównane twierdzenie po twierdzeniu."
      },
      "disagreement": {
        "name": "Mapa rozbieżności",
        "line": "Gdzie modele się zgadzają, gdzie się różnią i dlaczego odpowiedź jest właśnie taka."
      },
      "debate": {
        "name": "Tryb debaty",
        "line": "Zobacz, jak modele spierają się w rundach, zanim Keplar odpowie."
      },
      "voice": {
        "name": "Tryb głosowy",
        "line": "Zapytaj na głos i posłuchaj odpowiedzi. Keplar nigdy nie nagrywa ani nie przechowuje Twojego dźwięku."
      },
      "live-research": {
        "name": "Badanie na żywo",
        "line": "W aplikacji desktopowej Keplar przeszukuje sieć i czyta strony na Twoim komputerze, a potem cytuje każdą z nich i sprawdza cytowania.",
        "note": "Aplikacja desktopowa 0.2.0 lub nowsza."
      },
      "images": {
        "name": "Obrazy i zrzuty ekranu",
        "line": "Wykresy, paragony, tablice, interfejsy. Wysyłane tylko do modeli, które widzą."
      },
      "video": {
        "name": "Wideo",
        "line": "Klatki kluczowe są pobierane w Twojej przeglądarce; sam film nie jest przesyłany."
      },
      "docs": {
        "name": "Dokumenty, kod i dane",
        "line": "PDF, tekst, CSV, JSON i pliki źródłowe, czytane jako tekst."
      },
      "office": {
        "name": "Word, PowerPoint, Excel i audio",
        "line": "Pliki Office bezpiecznie przetwarzane; audio transkrybowane."
      },
      "links": {
        "name": "Linki",
        "line": "Wklej adres URL, a Keplar przeczyta stronę przez zabezpieczone pobieranie."
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "Mów i patrz, jak edytor, terminal i podgląd powstają jednocześnie. Powiedz „właściwie”, aby zmienić kierunek.",
        "note": "Wymaga przeglądarki z rozpoznawaniem mowy (Chrome, Edge, Safari)."
      },
      "showcase": {
        "name": "Galeria",
        "line": "Osiem dem zespołu Keplar, które wyznaczają poziom wymagany od Create."
      },
      "surprise": {
        "name": "Zaskocz mnie",
        "line": "Jedno kliknięcie: konkretny brief, styl i poziom szczegółów, zbudowane dla Ciebie."
      },
      "versions": {
        "name": "Historia wersji",
        "line": "Każda kompilacja to wersja. Przywróć dowolną albo utwórz z niej nowy szkic."
      },
      "community": {
        "name": "Galeria społeczności",
        "line": "Strony, którymi ludzie postanowili się podzielić. Polub, zremiksuj, zgłoś."
      },
      "anti-vibe": {
        "name": "Zasady przeciw sztampowemu designowi",
        "line": "Spisane kryteria i automatyczna kontrola, które odrzucają typowy wygląd AI, zanim go zobaczysz."
      },
      "collab": {
        "name": "Współpraca w czasie rzeczywistym",
        "line": "Zaproś przez link i edytujcie razem ten sam projekt: kursory na żywo, tryb śledzenia, wspólny terminal i podgląd.",
        "note": "Otwórz aplikację w Create, a potem Live. Widzowie oglądają, edytorzy piszą."
      },
      "critic": {
        "name": "Krytyk AI",
        "line": "Reguły, axe-core w prawdziwej przeglądarce i osobny model oceniają Twój projekt, a potem wprowadzają wybrane poprawki."
      },
      "publish": {
        "name": "Publikacja jednym kliknięciem",
        "line": "Opublikuj szkic pod działającym adresem prosto z Create."
      },
      "previews": {
        "name": "Podglądy",
        "line": "Każdy szkic ma prywatny link do podglądu, zanim trafi do sieci."
      },
      "rollback": {
        "name": "Przywracanie",
        "line": "Przywróć poprzednią wersję, jeśli zmiana pójdzie nie tak."
      },
      "domains": {
        "name": "Własne domeny",
        "line": "Podłącz własną domenę; Keplar sprawdzi DNS i powie, co zmienić."
      },
      "ssl": {
        "name": "Automatyczny HTTPS",
        "line": "Certyfikaty są wystawiane i odnawiane dla podłączonych domen."
      },
      "api": {
        "name": "Publiczne API",
        "line": "Klucze Bearer, limity zależne od planu, specyfikacja OpenAPI. Darmowe klucze korzystają tylko z darmowych modeli."
      },
      "embed": {
        "name": "Osadzany widżet",
        "line": "Jeden tag script umieszcza Keplar Ask na Twojej stronie, ograniczony do dozwolonych przez Ciebie domen."
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "Wspólne przestrzenie z rolami właściciela, administratora, edytora i obserwatora.",
        "note": "Plan Business."
      },
      "referrals": {
        "name": "Program poleceń",
        "line": "Zaproś znajomego; oboje dostajecie dodatkowe zużycie, nigdy pieniądze."
      },
      "roblox-studio": {
        "name": "Tryb Roblox Studio",
        "line": "Współtwórca w Roblox Studio: mapy, UI, efekty flipbook i skrypty Luau, z Claude Opus 5.5.",
        "note": "Aplikacja desktopowa, od planu Lite."
      },
      "roblox-cloud": {
        "name": "Roblox Cloud",
        "line": "Nocne zadania na skryptach Twojej gry, każda zmiana sprawdzona analizatorem Luau i zastosowana w Studio, gdy zdecydujesz.",
        "note": "Tylko skrypty; nie może testować rozgrywki."
      },
      "blender": {
        "name": "Tryb Blender",
        "line": "Modelowanie, teksturowanie zestawami PBR z Poly Haven, oświetlenie i eksport w Blenderze 4.2 lub nowszym.",
        "note": "Aplikacja desktopowa 0.1.8 lub nowsza."
      },
      "extension": {
        "name": "Rozszerzenie przeglądarki Keplar One",
        "line": "Pytaj o zaznaczenie lub stronę w Chrome albo Edge, używając swojego klucza API.",
        "note": "Zgłoszone do Chrome Web Store."
      },
      "lens": {
        "name": "Search with Keplar One",
        "line": "Przeciągnij po dowolnym tekście lub obrazie na stronie; odpowiedź otworzy się w panelu bocznym.",
        "note": "Część rozszerzenia przeglądarki."
      },
      "security": {
        "name": "Bezpieczeństwo",
        "line": "Szyfrowanie, dostawcy, przechowywanie danych, ochrona konta i zgłaszanie problemów."
      },
      "changelog": {
        "name": "Lista zmian",
        "line": "Co i kiedy wydaliśmy."
      },
      "roadmap": {
        "name": "Plan rozwoju",
        "line": "Co budujemy dalej i co jeszcze nie działa."
      }
    }
  },
  "featuresPage": {
    "kicker": "Wszystko w Keplar",
    "crumb": "Funkcje",
    "title": "Każda funkcja i informacja, czy możesz z niej skorzystać już dziś.",
    "lead": "Dostępne: <b>{live}</b>, w becie: <b>{beta}</b>, wkrótce: <b>{soon}</b>. Funkcje w becie działają, ale mogą się zmienić lub być dostępne tylko w niektórych planach. Funkcji oznaczonych jako „wkrótce” nie da się jeszcze używać i nie linkujemy do nich, jakby było inaczej.",
    "sections": "Sekcje",
    "thFeature": "Funkcja",
    "thWhat": "Co robi",
    "thStatus": "Status",
    "foot": "Co ostatnio się zmieniło: <changelog>lista zmian</changelog>. Co dalej: <roadmap>plan rozwoju</roadmap>. Gotowy, by spróbować? <demo>Zadaj pytanie na stronie głównej</demo>, bez konta."
  },
  "pricing": {
    "label": "Cennik",
    "title": "Zacznij za darmo. Przejdź wyżej, gdy potrzebujesz więcej.",
    "lede": "Zacznij za darmo z codziennymi pytaniami. Przejdź na wyższy plan, aby korzystać z modeli premium, Deep Research oraz tworzenia stron, obrazów i wideo. Prowadzisz firmę? Plan Business jest do niej dopasowany. Zużycie Keplar liczymy w kredytach, nie w surowych tokenach.",
    "tailored": "Dopasowany do Twojej firmy",
    "custom": "Indywidualnie",
    "cadence": {
      "forever": "na zawsze",
      "per month": "miesięcznie",
      "custom": "indywidualnie"
    },
    "perMonth": "{price}/mies.",
    "fine": "Zrezygnuj w dowolnym momencie z poziomu konta. Płatności obsługuje Whop. Kredyty odnawiają się co miesiąc i są zużywane zależnie od tego, ile pracy modeli wymaga pytanie: proste pytania kosztują bardzo mało.",
    "tiers": {
      "free": {
        "summary": "Codzienne pytania z Keplar-One na darmowych otwartych modelach.",
        "features": [
          "Orkiestracja Keplar-One",
          "Tylko darmowe otwarte modele",
          "Może działać wolniej, gdy darmowe modele są obciążone",
          "Dostawcy darmowych modeli mogą zapisywać prompty",
          "Ograniczony konsensus",
          "Brak wyszukiwania w sieci",
          "Do 50 pytań dziennie (uczciwe korzystanie)",
          "Pytania o obrazy i wideo na darmowych modelach wizyjnych",
          "Tryb nauki: prześlij PDF z tekstem, aby dostać fiszki, quizy i plan (darmowe modele, mniejsze limity)",
          "Zapisane czaty i opcjonalna pamięć po zalogowaniu"
        ],
        "cta": "Wypróbuj Keplar"
      },
      "lite": {
        "summary": "Krok wyżej niż Free: modele premium do codziennych pytań w niższej cenie.",
        "features": [
          "Modele premium i konsensus Keplar-One",
          "2400 kredytów miesięcznie z limitem 5-godzinnym i tygodniowym",
          "Pomoc w programowaniu i analiza plików",
          "Tryb nauki na mocniejszych modelach",
          "Utwórz małą stronę osobistą (darmowy adres keplar.site)",
          "Generowanie obrazów, Slides, Deep Research, wideo, agenci i własne domeny od planu Plus"
        ],
        "cta": "Przejdź na Lite"
      },
      "plus": {
        "summary": "Do codziennego użytku: nauka, praca, pytania o zdrowie i ważne decyzje.",
        "features": [
          "Modele premium i zaawansowany Keplar-One",
          "Większy limit konsensusu",
          "Deep Research przy ważnych decyzjach",
          "Pomoc w programowaniu i analiza plików",
          "Wyszukiwanie w sieci domyślnie wyłączone (jeszcze niedostępne)",
          "Twórz osobiste strony i aplikacje",
          "Kreator prezentacji z eksportem do PowerPointa i PDF (pomysły na obrazy to symbole zastępcze)",
          "Tryb nauki na mocniejszych modelach z wyższymi limitami",
          "Generowanie obrazów",
          "Większy kontekst i priorytetowe korzystanie"
        ],
        "cta": "Przejdź na Plus"
      },
      "pro": {
        "summary": "Dla intensywnych użytkowników i twórców: dużo więcej zużycia, tworzenia i agentów.",
        "features": [
          "Wszystko z planu Plus",
          "Ponad dwa razy więcej kredytów miesięcznie",
          "Generowanie wideo",
          "Kreator prezentacji i tryb nauki z najwyższymi limitami",
          "Zaawansowane tworzenie",
          "Zaawansowani agenci",
          "Większy kontekst",
          "Wyższy priorytet i więcej zadań równolegle"
        ],
        "cta": "Przejdź na Pro"
      }
    },
    "fitTitle": "Który plan pasuje?",
    "fits": {
      "free": {
        "who": "Chcesz zobaczyć, jak to działa.",
        "outcome": "Zadawaj codzienne pytania na darmowych modelach, do 50 dziennie. Bez karty.",
        "cta": "Zapytaj Keplar o cokolwiek"
      },
      "plus": {
        "who": "Codziennie korzystasz z AI do nauki, pracy lub ważnych decyzji.",
        "outcome": "Modele premium, Deep Research, Slides, generowanie obrazów i własna domena dla tego, co budujesz.",
        "cta": "Przejdź na Plus"
      },
      "pro": {
        "who": "Dużo budujesz i tworzysz.",
        "outcome": "Ponad dwa razy więcej kredytów niż w Plus, wideo, więcej projektów i agentów oraz wyższy priorytet.",
        "cta": "Przejdź na Pro"
      }
    },
    "compareTitle": "Porównaj wszystkie plany",
    "compareLede": "Pełna tabela, funkcja po funkcji, ze wszystkimi limitami, które produkt dziś stosuje, jest na angielskiej stronie cennika.",
    "compareLink": "Zobacz pełne porównanie (po angielsku)",
    "closingTitle": "Jeszcze się wahasz? Zacznij za darmo.",
    "closingLede": "Zadaj prawdziwe pytanie i zobacz, gdzie modele się zgadzają, a gdzie różnią. Bez karty, a na wyższy plan możesz przejść w aplikacji, kiedy zechcesz.",
    "closingAsk": "Zapytaj Keplar o cokolwiek",
    "closingCompare": "Keplar na tle innych"
  },
  "roadmap": {
    "kicker": "Plan rozwoju",
    "title": "Co budujemy i czego jeszcze nie skończyliśmy.",
    "lead": "Bez docelowych dat: rzeczy wychodzą, gdy działają. Wszystko poniżej jest właśnie budowane albo już działa w becie ze znanymi brakami. To, co już wydaliśmy, znajdziesz na <changelog>liście zmian</changelog>, a pełną listę ze statusami na stronie <features>Wszystko w Keplar</features>.",
    "nowNum": "Teraz",
    "nowTitle": "W budowie",
    "nowLede": "Jeszcze niedostępne. W całym serwisie oznaczone jako „Wkrótce”.",
    "nextNum": "Dalej",
    "nextTitle": "Dopracowywanie funkcji w becie",
    "nextLede": "Te funkcje już działają. Oto czego im jeszcze brakuje.",
    "doneNum": "Wydane",
    "doneTitle": "Ostatnio",
    "doneLede": "Kilka ostatnich wydań. Daty pochodzą z historii commitów.",
    "englishNote": "Informacje o wydaniach są po angielsku.",
    "finishing": [
      {
        "feature": "Publiczne API",
        "items": [
          "Klucze na poziomie zespołu",
          "Limity kredytów dla każdego klucza",
          "Oficjalne SDK",
          "Webhooki"
        ]
      },
      {
        "feature": "Osadzany widżet",
        "items": [
          "Podpisane tokeny wydawcy",
          "Własne style"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "Limity dla członków i podział zużycia",
          "Przekazanie własności",
          "Logowanie jednokrotne (SSO)"
        ]
      },
      {
        "feature": "Głos",
        "items": [
          "Rozwiązanie zastępcze dla przeglądarek bez rozpoznawania mowy (Firefox)",
          "Wybór języka"
        ]
      },
      {
        "feature": "Sprawdzanie źródeł",
        "items": [
          "Włączenie sprawdzania źródeł w sieci w planach płatnych po teście na żywo"
        ]
      }
    ],
    "foot": "Brakuje czegoś, czego potrzebujesz? <feedback>Daj nam znać</feedback>. Problemy z bezpieczeństwem zgłaszaj na adres podany na <security>stronie o bezpieczeństwie</security>."
  },
  "showcase": {
    "kicker": "Galeria",
    "title": "Bez fioletowej poświaty. Bez siatki z trzech kart. Zbudowane dla firmy z briefu.",
    "lead": "Create projektuje wygląd dla tego, co opisujesz, a potem odrzuca wzorce, przez które strony robione przez AI wyglądają tak samo. Te dema pokazują poziom, jakiego od niego wymagamy: karta win złożona jak drukowane menu, księga palarni kawy, tablica dyspozytorska firmy kurierskiej.",
    "disclosure": "Dema z galerii przygotowane przez zespół Keplar, aby pokazać, do czego dąży Create. To nie są strony klientów. Nazwy, ceny i daty są przykładowe.",
    "sites": "strony",
    "apps": "aplikacje",
    "styles": "stylów wizualnych",
    "industries": "branż",
    "contentNote": "Tytuły i opisy dem są po angielsku.",
    "galleryKicker": "Stworzone przez użytkowników Keplar",
    "gallery": "Galeria społeczności",
    "yourTurn": "Twoja kolej",
    "openCreate": "Otwórz Create"
  },
  "developers": {
    "kicker": "Dla programistów",
    "title": "Buduj z Keplar.",
    "lede": "Jedno żądanie wysyła pytanie do kilku modeli, porównuje je i zwraca jedną odpowiedź z jasnym zapisem tego, gdzie się nie zgodziły. Wywołaj je ze swojego serwera kluczem API albo umieść ten sam Ask na swojej stronie jednym tagiem script.",
    "getKey": "Uzyskaj klucz API",
    "widget": "Utwórz widżet",
    "spec": "Specyfikacja OpenAPI",
    "endpoint": "Główny endpoint",
    "products": [
      {
        "name": "Publiczne API",
        "text": "Klucze Bearer, odpowiedzi w JSON lub strumieniowo, zgodność i rozbieżności w każdej odpowiedzi."
      },
      {
        "name": "Osadzany Ask",
        "text": "Konfigurowalne pole Ask do Twojej dokumentacji lub produktu. Lista dozwolonych domen i limity zapytań w zestawie."
      },
      {
        "name": "Keplar for Teams",
        "text": "Wspólne przestrzenie z rolami administratora, edytora i obserwatora, zaproszenia przez e-mail lub link."
      },
      {
        "name": "Polecenia",
        "text": "Udostępnij swój link. Ty i zaproszona osoba dostajecie po {n} kredytów, gdy dołączy."
      }
    ],
    "platform": "Platforma",
    "refTitle": "Pełna dokumentacja",
    "refLede": "Plany i limity, szybki start, format żądań i odpowiedzi, streaming, widżet, role w Teams, błędy i uwagi o bezpieczeństwie znajdziesz na angielskiej stronie dla programistów. Kod, nazwy pól i kody błędów są takie same w każdym języku.",
    "sections": [
      "Plany i limity",
      "Szybki start",
      "POST /api/v1/ask",
      "Streaming",
      "Osadzany widżet Ask",
      "Keplar for Teams",
      "Błędy",
      "Bezpieczeństwo i prywatność",
      "Jeszcze niedostępne"
    ],
    "refLink": "Otwórz pełną dokumentację (po angielsku)"
  },
  "auth": {
    "signinTitle": "Zaloguj się do Keplar",
    "signinLead": "Wróć do swoich rozmów, projektów i planu.",
    "addTitle": "Dodaj konto",
    "addLead": "Zaloguj się na inne konto. Konto, z którego korzystasz, pozostanie zalogowane na tym urządzeniu.",
    "checkoutLead": "Zaloguj się, aby przejść do kasy. Zaraz potem przejdziesz do płatności.",
    "expired": "Konto {email} zostało wylogowane. Zaloguj się ponownie, aby z niego korzystać.",
    "signupTitle": "Utwórz konto Keplar",
    "signupLead": "Do zadań domowych i ważnych decyzji, planów podróży i projektów po godzinach albo do prowadzenia firmy. Plan Free działa na darmowych otwartych modelach, a na wyższy plan możesz przejść w każdej chwili.",
    "invited": "Ktoś Cię zaprosił: gdy zweryfikujesz adres e-mail, oboje dostaniecie dodatkowe kredyty (nigdy pieniądze). Szczegóły w regulaminie programu poleceń.",
    "signUp": "Zarejestruj się",
    "logIn": "Zaloguj się",
    "toggle": "Zarejestruj się lub zaloguj",
    "about": "O Keplar",
    "panel": {
      "signin": {
        "eyebrow": "Witaj ponownie",
        "title": "Kontynuuj tam, gdzie skończyłeś.",
        "lead": "Twoje rozmowy, projekty i plan czekają na każdym urządzeniu, na którym się zalogujesz."
      },
      "signup": {
        "eyebrow": "Darmowe konto",
        "title": "Przestań ufać jednej AI.",
        "lead": "Plan Free działa na darmowych otwartych modelach, a na wyższy plan możesz przejść w każdej chwili."
      }
    },
    "points": [
      "Pyta modele, których potrzebuje Twoje pytanie",
      "Pokazuje, gdzie się nie zgadzają",
      "Jedna odpowiedź, z widocznymi rozbieżnościami"
    ]
  }
};

export default m;
