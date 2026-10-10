// tr client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "Tek soru.",
      "Birden çok zekâ.",
      "Tek yanıt."
    ],
    "sub": "Keplar birden çok yapay zekâ modelini kullanır, bakış açılarını karşılaştırır ve size net, sentezlenmiş tek bir yanıt verir.",
    "note": "Model adları, Keplar’ın soruları yönlendirebileceği model ailelerine örnektir; hangi modellerin yanıt vereceği planınıza, soruya ve erişilebilirliğe bağlıdır. Adlar sahiplerine aittir. Uygulamada açılır; Gönder’e basana kadar hiçbir şey gönderilmez.",
    "ask": "Keplar’a dilediğinizi sorun",
    "questionLabel": "Sorunuz",
    "builtBy": "Geliştiren: {credit}",
    "tryDemo": "Canlı demoyu deneyin",
    "everything": "Keplar’daki her şey",
    "families": "Örnek model aileleri",
    "storyLabel": "Keplar nasıl çalışır",
    "kickers": [
      "Sor",
      "Yönlendir",
      "Yanıtla",
      "Karşılaştır",
      "Doğrula",
      "Yanıt"
    ],
    "index": [
      "Sor",
      "Soru",
      "Yönlendir",
      "Yanıtla",
      "Karşılaştır",
      "Doğrula",
      "Yanıt"
    ],
    "questionPrompt": "Bu yıl ev mi almalıyım, yoksa kirada mı kalmalıyım?",
    "questionCaption": "Bir soru sisteme girer.",
    "distributionTitle": "Kime sorulacağına Keplar-One karar verir.",
    "distributionBody": "Her model değil, her seferinde değil. Yalnızca bu sorunun ihtiyaç duyduğu zekâlar; kalite, güvenilirlik, gecikme ve maliyete göre tartılarak.",
    "routeNote": "Adlar örnektir. Hangi modellerin yanıt vereceği planınıza, soruya ve erişilebilirliğe bağlıdır. Adlar sahiplerine aittir.",
    "responsesTitle": "Her biri kendi başına yanıt verir.",
    "responsesBody": "Farklı akıl yürütmeler. Farklı kanıtlar. Bazı yanıtlar örtüşür. Bazıları örtüşmez.",
    "respondNote": "Temsilî görsel, canlı sonuç değil.",
    "agree": "5’i aynı fikirde.",
    "dissent": "1’i değil.",
    "detected": "Görüş ayrılığı tespit edildi.",
    "follow": "Keplar nedenini araştırır.",
    "disagreeNote": "Örnek bir soruyla temsilî görsel. Sayılar örnektir, canlı sonuç değildir.",
    "verificationTitle": "Oylama değil, değerlendirme.",
    "verificationBody": "Keplar her yanıtın arkasındaki kanıtı ve akıl yürütmeyi tartar. İlgili kanıtlar bir araya gelir, çelişkiler ayrışır, gürültü kaybolur. Azınlık haklı olabilir.",
    "verifySteps": [
      "Kanıtı tart",
      "Çelişkileri ayır",
      "Gürültüyü ele"
    ],
    "closingTitle": "Tek yanıt.",
    "convergenceBody": "Sağlam çıkanlardan sentezlenir; uzlaşma ve görüş ayrılıkları gösterilir.",
    "closingSecondary": "Keplar-One nasıl çalışır",
    "beats": {
      "question": {
        "text": "Her şey bir soruyla başlar.",
        "short": "Her şey bir soruyla başlar."
      },
      "minds": {
        "text": "Keplar aynı anda birkaç zihne sorar.",
        "short": "Birkaç zihin, aynı anda."
      },
      "disagree": {
        "text": "Nerede ayrıştıklarını bulur.",
        "short": "Nerede ayrıştıkları."
      },
      "verify": {
        "text": "Neyin sağlam olduğunu kontrol eder.",
        "short": "Neyin sağlam olduğu."
      },
      "answer": {
        "text": "Ve size güvenebileceğiniz tek bir yanıt verir.",
        "short": "Güvenilir tek yanıt."
      }
    }
  },
  "demo": {
    "samples": [
      "Soğuk bir kışta ısı pompası mı, doğalgaz kombisi mi daha ucuza gelir?",
      "İki kişilik bir girişim Delaware’de şirket kurmalı mı?",
      "Kreatin hafızaya mı yardımcı olur, yoksa sadece kaslara mı?"
    ],
    "stages": {
      "understand": "Soru anlaşılıyor",
      "select": "Sorulacak modeller seçiliyor",
      "compare": "Yanıtlar karşılaştırılıyor",
      "disagree": "Görüş ayrılıkları aranıyor",
      "verify": "Neyin sağlam olduğu kontrol ediliyor",
      "synthesize": "Tek yanıt yazılıyor"
    },
    "dailyDemo": "Bugünkü {n} demo sorusu bu kadardı. Uygulamada ücretsiz ve kartsız devam edin.",
    "slowDown": "Bir saniye: demoda dakikada yalnızca birkaç soru sorulabiliyor. Birazdan tekrar deneyin.",
    "dailyFree": "Bugünkü ücretsiz sorularınızı kullandınız. Devam etmek için ücretsiz kaydolun ya da yarın tekrar gelin.",
    "tooBig": "Bu soru ücretsiz kotadan fazlasını gerektiriyor. Daha kısa bir soru deneyin.",
    "offline": "Keplar’a ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.",
    "label": "Sorunuz",
    "placeholder": "İki kez kontrol edeceğiniz bir şey sorun.",
    "asking": "Birkaç modele soruluyor…",
    "ask": "Keplar’a dilediğinizi sorun",
    "examples": "Örnek sorular",
    "idleHead": "Neler göreceksiniz",
    "disagreement": "Görüş ayrılığı",
    "fullCard": "Yanıtın tamamını gör",
    "signup": "Geçmişinizi saklamak için ücretsiz hesap oluşturun",
    "left": "Bugün {n} demo sorusundan {left} tane kaldı",
    "metaTail": "ücretsiz modeller · hesap gerekmez",
    "models": "Modeller",
    "answered": "yanıtladı",
    "consensus": "{consulted} modelden {responded} tanesi yanıtladı · {agree} aynı fikirde",
    "disagreeCount": ", {n} farklı düşünüyor"
  },
  "authForm": {
    "checkEmail": "E-postanızı kontrol edin",
    "sentVerify": "<b>{email}</b> adresine bir doğrulama bağlantısı gönderdik. Hesabınızı oluşturmayı tamamlamak için bağlantıyı açıp “Doğrula ve devam et”e basın. Bağlantı 24 saat geçerlidir.",
    "sentLink": "<b>{email}</b> adresine bir giriş bağlantısı gönderdik. Bağlantıyı açıp “Giriş yap”a basın. Bağlantı 15 dakika geçerlidir.",
    "notThere": "Gelmedi mi? İstenmeyen klasörüne bakın ya da bir dakika bekleyin. Zaten bir hesabınız varsa e-postada bu belirtilir.",
    "sending": "Gönderiliyor…",
    "resendIn": "{n} sn sonra tekrar gönder",
    "resend": "E-postayı tekrar gönder",
    "differentEmail": "Başka bir e-posta kullan",
    "linkInstead": "Bunun yerine bana giriş bağlantısı gönder",
    "link": "Bana giriş bağlantısı gönder",
    "oauthConsent": "Google veya Microsoft ile devam ederek en az 13 yaşında olduğunuzu onaylar, <terms>Koşulları</terms> kabul eder ve <privacy>Gizlilik Politikası</privacy>’nı okuduğunuzu kabul edersiniz.",
    "or": "ya da e-postanızı kullanın",
    "name": "Ad",
    "optional": "(isteğe bağlı)",
    "email": "E-posta",
    "password": "Şifre",
    "forgot": "Şifrenizi mi unuttunuz?",
    "confirm": "Şifreyi onayla",
    "terms": "En az 13 yaşındayım (18 yaşından küçüksem ebeveynimin veya vasimin izniyle), <terms>Koşulları</terms> kabul ediyorum ve <privacy>Gizlilik Politikası</privacy>’nı okudum.",
    "remember": "Bu cihazda oturumum açık kalsın",
    "unverified": "E-posta adresiniz henüz doğrulanmadı.",
    "resendVerify": "Doğrulama e-postasını tekrar gönder",
    "creating": "Hesap oluşturuluyor…",
    "loggingIn": "Giriş yapılıyor…",
    "create": "Hesap oluştur",
    "logIn": "Giriş yap",
    "noPassword": "Şifre gerekmez. Adresinizi doğrulayan tek kullanımlık bir bağlantıyı e-postayla göndeririz.",
    "errEmail": "Geçerli bir e-posta adresi girin, örneğin siz@ornek.com.",
    "errEmailEmpty": "E-posta adresinizi girin.",
    "errEmailAbove": "Yukarıya e-postanızı girin, sonra buna tekrar basın.",
    "errPassword": "Şifrenizi girin.",
    "errWeak": "Daha güçlü bir şifre seçin.",
    "errMatch": "İki şifre eşleşmiyor.",
    "errTerms": "Hesap oluşturmak için Koşulları ve Gizlilik Politikası’nı kabul edin.",
    "errTooMany": "Çok fazla giriş e-postası istendi. Birkaç dakika sonra tekrar deneyin.",
    "continueWith": "{name} ile devam et",
    "opening": "{name} açılıyor…",
    "soon": "Yakında",
    "passkey": "Geçiş anahtarıyla giriş yap",
    "passkeyWaiting": "Cihazınız bekleniyor…"
  }
};

export default m;
