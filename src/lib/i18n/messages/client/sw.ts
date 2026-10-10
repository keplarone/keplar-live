// sw client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "Swali moja.",
      "Akili nyingi.",
      "Jibu moja."
    ],
    "sub": "Keplar hutumia miundo kadhaa ya AI, hulinganisha mitazamo yao, na kukupa jibu moja lililo wazi na lililounganishwa.",
    "note": "Majina ya miundo ni mifano ya familia za miundo ambazo Keplar inaweza kuzielekezea maswali; ni miundo ipi itajibu inategemea mpango wako, swali na upatikanaji. Majina ni mali ya wamiliki wake. Hufunguka kwenye programu; hakuna kinachotumwa hadi ubonyeze Tuma.",
    "ask": "Uliza Keplar chochote",
    "questionLabel": "Swali lako",
    "builtBy": "Imetengenezwa na {credit}",
    "tryDemo": "Jaribu onyesho la moja kwa moja",
    "everything": "Kila kitu ndani ya Keplar",
    "families": "Mifano ya familia za miundo",
    "storyLabel": "Jinsi Keplar inavyofanya kazi",
    "kickers": [
      "Uliza",
      "Elekeza",
      "Jibu",
      "Linganisha",
      "Thibitisha",
      "Jibu kuu"
    ],
    "index": [
      "Uliza",
      "Swali",
      "Elekeza",
      "Jibu",
      "Linganisha",
      "Thibitisha",
      "Jibu kuu"
    ],
    "questionPrompt": "Ninunue nyumba mwaka huu au niendelee kupanga?",
    "questionCaption": "Swali moja linaingia kwenye mfumo.",
    "distributionTitle": "Keplar-One huamua nani aulizwe.",
    "distributionBody": "Si kila muundo, kila mara. Ni akili zinazohitajika na swali hili tu, zikipimwa kwa ubora, kuaminika, kasi na gharama.",
    "routeNote": "Majina ni mifano. Ni miundo ipi itajibu inategemea mpango wako, swali na upatikanaji. Majina ni mali ya wamiliki wake.",
    "responsesTitle": "Kila mmoja hujibu peke yake.",
    "responsesBody": "Hoja tofauti. Ushahidi tofauti. Majibu mengine yanakubaliana. Mengine hayakubaliani.",
    "respondNote": "Kielelezo, si matokeo halisi.",
    "agree": "5 wanakubaliana.",
    "dissent": "1 hakubaliani.",
    "detected": "Tofauti imegunduliwa.",
    "follow": "Keplar huchunguza sababu.",
    "disagreeNote": "Kielelezo kwa swali la mfano. Idadi ni mfano, si matokeo halisi.",
    "verificationTitle": "Tathmini, si kura.",
    "verificationBody": "Keplar hupima ushahidi na hoja nyuma ya kila jibu. Ushahidi unaohusiana hukusanyika, migongano hutenganishwa, kelele huondoka. Wachache wanaweza kuwa sahihi.",
    "verifySteps": [
      "Pima ushahidi",
      "Tenganisha migongano",
      "Ondoa kelele"
    ],
    "closingTitle": "Jibu moja.",
    "convergenceBody": "Limeunganishwa kutokana na kilichosimama imara, likionyesha makubaliano na tofauti.",
    "closingSecondary": "Jinsi Keplar-One inavyofanya kazi",
    "beats": {
      "question": {
        "text": "Inaanza na swali.",
        "short": "Inaanza na swali."
      },
      "minds": {
        "text": "Keplar huuliza akili kadhaa kwa wakati mmoja.",
        "short": "Akili kadhaa, kwa pamoja."
      },
      "disagree": {
        "text": "Hutafuta wapi zinatofautiana.",
        "short": "Wapi zinatofautiana."
      },
      "verify": {
        "text": "Hukagua kinachosimama imara.",
        "short": "Kinachosimama imara."
      },
      "answer": {
        "text": "Na kukupa jibu moja unaloweza kuliamini.",
        "short": "Jibu moja la kuaminika."
      }
    }
  },
  "demo": {
    "samples": [
      "Katika baridi kali, ni nafuu zaidi kutumia pampu ya joto au boila ya gesi?",
      "Je, kampuni changa ya watu wawili inapaswa kusajiliwa Delaware?",
      "Je, kreatini husaidia kumbukumbu, au misuli tu?"
    ],
    "stages": {
      "understand": "Kuelewa swali",
      "select": "Kuchagua miundo ya kuuliza",
      "compare": "Kulinganisha majibu yao",
      "disagree": "Kutafuta tofauti",
      "verify": "Kukagua kinachosimama imara",
      "synthesize": "Kuandika jibu moja"
    },
    "dailyDemo": "Hayo ndiyo maswali {n} ya onyesho ya leo. Endelea kwenye programu, bure, bila kadi.",
    "slowDown": "Subiri kidogo: maswali machache tu kwa dakika kwenye onyesho. Jaribu tena baadaye kidogo.",
    "dailyFree": "Umetumia maswali ya bure ya leo. Jisajili bure ili kuendelea, au urudi kesho.",
    "tooBig": "Swali hili linahitaji zaidi ya kiwango cha bure. Jaribu swali fupi zaidi.",
    "offline": "Imeshindwa kufikia Keplar. Kagua muunganisho wako kisha ujaribu tena.",
    "label": "Swali lako",
    "placeholder": "Uliza chochote ambacho ungetaka kukagua mara mbili.",
    "asking": "Inauliza miundo kadhaa…",
    "ask": "Uliza Keplar chochote",
    "examples": "Mifano ya maswali",
    "idleHead": "Utakachoona",
    "disagreement": "Tofauti",
    "fullCard": "Tazama kadi kamili ya jibu",
    "signup": "Fungua akaunti ya bure ili kuhifadhi historia yako",
    "left": "Maswali {left} kati ya {n} ya onyesho yamebaki leo",
    "metaTail": "miundo ya bure · bila akaunti",
    "models": "Miundo",
    "answered": "imejibu",
    "consensus": "Miundo {responded} kati ya {consulted} imejibu · {agree} inakubaliana",
    "disagreeCount": ", {n} haikubaliani"
  },
  "authForm": {
    "checkEmail": "Angalia barua pepe yako",
    "sentVerify": "Tumetuma kiungo cha uthibitisho kwa <b>{email}</b>. Kifungue na ubonyeze “Thibitisha na uendelee” ili kumaliza kufungua akaunti yako. Kinaisha baada ya saa 24.",
    "sentLink": "Tumetuma kiungo cha kuingia kwa <b>{email}</b>. Kifungue na ubonyeze “Ingia”. Kinaisha baada ya dakika 15.",
    "notThere": "Haipo? Angalia spam, au subiri dakika moja. Kama tayari una akaunti, barua pepe itakueleza.",
    "sending": "Inatuma…",
    "resendIn": "Tuma tena baada ya sekunde {n}",
    "resend": "Tuma barua pepe tena",
    "differentEmail": "Tumia barua pepe nyingine",
    "linkInstead": "Nitumie kiungo cha kuingia badala yake",
    "link": "Nitumie kiungo cha kuingia",
    "oauthConsent": "Kwa kuendelea na Google au Microsoft unathibitisha kuwa una angalau miaka 13, unakubali <terms>Masharti</terms> na unatambua <privacy>Sera ya Faragha</privacy>.",
    "or": "au tumia barua pepe yako",
    "name": "Jina",
    "optional": "(si lazima)",
    "email": "Barua pepe",
    "password": "Nenosiri",
    "forgot": "Umesahau nenosiri?",
    "confirm": "Thibitisha nenosiri",
    "terms": "Nina angalau miaka 13 (kwa ruhusa ya mzazi au mlezi kama nina chini ya miaka 18), ninakubali <terms>Masharti</terms>, na nimesoma <privacy>Sera ya Faragha</privacy>.",
    "remember": "Nibakishe nikiwa nimeingia kwenye kifaa hiki",
    "unverified": "Barua pepe yako bado haijathibitishwa.",
    "resendVerify": "Tuma tena barua pepe ya uthibitisho",
    "creating": "Inafungua akaunti…",
    "loggingIn": "Inaingia…",
    "create": "Fungua akaunti",
    "logIn": "Ingia",
    "noPassword": "Hakuna nenosiri linalohitajika. Tunakutumia kiungo cha matumizi ya mara moja kinachothibitisha anwani yako.",
    "errEmail": "Weka anwani sahihi ya barua pepe, kama you@example.com.",
    "errEmailEmpty": "Weka anwani yako ya barua pepe.",
    "errEmailAbove": "Weka barua pepe yako hapo juu, kisha ubonyeze hiki tena.",
    "errPassword": "Weka nenosiri lako.",
    "errWeak": "Chagua nenosiri imara zaidi.",
    "errMatch": "Manenosiri mawili hayalingani.",
    "errTerms": "Kubali Masharti na Sera ya Faragha ili kufungua akaunti.",
    "errTooMany": "Barua pepe nyingi mno za kuingia zimeombwa. Jaribu tena baada ya dakika chache.",
    "continueWith": "Endelea na {name}",
    "opening": "Inafungua {name}…",
    "soon": "Inakuja hivi karibuni",
    "passkey": "Ingia kwa passkey",
    "passkeyWaiting": "Inasubiri kifaa chako…"
  }
};

export default m;
