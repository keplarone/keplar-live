// zh-tw marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — 一個問題。多種智慧。一個答案。",
      "description": "Keplar 把你的問題發給多個 AI 模型，找出它們的分歧並加以核實，給你一個綜合後的答案。免費試用，無需註冊。"
    },
    "features": {
      "title": "Keplar 全部功能",
      "description": "Keplar 的每項功能都在這一頁，按用途分組：提問、讀取檔案、建立網站和應用、協作、發布、API 和小元件，以及信任。每項都註明是已上線、測試版還是即將推出。"
    },
    "pricing": {
      "title": "價格：Free、Plus $45、Pro $99",
      "description": "免費開始使用 Keplar One。Keplar Plus 每月 $45，Keplar Pro 每月 $99，Business 方案可透過我們的銷售團隊獲取。用量清晰可見，從不隱藏。"
    },
    "showcase": {
      "title": "Create 作品展示：用 Keplar 構建的應用應有的樣子",
      "description": "Keplar 團隊製作的八個示範網站和應用，展示 Create 追求的廣度：選單、帳本、看板、日曆和編輯類頁面，各有自己的字型和配色。不是客戶網站。"
    },
    "roadmap": {
      "title": "路線圖",
      "description": "Keplar 正在構建什麼，哪些處於測試版仍在完善，最近發布了什麼。不寫我們無法兌現的目標日期。"
    },
    "developers": {
      "title": "面向開發者的 Keplar：API、可嵌入的 Ask、Teams",
      "description": "用 Bearer API 金鑰在你自己的程式碼中向 Keplar 提問，或用一個 script 標籤把 Ask 小元件放到你的網站上。OpenAPI 規範、流式傳輸，各方案限制清楚列明。"
    },
    "signin": {
      "title": "登入",
      "description": "登入 Keplar。"
    },
    "signup": {
      "title": "建立帳戶",
      "description": "建立免費的 Keplar 帳戶。"
    }
  },
  "status": {
    "live": "已上線",
    "beta": "測試版",
    "soon": "即將推出"
  },
  "chapters": {
    "demoKicker": "線上示範",
    "demoTitle": "就在這裡試試。無需帳戶。",
    "proof": "由 {credit} 打造。公開開發：<changelog>更新日誌</changelog>、<roadmap>路線圖</roadmap>，以及說明哪些已完成、哪些未完成的<security>安全頁面</security>。",
    "showcaseNote": "展示中的示範由 Keplar 團隊製作，不是客戶網站。<link>檢視全部八個</link>",
    "closeTitle": "問 Keplar 任何問題。",
    "closeCta": "問 Keplar 任何問題",
    "closeSmall": "免費，無需信用卡。<link>Keplar 全部功能一頁看完</link>，並註明哪些已上線、測試版和即將推出。",
    "voiceCaption": "Voice Live Create：開口說話，編輯器、終端和預覽同步變化。停下它就等著；說“其實”它就修改。",
    "voiceLabel": "Voice Live Create：編輯器、終端和實時預覽並排顯示",
    "list": {
      "ask": {
        "label": "提問",
        "title": "問 Keplar 任何問題。",
        "lede": "一個問題發給多個 AI 模型。Keplar 比較它們，指出分歧，核實哪些站得住腳，然後寫出一個答案。"
      },
      "understand": {
        "label": "理解",
        "title": "它會讀你給它的內容。",
        "lede": "把你要問的東西拖進來。Keplar 只為這個問題讀取它，不保留檔案。"
      },
      "create": {
        "label": "建立",
        "title": "寫出來，或說出來。得到不像是生成出來的作品。",
        "lede": "Create 根據你描述的業務規劃設計，編寫程式碼，測試每個頁面，並拒絕紫色光暈、漸層色塊和三卡片網格。"
      },
      "together": {
        "label": "一起構建",
        "title": "和別人一起做，再加一位評審。",
        "lede": "同時編輯同一個專案，並獲得來自你之外的第二意見。"
      },
      "ship": {
        "label": "發布",
        "title": "一步發布。一步撤銷。",
        "lede": "你的專案會在 Keplar 網址上線，需要時也可以用你自己的網域。"
      },
      "platform": {
        "label": "平臺",
        "title": "隨處使用 Keplar。",
        "lede": "同一個引擎，可透過 API 呼叫，在你的瀏覽器裡，嵌在你網站的小元件裡，也可以在團隊中共享。"
      },
      "trust": {
        "label": "信任",
        "title": "坦白它做什麼，以及如何對待你的資料。",
        "lede": "我們保護什麼、怎麼保護、還有什麼沒做，都寫得明明白白。不掛沒拿到的徽章。"
      }
    },
    "items": {
      "demo": {
        "name": "線上示範",
        "line": "在本頁問一個真實問題。無需帳戶。"
      },
      "multi-model": {
        "name": "多個模型，一個答案",
        "line": "只用問題需要的模型，逐條論點比較。"
      },
      "disagreement": {
        "name": "分歧圖",
        "line": "模型在哪裡一致、在哪裡分歧，以及答案為何如此。"
      },
      "debate": {
        "name": "辯論模式",
        "line": "在 Keplar 作答前，看模型分輪辯論。"
      },
      "voice": {
        "name": "語音模式",
        "line": "開口提問，聽答案朗讀。Keplar 從不錄製或儲存你的音訊。"
      },
      "live-research": {
        "name": "即時研究",
        "line": "在桌面應用程式中，Keplar 會搜尋網路並在你的電腦上讀取網頁，然後為每個網頁標註引用並核對引用。",
        "note": "桌面應用程式 0.2.0 或更新版本。"
      },
      "images": {
        "name": "圖片和截圖",
        "line": "圖表、收據、白板、介面。只發給能看圖的模型。"
      },
      "video": {
        "name": "影片",
        "line": "關鍵幀在你的瀏覽器中抽取，影片本身不會上傳。"
      },
      "docs": {
        "name": "文件、程式碼和資料",
        "line": "PDF、文字、CSV、JSON 和原始碼檔案，以文字形式讀取。"
      },
      "office": {
        "name": "Word、PowerPoint、Excel 和音訊",
        "line": "安全解析 Office 檔案；音訊會轉寫成文字。"
      },
      "links": {
        "name": "連結",
        "line": "貼上網址，Keplar 透過受保護的抓取讀取頁面。"
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "開口說話，看編輯器、終端和預覽同時搭建。說“其實”即可改變方向。",
        "note": "需要支援語音識別的瀏覽器（Chrome、Edge、Safari）。"
      },
      "showcase": {
        "name": "作品展示",
        "line": "Keplar 團隊的八個示範，為 Create 設定標準。"
      },
      "surprise": {
        "name": "給我驚喜",
        "line": "一鍵生成：具體的需求、風格和深度，為你構建。"
      },
      "versions": {
        "name": "版本歷史",
        "line": "每次構建都是一個版本。可恢復任一版本，或分支成新草稿。"
      },
      "community": {
        "name": "社群畫廊",
        "line": "大家選擇分享的網站。點贊、二次創作、舉報。"
      },
      "anti-vibe": {
        "name": "反模板化設計規則",
        "line": "成文的評分標準和 lint 檢查，在你看到之前就拒絕常見的 AI 風格。"
      },
      "collab": {
        "name": "實時協作",
        "line": "透過連結邀請，一起編輯同一個專案：實時游標、跟隨模式、共享終端和預覽。",
        "note": "在 Create 中開啟應用，然後選擇 Live。檢視者可觀看，編輯者可輸入。"
      },
      "critic": {
        "name": "AI 評審",
        "line": "規則、真實瀏覽器中的 axe-core 和另一個模型審查你的構建，然後應用你選擇的修復。"
      },
      "publish": {
        "name": "一鍵發布",
        "line": "從 Create 把草稿發布到線上網址。"
      },
      "previews": {
        "name": "預覽",
        "line": "每個草稿在上線前都有私密預覽連結。"
      },
      "rollback": {
        "name": "回滾",
        "line": "改動出錯時恢復上一個版本。"
      },
      "domains": {
        "name": "自訂網域",
        "line": "連線你擁有的網域；Keplar 會檢查 DNS 並告訴你需要改什麼。"
      },
      "ssl": {
        "name": "自動 HTTPS",
        "line": "為已連線的網域簽發和續期證書。"
      },
      "api": {
        "name": "公開 API",
        "line": "Bearer 金鑰、按方案限制、OpenAPI 規範。免費金鑰僅使用免費模型。"
      },
      "embed": {
        "name": "可嵌入小元件",
        "line": "一個 script 標籤就能把 Keplar Ask 放到你的網站上，僅限你允許的來源。"
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "共享工作區，包含所有者、管理員、編輯者和檢視者角色。",
        "note": "Business 方案。"
      },
      "referrals": {
        "name": "推薦計畫",
        "line": "邀請好友，你們都能獲得額外用量，絕不是現金。"
      },
      "roblox-studio": {
        "name": "Roblox Studio 模式",
        "line": "Roblox Studio 裡的共同建造者：地圖、介面、序列幀特效和 Luau 腳本，由 Claude Opus 5.5 驅動。",
        "note": "桌面應用程式，Lite 以上。"
      },
      "roblox-cloud": {
        "name": "Roblox Cloud",
        "line": "整夜處理你遊戲的腳本，每處修改都經 Luau 分析器檢查，由你決定何時在 Studio 中套用。",
        "note": "只處理腳本；無法試玩測試。"
      },
      "blender": {
        "name": "Blender 模式",
        "line": "在 Blender 4.2 或更新版本中建模、用 Poly Haven 的 PBR 材質貼圖、打光並匯出。",
        "note": "桌面應用程式 0.1.8 或更新版本。"
      },
      "blender-cloud": {
        "name": "Blender Cloud 雲端算圖",
        "line": "關掉電腦也能在 Keplar 的伺服器上算圖，之後下載各影格和一支 MP4 影片。",
        "note": "桌面應用程式 0.1.10 或更新版本。"
      },
      "extension": {
        "name": "Keplar One 瀏覽器擴充功能",
        "line": "在 Chrome 或 Edge 中，用你的 API 金鑰詢問選取的文字或整個頁面。",
        "note": "已提交至 Chrome 線上應用程式商店。"
      },
      "lens": {
        "name": "Search with Keplar One",
        "line": "在頁面上框選任何文字或圖片，答案會在側邊面板中開啟。",
        "note": "瀏覽器擴充功能的一部分。"
      },
      "security": {
        "name": "安全",
        "line": "加密、供應商、資料保留、帳戶保護以及如何報告問題。"
      },
      "changelog": {
        "name": "更新日誌",
        "line": "何時發布了什麼。"
      },
      "roadmap": {
        "name": "路線圖",
        "line": "接下來要做什麼，哪些還未上線。"
      }
    }
  },
  "featuresPage": {
    "kicker": "Keplar 全部功能",
    "crumb": "功能",
    "title": "每項功能，以及今天能否使用。",
    "lead": "<b>{live}</b> 項已上線，<b>{beta}</b> 項測試版，<b>{soon}</b> 項即將推出。測試版可以使用，但可能會變化或僅限部分方案。即將推出的功能尚不可用，也不會被當作可用功能來連結。",
    "sections": "分割槽",
    "thFeature": "功能",
    "thWhat": "用途",
    "thStatus": "狀態",
    "foot": "最近的變化：<changelog>更新日誌</changelog>。接下來：<roadmap>路線圖</roadmap>。準備試試：<demo>在首頁提一個問題</demo>，無需帳戶。"
  },
  "pricing": {
    "label": "價格",
    "title": "免費開始。需要更多時再升級。",
    "lede": "日常問題免費使用。升級即可使用高階模型、Deep Research，以及建立網站、圖片和影片。經營企業？Business 為你量身定製。Keplar 用量按點數計算，而不是原始 token。",
    "tailored": "為你的企業量身定製",
    "custom": "定製",
    "cadence": {
      "forever": "永久",
      "per month": "每月",
      "custom": "定製"
    },
    "perMonth": "{price}/月",
    "fine": "可隨時在帳戶中取消。結帳由 Whop 處理。點數每月更新，按問題所需的模型工作量消耗：簡單問題花費很少。",
    "tiers": {
      "free": {
        "summary": "用 Keplar-One 回答日常問題，基於免費開源模型。",
        "features": [
          "Keplar-One 編排",
          "僅限免費開源模型",
          "免費模型繁忙時可能較慢",
          "免費模型託管方可能記錄提示詞",
          "有限的共識",
          "不支援聯網查詢",
          "每天最多 50 個問題（合理使用）",
          "使用免費視覺模型提問圖片和影片",
          "學習模式：上傳文字型 PDF，生成抽認卡、測驗和學習計劃（免費模型，限額較小）",
          "登入後可儲存對話並可選開啟記憶"
        ],
        "cta": "試用 Keplar"
      },
      "lite": {
        "summary": "Free 的進階：以更低價格用高階模型回答日常問題。",
        "features": [
          "高階模型和 Keplar-One 共識",
          "每月 2,400 點數，設有 5 小時和每週上限",
          "程式設計幫助和檔案分析",
          "使用更強模型的學習模式",
          "建立一個小型個人網站（免費 keplar.site 網址）",
          "圖片生成、Slides、Deep Research、影片、AI 代理和自訂網域從 Plus 起提供"
        ],
        "cta": "升級到 Lite"
      },
      "plus": {
        "summary": "日常使用：學習、工作、健康問題和重大決定。",
        "features": [
          "高階模型和進階 Keplar-One",
          "更大的共識額度",
          "用於重大決定的 Deep Research",
          "程式設計幫助和檔案分析",
          "聯網查詢預設關閉（尚未上線）",
          "建立個人網站和應用",
          "幻燈片製作，可匯出 PowerPoint 和 PDF（圖片創意為佔位內容）",
          "使用更強模型、限額更高的學習模式",
          "圖片生成",
          "更大的上下文和優先使用"
        ],
        "cta": "升級到 Plus"
      },
      "pro": {
        "summary": "面向重度使用者和創作者：多得多的用量、創作和AI 代理。",
        "features": [
          "Plus 的全部功能",
          "每月點數是 Plus 的兩倍以上",
          "影片生成",
          "限額最高的幻燈片製作和學習模式",
          "高階創作",
          "高階AI 代理",
          "更大的上下文",
          "更高的優先順序和併發"
        ],
        "cta": "升級到 Pro"
      }
    },
    "fitTitle": "哪個方案適合你？",
    "fits": {
      "free": {
        "who": "你想看看它是怎麼運作的。",
        "outcome": "用免費模型提日常問題，每天最多 50 個。無需信用卡。",
        "cta": "問 Keplar 任何問題"
      },
      "plus": {
        "who": "你每天都用 AI 來學習、工作或做重大決定。",
        "outcome": "高階模型、Deep Research、Slides、圖片生成，以及為你的作品提供自訂網域。",
        "cta": "升級到 Plus"
      },
      "pro": {
        "who": "你經常構建和創作。",
        "outcome": "點數是 Plus 的兩倍以上，影片，更多專案和AI 代理，以及更高優先順序。",
        "cta": "升級到 Pro"
      }
    },
    "compareTitle": "比較所有方案",
    "compareLede": "包含產品目前執行的所有限制、逐項對比的完整表格位於英文價格頁面。",
    "compareLink": "檢視完整對比（英文）",
    "closingTitle": "還沒想好？先免費開始。",
    "closingLede": "問一個真實問題，看看模型在哪裡一致、在哪裡分歧。無需信用卡，需要更多時可在應用內升級。",
    "closingAsk": "問 Keplar 任何問題",
    "closingCompare": "Keplar 與其他產品對比"
  },
  "roadmap": {
    "kicker": "路線圖",
    "title": "我們正在構建什麼，哪些還沒完成。",
    "lead": "沒有目標日期：能用了就發布。下面的一切要麼正在構建，要麼已在測試版中可用但存在已知不足。已發布的內容見<changelog>更新日誌</changelog>；帶狀態的完整列表見<features>Keplar 全部功能</features>。",
    "nowNum": "現在",
    "nowTitle": "構建中",
    "nowLede": "尚不可用。在全站標註為“即將推出”。",
    "nextNum": "下一步",
    "nextTitle": "完善測試版功能",
    "nextLede": "這些今天就能用。以下是仍缺少的部分。",
    "doneNum": "已發布",
    "doneTitle": "最近",
    "doneLede": "最近幾次發布。日期來自提交歷史。",
    "englishNote": "發布說明為英文。",
    "finishing": [
      {
        "feature": "公開 API",
        "items": [
          "團隊級金鑰",
          "每個金鑰的點數上限",
          "官方 SDK",
          "Webhooks"
        ]
      },
      {
        "feature": "可嵌入小元件",
        "items": [
          "簽名的發布者令牌",
          "自訂樣式"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "每位成員的上限和用量明細",
          "所有權轉移",
          "單點登入"
        ]
      },
      {
        "feature": "語音",
        "items": [
          "為不支援語音識別的瀏覽器（Firefox）提供替代方案",
          "語言選擇器"
        ]
      },
      {
        "feature": "來源核查",
        "items": [
          "經過實測後為付費方案開啟網路來源核查"
        ]
      }
    ],
    "foot": "缺少你需要的功能？<feedback>告訴我們</feedback>。安全問題請傳送至<security>安全頁面</security>上的地址。"
  },
  "showcase": {
    "kicker": "作品展示",
    "title": "沒有紫色光暈。沒有三卡片網格。為需求中的業務而建。",
    "lead": "Create 根據你的描述規劃設計，並拒絕那些讓 AI 生成的網站千篇一律的套路。這些示範展示了我們對它的要求：像印刷卡片一樣排版的酒單、烘焙坊的帳本、快遞排程看板。",
    "disclosure": "這些展示示範由 Keplar 團隊製作，用於展示 Create 的目標。不是客戶網站。其中的名稱、價格和日期均為示例內容。",
    "sites": "網站",
    "apps": "應用",
    "styles": "視覺風格",
    "industries": "行業",
    "contentNote": "示範的標題和描述為英文。",
    "galleryKicker": "由 Keplar 使用者製作",
    "gallery": "社群畫廊",
    "yourTurn": "輪到你了",
    "openCreate": "開啟 Create"
  },
  "developers": {
    "kicker": "開發者",
    "title": "用 Keplar 構建。",
    "lede": "一次請求就能把問題發給多個模型，進行比較，並返回一個答案，附上它們分歧之處的清晰記錄。用 API 金鑰從你的伺服器呼叫，或用一個 script 標籤把同樣的 Ask 放到你自己的網站上。",
    "getKey": "獲取 API 金鑰",
    "widget": "建立小元件",
    "spec": "OpenAPI 規範",
    "endpoint": "主要端點",
    "products": [
      {
        "name": "公開 API",
        "text": "Bearer 金鑰，JSON 或流式回答，每個響應都包含一致與分歧。"
      },
      {
        "name": "可嵌入的 Ask",
        "text": "可定製主題的 Ask 輸入框，適合你的文件或產品。包含來源白名單和速率限制。"
      },
      {
        "name": "Keplar for Teams",
        "text": "共享工作區，包含管理員、編輯者和檢視者角色，可透過郵件或連結邀請。"
      },
      {
        "name": "推薦",
        "text": "分享你的連結。好友加入後，你們各獲得 {n} 用量點數。"
      }
    ],
    "platform": "平臺",
    "refTitle": "完整參考",
    "refLede": "方案與限制、快速入門、請求與響應格式、流式傳輸、小元件、Teams 角色、錯誤和安全說明都在英文開發者頁面上。程式碼、欄位名和錯誤碼在所有語言中都相同。",
    "sections": [
      "方案與限制",
      "快速入門",
      "POST /api/v1/ask",
      "流式傳輸",
      "可嵌入的 Ask 小元件",
      "Keplar for Teams",
      "錯誤",
      "安全與隱私",
      "尚未提供"
    ],
    "refLink": "開啟完整參考（英文）"
  },
  "auth": {
    "signinTitle": "登入 Keplar",
    "signinLead": "繼續你的對話、專案和方案。",
    "addTitle": "新增帳戶",
    "addLead": "用另一個帳戶登入。你正在使用的帳戶在此裝置上保持登入。",
    "checkoutLead": "登入以繼續結帳。之後會直接進入付款。",
    "expired": "{email} 已退出登入。請重新登入以使用。",
    "signupTitle": "建立你的 Keplar 帳戶",
    "signupLead": "適用於作業和重大決定、旅行計劃和副業專案，或經營企業。Free 基於免費開源模型執行，隨時可以升級。",
    "invited": "好友邀請了你：你的電子郵件驗證後，你們都會獲得額外的用量點數（絕不是現金）。詳情見推薦條款。",
    "signUp": "註冊",
    "logIn": "登入",
    "toggle": "註冊或登入",
    "about": "關於 Keplar",
    "panel": {
      "signin": {
        "eyebrow": "歡迎回來",
        "title": "從上次停下的地方繼續。",
        "lead": "你的對話、專案和方案都在等你，在你登入的每臺裝置上。"
      },
      "signup": {
        "eyebrow": "免費帳戶",
        "title": "別再只信一個 AI。",
        "lead": "Free 基於免費開源模型執行，隨時可以升級。"
      }
    },
    "points": [
      "詢問你的問題所需的模型",
      "告訴你它們的分歧",
      "一個答案，分歧一目瞭然"
    ]
  }
};

export default m;
