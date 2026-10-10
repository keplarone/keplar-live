// zh-tw client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "一個問題。",
      "多種智慧。",
      "一個答案。"
    ],
    "sub": "Keplar 呼叫多個 AI 模型，比較它們的觀點，給你一個清晰的綜合答案。",
    "note": "模型名稱是 Keplar 可排程的模型系列示例；由哪些模型回答取決於你的方案、問題和可用性。名稱歸其所有者所有。將在應用中開啟；在你點選傳送之前不會傳送任何內容。",
    "ask": "問 Keplar 任何問題",
    "questionLabel": "你的問題",
    "builtBy": "由 {credit} 打造",
    "tryDemo": "試用線上示範",
    "everything": "Keplar 全部功能",
    "families": "模型系列示例",
    "storyLabel": "Keplar 如何運作",
    "kickers": [
      "提問",
      "分配",
      "作答",
      "比較",
      "核實",
      "答案"
    ],
    "index": [
      "提問",
      "問題",
      "分配",
      "作答",
      "比較",
      "核實",
      "答案"
    ],
    "questionPrompt": "今年該買房，還是繼續租房？",
    "questionCaption": "一個問題進入系統。",
    "distributionTitle": "由 Keplar-One 決定問誰。",
    "distributionBody": "不是每次都問所有模型。只選這個問題需要的智慧，綜合考量品質、可靠性、延遲和成本。",
    "routeNote": "名稱僅為示例。由哪些模型回答取決於你的方案、問題和可用性。名稱歸其所有者所有。",
    "responsesTitle": "每個模型獨立作答。",
    "responsesBody": "不同的推理，不同的證據。有些回答一致，有些不一致。",
    "respondNote": "示意圖，並非實時結果。",
    "agree": "5 個一致。",
    "dissent": "1 個不同。",
    "detected": "發現分歧。",
    "follow": "Keplar 會調查原因。",
    "disagreeNote": "以示例問題作示意。數量僅為示例，並非實時結果。",
    "verificationTitle": "是評估，不是投票。",
    "verificationBody": "Keplar 權衡每個回答背後的證據和推理。相關證據彙集，矛盾被分開，噪音被濾除。少數也可能是對的。",
    "verifySteps": [
      "權衡證據",
      "分開矛盾",
      "濾除噪音"
    ],
    "closingTitle": "一個答案。",
    "convergenceBody": "基於經得起檢驗的內容綜合而成，並展示一致與分歧之處。",
    "closingSecondary": "Keplar-One 如何運作",
    "beats": {
      "question": {
        "text": "從一個問題開始。",
        "short": "從一個問題開始。"
      },
      "minds": {
        "text": "Keplar 同時詢問多個智慧。",
        "short": "多個智慧，同時作答。"
      },
      "disagree": {
        "text": "找出它們的分歧所在。",
        "short": "分歧所在。"
      },
      "verify": {
        "text": "核實哪些站得住腳。",
        "short": "站得住腳的內容。"
      },
      "answer": {
        "text": "然後給你一個值得信賴的答案。",
        "short": "一個值得信賴的答案。"
      }
    }
  },
  "demo": {
    "samples": [
      "寒冷的冬天，用熱泵還是燃氣鍋爐更省錢？",
      "兩人的初創公司應該在特拉華州註冊嗎？",
      "肌酸對記憶力有幫助，還是隻對肌肉有用？"
    ],
    "stages": {
      "understand": "正在理解問題",
      "select": "正在選擇要詢問的模型",
      "compare": "正在比較它們的回答",
      "disagree": "正在尋找分歧",
      "verify": "正在核實可靠內容",
      "synthesize": "正在寫出一個答案"
    },
    "dailyDemo": "今天的 {n} 個示範問題已用完。可以在應用中繼續，免費，無需信用卡。",
    "slowDown": "請稍等：示範每分鐘只能提幾個問題。請稍後再試。",
    "dailyFree": "今天的免費問題已用完。免費註冊即可繼續，或者明天再來。",
    "tooBig": "這個問題超出了免費額度。請試試更短的問題。",
    "offline": "無法連線到 Keplar。請檢查網路連線後重試。",
    "label": "你的問題",
    "placeholder": "問任何你會再三確認的問題。",
    "asking": "正在詢問多個模型…",
    "ask": "問 Keplar 任何問題",
    "examples": "示例問題",
    "idleHead": "你將看到",
    "disagreement": "分歧",
    "fullCard": "檢視完整答案卡片",
    "signup": "建立免費帳戶以儲存歷史記錄",
    "left": "今天還剩 {left}/{n} 個示範問題",
    "metaTail": "免費模型 · 無需帳戶",
    "models": "模型",
    "answered": "已作答",
    "consensus": "{consulted} 個模型中 {responded} 個作答 · {agree} 個一致",
    "disagreeCount": "，{n} 個不一致"
  },
  "authForm": {
    "checkEmail": "請查收郵件",
    "sentVerify": "我們已向 <b>{email}</b> 傳送驗證連結。開啟後點選“驗證並繼續”即可完成帳戶建立。連結 24 小時內有效。",
    "sentLink": "我們已向 <b>{email}</b> 傳送登入連結。開啟後點選“登入”。連結 15 分鐘內有效。",
    "notThere": "沒收到？請檢查垃圾郵件，或稍等一分鐘。如果你已有帳戶，郵件中會說明。",
    "sending": "傳送中…",
    "resendIn": "{n} 秒後可重新傳送",
    "resend": "重新傳送郵件",
    "differentEmail": "使用其他電子郵件",
    "linkInstead": "改為透過郵件接收登入連結",
    "link": "透過郵件接收登入連結",
    "oauthConsent": "使用 Google 或 Microsoft 繼續，即表示你確認已年滿 13 歲，同意<terms>條款</terms>，並已知悉<privacy>隱私政策</privacy>。",
    "or": "或使用你的電子郵件",
    "name": "姓名",
    "optional": "（可選）",
    "email": "電子郵件",
    "password": "密碼",
    "forgot": "忘記密碼？",
    "confirm": "確認密碼",
    "terms": "我已年滿 13 歲（未滿 18 歲需經父母或監護人許可），同意<terms>條款</terms>，並已閱讀<privacy>隱私政策</privacy>。",
    "remember": "在此裝置上保持登入",
    "unverified": "你的電子郵件尚未驗證。",
    "resendVerify": "重新傳送驗證郵件",
    "creating": "正在建立帳戶…",
    "loggingIn": "正在登入…",
    "create": "建立帳戶",
    "logIn": "登入",
    "noPassword": "無需密碼。我們會向你傳送一次性連結來驗證你的電子郵件地址。",
    "errEmail": "請輸入有效的電子郵件地址，例如 you@example.com。",
    "errEmailEmpty": "請輸入你的電子郵件地址。",
    "errEmailAbove": "請先在上方輸入電子郵件，再點選此按鈕。",
    "errPassword": "請輸入密碼。",
    "errWeak": "請選擇更強的密碼。",
    "errMatch": "兩次輸入的密碼不一致。",
    "errTerms": "請接受條款和隱私政策以建立帳戶。",
    "errTooMany": "登入郵件請求過多。請幾分鐘後再試。",
    "continueWith": "使用 {name} 繼續",
    "opening": "正在開啟 {name}…",
    "soon": "即將推出",
    "passkey": "使用通行金鑰登入",
    "passkeyWaiting": "正在等待你的裝置…"
  }
};

export default m;
