// id marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — Satu pertanyaan. Banyak kecerdasan. Satu jawaban.",
      "description": "Keplar mengirim pertanyaan Anda ke beberapa model AI, menemukan di mana mereka berbeda pendapat, memverifikasi, dan memberi Anda satu jawaban terpadu. Gratis dicoba, tanpa daftar."
    },
    "features": {
      "title": "Semua tentang Keplar",
      "description": "Setiap fitur Keplar dalam satu halaman, dikelompokkan menurut kegunaannya: bertanya, membaca file, membuat situs dan aplikasi, membangun bersama, merilis, API dan widget, serta kepercayaan. Masing-masing menyebutkan apakah sudah tersedia, beta, atau segera hadir."
    },
    "pricing": {
      "title": "Harga: Free, Plus $45, Pro $99",
      "description": "Mulai gratis dengan Keplar One. Keplar Plus $45/bulan, Keplar Pro $99/bulan, dan paket Business tersedia melalui tim penjualan kami. Pemakaian yang bisa Anda lihat, tidak pernah disembunyikan."
    },
    "showcase": {
      "title": "Etalase Create: seperti apa seharusnya aplikasi buatan Keplar",
      "description": "Delapan situs dan aplikasi demo buatan tim Keplar untuk menunjukkan jangkauan yang dituju Create: menu, buku besar, papan, kalender, dan halaman editorial, masing-masing dengan huruf dan palet sendiri. Bukan situs pelanggan."
    },
    "roadmap": {
      "title": "Peta jalan",
      "description": "Apa yang sedang dibangun Keplar, apa yang masih beta dan sedang dirampungkan, dan apa yang baru dirilis. Tanpa tanggal target yang tidak bisa kami tepati."
    },
    "developers": {
      "title": "Keplar untuk pengembang: API, Ask yang bisa disematkan, Teams",
      "description": "Tanya Keplar dari kode Anda sendiri dengan kunci API Bearer, atau pasang widget Ask di situs Anda dengan satu tag script. Spesifikasi OpenAPI, streaming, batas per paket yang dijelaskan dengan gamblang."
    },
    "signin": {
      "title": "Masuk",
      "description": "Masuk ke Keplar."
    },
    "signup": {
      "title": "Buat akun Anda",
      "description": "Buat akun Keplar gratis."
    }
  },
  "status": {
    "live": "Tersedia",
    "beta": "Beta",
    "soon": "Segera hadir"
  },
  "chapters": {
    "demoKicker": "Demo langsung",
    "demoTitle": "Coba di sini. Tanpa akun.",
    "proof": "Dibuat oleh {credit}. Dikembangkan secara terbuka: <changelog>catatan perubahan</changelog>, <roadmap>peta jalan</roadmap>, dan <security>halaman keamanan</security> yang menjelaskan apa yang sudah dan belum dikerjakan.",
    "showcaseNote": "Demo etalase dibuat oleh tim Keplar, bukan situs pelanggan. <link>Lihat kedelapannya</link>",
    "closeTitle": "Tanya Keplar apa saja.",
    "closeCta": "Tanya Keplar apa saja",
    "closeSmall": "Gratis, tanpa kartu. <link>Semua tentang Keplar dalam satu halaman</link>, dengan yang sudah tersedia, beta, dan segera hadir.",
    "voiceCaption": "Voice Live Create: bicara, dan editor, terminal, serta pratinjau bergerak bersamaan. Berhenti dan ia menunggu; ucapkan \"eh, maksudnya\" dan ia merevisi.",
    "voiceLabel": "Voice Live Create: editor, terminal, dan pratinjau langsung berdampingan",
    "list": {
      "ask": {
        "label": "Tanya",
        "title": "Tanya Keplar apa saja.",
        "lede": "Satu pertanyaan dikirim ke beberapa model AI. Keplar membandingkannya, menunjukkan di mana mereka berbeda, memeriksa apa yang terbukti kuat, dan menulis satu jawaban."
      },
      "understand": {
        "label": "Pahami",
        "title": "Keplar membaca apa yang Anda berikan.",
        "lede": "Masukkan hal yang Anda tanyakan. Keplar membacanya hanya untuk pertanyaan itu dan tidak menyimpan filenya."
      },
      "create": {
        "label": "Buat",
        "title": "Jelaskan, atau ucapkan. Dapatkan hasil yang tidak terlihat hasil generator.",
        "lede": "Create merancang desain untuk bisnis dalam brief Anda, menulis kodenya, menguji setiap layar, dan menolak cahaya ungu, gumpalan gradien, dan kisi tiga kartu."
      },
      "together": {
        "label": "Bangun bersama",
        "title": "Bangun bersama orang lain, dan bersama seorang kritikus.",
        "lede": "Kerjakan proyek yang sama pada saat yang sama, dan dapatkan pendapat kedua yang bukan dari diri Anda."
      },
      "ship": {
        "label": "Rilis",
        "title": "Terbitkan dalam satu langkah. Batalkan dalam satu langkah.",
        "lede": "Proyek Anda tayang di alamat Keplar, dengan domain Anda sendiri bila Anda mau."
      },
      "platform": {
        "label": "Platform",
        "title": "Gunakan Keplar dari mana saja.",
        "lede": "Mesin yang sama, di balik API, di dalam widget di situs Anda, dan dibagikan ke seluruh tim."
      },
      "trust": {
        "label": "Kepercayaan",
        "title": "Terus terang tentang apa yang dilakukannya, dan tentang data Anda.",
        "lede": "Apa yang kami lindungi, bagaimana caranya, dan apa yang belum kami lakukan, semuanya tertulis. Tanpa lencana yang belum kami raih."
      }
    },
    "items": {
      "demo": {
        "name": "Demo langsung",
        "line": "Ajukan pertanyaan sungguhan di halaman ini. Tanpa akun."
      },
      "multi-model": {
        "name": "Beberapa model, satu jawaban",
        "line": "Hanya model yang dibutuhkan pertanyaan, dibandingkan klaim demi klaim."
      },
      "disagreement": {
        "name": "Peta perbedaan pendapat",
        "line": "Di mana model sepakat, di mana mereka berbeda, dan mengapa jawabannya seperti itu."
      },
      "debate": {
        "name": "Mode debat",
        "line": "Saksikan model berdebat dalam beberapa ronde sebelum Keplar menjawab."
      },
      "voice": {
        "name": "Mode suara",
        "line": "Bertanya dengan suara, dengarkan jawabannya dibacakan. Keplar tidak pernah merekam atau menyimpan audio Anda."
      },
      "images": {
        "name": "Gambar dan tangkapan layar",
        "line": "Grafik, struk, papan tulis, UI. Hanya dikirim ke model yang bisa melihat."
      },
      "video": {
        "name": "Video",
        "line": "Keyframe diambil di browser Anda; klipnya sendiri tidak diunggah."
      },
      "docs": {
        "name": "Dokumen, kode, dan data",
        "line": "PDF, teks, CSV, JSON, dan file sumber, dibaca sebagai teks."
      },
      "office": {
        "name": "Word, PowerPoint, Excel, dan audio",
        "line": "File Office diurai dengan aman; audio ditranskripsikan."
      },
      "links": {
        "name": "Tautan",
        "line": "Tempel URL dan Keplar membaca halamannya melalui pengambilan yang dijaga."
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "Bicaralah dan saksikan editor, terminal, dan pratinjau terbentuk bersamaan. Ucapkan \"eh, maksudnya\" untuk berganti arah.",
        "note": "Memerlukan browser dengan pengenalan suara (Chrome, Edge, Safari)."
      },
      "showcase": {
        "name": "Etalase",
        "line": "Delapan demo dari tim Keplar yang menjadi standar bagi Create."
      },
      "surprise": {
        "name": "Kejutkan saya",
        "line": "Sekali tekan: brief, gaya, dan kedalaman yang spesifik, dibuat untuk Anda."
      },
      "versions": {
        "name": "Riwayat versi",
        "line": "Setiap build adalah versi. Pulihkan yang mana saja, atau cabangkan menjadi draf baru."
      },
      "community": {
        "name": "Galeri komunitas",
        "line": "Situs yang dipilih orang untuk dibagikan. Suka, remix, laporkan."
      },
      "anti-vibe": {
        "name": "Aturan desain anti-generik",
        "line": "Rubrik tertulis dan pemeriksaan lint yang menolak tampilan AI yang biasa sebelum Anda melihatnya."
      },
      "collab": {
        "name": "Kolaborasi waktu nyata",
        "line": "Undang lewat tautan dan edit proyek yang sama bersama: kursor langsung, mode ikuti, terminal dan pratinjau bersama.",
        "note": "Buka aplikasi di Create, lalu Live. Penonton menonton; editor mengetik."
      },
      "critic": {
        "name": "Kritikus AI",
        "line": "Aturan, axe-core di browser sungguhan, dan model terpisah meninjau build Anda, lalu menerapkan perbaikan yang Anda pilih."
      },
      "publish": {
        "name": "Terbitkan sekali klik",
        "line": "Terbitkan draf ke alamat langsung dari Create."
      },
      "previews": {
        "name": "Pratinjau",
        "line": "Setiap draf punya tautan pratinjau pribadi sebelum tayang."
      },
      "rollback": {
        "name": "Rollback",
        "line": "Pulihkan versi sebelumnya jika suatu perubahan bermasalah."
      },
      "domains": {
        "name": "Domain kustom",
        "line": "Hubungkan domain milik Anda; Keplar memeriksa DNS dan memberi tahu apa yang perlu diubah."
      },
      "ssl": {
        "name": "HTTPS otomatis",
        "line": "Sertifikat diterbitkan dan diperpanjang untuk domain yang terhubung."
      },
      "api": {
        "name": "API publik",
        "line": "Kunci Bearer, batas per paket, spesifikasi OpenAPI. Kunci gratis hanya memakai model gratis."
      },
      "embed": {
        "name": "Widget sematan",
        "line": "Satu tag script memasang Keplar Ask di situs Anda, terbatas pada origin yang Anda izinkan."
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "Ruang kerja bersama dengan peran pemilik, admin, editor, dan pemirsa.",
        "note": "Paket Business."
      },
      "referrals": {
        "name": "Program referensi",
        "line": "Undang teman; Anda berdua mendapat pemakaian ekstra, bukan uang tunai."
      },
      "security": {
        "name": "Keamanan",
        "line": "Enkripsi, penyedia, retensi, perlindungan akun, dan cara melaporkan masalah."
      },
      "changelog": {
        "name": "Catatan perubahan",
        "line": "Apa yang dirilis, dan kapan."
      },
      "roadmap": {
        "name": "Peta jalan",
        "line": "Apa yang kami bangun berikutnya, dan apa yang belum tersedia."
      }
    }
  },
  "featuresPage": {
    "kicker": "Semua tentang Keplar",
    "crumb": "Fitur",
    "title": "Setiap fitur, dan apakah bisa Anda gunakan hari ini.",
    "lead": "<b>{live}</b> tersedia, <b>{beta}</b> beta, <b>{soon}</b> segera hadir. Beta sudah berfungsi tetapi bisa berubah atau terbatas pada sebagian paket. Segera hadir belum bisa digunakan dan tidak ditautkan seolah-olah sudah bisa.",
    "sections": "Bagian",
    "thFeature": "Fitur",
    "thWhat": "Fungsinya",
    "thStatus": "Status",
    "foot": "Perubahan terbaru: <changelog>catatan perubahan</changelog>. Berikutnya: <roadmap>peta jalan</roadmap>. Siap mencoba: <demo>ajukan pertanyaan di beranda</demo>, tanpa akun."
  },
  "pricing": {
    "label": "Harga",
    "title": "Mulai gratis. Tingkatkan saat Anda butuh lebih.",
    "lede": "Mulai gratis untuk pertanyaan sehari-hari. Tingkatkan untuk model premium, Deep Research, serta membuat situs, gambar, dan video. Menjalankan bisnis? Business disesuaikan untuk itu. Pemakaian Keplar diukur dalam kredit, bukan token mentah.",
    "tailored": "Disesuaikan untuk bisnis Anda",
    "custom": "Kustom",
    "cadence": {
      "forever": "selamanya",
      "per month": "per bulan",
      "custom": "kustom"
    },
    "perMonth": "{price}/bln",
    "fine": "Batalkan kapan saja dari akun Anda. Pembayaran ditangani oleh Whop. Kredit diperbarui setiap bulan dan dipakai sesuai banyaknya kerja model yang dibutuhkan sebuah pertanyaan: pertanyaan sederhana hanya memakai sedikit.",
    "tiers": {
      "free": {
        "summary": "Pertanyaan sehari-hari dengan Keplar-One, memakai model terbuka gratis.",
        "features": [
          "Orkestrasi Keplar-One",
          "Hanya model terbuka gratis",
          "Bisa lebih lambat saat model gratis sedang sibuk",
          "Penyedia model gratis mungkin mencatat prompt",
          "Konsensus terbatas",
          "Tanpa pencarian web",
          "Hingga 50 pertanyaan sehari (penggunaan wajar)",
          "Pertanyaan gambar dan video dengan model visi gratis",
          "Mode belajar: unggah PDF berbasis teks untuk kartu hafalan, kuis, dan rencana belajar (model gratis, batas lebih kecil)",
          "Obrolan tersimpan dan memori opsional saat masuk"
        ],
        "cta": "Coba Keplar"
      },
      "lite": {
        "summary": "Selangkah di atas Free: model premium untuk pertanyaan sehari-hari, dengan harga lebih rendah.",
        "features": [
          "Model premium dan konsensus Keplar-One",
          "2.400 kredit per bulan dengan batas 5 jam dan batas mingguan",
          "Bantuan coding dan analisis file",
          "Mode belajar dengan model yang lebih kuat",
          "Buat situs pribadi kecil (alamat keplar.site gratis)",
          "Pembuatan gambar, Slides, Deep Research, video, agen, dan domain kustom mulai dari Plus"
        ],
        "cta": "Tingkatkan ke Lite"
      },
      "plus": {
        "summary": "Untuk pemakaian harian: sekolah, kerja, pertanyaan kesehatan, dan keputusan besar.",
        "features": [
          "Model premium dan Keplar-One tingkat lanjut",
          "Jatah konsensus lebih besar",
          "Deep Research untuk keputusan besar",
          "Bantuan coding dan analisis file",
          "Pencarian web nonaktif secara default (belum tersedia)",
          "Buat situs dan aplikasi pribadi",
          "Pembuat slide dengan ekspor PowerPoint dan PDF (ide gambar masih placeholder)",
          "Mode belajar dengan model lebih kuat dan batas lebih besar",
          "Pembuatan gambar",
          "Konteks lebih besar dan pemakaian prioritas"
        ],
        "cta": "Tingkatkan ke Plus"
      },
      "pro": {
        "summary": "Untuk pengguna berat dan kreator: jauh lebih banyak pemakaian, pembuatan, dan agen.",
        "features": [
          "Semua yang ada di Plus",
          "Lebih dari dua kali lipat kredit bulanan",
          "Pembuatan video",
          "Pembuat slide dan mode belajar dengan batas terbesar",
          "Pembuatan tingkat lanjut",
          "Agen tingkat lanjut",
          "Konteks lebih besar",
          "Prioritas dan konkurensi lebih tinggi"
        ],
        "cta": "Tingkatkan ke Pro"
      },
      "business": {
        "summary": "Menjalankan bisnis? Jawab, lalu Buat, lalu Bertindak.",
        "features": [
          "Commerce, CRM, kotak masuk, dan dasbor bisnis",
          "Agen otonom yang tetap bekerja setelah tab ditutup",
          "Batas pengeluaran tegas dan gerbang persetujuan manusia",
          "Izin terperinci hingga tingkat alat",
          "Log audit, rollback, dan penghentian darurat",
          "Isolasi rahasia dan sandbox",
          "Persetujuan deploy produksi dan pembayaran"
        ],
        "cta": "Hubungi Keplar"
      }
    },
    "fitTitle": "Paket mana yang cocok?",
    "fits": {
      "free": {
        "who": "Anda ingin melihat cara kerjanya.",
        "outcome": "Ajukan pertanyaan sehari-hari dengan model gratis, hingga 50 sehari. Tanpa kartu.",
        "cta": "Tanya Keplar apa saja"
      },
      "plus": {
        "who": "Anda memakai AI setiap hari untuk sekolah, kerja, atau keputusan besar.",
        "outcome": "Model premium, Deep Research, Slides, pembuatan gambar, dan domain kustom untuk apa yang Anda bangun.",
        "cta": "Tingkatkan ke Plus"
      },
      "pro": {
        "who": "Anda banyak membangun dan berkarya.",
        "outcome": "Lebih dari dua kali kredit Plus, video, lebih banyak proyek dan agen, serta prioritas lebih tinggi.",
        "cta": "Tingkatkan ke Pro"
      },
      "business": {
        "who": "Anda menjalankan bisnis dengan ini.",
        "outcome": "Commerce, CRM, dan agen dengan batas pengeluaran, gerbang persetujuan, dan log audit.",
        "cta": "Hubungi Keplar"
      }
    },
    "compareTitle": "Bandingkan semua paket",
    "compareLede": "Tabel lengkap per fitur, dengan setiap batas yang diterapkan produk saat ini, ada di halaman harga berbahasa Inggris.",
    "compareLink": "Lihat perbandingan lengkap (dalam bahasa Inggris)",
    "closingTitle": "Masih ragu? Mulai gratis.",
    "closingLede": "Ajukan pertanyaan sungguhan dan lihat di mana model sepakat dan di mana mereka berbeda. Tanpa kartu, dan Anda bisa meningkatkan paket dari dalam aplikasi kapan pun Anda butuh lebih.",
    "closingAsk": "Tanya Keplar apa saja",
    "closingCompare": "Perbandingan Keplar"
  },
  "roadmap": {
    "kicker": "Peta jalan",
    "title": "Apa yang sedang kami bangun, dan apa yang belum selesai.",
    "lead": "Tanpa tanggal target: fitur dirilis ketika sudah berfungsi. Semua di bawah ini sedang dibangun atau sudah bisa dipakai dalam beta dengan kekurangan yang diketahui. Untuk yang sudah dirilis, lihat <changelog>catatan perubahan</changelog>; untuk daftar lengkap beserta statusnya, lihat <features>semua tentang Keplar</features>.",
    "nowNum": "Sekarang",
    "nowTitle": "Sedang dibangun",
    "nowLede": "Belum bisa digunakan. Ditandai Segera hadir di seluruh situs.",
    "nextNum": "Berikutnya",
    "nextTitle": "Merampungkan fitur beta",
    "nextLede": "Ini sudah berfungsi hari ini. Inilah yang masih kurang.",
    "doneNum": "Dirilis",
    "doneTitle": "Baru-baru ini",
    "doneLede": "Beberapa rilis terakhir. Tanggal diambil dari riwayat commit.",
    "englishNote": "Catatan rilis dalam bahasa Inggris.",
    "finishing": [
      {
        "feature": "API publik",
        "items": [
          "Kunci tingkat tim",
          "Batas kredit per kunci",
          "SDK resmi",
          "Webhook"
        ]
      },
      {
        "feature": "Widget sematan",
        "items": [
          "Token penerbit bertanda tangan",
          "Gaya kustom"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "Batas per anggota dan rincian pemakaian",
          "Pemindahan kepemilikan",
          "Single sign-on"
        ]
      },
      {
        "feature": "Suara",
        "items": [
          "Alternatif untuk browser tanpa pengenalan suara (Firefox)",
          "Pemilih bahasa"
        ]
      },
      {
        "feature": "Pemeriksaan sumber",
        "items": [
          "Aktifkan pemeriksaan sumber web untuk paket berbayar setelah uji langsung"
        ]
      }
    ],
    "foot": "Ada yang Anda butuhkan tetapi belum ada? <feedback>Beri tahu kami</feedback>. Masalah keamanan dikirim ke alamat di <security>halaman keamanan</security>."
  },
  "showcase": {
    "kicker": "Etalase",
    "title": "Tanpa cahaya ungu. Tanpa kisi tiga kartu. Dibuat untuk bisnis dalam brief.",
    "lead": "Create merancang desain untuk apa yang Anda jelaskan, lalu menolak pola yang membuat situs buatan AI terlihat seragam. Demo ini menunjukkan jangkauan yang kami tuntut: daftar anggur yang ditata seperti kartu cetak, buku besar tempat sangrai kopi, papan pengiriman kurir.",
    "disclosure": "Demo etalase yang dibuat tim Keplar untuk menunjukkan apa yang dituju Create. Bukan situs pelanggan. Nama, harga, dan tanggal di dalamnya adalah contoh.",
    "sites": "situs",
    "apps": "aplikasi",
    "styles": "gaya visual",
    "industries": "industri",
    "contentNote": "Judul dan deskripsi demo dalam bahasa Inggris.",
    "galleryKicker": "Dibuat oleh pengguna Keplar",
    "gallery": "Galeri komunitas",
    "yourTurn": "Giliran Anda",
    "openCreate": "Buka Create"
  },
  "developers": {
    "kicker": "Pengembang",
    "title": "Bangun dengan Keplar.",
    "lede": "Satu permintaan mengirim pertanyaan ke beberapa model, membandingkannya, dan mengembalikan satu jawaban beserta catatan jelas tentang di mana mereka berbeda. Panggil dari server Anda dengan kunci API, atau pasang Ask yang sama di situs Anda dengan satu tag script.",
    "getKey": "Dapatkan kunci API",
    "widget": "Buat widget",
    "spec": "Spesifikasi OpenAPI",
    "endpoint": "Endpoint utama",
    "products": [
      {
        "name": "API publik",
        "text": "Kunci Bearer, jawaban JSON atau streaming, kesepakatan dan perbedaan pendapat di setiap respons."
      },
      {
        "name": "Ask yang bisa disematkan",
        "text": "Kotak Ask bertema untuk dokumentasi atau produk Anda. Termasuk daftar origin yang diizinkan dan batas laju."
      },
      {
        "name": "Keplar for Teams",
        "text": "Ruang kerja bersama dengan peran admin, editor, dan pemirsa, undangan lewat email atau tautan."
      },
      {
        "name": "Referensi",
        "text": "Bagikan tautan Anda. Anda dan teman masing-masing mendapat {n} kredit pemakaian saat ia bergabung."
      }
    ],
    "platform": "Platform",
    "refTitle": "Referensi lengkap",
    "refLede": "Paket dan batas, mulai cepat, format permintaan dan respons, streaming, widget, peran Teams, error, dan catatan keamanan ada di halaman pengembang berbahasa Inggris. Kode, nama field, dan kode error sama di semua bahasa.",
    "sections": [
      "Paket dan batas",
      "Mulai cepat",
      "POST /api/v1/ask",
      "Streaming",
      "Widget Ask sematan",
      "Keplar for Teams",
      "Error",
      "Keamanan dan privasi",
      "Belum tersedia"
    ],
    "refLink": "Buka referensi lengkap (dalam bahasa Inggris)"
  },
  "auth": {
    "signinTitle": "Masuk ke Keplar",
    "signinLead": "Lanjutkan percakapan, proyek, dan paket Anda.",
    "addTitle": "Tambahkan akun",
    "addLead": "Masuk dengan akun lain. Akun yang sedang Anda gunakan tetap masuk di perangkat ini.",
    "checkoutLead": "Masuk untuk melanjutkan ke pembayaran. Setelah itu Anda langsung menuju pembayaran.",
    "expired": "{email} telah keluar. Masuk lagi untuk menggunakannya.",
    "signupTitle": "Buat akun Keplar Anda",
    "signupLead": "Untuk PR dan keputusan besar, rencana perjalanan dan proyek sampingan, atau menjalankan bisnis. Free berjalan dengan model terbuka gratis, dan Anda bisa meningkatkan paket kapan saja.",
    "invited": "Seorang teman mengundang Anda: setelah email Anda terverifikasi, Anda berdua mendapat kredit pemakaian ekstra (bukan uang tunai). Detailnya ada di ketentuan referensi.",
    "signUp": "Daftar",
    "logIn": "Masuk",
    "toggle": "Daftar atau masuk",
    "about": "Tentang Keplar",
    "panel": {
      "signin": {
        "eyebrow": "Selamat datang kembali",
        "title": "Lanjutkan dari tempat terakhir.",
        "lead": "Percakapan, proyek, dan paket Anda menunggu, di setiap perangkat tempat Anda masuk."
      },
      "signup": {
        "eyebrow": "Akun gratis",
        "title": "Berhenti memercayai satu AI saja.",
        "lead": "Free berjalan dengan model terbuka gratis, dan Anda bisa meningkatkan paket kapan saja."
      }
    },
    "points": [
      "Bertanya ke model yang dibutuhkan pertanyaan Anda",
      "Menunjukkan di mana mereka berbeda pendapat",
      "Satu jawaban, dengan perbedaan pendapat ditampilkan"
    ]
  }
};

export default m;
