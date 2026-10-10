// id client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "Satu pertanyaan.",
      "Banyak kecerdasan.",
      "Satu jawaban."
    ],
    "sub": "Keplar menggunakan beberapa model AI, membandingkan sudut pandang mereka, dan memberi Anda satu jawaban yang jelas dan terpadu.",
    "note": "Nama model adalah contoh keluarga model yang dapat dituju Keplar; model mana yang menjawab bergantung pada paket Anda, pertanyaannya, dan ketersediaan. Nama-nama tersebut milik pemiliknya masing-masing. Dibuka di aplikasi; tidak ada yang dikirim sampai Anda menekan Kirim.",
    "ask": "Tanya Keplar apa saja",
    "questionLabel": "Pertanyaan Anda",
    "builtBy": "Dibuat oleh {credit}",
    "tryDemo": "Coba demo langsung",
    "everything": "Semua tentang Keplar",
    "families": "Contoh keluarga model",
    "storyLabel": "Cara kerja Keplar",
    "kickers": [
      "Tanya",
      "Arahkan",
      "Tanggapi",
      "Bandingkan",
      "Verifikasi",
      "Jawab"
    ],
    "index": [
      "Tanya",
      "Pertanyaan",
      "Arahkan",
      "Tanggapi",
      "Bandingkan",
      "Verifikasi",
      "Jawab"
    ],
    "questionPrompt": "Sebaiknya saya beli rumah tahun ini atau tetap menyewa?",
    "questionCaption": "Satu pertanyaan masuk ke sistem.",
    "distributionTitle": "Keplar-One memutuskan siapa yang ditanya.",
    "distributionBody": "Tidak setiap model, setiap saat. Hanya kecerdasan yang dibutuhkan pertanyaan ini, ditimbang dari kualitas, keandalan, latensi, dan biaya.",
    "routeNote": "Nama hanyalah contoh. Model mana yang menjawab bergantung pada paket Anda, pertanyaannya, dan ketersediaan. Nama-nama tersebut milik pemiliknya masing-masing.",
    "responsesTitle": "Masing-masing menjawab sendiri.",
    "responsesBody": "Penalaran berbeda. Bukti berbeda. Sebagian jawaban sejalan. Sebagian tidak.",
    "respondNote": "Ilustrasi, bukan hasil langsung.",
    "agree": "5 setuju.",
    "dissent": "1 tidak.",
    "detected": "Perbedaan pendapat terdeteksi.",
    "follow": "Keplar menyelidiki alasannya.",
    "disagreeNote": "Ilustrasi dengan contoh pertanyaan. Angkanya adalah contoh, bukan hasil langsung.",
    "verificationTitle": "Evaluasi, bukan pemungutan suara.",
    "verificationBody": "Keplar menimbang bukti dan penalaran di balik setiap jawaban. Bukti yang terkait berkumpul, kontradiksi terpisah, kebisingan tersaring. Pendapat minoritas bisa saja benar.",
    "verifySteps": [
      "Timbang buktinya",
      "Pisahkan kontradiksi",
      "Saring kebisingannya"
    ],
    "closingTitle": "Satu jawaban.",
    "convergenceBody": "Disusun dari apa yang terbukti kuat, dengan kesepakatan dan perbedaan pendapat ditampilkan.",
    "closingSecondary": "Cara kerja Keplar-One",
    "beats": {
      "question": {
        "text": "Semuanya dimulai dengan pertanyaan.",
        "short": "Dimulai dengan pertanyaan."
      },
      "minds": {
        "text": "Keplar bertanya ke beberapa kecerdasan sekaligus.",
        "short": "Beberapa kecerdasan, sekaligus."
      },
      "disagree": {
        "text": "Keplar menemukan di mana mereka berbeda pendapat.",
        "short": "Di mana mereka berbeda."
      },
      "verify": {
        "text": "Keplar memeriksa apa yang terbukti kuat.",
        "short": "Apa yang terbukti kuat."
      },
      "answer": {
        "text": "Lalu memberi Anda satu jawaban yang bisa dipercaya.",
        "short": "Satu jawaban yang bisa dipercaya."
      }
    }
  },
  "demo": {
    "samples": [
      "Mana yang lebih hemat saat musim dingin yang dingin, pompa kalor atau boiler gas?",
      "Apakah startup dua orang sebaiknya berbadan hukum di Delaware?",
      "Apakah kreatin membantu daya ingat, atau hanya otot?"
    ],
    "stages": {
      "understand": "Memahami pertanyaan",
      "select": "Memilih model yang akan ditanya",
      "compare": "Membandingkan jawaban mereka",
      "disagree": "Mencari perbedaan pendapat",
      "verify": "Memeriksa apa yang terbukti kuat",
      "synthesize": "Menulis satu jawaban"
    },
    "dailyDemo": "Itu tadi {n} pertanyaan demo hari ini. Lanjutkan di aplikasi, gratis, tanpa kartu.",
    "slowDown": "Sebentar: demo hanya menerima beberapa pertanyaan per menit. Coba lagi sebentar lagi.",
    "dailyFree": "Pertanyaan gratis hari ini sudah habis. Daftar gratis untuk melanjutkan, atau kembali besok.",
    "tooBig": "Pertanyaan ini membutuhkan lebih dari kuota gratis. Coba yang lebih pendek.",
    "offline": "Tidak dapat terhubung ke Keplar. Periksa koneksi Anda lalu coba lagi.",
    "label": "Pertanyaan Anda",
    "placeholder": "Tanyakan apa saja yang ingin Anda periksa dua kali.",
    "asking": "Bertanya ke beberapa model…",
    "ask": "Tanya Keplar apa saja",
    "examples": "Contoh pertanyaan",
    "idleHead": "Yang akan Anda lihat",
    "disagreement": "Perbedaan pendapat",
    "fullCard": "Lihat kartu jawaban lengkap",
    "signup": "Buat akun gratis untuk menyimpan riwayat Anda",
    "left": "Tersisa {left} dari {n} pertanyaan demo hari ini",
    "metaTail": "model gratis · tanpa akun",
    "models": "Model",
    "answered": "menjawab",
    "consensus": "{responded} dari {consulted} model menjawab · {agree} setuju",
    "disagreeCount": ", {n} tidak setuju"
  },
  "authForm": {
    "checkEmail": "Periksa email Anda",
    "sentVerify": "Kami mengirim tautan verifikasi ke <b>{email}</b>. Buka dan tekan “Verifikasi dan lanjutkan” untuk menyelesaikan pembuatan akun. Tautan berlaku 24 jam.",
    "sentLink": "Kami mengirim tautan masuk ke <b>{email}</b>. Buka dan tekan “Masuk”. Tautan berlaku 15 menit.",
    "notThere": "Tidak ada? Periksa folder spam, atau tunggu sebentar. Jika Anda sudah punya akun, emailnya akan memberi tahu.",
    "sending": "Mengirim…",
    "resendIn": "Kirim ulang dalam {n} dtk",
    "resend": "Kirim ulang email",
    "differentEmail": "Gunakan email lain",
    "linkInstead": "Kirimkan tautan masuk lewat email saja",
    "link": "Kirimkan tautan masuk lewat email",
    "oauthConsent": "Dengan melanjutkan menggunakan Google atau Microsoft, Anda mengonfirmasi bahwa Anda berusia minimal 13 tahun, menyetujui <terms>Ketentuan</terms>, dan memahami <privacy>Kebijakan Privasi</privacy>.",
    "or": "atau gunakan email Anda",
    "name": "Nama",
    "optional": "(opsional)",
    "email": "Email",
    "password": "Kata sandi",
    "forgot": "Lupa kata sandi?",
    "confirm": "Konfirmasi kata sandi",
    "terms": "Saya berusia minimal 13 tahun (dengan izin orang tua atau wali jika di bawah 18 tahun), saya menyetujui <terms>Ketentuan</terms>, dan saya telah membaca <privacy>Kebijakan Privasi</privacy>.",
    "remember": "Biarkan saya tetap masuk di perangkat ini",
    "unverified": "Email Anda belum diverifikasi.",
    "resendVerify": "Kirim ulang email verifikasi",
    "creating": "Membuat akun…",
    "loggingIn": "Masuk…",
    "create": "Buat akun",
    "logIn": "Masuk",
    "noPassword": "Tidak perlu kata sandi. Kami mengirim tautan sekali pakai untuk membuktikan alamat Anda.",
    "errEmail": "Masukkan alamat email yang valid, misalnya you@example.com.",
    "errEmailEmpty": "Masukkan alamat email Anda.",
    "errEmailAbove": "Masukkan email Anda di atas, lalu tekan ini lagi.",
    "errPassword": "Masukkan kata sandi Anda.",
    "errWeak": "Pilih kata sandi yang lebih kuat.",
    "errMatch": "Kedua kata sandi tidak cocok.",
    "errTerms": "Setujui Ketentuan dan Kebijakan Privasi untuk membuat akun.",
    "errTooMany": "Terlalu banyak permintaan email masuk. Coba lagi dalam beberapa menit.",
    "continueWith": "Lanjutkan dengan {name}",
    "opening": "Membuka {name}…",
    "soon": "Segera hadir",
    "passkey": "Masuk dengan passkey",
    "passkeyWaiting": "Menunggu perangkat Anda…"
  }
};

export default m;
