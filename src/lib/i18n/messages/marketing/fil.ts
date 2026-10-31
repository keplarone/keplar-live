// fil marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — Isang tanong. Maraming katalinuhan. Isang sagot.",
      "description": "Ipinapadala ng Keplar ang tanong mo sa maraming AI model, hinahanap kung saan sila hindi magkasundo, nagbeberipika, at binibigyan ka ng isang pinagsamang sagot. Libreng subukan, walang sign-up."
    },
    "features": {
      "title": "Lahat ng nasa Keplar",
      "description": "Bawat feature ng Keplar sa iisang page, nakagrupo ayon sa gamit: pagtatanong, pagbasa ng file, paggawa ng site at app, sama-samang pagbuo, pag-publish, ang API at widget, at tiwala. Sinasabi ng bawat isa kung live na, nasa beta o malapit na."
    },
    "pricing": {
      "title": "Presyo: Free, Plus $45, Pro $99",
      "description": "Magsimula nang libre sa Keplar One. Ang Keplar Plus ay $45/buwan, ang Keplar Pro ay $99/buwan, at available ang mga Business plan sa pamamagitan ng aming sales team. Paggamit na nakikita mo, hindi kailanman nakatago."
    },
    "showcase": {
      "title": "Create showcase: ganito dapat ang itsura ng app na ginawa sa Keplar",
      "description": "Walong demo na site at app na ginawa ng Keplar team para ipakita ang saklaw na layunin ng Create: mga menu, ledger, board, kalendaryo at editorial na page, bawat isa may sariling font at kulay. Hindi mga site ng customer."
    },
    "roadmap": {
      "title": "Roadmap",
      "description": "Ano ang ginagawa ngayon ng Keplar, ano ang nasa beta at tinatapos pa, at ano ang kalalabas lang. Walang target na petsang hindi namin kayang tuparin."
    },
    "developers": {
      "title": "Keplar para sa mga developer: API, embeddable Ask, Teams",
      "description": "Magtanong sa Keplar mula sa sarili mong code gamit ang Bearer API key, o ilagay ang Ask widget sa site mo gamit ang isang script tag. OpenAPI spec, streaming, malinaw na limit kada plan."
    },
    "signin": {
      "title": "Mag-log in",
      "description": "Mag-log in sa Keplar."
    },
    "signup": {
      "title": "Gumawa ng account",
      "description": "Gumawa ng libreng Keplar account."
    }
  },
  "status": {
    "live": "Live",
    "beta": "Beta",
    "soon": "Malapit na"
  },
  "chapters": {
    "demoKicker": "Live na demo",
    "demoTitle": "Subukan dito. Walang account.",
    "proof": "Ginawa nina {credit}. Bukas sa publiko ang paggawa: <changelog>changelog</changelog>, <roadmap>roadmap</roadmap>, at isang <security>security page</security> na nagsasabi kung ano ang tapos na at hindi pa.",
    "showcaseNote": "Ang mga showcase demo ay gawa ng Keplar team, hindi mga site ng customer. <link>Tingnan ang lahat ng walo</link>",
    "closeTitle": "Itanong sa Keplar ang kahit ano.",
    "closeCta": "Itanong sa Keplar ang kahit ano",
    "closeSmall": "Libre, walang card. <link>Lahat ng nasa Keplar sa iisang page</link>, kasama kung ano ang live, nasa beta at malapit na.",
    "voiceCaption": "Voice Live Create: magsalita, at sabay na gumagalaw ang editor, terminal at preview. Huminto at maghihintay ito; sabihing \"teka, mali\" at babaguhin nito.",
    "voiceLabel": "Voice Live Create: editor, terminal at live preview na magkakatabi",
    "list": {
      "ask": {
        "label": "Magtanong",
        "title": "Itanong sa Keplar ang kahit ano.",
        "lede": "Isang tanong ang napupunta sa ilang AI model. Inihahambing sila ng Keplar, ipinapakita kung saan sila hindi magkasundo, sinusuri kung ano ang tumatayo at sumusulat ng isang sagot."
      },
      "understand": {
        "label": "Unawain",
        "title": "Binabasa nito ang ibinibigay mo.",
        "lede": "Ilagay ang bagay na itinatanong mo. Binabasa ito ng Keplar para lang sa tanong na iyon at hindi nito itinatabi ang file."
      },
      "create": {
        "label": "Gumawa",
        "title": "Ilarawan ito, o sabihin. Makakuha ng hindi mukhang generated.",
        "lede": "Nagpaplano ang Create ng disenyo para sa negosyong nasa brief mo, sumusulat ng code, sinusubok ang bawat screen, at tinatanggihan ang purple glow, gradient blob at three-card grid."
      },
      "together": {
        "label": "Sama-samang bumuo",
        "title": "Buuin ito kasama ang iba, at kasama ang isang kritiko.",
        "lede": "Magtrabaho sa iisang proyekto nang sabay, at makakuha ng pangalawang opinyon na hindi galing sa iyo."
      },
      "ship": {
        "label": "I-publish",
        "title": "I-publish sa isang hakbang. I-undo sa isang hakbang.",
        "lede": "Nagla-live ang proyekto mo sa isang Keplar address, at sa sarili mong domain kapag gusto mo."
      },
      "platform": {
        "label": "Platform",
        "title": "Gamitin ang Keplar kahit saan.",
        "lede": "Ang parehong makina, sa likod ng API, sa browser mo, sa loob ng widget sa site mo, at shared sa buong team."
      },
      "trust": {
        "label": "Tiwala",
        "title": "Tapat tungkol sa ginagawa nito, at sa data mo.",
        "lede": "Kung ano ang pinoprotektahan namin, paano, at kung ano ang hindi pa namin nagagawa, nakasulat lahat. Walang badge na hindi namin nakuha."
      }
    },
    "items": {
      "demo": {
        "name": "Live na demo",
        "line": "Magtanong ng totoong tanong sa page na ito. Walang account."
      },
      "multi-model": {
        "name": "Ilang model, isang sagot",
        "line": "Ang mga model lang na kailangan ng tanong, inihahambing bawat claim."
      },
      "disagreement": {
        "name": "Mapa ng hindi pagkakasundo",
        "line": "Kung saan nagkakasundo ang mga model, saan naghihiwalay, at bakit ganoon ang naging sagot."
      },
      "debate": {
        "name": "Debate mode",
        "line": "Panoorin ang mga model na magtalo nang ilang round bago sumagot ang Keplar."
      },
      "voice": {
        "name": "Voice mode",
        "line": "Magtanong nang malakas, pakinggan ang sagot na binabasa. Hindi kailanman nire-record o sine-save ng Keplar ang audio mo."
      },
      "live-research": {
        "name": "Live Research",
        "line": "Sa desktop app, naghahanap ang Keplar sa web at nagbabasa ng mga page sa computer mo, saka sinisipi ang bawat isa at sinusuri ang mga sipi.",
        "note": "Desktop app 0.2.0 o mas bago."
      },
      "images": {
        "name": "Mga larawan at screenshot",
        "line": "Mga chart, resibo, whiteboard, UI. Ipinapadala lang sa mga model na nakakakita."
      },
      "video": {
        "name": "Video",
        "line": "Kinukuha ang mga keyframe sa browser mo; hindi ina-upload ang mismong clip."
      },
      "docs": {
        "name": "Mga dokumento, code at data",
        "line": "PDF, text, CSV, JSON at mga source file, binabasa bilang text."
      },
      "office": {
        "name": "Word, PowerPoint, Excel at audio",
        "line": "Ligtas na pina-parse ang mga Office file; tina-transcribe ang audio."
      },
      "links": {
        "name": "Mga link",
        "line": "Mag-paste ng URL at babasahin ng Keplar ang page sa pamamagitan ng protektadong fetch."
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "Magsalita at panoorin ang editor, terminal at preview na sabay na nabubuo. Sabihing \"teka, mali\" para magbago ng direksyon.",
        "note": "Kailangan ng browser na may speech recognition (Chrome, Edge, Safari)."
      },
      "showcase": {
        "name": "Showcase",
        "line": "Walong demo ng Keplar team na nagtatakda ng pamantayan para sa Create."
      },
      "surprise": {
        "name": "Sorpresahin mo ako",
        "line": "Isang pindot: tiyak na brief, estilo at lalim, ginawa para sa iyo."
      },
      "versions": {
        "name": "Version history",
        "line": "Bawat build ay isang version. I-restore ang kahit alin, o i-branch ito sa bagong draft."
      },
      "community": {
        "name": "Gallery ng komunidad",
        "line": "Mga site na piniling i-share ng mga tao. I-like, i-remix, i-report."
      },
      "anti-vibe": {
        "name": "Mga panuntunan laban sa generic na disenyo",
        "line": "Isang nakasulat na rubric at lint pass na tinatanggihan ang karaniwang itsura ng AI bago mo pa makita."
      },
      "collab": {
        "name": "Real-time na kolaborasyon",
        "line": "Mag-imbita gamit ang link at sabay na i-edit ang iisang proyekto: live cursor, follow mode, shared terminal at preview.",
        "note": "Magbukas ng app sa Create, saka Live. Nanonood ang mga viewer; nagta-type ang mga editor."
      },
      "critic": {
        "name": "AI critic",
        "line": "Mga panuntunan, axe-core sa totoong browser at isang hiwalay na model ang nagre-review ng build mo, saka ina-apply ang mga ayos na pinili mo."
      },
      "publish": {
        "name": "One-click publish",
        "line": "I-publish ang draft sa live na address mula sa Create."
      },
      "previews": {
        "name": "Mga preview",
        "line": "May pribadong preview link ang bawat draft bago ito mag-live."
      },
      "rollback": {
        "name": "Rollback",
        "line": "I-restore ang naunang version kapag nagkaproblema ang isang pagbabago."
      },
      "domains": {
        "name": "Custom domain",
        "line": "Ikonekta ang domain na pagmamay-ari mo; sinusuri ng Keplar ang DNS at sinasabi kung ano ang babaguhin."
      },
      "ssl": {
        "name": "Awtomatikong HTTPS",
        "line": "Nag-iisyu at nagre-renew ng certificate para sa mga nakakonektang domain."
      },
      "api": {
        "name": "Public API",
        "line": "Bearer key, limit kada plan, OpenAPI spec. Libreng model lang ang gamit ng libreng key."
      },
      "embed": {
        "name": "Embeddable widget",
        "line": "Isang script tag ang naglalagay ng Keplar Ask sa site mo, limitado sa mga origin na pinapayagan mo."
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "Mga shared workspace na may role na owner, admin, editor at viewer.",
        "note": "Business plan."
      },
      "referrals": {
        "name": "Referral program",
        "line": "Mag-imbita ng kaibigan; pareho kayong makakakuha ng dagdag na paggamit, hindi kailanman pera."
      },
      "roblox-studio": {
        "name": "Roblox Studio mode",
        "line": "Kasamang tagabuo sa loob ng Roblox Studio: mapa, UI, flipbook effects at Luau scripts, gamit ang Keplar's studio model.",
        "note": "Desktop app, Lite pataas."
      },
      "roblox-cloud": {
        "name": "Roblox Cloud",
        "line": "Magdamagang trabaho sa scripts ng laro mo, bawat edit sinusuri ng analyzer ng Luau, ina-apply sa Studio kapag sinabi mo.",
        "note": "Scripts lang; hindi ito makakapag-play-test."
      },
      "blender": {
        "name": "Blender mode",
        "line": "Mag-model, mag-texture gamit ang Poly Haven PBR sets, mag-ilaw at mag-export sa Blender 4.2 o mas bago.",
        "note": "Desktop app 0.1.8 o mas bago."
      },
      "blender-cloud": {
        "name": "Blender Cloud rendering",
        "line": "Mag-render ng scene sa mga server ng Keplar kahit nakapatay ang computer mo, saka i-download ang mga frame at isang MP4.",
        "note": "Desktop app 0.1.10 o mas bago."
      },
      "extension": {
        "name": "Keplar One browser extension",
        "line": "Magtanong tungkol sa napiling text o isang page mula sa Chrome o Edge, gamit ang API key mo.",
        "note": "Naisumite na sa Chrome Web Store."
      },
      "lens": {
        "name": "Search with Keplar One",
        "line": "I-drag sa anumang text o larawan sa page; bubukas ang sagot sa side panel.",
        "note": "Bahagi ng browser extension."
      },
      "security": {
        "name": "Seguridad",
        "line": "Encryption, mga provider, retention, proteksyon ng account at paano mag-report ng problema."
      },
      "changelog": {
        "name": "Changelog",
        "line": "Ano ang inilabas, at kailan."
      },
      "roadmap": {
        "name": "Roadmap",
        "line": "Ano ang susunod naming gagawin, at ano ang hindi pa live."
      }
    }
  },
  "featuresPage": {
    "kicker": "Lahat ng nasa Keplar",
    "crumb": "Mga feature",
    "title": "Bawat feature, at kung magagamit mo na ito ngayon.",
    "lead": "<b>{live}</b> live, <b>{beta}</b> nasa beta, <b>{soon}</b> malapit na. Gumagana ang beta pero puwedeng magbago o limitado sa ilang plan. Ang malapit na ay hindi pa magagamit at hindi naka-link na para bang magagamit na.",
    "sections": "Mga seksyon",
    "thFeature": "Feature",
    "thWhat": "Ginagawa nito",
    "thStatus": "Status",
    "foot": "Ano ang nagbago kamakailan: <changelog>changelog</changelog>. Ano ang susunod: <roadmap>roadmap</roadmap>. Handa nang subukan: <demo>magtanong sa home page</demo>, walang account."
  },
  "pricing": {
    "label": "Presyo",
    "title": "Magsimula nang libre. Mag-upgrade kapag kailangan mo ng higit pa.",
    "lede": "Magsimula nang libre para sa pang-araw-araw na tanong. Mag-upgrade para sa premium na model, Deep Research, at paggawa ng site, larawan at video. May negosyo ka? Iniaangkop dito ang Business. Sinusukat ang paggamit ng Keplar sa credit, hindi sa raw token.",
    "tailored": "Iniaangkop sa negosyo mo",
    "custom": "Custom",
    "cadence": {
      "forever": "habambuhay",
      "per month": "kada buwan",
      "custom": "custom"
    },
    "perMonth": "{price}/buwan",
    "fine": "Mag-cancel anumang oras mula sa account mo. Ang Whop ang humahawak sa checkout. Nire-renew ang credit bawat buwan at nagagamit ayon sa dami ng trabahong kailangan ng tanong mula sa mga model: kaunti lang ang gastos ng simpleng tanong.",
    "tiers": {
      "free": {
        "summary": "Pang-araw-araw na tanong gamit ang Keplar-One, sa libreng open model.",
        "features": [
          "Keplar-One orchestration",
          "Libreng open model lang",
          "Puwedeng bumagal kapag abala ang libreng model",
          "Puwedeng i-log ng host ng libreng model ang prompt",
          "Limitadong consensus",
          "Web search sa desktop app lang (Live Research, beta)",
          "Hanggang 50 tanong kada araw (fair use)",
          "Tanong tungkol sa larawan at video gamit ang libreng vision model",
          "Study mode: mag-upload ng text-based na PDF para sa flashcard, quiz at plano (libreng model, mas maliit na limit)",
          "Naka-save na chat at opsyonal na memory kapag naka-sign in"
        ],
        "cta": "Subukan ang Keplar"
      },
      "lite": {
        "summary": "Ang kasunod ng Free: premium na model para sa pang-araw-araw na tanong, sa mas mababang presyo.",
        "features": [
          "Premium na model at Keplar-One consensus",
          "2,400 credit kada buwan na may 5-oras at lingguhang limit",
          "Tulong sa coding at pagsusuri ng file",
          "Study mode sa mas malalakas na model",
          "Gumawa ng maliit na personal na site (libreng keplar.site address)",
          "Nagsisimula sa Plus ang image generation, Slides, Deep Research, agent at custom domain",
          "Pro at Business lang ang video"
        ],
        "cta": "Mag-upgrade sa Lite"
      },
      "plus": {
        "summary": "Para sa araw-araw na gamit: paaralan, trabaho, tanong sa kalusugan at malalaking desisyon.",
        "features": [
          "Premium na model at advanced na Keplar-One",
          "Mas malaking consensus allowance",
          "Deep Research para sa malalaking desisyon",
          "Tulong sa coding at pagsusuri ng file",
          "Web search sa desktop app lang (Live Research, beta)",
          "Gumawa ng personal na site at app",
          "Slideshow creator na may export sa PowerPoint at PDF (placeholder ang mga ideya ng larawan)",
          "Study mode sa mas malalakas na model na may mas malaking limit",
          "Image generation",
          "Mas malaking context at priority na paggamit"
        ],
        "cta": "Mag-upgrade sa Plus"
      },
      "pro": {
        "summary": "Para sa power user at creator: mas maraming paggamit, paggawa at agent.",
        "features": [
          "Lahat ng nasa Plus",
          "Higit sa dobleng buwanang credit",
          "Video generation",
          "Slideshow creator at Study mode na may pinakamalaking limit",
          "Advanced na paggawa",
          "Advanced na agent",
          "Mas malaking context",
          "Mas mataas na priority at concurrency"
        ],
        "cta": "Mag-upgrade sa Pro"
      }
    },
    "seeAll": "Tingnan ang lahat sa {plan}",
    "showLess": "Ipakita nang mas kaunti",
    "fitTitle": "Aling plan ang bagay?",
    "fits": {
      "free": {
        "who": "Gusto mong makita kung paano ito gumagana.",
        "outcome": "Magtanong ng pang-araw-araw na tanong sa libreng model, hanggang 50 kada araw. Walang card.",
        "cta": "Itanong sa Keplar ang kahit ano"
      },
      "plus": {
        "who": "Araw-araw kang gumagamit ng AI para sa paaralan, trabaho o malalaking desisyon.",
        "outcome": "Premium na model, Deep Research, Slides, image generation at custom domain para sa mga ginagawa mo.",
        "cta": "Mag-upgrade sa Plus"
      },
      "pro": {
        "who": "Marami kang binubuo at ginagawa.",
        "outcome": "Higit sa dobleng credit ng Plus, video, mas maraming proyekto at agent, at mas mataas na priority.",
        "cta": "Mag-upgrade sa Pro"
      }
    },
    "compareTitle": "Ihambing ang lahat ng plan",
    "compareLede": "Ang buong talahanayan bawat feature, kasama ang bawat limit na ipinapatupad ng produkto ngayon, ay nasa English na pricing page.",
    "compareLink": "Tingnan ang buong paghahambing (sa Ingles)",
    "closingTitle": "Hindi pa sigurado? Magsimula nang libre.",
    "closingLede": "Magtanong ng totoong tanong at tingnan kung saan nagkakasundo at naghihiwalay ang mga model. Walang card, at puwede kang mag-upgrade sa loob ng app kapag kailangan mo ng higit pa.",
    "closingAsk": "Itanong sa Keplar ang kahit ano",
    "closingCompare": "Paano naghahambing ang Keplar"
  },
  "roadmap": {
    "kicker": "Roadmap",
    "title": "Ano ang ginagawa namin, at ano ang hindi pa tapos.",
    "lead": "Walang target na petsa: inilalabas ang mga bagay kapag gumagana na. Lahat sa ibaba ay ginagawa pa ngayon o magagamit na sa beta na may alam na kakulangan. Para sa mga nailabas na, tingnan ang <changelog>changelog</changelog>; para sa buong listahan na may status, tingnan ang <features>lahat ng nasa Keplar</features>.",
    "nowNum": "Ngayon",
    "nowTitle": "Ginagawa",
    "nowLede": "Hindi pa magagamit. Ipinapakita bilang Malapit na sa buong site.",
    "nextNum": "Susunod",
    "nextTitle": "Tinatapos ang mga beta feature",
    "nextLede": "Gumagana na ang mga ito ngayon. Ito ang kulang pa.",
    "doneNum": "Nailabas",
    "doneTitle": "Kamakailan",
    "doneLede": "Ang huling ilang release. Galing sa commit history ang mga petsa.",
    "englishNote": "Nasa Ingles ang release notes.",
    "finishing": [
      {
        "feature": "Public API",
        "items": [
          "Team-level na key",
          "Credit cap kada key",
          "Opisyal na SDK",
          "Webhook"
        ]
      },
      {
        "feature": "Embeddable widget",
        "items": [
          "Signed na publisher token",
          "Custom na styling"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "Cap kada miyembro at breakdown ng paggamit",
          "Paglipat ng ownership",
          "Single sign-on"
        ]
      },
      {
        "feature": "Boses",
        "items": [
          "Fallback para sa browser na walang speech recognition (Firefox)",
          "Pagpili ng wika"
        ]
      },
      {
        "feature": "Pagsusuri ng source",
        "items": [
          "I-on ang web source check para sa mga bayad na plan pagkatapos ng live na test"
        ]
      }
    ],
    "foot": "May kailangan kang wala pa? <feedback>Sabihin sa amin</feedback>. Ang mga isyu sa seguridad ay ipadala sa address na nasa <security>security page</security>."
  },
  "showcase": {
    "kicker": "Showcase",
    "title": "Walang purple glow. Walang three-card grid. Ginawa para sa negosyong nasa brief.",
    "lead": "Nagpaplano ang Create ng disenyo para sa inilalarawan mo, saka tinatanggihan ang mga pattern na nagpapamukhang magkakapareho ang mga site na gawa ng AI. Ipinapakita ng mga demo na ito ang saklaw na hinihingi namin: listahan ng alak na parang naka-print na card, ledger ng roastery, dispatch board ng courier.",
    "disclosure": "Mga showcase demo na ginawa ng Keplar team para ipakita ang layunin ng Create. Hindi mga site ng customer. Sample na nilalaman lang ang mga pangalan, presyo at petsa sa loob.",
    "sites": "site",
    "apps": "app",
    "styles": "visual na estilo",
    "industries": "industriya",
    "contentNote": "Nasa Ingles ang mga pamagat at paglalarawan ng demo.",
    "galleryKicker": "Gawa ng mga gumagamit ng Keplar",
    "gallery": "Gallery ng komunidad",
    "yourTurn": "Ikaw naman",
    "openCreate": "Buksan ang Create"
  },
  "developers": {
    "kicker": "Mga developer",
    "title": "Bumuo gamit ang Keplar.",
    "lede": "Isang request ang nagpapadala ng tanong sa ilang model, inihahambing sila, at nagbabalik ng isang sagot na may malinaw na tala kung saan sila hindi nagkasundo. Tawagin ito mula sa server mo gamit ang API key, o ilagay ang parehong Ask sa sarili mong site gamit ang isang script tag.",
    "getKey": "Kumuha ng API key",
    "widget": "Gumawa ng widget",
    "spec": "OpenAPI spec",
    "endpoint": "Pangunahing endpoint",
    "products": [
      {
        "name": "Public API",
        "text": "Bearer key, JSON o streaming na sagot, pagkakasundo at hindi pagkakasundo sa bawat response."
      },
      {
        "name": "Embeddable Ask",
        "text": "Isang themeable na Ask box para sa docs o produkto mo. May kasamang origin allowlist at rate limit."
      },
      {
        "name": "Keplar for Teams",
        "text": "Mga shared workspace na may role na admin, editor at viewer, imbitasyon sa email o link."
      },
      {
        "name": "Mga referral",
        "text": "I-share ang link mo. Ikaw at ang kaibigan mo ay makakakuha ng tig-{n} usage credit kapag sumali siya."
      }
    ],
    "platform": "Platform",
    "refTitle": "Ang buong reference",
    "refLede": "Ang mga tier at limit, quickstart, format ng request at response, streaming, widget, mga role sa Teams, error at mga tala sa seguridad ay nasa English na developer page. Pareho ang code, pangalan ng field at error code sa bawat wika.",
    "sections": [
      "Mga tier at limit",
      "Quickstart",
      "POST /api/v1/ask",
      "Streaming",
      "Embeddable Ask widget",
      "Keplar for Teams",
      "Mga error",
      "Seguridad at privacy",
      "Hindi pa available"
    ],
    "refLink": "Buksan ang buong reference (sa Ingles)"
  },
  "auth": {
    "signinTitle": "Mag-log in sa Keplar",
    "signinLead": "Ituloy ang mga thread, proyekto at plan mo.",
    "addTitle": "Magdagdag ng account",
    "addLead": "Mag-sign in gamit ang ibang account. Mananatiling naka-sign in sa device na ito ang account na ginagamit mo.",
    "checkoutLead": "Mag-log in para magpatuloy sa checkout. Diretso ka sa pagbabayad pagkatapos.",
    "expired": "Na-sign out ang {email}. Mag-sign in ulit para magamit ito.",
    "signupTitle": "Gumawa ng Keplar account mo",
    "signupLead": "Para sa homework at malalaking desisyon, plano sa biyahe at side project, o pagpapatakbo ng negosyo. Tumatakbo ang Free sa libreng open model, at puwede kang mag-upgrade anumang oras.",
    "invited": "Inimbitahan ka ng isang kaibigan: kapag na-verify ang email mo, pareho kayong makakakuha ng dagdag na usage credit (hindi kailanman pera). Nasa referral terms ang detalye.",
    "signUp": "Mag-sign up",
    "logIn": "Mag-log in",
    "toggle": "Mag-sign up o mag-log in",
    "about": "Tungkol sa Keplar",
    "panel": {
      "signin": {
        "eyebrow": "Maligayang pagbabalik",
        "title": "Ituloy kung saan ka huminto.",
        "lead": "Naghihintay ang mga thread, proyekto at plan mo, sa bawat device na pinag-sign in-an mo."
      },
      "signup": {
        "eyebrow": "Libreng account",
        "title": "Huwag nang magtiwala sa iisang AI lang.",
        "lead": "Tumatakbo ang Free sa libreng open model, at puwede kang mag-upgrade anumang oras."
      }
    },
    "points": [
      "Tinatanong ang mga model na kailangan ng tanong mo",
      "Ipinapakita kung saan sila hindi nagkakasundo",
      "Isang sagot, kasama ang mga hindi pagkakasundo"
    ]
  }
};

export default m;
