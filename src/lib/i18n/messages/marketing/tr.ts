// tr marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — Tek soru. Birden çok zekâ. Tek yanıt.",
      "description": "Keplar sorunuzu birden çok yapay zekâ modeline gönderir, nerede ayrıştıklarını bulur, doğrular ve size sentezlenmiş tek bir yanıt verir. Ücretsiz deneyin, kayıt gerekmez."
    },
    "features": {
      "title": "Keplar’daki her şey",
      "description": "Keplar’ın tüm özellikleri tek sayfada, amacına göre gruplanmış: soru sormak, dosya okumak, site ve uygulama oluşturmak, birlikte geliştirmek, yayınlamak, API ve widget, ve güven. Her birinin kullanımda mı, betada mı yoksa yakında mı olduğu yazıyor."
    },
    "pricing": {
      "title": "Fiyatlandırma: Free, Plus $45, Pro $99",
      "description": "Keplar One ile ücretsiz başlayın. Keplar Plus aylık $45, Keplar Pro aylık $99; Business planları satış ekibimiz aracılığıyla sunulur. Kullanımınızı görürsünüz, hiçbir şey gizli değildir."
    },
    "showcase": {
      "title": "Create vitrini: Keplar ile yapılan bir uygulama nasıl görünmeli",
      "description": "Keplar ekibinin Create’in hedeflediği yelpazeyi göstermek için yaptığı sekiz demo site ve uygulama: menüler, defterler, panolar, takvimler ve editoryal sayfalar; her biri kendi yazı tipi ve renk paletiyle. Müşteri siteleri değildir."
    },
    "roadmap": {
      "title": "Yol haritası",
      "description": "Keplar’ın şu anda neyi geliştirdiği, neyin betada olup hâlâ tamamlandığı ve son zamanlarda neyin yayınlandığı. Tutamayacağımız tarihler yok."
    },
    "developers": {
      "title": "Geliştiriciler için Keplar: API, yerleştirilebilir Ask, Teams",
      "description": "Keplar’a kendi kodunuzdan Bearer API anahtarıyla sorun ya da Ask widget’ını tek bir script etiketiyle sitenize ekleyin. OpenAPI şartnamesi, akış ve plan başına sınırlar açıkça belirtilmiş."
    },
    "signin": {
      "title": "Giriş yap",
      "description": "Keplar’a giriş yapın."
    },
    "signup": {
      "title": "Hesabınızı oluşturun",
      "description": "Ücretsiz bir Keplar hesabı oluşturun."
    }
  },
  "status": {
    "live": "Kullanımda",
    "beta": "Beta",
    "soon": "Yakında"
  },
  "chapters": {
    "demoKicker": "Canlı demo",
    "demoTitle": "Burada deneyin. Hesap gerekmez.",
    "proof": "Geliştiren: {credit}. Herkesin gözü önünde geliştiriyoruz: <changelog>değişiklik günlüğü</changelog>, <roadmap>yol haritası</roadmap> ve neyin bitip neyin bitmediğini söyleyen bir <security>güvenlik sayfası</security>.",
    "showcaseNote": "Vitrin demolarını Keplar ekibi yaptı; müşteri siteleri değildir. <link>Sekizini de görün</link>",
    "closeTitle": "Keplar’a dilediğinizi sorun.",
    "closeCta": "Keplar’a dilediğinizi sorun",
    "closeSmall": "Ücretsiz, kart gerekmez. <link>Keplar’daki her şey tek sayfada</link>; nelerin kullanımda, betada ve yakında olduğuyla birlikte.",
    "voiceCaption": "Voice Live Create: konuşun; düzenleyici, terminal ve önizleme birlikte ilerler. Duraklayın, bekler; “aslında” deyin, düzeltir.",
    "voiceLabel": "Voice Live Create: düzenleyici, terminal ve canlı önizleme yan yana",
    "list": {
      "ask": {
        "label": "Sor",
        "title": "Keplar’a dilediğinizi sorun.",
        "lede": "Tek bir soru birkaç yapay zekâ modeline gider. Keplar onları karşılaştırır, nerede ayrıştıklarını gösterir, neyin sağlam olduğunu kontrol eder ve tek bir yanıt yazar."
      },
      "understand": {
        "label": "Anla",
        "title": "Ona verdiğinizi okur.",
        "lede": "Sorduğunuz şeyi buraya bırakın. Keplar onu yalnızca o soru için okur ve dosyayı saklamaz."
      },
      "create": {
        "label": "Create",
        "title": "Anlatın ya da söyleyin. Üretilmiş gibi görünmeyen bir şey alın.",
        "lede": "Create, brifinginizdeki işletme için bir tasarım planlar, kodu yazar, her ekranı test eder; mor parıltıyı, gradyan lekeleri ve üç kartlı ızgaraları reddeder."
      },
      "together": {
        "label": "Birlikte geliştir",
        "title": "Biriyle, bir de eleştirmenle birlikte geliştirin.",
        "lede": "Aynı projede aynı anda çalışın ve sizden olmayan ikinci bir görüş alın."
      },
      "ship": {
        "label": "Yayınla",
        "title": "Tek adımda yayınlayın. Tek adımda geri alın.",
        "lede": "Projeniz bir Keplar adresinde yayına girer; istediğinizde kendi alan adınızla."
      },
      "platform": {
        "label": "Platform",
        "title": "Keplar’ı her yerden kullanın.",
        "lede": "Aynı motor; bir API’nin arkasında, tarayıcınızda, sitenizdeki bir widget’ın içinde ve bir ekiple paylaşılarak."
      },
      "trust": {
        "label": "Güven",
        "title": "Ne yaptığı ve verileriniz konusunda açık.",
        "lede": "Neyi, nasıl koruduğumuz ve henüz neyi yapmadığımız yazılı olarak. Hak etmediğimiz rozetler yok."
      }
    },
    "items": {
      "demo": {
        "name": "Canlı demo",
        "line": "Bu sayfada gerçek bir soru sorun. Hesap gerekmez."
      },
      "multi-model": {
        "name": "Birden çok model, tek yanıt",
        "line": "Yalnızca sorunun ihtiyaç duyduğu modeller, iddia iddia karşılaştırılır."
      },
      "disagreement": {
        "name": "Görüş ayrılığı haritası",
        "line": "Modellerin nerede uzlaştığı, nerede ayrıştığı ve yanıtın neden o yöne gittiği."
      },
      "debate": {
        "name": "Tartışma modu",
        "line": "Keplar yanıt vermeden önce modellerin turlar hâlinde tartışmasını izleyin."
      },
      "voice": {
        "name": "Sesli mod",
        "line": "Sesli sorun, yanıtı dinleyin. Keplar sesinizi asla kaydetmez veya saklamaz."
      },
      "live-research": {
        "name": "Canlı Araştırma",
        "line": "Masaüstü uygulamasında Keplar web’de arar ve sayfaları bilgisayarınızda okur, ardından her birini kaynak gösterir ve alıntıları denetler.",
        "note": "Masaüstü uygulaması 0.2.0 veya üzeri."
      },
      "images": {
        "name": "Görseller ve ekran görüntüleri",
        "line": "Grafikler, fişler, beyaz tahtalar, arayüzler. Yalnızca görebilen modellere gönderilir."
      },
      "video": {
        "name": "Video",
        "line": "Ana kareler tarayıcınızda alınır; videonun kendisi yüklenmez."
      },
      "docs": {
        "name": "Belgeler, kod ve veriler",
        "line": "PDF, metin, CSV, JSON ve kaynak dosyaları metin olarak okunur."
      },
      "office": {
        "name": "Word, PowerPoint, Excel ve ses",
        "line": "Office dosyaları güvenle ayrıştırılır; ses yazıya dökülür."
      },
      "links": {
        "name": "Bağlantılar",
        "line": "Bir URL yapıştırın; Keplar sayfayı korumalı bir getirme ile okur."
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "Konuşun ve düzenleyicinin, terminalin ve önizlemenin aynı anda oluşmasını izleyin. Yön değiştirmek için “aslında” deyin.",
        "note": "Konuşma tanıma özelliği olan bir tarayıcı gerekir (Chrome, Edge, Safari)."
      },
      "showcase": {
        "name": "Vitrin",
        "line": "Keplar ekibinin, Create’ten beklenen çıtayı belirleyen sekiz demosu."
      },
      "surprise": {
        "name": "Beni şaşırt",
        "line": "Tek dokunuş: sizin için hazırlanmış belirli bir brif, stil ve ayrıntı düzeyi."
      },
      "versions": {
        "name": "Sürüm geçmişi",
        "line": "Her derleme bir sürümdür. Herhangi birini geri yükleyin ya da yeni bir taslağa dönüştürün."
      },
      "community": {
        "name": "Topluluk galerisi",
        "line": "İnsanların paylaşmayı seçtiği siteler. Beğenin, remiksleyin, bildirin."
      },
      "anti-vibe": {
        "name": "Sıradan tasarım karşıtı kurallar",
        "line": "Siz görmeden önce alışılmış yapay zekâ görünümünü eleyen yazılı bir ölçüt ve otomatik bir kontrol."
      },
      "collab": {
        "name": "Gerçek zamanlı iş birliği",
        "line": "Bağlantıyla davet edin ve aynı projeyi birlikte düzenleyin: canlı imleçler, takip modu, ortak terminal ve önizleme.",
        "note": "Create’te bir uygulama açın, ardından Live’a geçin. İzleyenler izler; düzenleyenler yazar."
      },
      "critic": {
        "name": "Yapay zekâ eleştirmeni",
        "line": "Kurallar, gerçek bir tarayıcıda axe-core ve ayrı bir model projenizi inceler, sonra seçtiğiniz düzeltmeleri uygular."
      },
      "publish": {
        "name": "Tek tıkla yayınlama",
        "line": "Bir taslağı Create’ten canlı bir adrese yayınlayın."
      },
      "previews": {
        "name": "Önizlemeler",
        "line": "Her taslağın yayına girmeden önce özel bir önizleme bağlantısı vardır."
      },
      "rollback": {
        "name": "Geri alma",
        "line": "Bir değişiklik ters giderse önceki sürümü geri yükleyin."
      },
      "domains": {
        "name": "Özel alan adları",
        "line": "Size ait bir alan adını bağlayın; Keplar DNS’i kontrol eder ve neyi değiştirmeniz gerektiğini söyler."
      },
      "ssl": {
        "name": "Otomatik HTTPS",
        "line": "Bağlı alan adları için sertifikalar düzenlenir ve yenilenir."
      },
      "api": {
        "name": "Herkese açık API",
        "line": "Bearer anahtarları, plan başına sınırlar, OpenAPI şartnamesi. Ücretsiz anahtarlar yalnızca ücretsiz modelleri kullanır."
      },
      "embed": {
        "name": "Yerleştirilebilir widget",
        "line": "Tek bir script etiketi Keplar Ask’i sitenize ekler; izin verdiğiniz kaynaklarla sınırlıdır."
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "Sahip, yönetici, düzenleyici ve görüntüleyici rolleriyle ortak çalışma alanları.",
        "note": "Business planı."
      },
      "referrals": {
        "name": "Davet programı",
        "line": "Bir arkadaşınızı davet edin; ikiniz de ek kullanım kazanırsınız, asla para değil."
      },
      "extension": {
        "name": "Keplar One tarayıcı uzantısı",
        "line": "Chrome veya Edge’de seçili metin ya da bir sayfa hakkında API anahtarınızla soru sorun.",
        "note": "Chrome Web Store’a gönderildi."
      },
      "lens": {
        "name": "Search with Keplar One",
        "line": "Sayfadaki herhangi bir metnin veya resmin üzerinden sürükleyin; yanıt yan panelde açılır.",
        "note": "Tarayıcı uzantısının bir parçası."
      },
      "security": {
        "name": "Güvenlik",
        "line": "Şifreleme, sağlayıcılar, saklama süreleri, hesap koruması ve sorun bildirme."
      },
      "changelog": {
        "name": "Değişiklik günlüğü",
        "line": "Ne zaman ne yayınlandı."
      },
      "roadmap": {
        "name": "Yol haritası",
        "line": "Sırada neyi geliştireceğimiz ve neyin henüz kullanıma açık olmadığı."
      }
    }
  },
  "featuresPage": {
    "kicker": "Keplar’daki her şey",
    "crumb": "Özellikler",
    "title": "Her özellik ve bugün kullanıp kullanamayacağınız.",
    "lead": "<b>{live}</b> kullanımda, <b>{beta}</b> betada, <b>{soon}</b> yakında. Beta özellikler çalışır ama değişebilir veya bazı planlarla sınırlı olabilir. Yakında olanlar henüz kullanılamaz ve kullanılabilirmiş gibi bağlantı verilmez.",
    "sections": "Bölümler",
    "thFeature": "Özellik",
    "thWhat": "Ne yapar",
    "thStatus": "Durum",
    "foot": "Son zamanlarda ne değişti: <changelog>değişiklik günlüğü</changelog>. Sırada ne var: <roadmap>yol haritası</roadmap>. Denemeye hazır mısınız? <demo>Ana sayfada bir soru sorun</demo>, hesap gerekmez."
  },
  "pricing": {
    "label": "Fiyatlandırma",
    "title": "Ücretsiz başlayın. Daha fazlasına ihtiyacınız olduğunda yükseltin.",
    "lede": "Gündelik sorular için ücretsiz başlayın. Premium modeller, Deep Research ve site, görsel ve video oluşturma için planınızı yükseltin. Bir işletmeniz mi var? Business ona göre uyarlanır. Keplar kullanımı ham token ile değil, kredi ile ölçülür.",
    "tailored": "İşletmenize göre uyarlanır",
    "custom": "Özel",
    "cadence": {
      "forever": "süresiz",
      "per month": "aylık",
      "custom": "özel"
    },
    "perMonth": "{price}/ay",
    "fine": "Hesabınızdan istediğiniz zaman iptal edin. Ödeme Whop üzerinden yapılır. Krediler her ay yenilenir ve bir sorunun gerektirdiği model işine göre kullanılır: basit sorular çok az tutar.",
    "tiers": {
      "free": {
        "summary": "Ücretsiz açık modellerde Keplar-One ile gündelik sorular.",
        "features": [
          "Keplar-One orkestrasyonu",
          "Yalnızca ücretsiz açık modeller",
          "Ücretsiz modeller yoğunken daha yavaş olabilir",
          "Ücretsiz model sağlayıcıları istemleri kaydedebilir",
          "Sınırlı uzlaşı",
          "Web araması yalnızca masaüstü uygulamasında (Live Research, beta)",
          "Günde 50 soruya kadar (adil kullanım)",
          "Ücretsiz görme modelleriyle görsel ve video soruları",
          "Çalışma modu: bilgi kartları, testler ve plan için metin tabanlı bir PDF yükleyin (ücretsiz modeller, daha düşük sınırlar)",
          "Giriş yaptığınızda kayıtlı sohbetler ve isteğe bağlı hafıza"
        ],
        "cta": "Keplar’ı deneyin"
      },
      "lite": {
        "summary": "Free’nin bir üstü: gündelik sorular için premium modeller, daha uygun fiyata.",
        "features": [
          "Premium modeller ve Keplar-One uzlaşısı",
          "5 saatlik ve haftalık sınırla ayda 2.400 kredi",
          "Kodlama yardımı ve dosya analizi",
          "Daha güçlü modellerde Çalışma modu",
          "Küçük bir kişisel site oluşturun (ücretsiz keplar.site adresi)",
          "Görsel üretimi, Slides, Deep Research, video, ajanlar ve özel alan adları Plus’tan itibaren"
        ],
        "cta": "Lite’a yükselt"
      },
      "plus": {
        "summary": "Günlük kullanım için: okul, iş, sağlık soruları ve büyük kararlar.",
        "features": [
          "Premium modeller ve gelişmiş Keplar-One",
          "Daha geniş uzlaşı kotası",
          "Büyük kararlar için Deep Research",
          "Kodlama yardımı ve dosya analizi",
          "Web araması yalnızca masaüstü uygulamasında (Live Research, beta)",
          "Kişisel siteler ve uygulamalar oluşturun",
          "PowerPoint ve PDF dışa aktarımlı sunum oluşturucu (görsel fikirleri yer tutucudur)",
          "Daha güçlü modellerde ve daha yüksek sınırlarla Çalışma modu",
          "Görsel üretimi",
          "Daha geniş bağlam ve öncelikli kullanım"
        ],
        "cta": "Plus’a yükselt"
      },
      "pro": {
        "summary": "Yoğun kullanıcılar ve üreticiler için: çok daha fazla kullanım, üretim ve ajan.",
        "features": [
          "Plus’taki her şey",
          "İki katından fazla aylık kredi",
          "Video üretimi",
          "En yüksek sınırlarla sunum oluşturucu ve Çalışma modu",
          "Gelişmiş üretim",
          "Gelişmiş ajanlar",
          "Daha geniş bağlam",
          "Daha yüksek öncelik ve eşzamanlılık"
        ],
        "cta": "Pro’ya yükselt"
      }
    },
    "seeAll": "{plan} içindeki her şeyi gör",
    "showLess": "Daha az göster",
    "fitTitle": "Hangi plan size uygun?",
    "fits": {
      "free": {
        "who": "Nasıl çalıştığını görmek istiyorsunuz.",
        "outcome": "Ücretsiz modellerde gündelik sorular sorun, günde 50’ye kadar. Kart gerekmez.",
        "cta": "Keplar’a dilediğinizi sorun"
      },
      "plus": {
        "who": "Yapay zekâyı her gün okul, iş veya büyük kararlar için kullanıyorsunuz.",
        "outcome": "Premium modeller, Deep Research, Slides, görsel üretimi ve geliştirdikleriniz için özel alan adı.",
        "cta": "Plus’a yükselt"
      },
      "pro": {
        "who": "Çok şey geliştirip üretiyorsunuz.",
        "outcome": "Plus’ın iki katından fazla kredi, video, daha fazla proje ve ajan, daha yüksek öncelik.",
        "cta": "Pro’ya yükselt"
      }
    },
    "compareTitle": "Tüm planları karşılaştırın",
    "compareLede": "Ürünün bugün uyguladığı her sınırla birlikte özellik özellik tam tablo, İngilizce fiyatlandırma sayfasında.",
    "compareLink": "Tam karşılaştırmayı görün (İngilizce)",
    "closingTitle": "Henüz emin değil misiniz? Ücretsiz başlayın.",
    "closingLede": "Gerçek bir soru sorun ve modellerin nerede uzlaşıp nerede ayrıştığını görün. Kart gerekmez; daha fazlasını istediğinizde uygulamanın içinden yükseltebilirsiniz.",
    "closingAsk": "Keplar’a dilediğinizi sorun",
    "closingCompare": "Keplar’ın karşılaştırması"
  },
  "roadmap": {
    "kicker": "Yol haritası",
    "title": "Neler geliştiriyoruz ve neler henüz bitmedi.",
    "lead": "Hedef tarih yok: işler çalıştığında yayınlanır. Aşağıdaki her şey ya şu anda geliştiriliyor ya da bilinen eksikleriyle betada kullanılabiliyor. Yayınlananlar için <changelog>değişiklik günlüğüne</changelog>, durumlarıyla tam liste için <features>Keplar’daki her şey</features> sayfasına bakın.",
    "nowNum": "Şimdi",
    "nowTitle": "Geliştiriliyor",
    "nowLede": "Henüz kullanılamaz. Sitenin her yerinde Yakında olarak gösterilir.",
    "nextNum": "Sırada",
    "nextTitle": "Beta özellikleri tamamlanıyor",
    "nextLede": "Bunlar bugün çalışıyor. Hâlâ eksik olanlar şunlar.",
    "doneNum": "Yayınlandı",
    "doneTitle": "Son zamanlarda",
    "doneLede": "Son birkaç sürüm. Tarihler commit geçmişinden alınır.",
    "englishNote": "Sürüm notları İngilizcedir.",
    "finishing": [
      {
        "feature": "Herkese açık API",
        "items": [
          "Ekip düzeyinde anahtarlar",
          "Anahtar başına kredi sınırları",
          "Resmî bir SDK",
          "Webhook’lar"
        ]
      },
      {
        "feature": "Yerleştirilebilir widget",
        "items": [
          "İmzalı yayıncı token’ları",
          "Özel stil"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "Üye başına sınırlar ve kullanım dökümü",
          "Sahiplik devri",
          "Tek oturum açma (SSO)"
        ]
      },
      {
        "feature": "Ses",
        "items": [
          "Konuşma tanıması olmayan tarayıcılar için bir alternatif (Firefox)",
          "Bir dil seçici"
        ]
      },
      {
        "feature": "Kaynak kontrolü",
        "items": [
          "Canlı bir testten sonra ücretli planlarda web kaynak kontrolünü açmak"
        ]
      }
    ],
    "foot": "İhtiyacınız olan bir şey mi eksik? <feedback>Bize söyleyin</feedback>. Güvenlik sorunlarını <security>güvenlik sayfasındaki</security> adrese bildirin."
  },
  "showcase": {
    "kicker": "Vitrin",
    "title": "Mor parıltı yok. Üç kartlı ızgara yok. Brifteki işletme için yapıldı.",
    "lead": "Create anlattığınız şey için bir tasarım planlar, ardından yapay zekâyla yapılan siteleri birbirine benzeten kalıpları reddeder. Bu demolar ondan beklediğimiz yelpazeyi gösteriyor: basılı bir menü gibi dizilmiş bir şarap listesi, bir kahve kavurucusunun defteri, bir kurye firmasının sevk panosu.",
    "disclosure": "Create’in hedefini göstermek için Keplar ekibinin yaptığı vitrin demoları. Müşteri siteleri değildir. İçlerindeki adlar, fiyatlar ve tarihler örnek içeriktir.",
    "sites": "site",
    "apps": "uygulama",
    "styles": "görsel stil",
    "industries": "sektör",
    "contentNote": "Demo başlıkları ve açıklamaları İngilizcedir.",
    "galleryKicker": "Keplar kullanan kişilerin yaptıkları",
    "gallery": "Topluluk galerisi",
    "yourTurn": "Sıra sizde",
    "openCreate": "Create’i aç"
  },
  "developers": {
    "kicker": "Geliştiriciler",
    "title": "Keplar ile geliştirin.",
    "lede": "Tek bir istek, soruyu birkaç modele gönderir, onları karşılaştırır ve nerede ayrıştıklarının açık bir kaydıyla birlikte tek bir yanıt döndürür. Sunucunuzdan bir API anahtarıyla çağırın ya da aynı Ask’i tek bir script etiketiyle kendi sitenize koyun.",
    "getKey": "API anahtarı alın",
    "widget": "Widget oluşturun",
    "spec": "OpenAPI şartnamesi",
    "endpoint": "Ana uç nokta",
    "products": [
      {
        "name": "Herkese açık API",
        "text": "Bearer anahtarları, JSON veya akış yanıtları, her yanıtta uzlaşma ve görüş ayrılığı."
      },
      {
        "name": "Yerleştirilebilir Ask",
        "text": "Belgeleriniz veya ürününüz için temaya uyarlanabilir bir Ask kutusu. Kaynak izin listesi ve hız sınırları dahil."
      },
      {
        "name": "Keplar for Teams",
        "text": "Yönetici, düzenleyici ve görüntüleyici rolleriyle ortak çalışma alanları; e-posta veya bağlantıyla davet."
      },
      {
        "name": "Davetler",
        "text": "Bağlantınızı paylaşın. Arkadaşınız katıldığında ikiniz de {n} kullanım kredisi kazanırsınız."
      }
    ],
    "platform": "Platform",
    "refTitle": "Tam başvuru kaynağı",
    "refLede": "Planlar ve sınırlar, hızlı başlangıç, istek ve yanıt biçimi, akış, widget, Teams rolleri, hatalar ve güvenlik notları İngilizce geliştirici sayfasında. Kod, alan adları ve hata kodları her dilde aynıdır.",
    "sections": [
      "Planlar ve sınırlar",
      "Hızlı başlangıç",
      "POST /api/v1/ask",
      "Akış",
      "Yerleştirilebilir Ask widget’ı",
      "Keplar for Teams",
      "Hatalar",
      "Güvenlik ve gizlilik",
      "Henüz kullanılamayanlar"
    ],
    "refLink": "Tam başvuru kaynağını açın (İngilizce)"
  },
  "auth": {
    "signinTitle": "Keplar’a giriş yapın",
    "signinLead": "Sohbetlerinize, projelerinize ve planınıza kaldığınız yerden devam edin.",
    "addTitle": "Hesap ekle",
    "addLead": "Başka bir hesapla giriş yapın. Kullandığınız hesap bu cihazda açık kalır.",
    "checkoutLead": "Ödemeye devam etmek için giriş yapın. Ardından doğrudan ödemeye geçeceksiniz.",
    "expired": "{email} hesabının oturumu kapatıldı. Kullanmak için tekrar giriş yapın.",
    "signupTitle": "Keplar hesabınızı oluşturun",
    "signupLead": "Ödevler ve büyük kararlar, gezi planları ve yan projeler ya da bir işletme yönetmek için. Free ücretsiz açık modellerle çalışır ve istediğiniz zaman yükseltebilirsiniz.",
    "invited": "Bir arkadaşınız sizi davet etti: e-postanız doğrulandığında ikiniz de ek kullanım kredisi kazanırsınız (asla para değil). Ayrıntılar davet programı koşullarında.",
    "signUp": "Kaydol",
    "logIn": "Giriş yap",
    "toggle": "Kaydol veya giriş yap",
    "about": "Keplar hakkında",
    "panel": {
      "signin": {
        "eyebrow": "Tekrar hoş geldiniz",
        "title": "Kaldığınız yerden devam edin.",
        "lead": "Sohbetleriniz, projeleriniz ve planınız giriş yaptığınız her cihazda sizi bekliyor."
      },
      "signup": {
        "eyebrow": "Ücretsiz hesap",
        "title": "Tek bir yapay zekâya güvenmeyi bırakın.",
        "lead": "Free ücretsiz açık modellerle çalışır ve istediğiniz zaman yükseltebilirsiniz."
      }
    },
    "points": [
      "Sorunuzun ihtiyaç duyduğu modellere sorar",
      "Nerede ayrıştıklarını gösterir",
      "Görüş ayrılıklarıyla birlikte tek yanıt"
    ]
  }
};

export default m;
