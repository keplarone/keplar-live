// fil client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "Isang tanong.",
      "Maraming katalinuhan.",
      "Isang sagot."
    ],
    "sub": "Gumagamit ang Keplar ng maraming AI model, inihahambing ang kanilang pananaw, at binibigyan ka ng isang malinaw at pinagsamang sagot.",
    "note": "Ang mga pangalan ng model ay halimbawa ng mga pamilya ng model na kayang padalhan ng Keplar; kung aling model ang sasagot ay depende sa plan mo, sa tanong at sa availability. Pagmamay-ari ng kani-kanilang may-ari ang mga pangalan. Bubukas sa app; walang ipapadala hangga't hindi mo pinipindot ang Ipadala.",
    "ask": "Itanong sa Keplar ang kahit ano",
    "questionLabel": "Ang tanong mo",
    "builtBy": "Ginawa nina {credit}",
    "tryDemo": "Subukan ang live na demo",
    "everything": "Lahat ng nasa Keplar",
    "families": "Mga halimbawang pamilya ng model",
    "storyLabel": "Paano gumagana ang Keplar",
    "kickers": [
      "Magtanong",
      "I-route",
      "Tumugon",
      "Ihambing",
      "Beripikahin",
      "Sagot"
    ],
    "index": [
      "Magtanong",
      "Tanong",
      "I-route",
      "Tumugon",
      "Ihambing",
      "Beripikahin",
      "Sagot"
    ],
    "questionPrompt": "Bibili na ba ako ng bahay ngayong taon o uupa pa rin?",
    "questionCaption": "Isang tanong ang pumapasok sa sistema.",
    "distributionTitle": "Ang Keplar-One ang nagpapasya kung sino ang tatanungin.",
    "distributionBody": "Hindi lahat ng model, hindi sa lahat ng pagkakataon. Ang mga katalinuhang kailangan lang ng tanong na ito, tinimbang ayon sa kalidad, pagiging maaasahan, bilis at gastos.",
    "routeNote": "Halimbawa lang ang mga pangalan. Kung aling model ang sasagot ay depende sa plan mo, sa tanong at sa availability. Pagmamay-ari ng kani-kanilang may-ari ang mga pangalan.",
    "responsesTitle": "Kanya-kanyang sagot ang bawat isa.",
    "responsesBody": "Iba-ibang pangangatwiran. Iba-ibang ebidensya. May mga sagot na nagtutugma. May mga hindi.",
    "respondNote": "Paglalarawan, hindi live na resulta.",
    "agree": "5 ang sang-ayon.",
    "dissent": "1 ang hindi.",
    "detected": "May natukoy na hindi pagkakasundo.",
    "follow": "Inaalam ng Keplar kung bakit.",
    "disagreeNote": "Paglalarawan gamit ang halimbawang tanong. Halimbawa lang ang mga bilang, hindi live na resulta.",
    "verificationTitle": "Pagsusuri, hindi botohan.",
    "verificationBody": "Tinitimbang ng Keplar ang ebidensya at pangangatwiran sa likod ng bawat sagot. Nagsasama-sama ang magkakaugnay na ebidensya, naghihiwalay ang mga salungatan, nawawala ang ingay. Puwedeng tama ang minorya.",
    "verifySteps": [
      "Timbangin ang ebidensya",
      "Ihiwalay ang mga salungatan",
      "Alisin ang ingay"
    ],
    "closingTitle": "Isang sagot.",
    "convergenceBody": "Pinagsama mula sa mga napatunayan, kasama ang mga pinagkasunduan at hindi pinagkasunduan.",
    "closingSecondary": "Paano gumagana ang Keplar-One",
    "beats": {
      "question": {
        "text": "Nagsisimula ito sa isang tanong.",
        "short": "Nagsisimula sa isang tanong."
      },
      "minds": {
        "text": "Nagtatanong ang Keplar sa ilang isip nang sabay-sabay.",
        "short": "Ilang isip, nang sabay."
      },
      "disagree": {
        "text": "Hinahanap nito kung saan sila hindi magkasundo.",
        "short": "Kung saan sila hindi magkasundo."
      },
      "verify": {
        "text": "Sinusuri nito kung ano ang tumatayo.",
        "short": "Kung ano ang tumatayo."
      },
      "answer": {
        "text": "At binibigyan ka ng isang sagot na mapagkakatiwalaan.",
        "short": "Isang sagot na mapagkakatiwalaan."
      }
    }
  },
  "demo": {
    "samples": [
      "Sa napakalamig na taglamig, mas mura bang magpatakbo ng heat pump o gas boiler?",
      "Dapat bang mag-incorporate sa Delaware ang dalawang-taong startup?",
      "Nakakatulong ba ang creatine sa memorya, o sa kalamnan lang?"
    ],
    "stages": {
      "understand": "Inuunawa ang tanong",
      "select": "Pinipili ang mga model na tatanungin",
      "compare": "Inihahambing ang kanilang mga sagot",
      "disagree": "Hinahanap ang mga hindi pagkakasundo",
      "verify": "Sinusuri kung ano ang tumatayo",
      "synthesize": "Isinusulat ang isang sagot"
    },
    "dailyDemo": "Naubos mo na ang {n} demo na tanong ngayong araw. Ituloy sa app, libre, walang card.",
    "slowDown": "Sandali lang: ilang tanong lang kada minuto sa demo. Subukan ulit maya-maya.",
    "dailyFree": "Naubos mo na ang libreng tanong ngayong araw. Mag-sign up nang libre para magpatuloy, o bumalik bukas.",
    "tooBig": "Kailangan ng tanong na ito ng higit sa libreng allowance. Subukan ang mas maikli.",
    "offline": "Hindi maabot ang Keplar. Tingnan ang koneksyon mo at subukan ulit.",
    "label": "Ang tanong mo",
    "placeholder": "Itanong ang kahit anong gusto mong suriin nang dalawang beses.",
    "asking": "Nagtatanong sa ilang model…",
    "ask": "Itanong sa Keplar ang kahit ano",
    "examples": "Mga halimbawang tanong",
    "idleHead": "Ang makikita mo",
    "disagreement": "Hindi pagkakasundo",
    "fullCard": "Tingnan ang buong answer card",
    "signup": "Gumawa ng libreng account para mai-save ang history mo",
    "left": "{left} sa {n} demo na tanong ang natitira ngayong araw",
    "metaTail": "libreng model · walang account",
    "models": "Mga model",
    "answered": "sumagot",
    "consensus": "{responded} sa {consulted} model ang sumagot · {agree} ang sang-ayon",
    "disagreeCount": ", {n} ang hindi sang-ayon"
  },
  "authForm": {
    "checkEmail": "Tingnan ang email mo",
    "sentVerify": "Nagpadala kami ng verification link sa <b>{email}</b>. Buksan ito at pindutin ang “I-verify at magpatuloy” para matapos ang paggawa ng account mo. Mag-e-expire ito sa loob ng 24 na oras.",
    "sentLink": "Nagpadala kami ng sign-in link sa <b>{email}</b>. Buksan ito at pindutin ang “Mag-sign in”. Mag-e-expire ito sa loob ng 15 minuto.",
    "notThere": "Wala pa? Tingnan ang spam, o maghintay nang isang minuto. Kung may account ka na, sasabihin iyon ng email.",
    "sending": "Ipinapadala…",
    "resendIn": "Ipadala ulit sa loob ng {n}s",
    "resend": "Ipadala ulit ang email",
    "differentEmail": "Gumamit ng ibang email",
    "linkInstead": "I-email na lang sa akin ang sign-in link",
    "link": "I-email sa akin ang sign-in link",
    "oauthConsent": "Sa pagpapatuloy gamit ang Google o Microsoft, kinukumpirma mong hindi bababa sa 13 taong gulang ka, sumasang-ayon ka sa <terms>Mga Tuntunin</terms>, at kinikilala mo ang <privacy>Patakaran sa Privacy</privacy>.",
    "or": "o gamitin ang email mo",
    "name": "Pangalan",
    "optional": "(opsyonal)",
    "email": "Email",
    "password": "Password",
    "forgot": "Nakalimutan ang password?",
    "confirm": "Kumpirmahin ang password",
    "terms": "Hindi bababa sa 13 taong gulang ako (may pahintulot ng magulang o tagapag-alaga kung wala pang 18), sumasang-ayon ako sa <terms>Mga Tuntunin</terms>, at nabasa ko na ang <privacy>Patakaran sa Privacy</privacy>.",
    "remember": "Panatilihin akong naka-sign in sa device na ito",
    "unverified": "Hindi pa na-verify ang email mo.",
    "resendVerify": "Ipadala ulit ang verification email",
    "creating": "Ginagawa ang account…",
    "loggingIn": "Nagla-log in…",
    "create": "Gumawa ng account",
    "logIn": "Mag-log in",
    "noPassword": "Hindi kailangan ng password. Mag-e-email kami ng one-time link na nagpapatunay ng address mo.",
    "errEmail": "Maglagay ng valid na email address, gaya ng you@example.com.",
    "errEmailEmpty": "Ilagay ang email address mo.",
    "errEmailAbove": "Ilagay ang email mo sa itaas, saka pindutin ulit ito.",
    "errPassword": "Ilagay ang password mo.",
    "errWeak": "Pumili ng mas malakas na password.",
    "errMatch": "Hindi magkatugma ang dalawang password.",
    "errTerms": "Tanggapin ang Mga Tuntunin at Patakaran sa Privacy para makagawa ng account.",
    "errTooMany": "Masyadong maraming hiniling na sign-in email. Subukan ulit pagkalipas ng ilang minuto.",
    "continueWith": "Magpatuloy gamit ang {name}",
    "opening": "Binubuksan ang {name}…",
    "soon": "Malapit na",
    "passkey": "Mag-log in gamit ang passkey",
    "passkeyWaiting": "Hinihintay ang device mo…"
  }
};

export default m;
