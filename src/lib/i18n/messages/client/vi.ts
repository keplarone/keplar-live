// vi client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "Một câu hỏi.",
      "Nhiều trí tuệ.",
      "Một câu trả lời."
    ],
    "sub": "Keplar dùng nhiều mô hình AI, so sánh góc nhìn của chúng và đưa cho bạn một câu trả lời tổng hợp rõ ràng.",
    "note": "Tên mô hình là ví dụ về các dòng mô hình Keplar có thể định tuyến tới; mô hình nào trả lời tùy vào gói của bạn, câu hỏi và tình trạng sẵn có. Các tên thuộc về chủ sở hữu tương ứng. Mở trong ứng dụng; không có gì được gửi cho đến khi bạn nhấn Gửi.",
    "ask": "Hỏi Keplar bất cứ điều gì",
    "questionLabel": "Câu hỏi của bạn",
    "builtBy": "Được xây dựng bởi {credit}",
    "tryDemo": "Dùng thử bản demo trực tiếp",
    "everything": "Mọi thứ trong Keplar",
    "families": "Ví dụ các dòng mô hình",
    "storyLabel": "Keplar hoạt động thế nào",
    "kickers": [
      "Hỏi",
      "Định tuyến",
      "Phản hồi",
      "So sánh",
      "Kiểm chứng",
      "Trả lời"
    ],
    "index": [
      "Hỏi",
      "Câu hỏi",
      "Định tuyến",
      "Phản hồi",
      "So sánh",
      "Kiểm chứng",
      "Trả lời"
    ],
    "questionPrompt": "Năm nay tôi nên mua nhà hay tiếp tục thuê?",
    "questionCaption": "Một câu hỏi đi vào hệ thống.",
    "distributionTitle": "Keplar-One quyết định hỏi ai.",
    "distributionBody": "Không phải mọi mô hình, mọi lúc. Chỉ những trí tuệ câu hỏi này cần, được cân nhắc theo chất lượng, độ tin cậy, độ trễ và chi phí.",
    "routeNote": "Tên chỉ là ví dụ. Mô hình nào trả lời tùy vào gói của bạn, câu hỏi và tình trạng sẵn có. Các tên thuộc về chủ sở hữu tương ứng.",
    "responsesTitle": "Mỗi mô hình tự trả lời.",
    "responsesBody": "Lập luận khác nhau. Bằng chứng khác nhau. Có câu trả lời trùng khớp. Có câu thì không.",
    "respondNote": "Hình minh họa, không phải kết quả thực.",
    "agree": "5 đồng ý.",
    "dissent": "1 không.",
    "detected": "Phát hiện bất đồng.",
    "follow": "Keplar tìm hiểu lý do.",
    "disagreeNote": "Minh họa với câu hỏi mẫu. Các con số chỉ là ví dụ, không phải kết quả thực.",
    "verificationTitle": "Đánh giá, không phải bỏ phiếu.",
    "verificationBody": "Keplar cân nhắc bằng chứng và lập luận đằng sau từng câu trả lời. Bằng chứng liên quan được gom lại, mâu thuẫn được tách ra, nhiễu bị loại bỏ. Thiểu số vẫn có thể đúng.",
    "verifySteps": [
      "Cân nhắc bằng chứng",
      "Tách các mâu thuẫn",
      "Loại bỏ nhiễu"
    ],
    "closingTitle": "Một câu trả lời.",
    "convergenceBody": "Tổng hợp từ những gì đứng vững, kèm theo điểm đồng thuận và bất đồng.",
    "closingSecondary": "Keplar-One hoạt động thế nào",
    "beats": {
      "question": {
        "text": "Mọi thứ bắt đầu từ một câu hỏi.",
        "short": "Bắt đầu từ một câu hỏi."
      },
      "minds": {
        "text": "Keplar hỏi nhiều trí tuệ cùng lúc.",
        "short": "Nhiều trí tuệ, cùng lúc."
      },
      "disagree": {
        "text": "Keplar tìm ra chỗ chúng bất đồng.",
        "short": "Chỗ chúng bất đồng."
      },
      "verify": {
        "text": "Keplar kiểm tra điều gì đứng vững.",
        "short": "Điều gì đứng vững."
      },
      "answer": {
        "text": "Và đưa cho bạn một câu trả lời đáng tin cậy.",
        "short": "Một câu trả lời đáng tin cậy."
      }
    }
  },
  "demo": {
    "samples": [
      "Mùa đông lạnh, chạy bơm nhiệt hay nồi hơi gas thì rẻ hơn?",
      "Startup hai người có nên thành lập công ty ở Delaware không?",
      "Creatine có giúp trí nhớ không, hay chỉ cho cơ bắp?"
    ],
    "stages": {
      "understand": "Đang hiểu câu hỏi",
      "select": "Đang chọn mô hình để hỏi",
      "compare": "Đang so sánh các câu trả lời",
      "disagree": "Đang tìm điểm bất đồng",
      "verify": "Đang kiểm tra điều gì đứng vững",
      "synthesize": "Đang viết một câu trả lời"
    },
    "dailyDemo": "Bạn đã dùng hết {n} câu hỏi demo hôm nay. Hãy tiếp tục trong ứng dụng, miễn phí, không cần thẻ.",
    "slowDown": "Chờ một chút: bản demo chỉ nhận vài câu hỏi mỗi phút. Hãy thử lại sau ít phút.",
    "dailyFree": "Bạn đã dùng hết câu hỏi miễn phí hôm nay. Đăng ký miễn phí để tiếp tục, hoặc quay lại vào ngày mai.",
    "tooBig": "Câu hỏi này cần nhiều hơn hạn mức miễn phí. Hãy thử câu ngắn hơn.",
    "offline": "Không thể kết nối tới Keplar. Hãy kiểm tra kết nối và thử lại.",
    "label": "Câu hỏi của bạn",
    "placeholder": "Hỏi bất cứ điều gì bạn muốn kiểm tra hai lần.",
    "asking": "Đang hỏi nhiều mô hình…",
    "ask": "Hỏi Keplar bất cứ điều gì",
    "examples": "Câu hỏi ví dụ",
    "idleHead": "Những gì bạn sẽ thấy",
    "disagreement": "Bất đồng",
    "fullCard": "Xem thẻ câu trả lời đầy đủ",
    "signup": "Tạo tài khoản miễn phí để lưu lịch sử",
    "left": "Còn {left}/{n} câu hỏi demo hôm nay",
    "metaTail": "mô hình miễn phí · không cần tài khoản",
    "models": "Mô hình",
    "answered": "đã trả lời",
    "consensus": "{responded}/{consulted} mô hình đã trả lời · {agree} đồng ý",
    "disagreeCount": ", {n} không đồng ý"
  },
  "authForm": {
    "checkEmail": "Kiểm tra email của bạn",
    "sentVerify": "Chúng tôi đã gửi liên kết xác minh tới <b>{email}</b>. Mở liên kết và nhấn “Xác minh và tiếp tục” để hoàn tất tạo tài khoản. Liên kết hết hạn sau 24 giờ.",
    "sentLink": "Chúng tôi đã gửi liên kết đăng nhập tới <b>{email}</b>. Mở liên kết và nhấn “Đăng nhập”. Liên kết hết hạn sau 15 phút.",
    "notThere": "Không thấy? Hãy kiểm tra thư rác, hoặc chờ một phút. Nếu bạn đã có tài khoản, email sẽ cho bạn biết.",
    "sending": "Đang gửi…",
    "resendIn": "Gửi lại sau {n} giây",
    "resend": "Gửi lại email",
    "differentEmail": "Dùng email khác",
    "linkInstead": "Gửi cho tôi liên kết đăng nhập thay thế",
    "link": "Gửi cho tôi liên kết đăng nhập",
    "oauthConsent": "Khi tiếp tục bằng Google hoặc Microsoft, bạn xác nhận mình từ 13 tuổi trở lên, đồng ý với <terms>Điều khoản</terms> và xác nhận đã biết <privacy>Chính sách quyền riêng tư</privacy>.",
    "or": "hoặc dùng email của bạn",
    "name": "Tên",
    "optional": "(không bắt buộc)",
    "email": "Email",
    "password": "Mật khẩu",
    "forgot": "Quên mật khẩu?",
    "confirm": "Xác nhận mật khẩu",
    "terms": "Tôi từ 13 tuổi trở lên (có sự cho phép của cha mẹ hoặc người giám hộ nếu dưới 18 tuổi), tôi đồng ý với <terms>Điều khoản</terms> và đã đọc <privacy>Chính sách quyền riêng tư</privacy>.",
    "remember": "Duy trì đăng nhập trên thiết bị này",
    "unverified": "Email của bạn chưa được xác minh.",
    "resendVerify": "Gửi lại email xác minh",
    "creating": "Đang tạo tài khoản…",
    "loggingIn": "Đang đăng nhập…",
    "create": "Tạo tài khoản",
    "logIn": "Đăng nhập",
    "noPassword": "Không cần mật khẩu. Chúng tôi gửi email cho bạn một liên kết dùng một lần để xác minh địa chỉ.",
    "errEmail": "Nhập địa chỉ email hợp lệ, ví dụ you@example.com.",
    "errEmailEmpty": "Nhập địa chỉ email của bạn.",
    "errEmailAbove": "Nhập email ở trên, rồi nhấn nút này lần nữa.",
    "errPassword": "Nhập mật khẩu của bạn.",
    "errWeak": "Hãy chọn mật khẩu mạnh hơn.",
    "errMatch": "Hai mật khẩu không khớp.",
    "errTerms": "Hãy chấp nhận Điều khoản và Chính sách quyền riêng tư để tạo tài khoản.",
    "errTooMany": "Đã yêu cầu quá nhiều email đăng nhập. Hãy thử lại sau vài phút.",
    "continueWith": "Tiếp tục với {name}",
    "opening": "Đang mở {name}…",
    "soon": "Sắp ra mắt",
    "passkey": "Đăng nhập bằng khóa truy cập",
    "passkeyWaiting": "Đang chờ thiết bị của bạn…"
  }
};

export default m;
