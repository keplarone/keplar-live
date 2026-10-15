// vi marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — Một câu hỏi. Nhiều trí tuệ. Một câu trả lời.",
      "description": "Keplar gửi câu hỏi của bạn tới nhiều mô hình AI, tìm chỗ chúng bất đồng, kiểm chứng và đưa cho bạn một câu trả lời tổng hợp. Dùng thử miễn phí, không cần đăng ký."
    },
    "features": {
      "title": "Mọi thứ trong Keplar",
      "description": "Mọi tính năng của Keplar trên một trang, nhóm theo mục đích: hỏi đáp, đọc tệp, tạo trang web và ứng dụng, cùng nhau xây dựng, phát hành, API và widget, và sự tin cậy. Mỗi mục đều ghi rõ đang hoạt động, beta hay sắp ra mắt."
    },
    "pricing": {
      "title": "Bảng giá: Free, Plus $45, Pro $99",
      "description": "Bắt đầu miễn phí với Keplar One. Keplar Plus giá $45/tháng, Keplar Pro giá $99/tháng, và gói Business có sẵn qua đội ngũ kinh doanh của chúng tôi. Mức sử dụng luôn hiển thị, không bao giờ bị ẩn."
    },
    "showcase": {
      "title": "Trưng bày Create: một ứng dụng làm bằng Keplar nên trông thế nào",
      "description": "Tám trang web và ứng dụng demo do đội ngũ Keplar làm để cho thấy phạm vi Create hướng tới: thực đơn, sổ cái, bảng, lịch và trang biên tập, mỗi cái có kiểu chữ và bảng màu riêng. Không phải trang của khách hàng."
    },
    "roadmap": {
      "title": "Lộ trình",
      "description": "Keplar đang xây dựng gì, điều gì đang ở bản beta và đang hoàn thiện, và điều gì vừa ra mắt. Không có ngày mục tiêu mà chúng tôi không thể giữ."
    },
    "developers": {
      "title": "Keplar cho nhà phát triển: API, Ask nhúng được, Teams",
      "description": "Hỏi Keplar từ mã của bạn bằng khóa API Bearer, hoặc đặt widget Ask lên trang của bạn bằng một thẻ script. Đặc tả OpenAPI, truyền phát, giới hạn theo gói được nêu rõ ràng."
    },
    "signin": {
      "title": "Đăng nhập",
      "description": "Đăng nhập vào Keplar."
    },
    "signup": {
      "title": "Tạo tài khoản",
      "description": "Tạo tài khoản Keplar miễn phí."
    }
  },
  "status": {
    "live": "Đang hoạt động",
    "beta": "Beta",
    "soon": "Sắp ra mắt"
  },
  "chapters": {
    "demoKicker": "Bản demo trực tiếp",
    "demoTitle": "Thử ngay tại đây. Không cần tài khoản.",
    "proof": "Được xây dựng bởi {credit}. Phát triển công khai: <changelog>nhật ký thay đổi</changelog>, <roadmap>lộ trình</roadmap>, và một <security>trang bảo mật</security> nói rõ điều gì đã làm và chưa làm.",
    "showcaseNote": "Các bản demo trưng bày do đội ngũ Keplar làm, không phải trang của khách hàng. <link>Xem cả tám</link>",
    "closeTitle": "Hỏi Keplar bất cứ điều gì.",
    "closeCta": "Hỏi Keplar bất cứ điều gì",
    "closeSmall": "Miễn phí, không cần thẻ. <link>Mọi thứ trong Keplar trên một trang</link>, kèm điều gì đang hoạt động, beta và sắp ra mắt.",
    "voiceCaption": "Voice Live Create: bạn nói, và trình soạn thảo, terminal và bản xem trước cùng chuyển động. Dừng lại thì nó chờ; nói \"à không\" thì nó sửa.",
    "voiceLabel": "Voice Live Create: trình soạn thảo, terminal và bản xem trước trực tiếp đặt cạnh nhau",
    "list": {
      "ask": {
        "label": "Hỏi",
        "title": "Hỏi Keplar bất cứ điều gì.",
        "lede": "Một câu hỏi được gửi tới nhiều mô hình AI. Keplar so sánh chúng, chỉ ra chỗ bất đồng, kiểm tra điều gì đứng vững và viết một câu trả lời."
      },
      "understand": {
        "label": "Hiểu",
        "title": "Nó đọc những gì bạn đưa.",
        "lede": "Thả vào thứ bạn đang hỏi. Keplar chỉ đọc nó cho câu hỏi đó và không giữ lại tệp."
      },
      "create": {
        "label": "Tạo",
        "title": "Mô tả, hoặc nói ra. Nhận về thứ không trông như máy tạo.",
        "lede": "Create lên thiết kế cho doanh nghiệp trong yêu cầu của bạn, viết mã, kiểm thử mọi màn hình và từ chối ánh tím, mảng gradient và lưới ba thẻ."
      },
      "together": {
        "label": "Cùng xây dựng",
        "title": "Làm cùng ai đó, và cùng một nhà phê bình.",
        "lede": "Cùng làm một dự án vào cùng lúc, và nhận ý kiến thứ hai không phải của chính bạn."
      },
      "ship": {
        "label": "Phát hành",
        "title": "Xuất bản trong một bước. Hoàn tác trong một bước.",
        "lede": "Dự án của bạn lên mạng tại một địa chỉ Keplar, với tên miền riêng khi bạn muốn."
      },
      "platform": {
        "label": "Nền tảng",
        "title": "Dùng Keplar ở bất cứ đâu.",
        "lede": "Cùng một bộ máy, sau một API, trong trình duyệt của bạn, trong widget trên trang của bạn, và dùng chung cả nhóm."
      },
      "trust": {
        "label": "Tin cậy",
        "title": "Thẳng thắn về những gì nó làm, và về dữ liệu của bạn.",
        "lede": "Chúng tôi bảo vệ gì, bằng cách nào, và điều gì chưa làm, đều được viết ra. Không có huy hiệu nào chúng tôi chưa đạt được."
      }
    },
    "items": {
      "demo": {
        "name": "Bản demo trực tiếp",
        "line": "Đặt một câu hỏi thật ngay trên trang này. Không cần tài khoản."
      },
      "multi-model": {
        "name": "Nhiều mô hình, một câu trả lời",
        "line": "Chỉ những mô hình câu hỏi cần, so sánh từng luận điểm."
      },
      "disagreement": {
        "name": "Bản đồ bất đồng",
        "line": "Các mô hình đồng ý ở đâu, chia rẽ ở đâu, và vì sao câu trả lời đi theo hướng đó."
      },
      "debate": {
        "name": "Chế độ tranh luận",
        "line": "Xem các mô hình tranh luận qua nhiều vòng trước khi Keplar trả lời."
      },
      "voice": {
        "name": "Chế độ giọng nói",
        "line": "Hỏi thành tiếng, nghe câu trả lời được đọc lại. Keplar không bao giờ ghi âm hay lưu âm thanh của bạn."
      },
      "live-research": {
        "name": "Nghiên cứu trực tiếp",
        "line": "Trong ứng dụng máy tính, Keplar tìm kiếm trên web và đọc các trang ngay trên máy của bạn, rồi trích dẫn từng trang và kiểm tra các trích dẫn.",
        "note": "Ứng dụng máy tính 0.2.0 trở lên."
      },
      "images": {
        "name": "Hình ảnh và ảnh chụp màn hình",
        "line": "Biểu đồ, hóa đơn, bảng trắng, giao diện. Chỉ gửi tới các mô hình nhìn được."
      },
      "video": {
        "name": "Video",
        "line": "Khung hình chính được lấy mẫu ngay trong trình duyệt; bản thân đoạn video không được tải lên."
      },
      "docs": {
        "name": "Tài liệu, mã và dữ liệu",
        "line": "PDF, văn bản, CSV, JSON và tệp mã nguồn, được đọc dưới dạng văn bản."
      },
      "office": {
        "name": "Word, PowerPoint, Excel và âm thanh",
        "line": "Tệp Office được phân tích an toàn; âm thanh được chép lời."
      },
      "links": {
        "name": "Liên kết",
        "line": "Dán URL và Keplar đọc trang qua một lượt tải có bảo vệ."
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "Nói và xem trình soạn thảo, terminal và bản xem trước được dựng cùng lúc. Nói \"à không\" để đổi hướng.",
        "note": "Cần trình duyệt có nhận dạng giọng nói (Chrome, Edge, Safari)."
      },
      "showcase": {
        "name": "Trưng bày",
        "line": "Tám bản demo của đội ngũ Keplar đặt ra tiêu chuẩn cho Create."
      },
      "surprise": {
        "name": "Gây bất ngờ cho tôi",
        "line": "Một lần nhấn: yêu cầu, phong cách và độ chi tiết cụ thể, được dựng cho bạn."
      },
      "versions": {
        "name": "Lịch sử phiên bản",
        "line": "Mỗi lần dựng là một phiên bản. Khôi phục bất kỳ bản nào, hoặc tách nhánh thành bản nháp mới."
      },
      "community": {
        "name": "Thư viện cộng đồng",
        "line": "Các trang mọi người chọn chia sẻ. Thích, remix, báo cáo."
      },
      "anti-vibe": {
        "name": "Quy tắc thiết kế chống rập khuôn",
        "line": "Một bộ tiêu chí thành văn và bước lint loại bỏ vẻ AI quen thuộc trước khi bạn kịp thấy."
      },
      "collab": {
        "name": "Cộng tác thời gian thực",
        "line": "Mời bằng liên kết và cùng sửa một dự án: con trỏ trực tiếp, chế độ theo dõi, terminal và bản xem trước dùng chung.",
        "note": "Mở một ứng dụng trong Create, rồi chọn Live. Người xem chỉ xem; người sửa có thể gõ."
      },
      "critic": {
        "name": "Nhà phê bình AI",
        "line": "Quy tắc, axe-core trong trình duyệt thật và một mô hình riêng xem xét bản dựng của bạn, rồi áp dụng các bản sửa bạn chọn."
      },
      "publish": {
        "name": "Xuất bản một lần nhấp",
        "line": "Xuất bản bản nháp lên địa chỉ trực tiếp ngay từ Create."
      },
      "previews": {
        "name": "Bản xem trước",
        "line": "Mỗi bản nháp có liên kết xem trước riêng tư trước khi lên mạng."
      },
      "rollback": {
        "name": "Quay lui",
        "line": "Khôi phục phiên bản trước nếu một thay đổi gặp trục trặc."
      },
      "domains": {
        "name": "Tên miền tùy chỉnh",
        "line": "Kết nối tên miền bạn sở hữu; Keplar kiểm tra DNS và cho bạn biết cần sửa gì."
      },
      "ssl": {
        "name": "HTTPS tự động",
        "line": "Chứng chỉ được cấp và gia hạn cho các tên miền đã kết nối."
      },
      "api": {
        "name": "API công khai",
        "line": "Khóa Bearer, giới hạn theo gói, đặc tả OpenAPI. Khóa miễn phí chỉ dùng mô hình miễn phí."
      },
      "embed": {
        "name": "Widget nhúng",
        "line": "Một thẻ script đặt Keplar Ask lên trang của bạn, giới hạn ở các nguồn bạn cho phép."
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "Không gian làm việc chung với vai trò chủ sở hữu, quản trị viên, người sửa và người xem.",
        "note": "Gói Business."
      },
      "referrals": {
        "name": "Chương trình giới thiệu",
        "line": "Mời bạn bè; cả hai đều được thêm mức sử dụng, không bao giờ là tiền mặt."
      },
      "roblox-studio": {
        "name": "Chế độ Roblox Studio",
        "line": "Người cùng xây dựng ngay trong Roblox Studio: bản đồ, UI, hiệu ứng flipbook và script Luau, với Claude Opus 5.5.",
        "note": "Ứng dụng máy tính, từ gói Lite trở lên."
      },
      "roblox-cloud": {
        "name": "Roblox Cloud",
        "line": "Làm việc qua đêm trên script của game, mỗi chỉnh sửa được bộ phân tích Luau kiểm tra, áp dụng vào Studio khi bạn đồng ý.",
        "note": "Chỉ script; không thể chơi thử."
      },
      "blender": {
        "name": "Chế độ Blender",
        "line": "Dựng mô hình, phủ texture bằng bộ PBR của Poly Haven, chiếu sáng và xuất trong Blender 4.2 trở lên.",
        "note": "Ứng dụng máy tính 0.1.8 trở lên."
      },
      "blender-cloud": {
        "name": "Render bằng Blender Cloud",
        "line": "Render cảnh trên máy chủ của Keplar khi máy tính đã tắt, rồi tải các khung hình và một video MP4.",
        "note": "Ứng dụng máy tính 0.1.10 trở lên."
      },
      "extension": {
        "name": "Tiện ích trình duyệt Keplar One",
        "line": "Hỏi về đoạn chữ đã chọn hoặc cả trang từ Chrome hay Edge, bằng khóa API của bạn.",
        "note": "Đã gửi lên Chrome Web Store."
      },
      "lens": {
        "name": "Search with Keplar One",
        "line": "Kéo qua bất kỳ chữ hay hình nào trên trang; câu trả lời mở trong bảng bên cạnh.",
        "note": "Một phần của tiện ích trình duyệt."
      },
      "security": {
        "name": "Bảo mật",
        "line": "Mã hóa, nhà cung cấp, thời gian lưu giữ, bảo vệ tài khoản và cách báo cáo sự cố."
      },
      "changelog": {
        "name": "Nhật ký thay đổi",
        "line": "Đã ra mắt gì, khi nào."
      },
      "roadmap": {
        "name": "Lộ trình",
        "line": "Chúng tôi sẽ xây gì tiếp theo, và điều gì chưa hoạt động."
      }
    }
  },
  "featuresPage": {
    "kicker": "Mọi thứ trong Keplar",
    "crumb": "Tính năng",
    "title": "Mọi tính năng, và liệu bạn có dùng được hôm nay.",
    "lead": "<b>{live}</b> đang hoạt động, <b>{beta}</b> beta, <b>{soon}</b> sắp ra mắt. Beta dùng được nhưng có thể thay đổi hoặc chỉ dành cho một số gói. Sắp ra mắt thì chưa dùng được và không được liên kết như thể đã dùng được.",
    "sections": "Mục",
    "thFeature": "Tính năng",
    "thWhat": "Chức năng",
    "thStatus": "Trạng thái",
    "foot": "Thay đổi gần đây: <changelog>nhật ký thay đổi</changelog>. Sắp tới: <roadmap>lộ trình</roadmap>. Sẵn sàng thử: <demo>đặt câu hỏi trên trang chủ</demo>, không cần tài khoản."
  },
  "pricing": {
    "label": "Bảng giá",
    "title": "Bắt đầu miễn phí. Nâng cấp khi cần thêm.",
    "lede": "Bắt đầu miễn phí cho các câu hỏi hằng ngày. Nâng cấp để dùng mô hình cao cấp, Deep Research, và tạo trang web, hình ảnh, video. Bạn điều hành doanh nghiệp? Business được may đo cho bạn. Mức sử dụng Keplar được tính bằng tín dụng, không phải token thô.",
    "tailored": "May đo cho doanh nghiệp của bạn",
    "custom": "Tùy chỉnh",
    "cadence": {
      "forever": "mãi mãi",
      "per month": "mỗi tháng",
      "custom": "tùy chỉnh"
    },
    "perMonth": "{price}/tháng",
    "fine": "Hủy bất cứ lúc nào trong tài khoản. Thanh toán do Whop xử lý. Tín dụng được làm mới mỗi tháng và được dùng theo lượng công việc mô hình mà câu hỏi cần: câu hỏi đơn giản tốn rất ít.",
    "tiers": {
      "free": {
        "summary": "Câu hỏi hằng ngày với Keplar-One, trên các mô hình mở miễn phí.",
        "features": [
          "Điều phối Keplar-One",
          "Chỉ mô hình mở miễn phí",
          "Có thể chậm hơn khi mô hình miễn phí đang bận",
          "Nơi lưu trữ mô hình miễn phí có thể ghi lại prompt",
          "Đồng thuận có giới hạn",
          "Không tra cứu web",
          "Tối đa 50 câu hỏi mỗi ngày (sử dụng hợp lý)",
          "Câu hỏi về hình ảnh và video trên mô hình thị giác miễn phí",
          "Chế độ học: tải lên PDF dạng văn bản để có thẻ ghi nhớ, bài kiểm tra và kế hoạch học (mô hình miễn phí, giới hạn nhỏ hơn)",
          "Lưu cuộc trò chuyện và bộ nhớ tùy chọn khi đăng nhập"
        ],
        "cta": "Dùng thử Keplar"
      },
      "lite": {
        "summary": "Bước tiếp theo sau Free: mô hình cao cấp cho câu hỏi hằng ngày, với giá thấp hơn.",
        "features": [
          "Mô hình cao cấp và đồng thuận Keplar-One",
          "2.400 tín dụng mỗi tháng với giới hạn 5 giờ và giới hạn hằng tuần",
          "Hỗ trợ lập trình và phân tích tệp",
          "Chế độ học trên mô hình mạnh hơn",
          "Tạo một trang cá nhân nhỏ (địa chỉ keplar.site miễn phí)",
          "Tạo hình ảnh, Slides, Deep Research, video, tác tử và tên miền tùy chỉnh bắt đầu từ Plus"
        ],
        "cta": "Nâng cấp lên Lite"
      },
      "plus": {
        "summary": "Cho việc dùng hằng ngày: học tập, công việc, câu hỏi sức khỏe và quyết định lớn.",
        "features": [
          "Mô hình cao cấp và Keplar-One nâng cao",
          "Hạn mức đồng thuận lớn hơn",
          "Deep Research cho quyết định lớn",
          "Hỗ trợ lập trình và phân tích tệp",
          "Tra cứu web tắt theo mặc định (chưa hoạt động)",
          "Tạo trang web và ứng dụng cá nhân",
          "Tạo trình chiếu với xuất PowerPoint và PDF (ý tưởng hình ảnh là chỗ giữ chỗ)",
          "Chế độ học trên mô hình mạnh hơn với giới hạn lớn hơn",
          "Tạo hình ảnh",
          "Ngữ cảnh lớn hơn và ưu tiên sử dụng"
        ],
        "cta": "Nâng cấp lên Plus"
      },
      "pro": {
        "summary": "Cho người dùng chuyên sâu và nhà sáng tạo: nhiều hơn hẳn về mức dùng, sáng tạo và tác tử.",
        "features": [
          "Mọi thứ trong Plus",
          "Hơn gấp đôi tín dụng hằng tháng",
          "Tạo video",
          "Tạo trình chiếu và chế độ học với giới hạn lớn nhất",
          "Sáng tạo nâng cao",
          "Tác tử nâng cao",
          "Ngữ cảnh lớn hơn",
          "Ưu tiên và số tác vụ đồng thời cao hơn"
        ],
        "cta": "Nâng cấp lên Pro"
      }
    },
    "seeAll": "Xem mọi thứ trong {plan}",
    "showLess": "Thu gọn",
    "fitTitle": "Gói nào phù hợp?",
    "fits": {
      "free": {
        "who": "Bạn muốn xem nó hoạt động ra sao.",
        "outcome": "Hỏi các câu hằng ngày trên mô hình miễn phí, tối đa 50 câu mỗi ngày. Không cần thẻ.",
        "cta": "Hỏi Keplar bất cứ điều gì"
      },
      "plus": {
        "who": "Bạn dùng AI mỗi ngày cho học tập, công việc hoặc quyết định lớn.",
        "outcome": "Mô hình cao cấp, Deep Research, Slides, tạo hình ảnh và tên miền tùy chỉnh cho những gì bạn xây dựng.",
        "cta": "Nâng cấp lên Plus"
      },
      "pro": {
        "who": "Bạn xây dựng và sáng tạo rất nhiều.",
        "outcome": "Hơn gấp đôi tín dụng của Plus, video, nhiều dự án và tác tử hơn, và ưu tiên cao hơn.",
        "cta": "Nâng cấp lên Pro"
      }
    },
    "compareTitle": "So sánh mọi gói",
    "compareLede": "Bảng so sánh đầy đủ từng tính năng, với mọi giới hạn sản phẩm đang áp dụng hôm nay, nằm ở trang bảng giá tiếng Anh.",
    "compareLink": "Xem so sánh đầy đủ (tiếng Anh)",
    "closingTitle": "Chưa chắc? Hãy bắt đầu miễn phí.",
    "closingLede": "Đặt một câu hỏi thật và xem các mô hình đồng ý ở đâu, chia rẽ ở đâu. Không cần thẻ, và bạn có thể nâng cấp ngay trong ứng dụng khi cần thêm.",
    "closingAsk": "Hỏi Keplar bất cứ điều gì",
    "closingCompare": "Keplar so với các lựa chọn khác"
  },
  "roadmap": {
    "kicker": "Lộ trình",
    "title": "Chúng tôi đang xây gì, và điều gì chưa xong.",
    "lead": "Không có ngày mục tiêu: mọi thứ ra mắt khi đã chạy được. Mọi mục dưới đây hoặc đang được xây, hoặc đã dùng được ở bản beta với các thiếu sót đã biết. Những gì đã ra mắt, xem <changelog>nhật ký thay đổi</changelog>; danh sách đầy đủ kèm trạng thái, xem <features>mọi thứ trong Keplar</features>.",
    "nowNum": "Hiện tại",
    "nowTitle": "Đang xây dựng",
    "nowLede": "Chưa dùng được. Được ghi là Sắp ra mắt ở mọi nơi trên trang.",
    "nextNum": "Tiếp theo",
    "nextTitle": "Hoàn thiện các tính năng beta",
    "nextLede": "Những thứ này dùng được hôm nay. Đây là những gì còn thiếu.",
    "doneNum": "Đã ra mắt",
    "doneTitle": "Gần đây",
    "doneLede": "Vài bản phát hành gần nhất. Ngày lấy từ lịch sử commit.",
    "englishNote": "Ghi chú phát hành bằng tiếng Anh.",
    "finishing": [
      {
        "feature": "API công khai",
        "items": [
          "Khóa cấp nhóm",
          "Trần tín dụng theo từng khóa",
          "SDK chính thức",
          "Webhook"
        ]
      },
      {
        "feature": "Widget nhúng",
        "items": [
          "Token nhà xuất bản có chữ ký",
          "Tùy chỉnh giao diện"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "Trần theo thành viên và chi tiết mức sử dụng",
          "Chuyển quyền sở hữu",
          "Đăng nhập một lần"
        ]
      },
      {
        "feature": "Giọng nói",
        "items": [
          "Phương án dự phòng cho trình duyệt không có nhận dạng giọng nói (Firefox)",
          "Bộ chọn ngôn ngữ"
        ]
      },
      {
        "feature": "Kiểm tra nguồn",
        "items": [
          "Bật kiểm tra nguồn web cho các gói trả phí sau khi thử nghiệm thực tế"
        ]
      }
    ],
    "foot": "Thiếu thứ bạn cần? <feedback>Hãy cho chúng tôi biết</feedback>. Vấn đề bảo mật xin gửi tới địa chỉ trên <security>trang bảo mật</security>."
  },
  "showcase": {
    "kicker": "Trưng bày",
    "title": "Không ánh tím. Không lưới ba thẻ. Được dựng cho doanh nghiệp trong yêu cầu.",
    "lead": "Create lên thiết kế cho những gì bạn mô tả, rồi từ chối các khuôn mẫu khiến trang web làm bằng AI trông giống hệt nhau. Các bản demo này cho thấy phạm vi chúng tôi đòi hỏi: danh sách rượu vang trình bày như thẻ in, sổ cái của xưởng rang cà phê, bảng điều phối giao hàng.",
    "disclosure": "Các bản demo trưng bày do đội ngũ Keplar làm để cho thấy Create hướng tới điều gì. Không phải trang của khách hàng. Tên, giá và ngày bên trong là nội dung mẫu.",
    "sites": "trang web",
    "apps": "ứng dụng",
    "styles": "phong cách thị giác",
    "industries": "ngành",
    "contentNote": "Tiêu đề và mô tả demo bằng tiếng Anh.",
    "galleryKicker": "Do người dùng Keplar làm",
    "gallery": "Thư viện cộng đồng",
    "yourTurn": "Đến lượt bạn",
    "openCreate": "Mở Create"
  },
  "developers": {
    "kicker": "Nhà phát triển",
    "title": "Xây dựng với Keplar.",
    "lede": "Một yêu cầu gửi câu hỏi tới nhiều mô hình, so sánh chúng và trả về một câu trả lời kèm bản ghi rõ ràng về chỗ chúng bất đồng. Gọi từ máy chủ của bạn bằng khóa API, hoặc đặt cùng Ask đó lên trang của bạn bằng một thẻ script.",
    "getKey": "Lấy khóa API",
    "widget": "Tạo widget",
    "spec": "Đặc tả OpenAPI",
    "endpoint": "Endpoint chính",
    "products": [
      {
        "name": "API công khai",
        "text": "Khóa Bearer, câu trả lời JSON hoặc truyền phát, đồng thuận và bất đồng trong mọi phản hồi."
      },
      {
        "name": "Ask nhúng được",
        "text": "Hộp Ask có thể đổi giao diện cho tài liệu hoặc sản phẩm của bạn. Kèm danh sách nguồn được phép và giới hạn tần suất."
      },
      {
        "name": "Keplar for Teams",
        "text": "Không gian làm việc chung với vai trò quản trị viên, người sửa và người xem, mời qua email hoặc liên kết."
      },
      {
        "name": "Giới thiệu",
        "text": "Chia sẻ liên kết của bạn. Bạn và người bạn mỗi người nhận {n} tín dụng sử dụng khi họ tham gia."
      }
    ],
    "platform": "Nền tảng",
    "refTitle": "Tài liệu tham khảo đầy đủ",
    "refLede": "Các gói và giới hạn, bắt đầu nhanh, định dạng yêu cầu và phản hồi, truyền phát, widget, vai trò Teams, lỗi và ghi chú bảo mật nằm ở trang nhà phát triển tiếng Anh. Mã, tên trường và mã lỗi giống nhau ở mọi ngôn ngữ.",
    "sections": [
      "Các gói và giới hạn",
      "Bắt đầu nhanh",
      "POST /api/v1/ask",
      "Truyền phát",
      "Widget Ask nhúng",
      "Keplar for Teams",
      "Lỗi",
      "Bảo mật và quyền riêng tư",
      "Chưa có"
    ],
    "refLink": "Mở tài liệu tham khảo đầy đủ (tiếng Anh)"
  },
  "auth": {
    "signinTitle": "Đăng nhập vào Keplar",
    "signinLead": "Tiếp tục các cuộc trò chuyện, dự án và gói của bạn.",
    "addTitle": "Thêm tài khoản",
    "addLead": "Đăng nhập bằng tài khoản khác. Tài khoản bạn đang dùng vẫn được đăng nhập trên thiết bị này.",
    "checkoutLead": "Đăng nhập để tiếp tục thanh toán. Sau đó bạn sẽ chuyển thẳng tới bước thanh toán.",
    "expired": "{email} đã bị đăng xuất. Hãy đăng nhập lại để sử dụng.",
    "signupTitle": "Tạo tài khoản Keplar",
    "signupLead": "Cho bài tập và những quyết định lớn, kế hoạch du lịch và dự án phụ, hay điều hành doanh nghiệp. Free chạy trên các mô hình mở miễn phí, và bạn có thể nâng cấp bất cứ lúc nào.",
    "invited": "Một người bạn đã mời bạn: khi email của bạn được xác minh, cả hai đều nhận thêm tín dụng sử dụng (không bao giờ là tiền mặt). Chi tiết trong điều khoản giới thiệu.",
    "signUp": "Đăng ký",
    "logIn": "Đăng nhập",
    "toggle": "Đăng ký hoặc đăng nhập",
    "about": "Giới thiệu Keplar",
    "panel": {
      "signin": {
        "eyebrow": "Chào mừng trở lại",
        "title": "Tiếp tục từ chỗ bạn dừng lại.",
        "lead": "Các cuộc trò chuyện, dự án và gói của bạn đang chờ, trên mọi thiết bị bạn đăng nhập."
      },
      "signup": {
        "eyebrow": "Tài khoản miễn phí",
        "title": "Đừng chỉ tin vào một AI.",
        "lead": "Free chạy trên các mô hình mở miễn phí, và bạn có thể nâng cấp bất cứ lúc nào."
      }
    },
    "points": [
      "Hỏi những mô hình câu hỏi của bạn cần",
      "Cho bạn thấy chúng bất đồng ở đâu",
      "Một câu trả lời, kèm các điểm bất đồng"
    ]
  }
};

export default m;
