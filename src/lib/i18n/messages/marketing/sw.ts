// sw marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — Swali moja. Akili nyingi. Jibu moja.",
      "description": "Keplar hutuma swali lako kwa miundo kadhaa ya AI, hutafuta wapi zinatofautiana, huthibitisha, na kukupa jibu moja lililounganishwa. Jaribu bure, bila kujisajili."
    },
    "features": {
      "title": "Kila kitu ndani ya Keplar",
      "description": "Kila kipengele cha Keplar kwenye ukurasa mmoja, kimepangwa kwa matumizi: kuuliza, kusoma faili, kutengeneza tovuti na programu, kujenga pamoja, kuchapisha, API na wijeti, na uaminifu. Kila kimoja kinaeleza kama kinapatikana, kiko kwenye beta au kinakuja hivi karibuni."
    },
    "pricing": {
      "title": "Bei: Free, Plus $45, Pro $99",
      "description": "Anza bure na Keplar One. Keplar Plus ni $45 kwa mwezi, Keplar Pro ni $99 kwa mwezi, na mipango ya Business inapatikana kupitia timu yetu ya mauzo. Matumizi unayoweza kuona, kamwe hayafichwi."
    },
    "showcase": {
      "title": "Maonyesho ya Create: jinsi programu iliyotengenezwa na Keplar inavyopaswa kuonekana",
      "description": "Tovuti na programu nane za onyesho zilizotengenezwa na timu ya Keplar kuonyesha upana ambao Create inalenga: menyu, daftari za hesabu, ubao, kalenda na kurasa za uhariri, kila moja na herufi na rangi zake. Si tovuti za wateja."
    },
    "roadmap": {
      "title": "Ramani ya kazi",
      "description": "Kile Keplar inachojenga sasa, kilicho kwenye beta na bado kinakamilishwa, na kilichotolewa hivi karibuni. Hakuna tarehe lengwa ambazo hatuwezi kuzitimiza."
    },
    "developers": {
      "title": "Keplar kwa wasanidi: API, Ask ya kupachika, Teams",
      "description": "Uliza Keplar kutoka kwenye msimbo wako kwa ufunguo wa API wa Bearer, au weka wijeti ya Ask kwenye tovuti yako kwa lebo moja ya script. Maelezo ya OpenAPI, utiririshaji, na mipaka ya kila mpango imeelezwa wazi."
    },
    "signin": {
      "title": "Ingia",
      "description": "Ingia kwenye Keplar."
    },
    "signup": {
      "title": "Fungua akaunti yako",
      "description": "Fungua akaunti ya Keplar bure."
    }
  },
  "status": {
    "live": "Inapatikana",
    "beta": "Beta",
    "soon": "Inakuja hivi karibuni"
  },
  "chapters": {
    "demoKicker": "Onyesho la moja kwa moja",
    "demoTitle": "Jaribu hapa. Bila akaunti.",
    "proof": "Imetengenezwa na {credit}. Tunajenga hadharani: <changelog>kumbukumbu ya mabadiliko</changelog>, <roadmap>ramani ya kazi</roadmap>, na <security>ukurasa wa usalama</security> unaoeleza kilichofanyika na ambacho bado.",
    "showcaseNote": "Maonyesho yametengenezwa na timu ya Keplar, si tovuti za wateja. <link>Tazama yote manane</link>",
    "closeTitle": "Uliza Keplar chochote.",
    "closeCta": "Uliza Keplar chochote",
    "closeSmall": "Bure, bila kadi. <link>Kila kitu ndani ya Keplar kwenye ukurasa mmoja</link>, pamoja na kinachopatikana, kilicho kwenye beta na kinachokuja hivi karibuni.",
    "voiceCaption": "Voice Live Create: ongea, na kihariri, terminal na hakikisho husonga pamoja. Ukinyamaza husubiri; ukisema \"aah, kumbe\" hurekebisha.",
    "voiceLabel": "Voice Live Create: kihariri, terminal na hakikisho la moja kwa moja kando kwa kando",
    "list": {
      "ask": {
        "label": "Uliza",
        "title": "Uliza Keplar chochote.",
        "lede": "Swali moja huenda kwa miundo kadhaa ya AI. Keplar huzilinganisha, huonyesha wapi zinatofautiana, hukagua kinachosimama imara na kuandika jibu moja."
      },
      "understand": {
        "label": "Elewa",
        "title": "Husoma unachokipa.",
        "lede": "Weka kile unachokiuliza. Keplar hukisoma kwa ajili ya swali hilo tu na haihifadhi faili."
      },
      "create": {
        "label": "Tengeneza",
        "title": "Kieleze, au kitamke. Pata kitu kisichoonekana kama kimetengenezwa na mashine.",
        "lede": "Create hupanga muundo kwa ajili ya biashara iliyo kwenye maelezo yako, huandika msimbo, hujaribu kila skrini, na hukataa mng'ao wa zambarau, madoa ya gradient na gridi za kadi tatu."
      },
      "together": {
        "label": "Jenga pamoja",
        "title": "Kijenge na mtu mwingine, na pamoja na mkosoaji.",
        "lede": "Fanyeni kazi kwenye mradi mmoja kwa wakati mmoja, na upate maoni ya pili yasiyo yako."
      },
      "ship": {
        "label": "Chapisha",
        "title": "Chapisha kwa hatua moja. Rudisha kwa hatua moja.",
        "lede": "Mradi wako huwekwa hewani kwenye anwani ya Keplar, na kwenye kikoa chako unapotaka."
      },
      "platform": {
        "label": "Jukwaa",
        "title": "Tumia Keplar kutoka popote.",
        "lede": "Injini ileile, nyuma ya API, kwenye kivinjari chako, ndani ya wijeti kwenye tovuti yako, na inayoshirikiwa na timu nzima."
      },
      "trust": {
        "label": "Uaminifu",
        "title": "Wazi kuhusu inachofanya, na kuhusu data yako.",
        "lede": "Tunacholinda, jinsi tunavyolinda, na ambacho bado hatujafanya, vyote vimeandikwa. Hakuna beji ambazo hatujazipata."
      }
    },
    "items": {
      "demo": {
        "name": "Onyesho la moja kwa moja",
        "line": "Uliza swali halisi kwenye ukurasa huu. Bila akaunti."
      },
      "multi-model": {
        "name": "Miundo kadhaa, jibu moja",
        "line": "Miundo inayohitajika na swali tu, ikilinganishwa dai kwa dai."
      },
      "disagreement": {
        "name": "Ramani ya tofauti",
        "line": "Wapi miundo inakubaliana, wapi inagawanyika, na kwa nini jibu lilielekea upande huo."
      },
      "debate": {
        "name": "Hali ya mjadala",
        "line": "Tazama miundo ikijadiliana kwa raundi kadhaa kabla Keplar haijajibu."
      },
      "voice": {
        "name": "Hali ya sauti",
        "line": "Uliza kwa sauti, sikiliza jibu likisomwa. Keplar kamwe hairekodi wala kuhifadhi sauti yako."
      },
      "live-research": {
        "name": "Utafiti wa Moja kwa Moja",
        "line": "Katika programu ya kompyuta, Keplar hutafuta kwenye wavuti na kusoma kurasa kwenye kompyuta yako, kisha hunukuu kila ukurasa na kukagua manukuu.",
        "note": "Programu ya kompyuta 0.2.0 au mpya zaidi."
      },
      "images": {
        "name": "Picha na picha za skrini",
        "line": "Chati, risiti, ubao mweupe, UI. Hutumwa tu kwa miundo inayoweza kuona."
      },
      "video": {
        "name": "Video",
        "line": "Fremu muhimu huchukuliwa ndani ya kivinjari chako; klipu yenyewe haipakiwi."
      },
      "docs": {
        "name": "Nyaraka, msimbo na data",
        "line": "PDF, maandishi, CSV, JSON na faili za msimbo chanzo, husomwa kama maandishi."
      },
      "office": {
        "name": "Word, PowerPoint, Excel na sauti",
        "line": "Faili za Office huchanganuliwa kwa usalama; sauti huandikwa kwa maandishi."
      },
      "links": {
        "name": "Viungo",
        "line": "Bandika URL na Keplar husoma ukurasa kupitia upakuaji unaolindwa."
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "Ongea na utazame kihariri, terminal na hakikisho vikijengwa kwa wakati mmoja. Sema \"aah, kumbe\" kubadili mwelekeo.",
        "note": "Inahitaji kivinjari chenye utambuzi wa sauti (Chrome, Edge, Safari)."
      },
      "showcase": {
        "name": "Maonyesho",
        "line": "Maonyesho manane ya timu ya Keplar yanayoweka kiwango ambacho Create hupimwa nacho."
      },
      "surprise": {
        "name": "Nishangaze",
        "line": "Bonyeza mara moja: maelezo, mtindo na kina mahususi, vimejengwa kwa ajili yako."
      },
      "versions": {
        "name": "Historia ya matoleo",
        "line": "Kila ujenzi ni toleo. Rejesha lolote, au ligawe kuwa rasimu mpya."
      },
      "community": {
        "name": "Matunzio ya jamii",
        "line": "Tovuti ambazo watu walichagua kushiriki. Penda, rekebisha, ripoti."
      },
      "anti-vibe": {
        "name": "Kanuni za muundo dhidi ya ukawaida",
        "line": "Kigezo kilichoandikwa na ukaguzi wa lint vinavyokataa mwonekano wa kawaida wa AI kabla hujauona."
      },
      "collab": {
        "name": "Ushirikiano wa wakati halisi",
        "line": "Alika kwa kiungo na mhariri mradi mmoja pamoja: vielekezi vya moja kwa moja, hali ya kufuata, terminal na hakikisho vya pamoja.",
        "note": "Fungua programu ndani ya Create, kisha Live. Watazamaji hutazama; wahariri huandika."
      },
      "critic": {
        "name": "Mkosoaji wa AI",
        "line": "Kanuni, axe-core kwenye kivinjari halisi na muundo tofauti hukagua ujenzi wako, kisha hutumia marekebisho unayochagua."
      },
      "publish": {
        "name": "Chapisha kwa mbofyo mmoja",
        "line": "Chapisha rasimu kwenye anwani hai kutoka Create."
      },
      "previews": {
        "name": "Hakikisho",
        "line": "Kila rasimu ina kiungo cha hakikisho cha faragha kabla haijawekwa hewani."
      },
      "rollback": {
        "name": "Kurudisha nyuma",
        "line": "Rejesha toleo lililotangulia ikiwa mabadiliko yameharibika."
      },
      "domains": {
        "name": "Vikoa maalum",
        "line": "Unganisha kikoa unachomiliki; Keplar hukagua DNS na kukueleza cha kubadilisha."
      },
      "ssl": {
        "name": "HTTPS ya kiotomatiki",
        "line": "Vyeti hutolewa na kusasishwa kwa vikoa vilivyounganishwa."
      },
      "api": {
        "name": "API ya umma",
        "line": "Funguo za Bearer, mipaka ya kila mpango, maelezo ya OpenAPI. Funguo za bure hutumia miundo ya bure tu."
      },
      "embed": {
        "name": "Wijeti ya kupachika",
        "line": "Lebo moja ya script huweka Keplar Ask kwenye tovuti yako, ikiwa na mipaka ya vyanzo unavyoruhusu."
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "Nafasi za kazi za pamoja zenye majukumu ya mmiliki, msimamizi, mhariri na mtazamaji.",
        "note": "Mpango wa Business."
      },
      "referrals": {
        "name": "Mpango wa rufaa",
        "line": "Alika rafiki; nyote wawili mnapata matumizi ya ziada, kamwe si pesa taslimu."
      },
      "roblox-studio": {
        "name": "Hali ya Roblox Studio",
        "line": "Mjenzi mwenzi ndani ya Roblox Studio: ramani, UI, madoido ya flipbook na skripti za Luau, kwa Claude Opus 5.5.",
        "note": "Programu ya kompyuta, Lite na zaidi."
      },
      "roblox-cloud": {
        "name": "Roblox Cloud",
        "line": "Kazi za usiku kwenye skripti za mchezo wako, kila badiliko hukaguliwa na kichanganuzi cha Luau, na huwekwa kwenye Studio ukisema.",
        "note": "Skripti tu; haiwezi kujaribu mchezo."
      },
      "blender": {
        "name": "Hali ya Blender",
        "line": "Unda modeli, weka maumbile kwa seti za PBR za Poly Haven, mwanga na kuhamisha katika Blender 4.2 au mpya zaidi.",
        "note": "Programu ya kompyuta 0.1.8 au mpya zaidi."
      },
      "blender-cloud": {
        "name": "Uchakataji wa Blender Cloud",
        "line": "Chakata picha za tukio kwenye seva za Keplar kompyuta yako ikiwa imezimwa, kisha pakua fremu na video ya MP4.",
        "note": "Programu ya kompyuta 0.1.10 au mpya zaidi."
      },
      "extension": {
        "name": "Kiendelezi cha kivinjari Keplar One",
        "line": "Uliza kuhusu maandishi uliyochagua au ukurasa kutoka Chrome au Edge, kwa ufunguo wako wa API.",
        "note": "Kimewasilishwa kwa Chrome Web Store."
      },
      "lens": {
        "name": "Search with Keplar One",
        "line": "Buruta juu ya maandishi au picha yoyote kwenye ukurasa; jibu hufunguka kwenye paneli ya pembeni.",
        "note": "Sehemu ya kiendelezi cha kivinjari."
      },
      "security": {
        "name": "Usalama",
        "line": "Usimbaji fiche, watoa huduma, muda wa kuhifadhi, ulinzi wa akaunti na jinsi ya kuripoti tatizo."
      },
      "changelog": {
        "name": "Kumbukumbu ya mabadiliko",
        "line": "Nini kilitolewa, na lini."
      },
      "roadmap": {
        "name": "Ramani ya kazi",
        "line": "Tunachojenga baadaye, na kisichopatikana bado."
      }
    }
  },
  "featuresPage": {
    "kicker": "Kila kitu ndani ya Keplar",
    "crumb": "Vipengele",
    "title": "Kila kipengele, na kama unaweza kukitumia leo.",
    "lead": "<b>{live}</b> vinapatikana, <b>{beta}</b> viko kwenye beta, <b>{soon}</b> vinakuja hivi karibuni. Beta hufanya kazi lakini vinaweza kubadilika au kuwekewa mipaka kwa baadhi ya mipango. Vinavyokuja hivi karibuni bado haviwezi kutumika na haviunganishwi kana kwamba vinapatikana.",
    "sections": "Sehemu",
    "thFeature": "Kipengele",
    "thWhat": "Kinachofanya",
    "thStatus": "Hali",
    "foot": "Kilichobadilika hivi karibuni: <changelog>kumbukumbu ya mabadiliko</changelog>. Kinachofuata: <roadmap>ramani ya kazi</roadmap>. Uko tayari kujaribu: <demo>uliza swali kwenye ukurasa wa mwanzo</demo>, bila akaunti."
  },
  "pricing": {
    "label": "Bei",
    "title": "Anza bure. Pandisha daraja unapohitaji zaidi.",
    "lede": "Anza bure kwa maswali ya kila siku. Pandisha daraja kwa miundo ya hali ya juu, Deep Research, na kutengeneza tovuti, picha na video. Unaendesha biashara? Business imeundwa kulingana nayo. Matumizi ya Keplar hupimwa kwa krediti, si tokeni ghafi.",
    "tailored": "Imeundwa kwa ajili ya biashara yako",
    "custom": "Maalum",
    "cadence": {
      "forever": "milele",
      "per month": "kwa mwezi",
      "custom": "maalum"
    },
    "perMonth": "{price}/mwezi",
    "fine": "Ghairi wakati wowote kutoka kwenye akaunti yako. Malipo hushughulikiwa na Whop. Krediti husasishwa kila mwezi na hutumika kulingana na kazi ambayo swali linahitaji kutoka kwa miundo: maswali rahisi hugharimu kidogo sana.",
    "tiers": {
      "free": {
        "summary": "Maswali ya kila siku na Keplar-One, kwenye miundo huria ya bure.",
        "features": [
          "Uratibu wa Keplar-One",
          "Miundo huria ya bure tu",
          "Inaweza kuwa polepole miundo ya bure ikiwa na watumiaji wengi",
          "Wapangishaji wa miundo ya bure wanaweza kurekodi maagizo",
          "Makubaliano yenye mipaka",
          "Hakuna utafutaji wa wavuti",
          "Hadi maswali 50 kwa siku (matumizi ya haki)",
          "Maswali ya picha na video kwenye miundo ya bure ya kuona",
          "Hali ya kusoma: pakia PDF ya maandishi upate kadi za kukumbuka, majaribio na mpango (miundo ya bure, mipaka midogo)",
          "Mazungumzo yaliyohifadhiwa na kumbukumbu ya hiari ukiwa umeingia"
        ],
        "cta": "Jaribu Keplar"
      },
      "lite": {
        "summary": "Hatua inayofuata baada ya Free: miundo ya hali ya juu kwa maswali ya kila siku, kwa bei nafuu zaidi.",
        "features": [
          "Miundo ya hali ya juu na makubaliano ya Keplar-One",
          "Krediti 2,400 kwa mwezi zenye kikomo cha saa 5 na cha kila wiki",
          "Msaada wa kuandika msimbo na uchambuzi wa faili",
          "Hali ya kusoma kwenye miundo yenye nguvu zaidi",
          "Tengeneza tovuti ndogo binafsi (anwani ya bure ya keplar.site)",
          "Kutengeneza picha, Slides, Deep Research, video, mawakala na vikoa maalum huanzia Plus"
        ],
        "cta": "Pandisha hadi Lite"
      },
      "plus": {
        "summary": "Kwa matumizi ya kila siku: shule, kazi, maswali ya afya na maamuzi makubwa.",
        "features": [
          "Miundo ya hali ya juu na Keplar-One ya hali ya juu",
          "Kiwango kikubwa zaidi cha makubaliano",
          "Deep Research kwa maamuzi makubwa",
          "Msaada wa kuandika msimbo na uchambuzi wa faili",
          "Utafutaji wa wavuti umezimwa kwa chaguo-msingi (bado haupatikani)",
          "Tengeneza tovuti na programu binafsi",
          "Kitengeneza slaidi chenye uhamishaji wa PowerPoint na PDF (mawazo ya picha ni vishika nafasi)",
          "Hali ya kusoma kwenye miundo yenye nguvu zaidi na mipaka mikubwa zaidi",
          "Kutengeneza picha",
          "Muktadha mkubwa zaidi na kipaumbele cha matumizi"
        ],
        "cta": "Pandisha hadi Plus"
      },
      "pro": {
        "summary": "Kwa watumiaji wakubwa na wabunifu: matumizi, ubunifu na mawakala mengi zaidi.",
        "features": [
          "Kila kitu kilicho kwenye Plus",
          "Zaidi ya mara mbili ya krediti za kila mwezi",
          "Kutengeneza video",
          "Kitengeneza slaidi na hali ya kusoma zenye mipaka mikubwa zaidi",
          "Ubunifu wa hali ya juu",
          "Mawakala wa hali ya juu",
          "Muktadha mkubwa zaidi",
          "Kipaumbele na uwezo wa kufanya kazi sambamba wa juu zaidi"
        ],
        "cta": "Pandisha hadi Pro"
      }
    },
    "fitTitle": "Mpango upi unakufaa?",
    "fits": {
      "free": {
        "who": "Unataka kuona jinsi inavyofanya kazi.",
        "outcome": "Uliza maswali ya kila siku kwenye miundo ya bure, hadi 50 kwa siku. Bila kadi.",
        "cta": "Uliza Keplar chochote"
      },
      "plus": {
        "who": "Unatumia AI kila siku kwa shule, kazi au maamuzi makubwa.",
        "outcome": "Miundo ya hali ya juu, Deep Research, Slides, kutengeneza picha na kikoa maalum kwa unachojenga.",
        "cta": "Pandisha hadi Plus"
      },
      "pro": {
        "who": "Unajenga na kubuni mengi.",
        "outcome": "Zaidi ya mara mbili ya krediti za Plus, video, miradi na mawakala zaidi, na kipaumbele cha juu.",
        "cta": "Pandisha hadi Pro"
      }
    },
    "compareTitle": "Linganisha mipango yote",
    "compareLede": "Jedwali kamili la kipengele kwa kipengele, pamoja na kila kikomo ambacho bidhaa inatekeleza leo, liko kwenye ukurasa wa bei wa Kiingereza.",
    "compareLink": "Tazama ulinganisho kamili (kwa Kiingereza)",
    "closingTitle": "Bado huna uhakika? Anza bure.",
    "closingLede": "Uliza swali halisi na uone wapi miundo inakubaliana na wapi inagawanyika. Bila kadi, na unaweza kupandisha daraja ukiwa ndani ya programu unapohitaji zaidi.",
    "closingAsk": "Uliza Keplar chochote",
    "closingCompare": "Keplar ikilinganishwa"
  },
  "roadmap": {
    "kicker": "Ramani ya kazi",
    "title": "Tunachojenga, na kisichokamilika bado.",
    "lead": "Hakuna tarehe lengwa: vitu hutolewa vinapofanya kazi. Kila kitu hapa chini kinajengwa sasa au tayari kinatumika kwenye beta chenye mapungufu yanayojulikana. Kwa vilivyotolewa, tazama <changelog>kumbukumbu ya mabadiliko</changelog>; kwa orodha kamili yenye hali, tazama <features>kila kitu ndani ya Keplar</features>.",
    "nowNum": "Sasa",
    "nowTitle": "Kinajengwa",
    "nowLede": "Bado hakitumiki. Kimeonyeshwa kama Inakuja hivi karibuni kote kwenye tovuti.",
    "nextNum": "Kinachofuata",
    "nextTitle": "Kukamilisha vipengele vya beta",
    "nextLede": "Hivi vinafanya kazi leo. Hiki ndicho bado kinakosekana.",
    "doneNum": "Vilivyotolewa",
    "doneTitle": "Hivi karibuni",
    "doneLede": "Matoleo machache ya mwisho. Tarehe zinatoka kwenye historia ya commit.",
    "englishNote": "Maelezo ya matoleo ni kwa Kiingereza.",
    "finishing": [
      {
        "feature": "API ya umma",
        "items": [
          "Funguo za ngazi ya timu",
          "Vikomo vya krediti kwa kila ufunguo",
          "SDK rasmi",
          "Webhook"
        ]
      },
      {
        "feature": "Wijeti ya kupachika",
        "items": [
          "Tokeni za mchapishaji zilizosainiwa",
          "Mitindo maalum"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "Vikomo kwa kila mwanachama na mchanganuo wa matumizi",
          "Uhamishaji wa umiliki",
          "Kuingia mara moja (SSO)"
        ]
      },
      {
        "feature": "Sauti",
        "items": [
          "Mbadala kwa vivinjari visivyo na utambuzi wa sauti (Firefox)",
          "Kichagua lugha"
        ]
      },
      {
        "feature": "Ukaguzi wa vyanzo",
        "items": [
          "Kuwasha ukaguzi wa vyanzo vya wavuti kwa mipango ya kulipia baada ya jaribio la moja kwa moja"
        ]
      }
    ],
    "foot": "Kuna unachohitaji ambacho hakipo? <feedback>Tuambie</feedback>. Masuala ya usalama yatumwe kwa anwani iliyo kwenye <security>ukurasa wa usalama</security>."
  },
  "showcase": {
    "kicker": "Maonyesho",
    "title": "Hakuna mng'ao wa zambarau. Hakuna gridi ya kadi tatu. Imejengwa kwa ajili ya biashara iliyo kwenye maelezo.",
    "lead": "Create hupanga muundo kwa kile unachoeleza, kisha hukataa mitindo inayofanya tovuti zilizojengwa na AI zifanane. Maonyesho haya yanaonyesha upana tunaoudai: orodha ya mvinyo iliyopangwa kama kadi iliyochapishwa, daftari la mchomaji kahawa, ubao wa kupanga usafirishaji wa vifurushi.",
    "disclosure": "Maonyesho yaliyotengenezwa na timu ya Keplar kuonyesha kile Create inalenga. Si tovuti za wateja. Majina, bei na tarehe zilizomo ni maudhui ya mfano.",
    "sites": "tovuti",
    "apps": "programu",
    "styles": "mitindo ya kuona",
    "industries": "sekta",
    "contentNote": "Vichwa na maelezo ya maonyesho ni kwa Kiingereza.",
    "galleryKicker": "Imetengenezwa na watu wanaotumia Keplar",
    "gallery": "Matunzio ya jamii",
    "yourTurn": "Zamu yako",
    "openCreate": "Fungua Create"
  },
  "developers": {
    "kicker": "Wasanidi",
    "title": "Jenga na Keplar.",
    "lede": "Ombi moja hutuma swali kwa miundo kadhaa, huzilinganisha, na kurudisha jibu moja pamoja na rekodi wazi ya wapi zilitofautiana. Iite kutoka kwenye seva yako kwa ufunguo wa API, au weka Ask ileile kwenye tovuti yako kwa lebo moja ya script.",
    "getKey": "Pata ufunguo wa API",
    "widget": "Tengeneza wijeti",
    "spec": "Maelezo ya OpenAPI",
    "endpoint": "Endpoint kuu",
    "products": [
      {
        "name": "API ya umma",
        "text": "Funguo za Bearer, majibu ya JSON au ya kutiririka, makubaliano na tofauti katika kila jibu."
      },
      {
        "name": "Ask ya kupachika",
        "text": "Kisanduku cha Ask chenye mandhari kwa ajili ya nyaraka au bidhaa yako. Kina orodha ya vyanzo vinavyoruhusiwa na vikomo vya kasi."
      },
      {
        "name": "Keplar for Teams",
        "text": "Nafasi za kazi za pamoja zenye majukumu ya msimamizi, mhariri na mtazamaji, mialiko kwa barua pepe au kiungo."
      },
      {
        "name": "Rufaa",
        "text": "Shiriki kiungo chako. Wewe na rafiki kila mmoja anapata krediti {n} za matumizi anapojiunga."
      }
    ],
    "platform": "Jukwaa",
    "refTitle": "Marejeleo kamili",
    "refLede": "Viwango na mipaka, mwanzo wa haraka, muundo wa ombi na jibu, utiririshaji, wijeti, majukumu ya Teams, hitilafu na maelezo ya usalama viko kwenye ukurasa wa wasanidi wa Kiingereza. Msimbo, majina ya sehemu na misimbo ya hitilafu ni sawa katika kila lugha.",
    "sections": [
      "Viwango na mipaka",
      "Mwanzo wa haraka",
      "POST /api/v1/ask",
      "Utiririshaji",
      "Wijeti ya Ask ya kupachika",
      "Keplar for Teams",
      "Hitilafu",
      "Usalama na faragha",
      "Bado haipatikani"
    ],
    "refLink": "Fungua marejeleo kamili (kwa Kiingereza)"
  },
  "auth": {
    "signinTitle": "Ingia kwenye Keplar",
    "signinLead": "Endelea na mazungumzo, miradi na mpango wako.",
    "addTitle": "Ongeza akaunti",
    "addLead": "Ingia kwa akaunti nyingine. Akaunti unayotumia itabaki imeingia kwenye kifaa hiki.",
    "checkoutLead": "Ingia ili kuendelea na malipo. Utaenda moja kwa moja kwenye malipo baadaye.",
    "expired": "{email} imetolewa. Ingia tena ili kuitumia.",
    "signupTitle": "Fungua akaunti yako ya Keplar",
    "signupLead": "Kwa kazi za nyumbani na maamuzi makubwa, mipango ya safari na miradi ya pembeni, au kuendesha biashara. Free inafanya kazi kwenye miundo huria ya bure, na unaweza kupandisha daraja wakati wowote.",
    "invited": "Rafiki amekualika: barua pepe yako ikithibitishwa, nyote wawili mtapata krediti za ziada za matumizi (kamwe si pesa taslimu). Maelezo yako kwenye masharti ya rufaa.",
    "signUp": "Jisajili",
    "logIn": "Ingia",
    "toggle": "Jisajili au ingia",
    "about": "Kuhusu Keplar",
    "panel": {
      "signin": {
        "eyebrow": "Karibu tena",
        "title": "Endelea ulipoachia.",
        "lead": "Mazungumzo, miradi na mpango wako vinakusubiri, kwenye kila kifaa unachoingia."
      },
      "signup": {
        "eyebrow": "Akaunti ya bure",
        "title": "Acha kuamini AI moja tu.",
        "lead": "Free inafanya kazi kwenye miundo huria ya bure, na unaweza kupandisha daraja wakati wowote."
      }
    },
    "points": [
      "Huuliza miundo ambayo swali lako linahitaji",
      "Hukuonyesha wapi zinatofautiana",
      "Jibu moja, pamoja na tofauti zilizoonyeshwa"
    ]
  }
};

export default m;
