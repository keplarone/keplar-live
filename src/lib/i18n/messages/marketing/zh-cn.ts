// zh-cn marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — 一个问题。多种智能。一个答案。",
      "description": "Keplar 把你的问题发给多个 AI 模型，找出它们的分歧并加以核实，给你一个综合后的答案。免费试用，无需注册。"
    },
    "features": {
      "title": "Keplar 全部功能",
      "description": "Keplar 的每项功能都在这一页，按用途分组：提问、读取文件、创建网站和应用、协作、发布、API 和小组件，以及信任。每项都注明是已上线、测试版还是即将推出。"
    },
    "pricing": {
      "title": "价格：Free、Plus $45、Pro $99",
      "description": "免费开始使用 Keplar One。Keplar Plus 每月 $45，Keplar Pro 每月 $99，Business 方案可通过我们的销售团队获取。用量清晰可见，从不隐藏。"
    },
    "showcase": {
      "title": "Create 作品展示：用 Keplar 构建的应用应有的样子",
      "description": "Keplar 团队制作的八个演示网站和应用，展示 Create 追求的广度：菜单、账本、看板、日历和编辑类页面，各有自己的字体和配色。不是客户网站。"
    },
    "roadmap": {
      "title": "路线图",
      "description": "Keplar 正在构建什么，哪些处于测试版仍在完善，最近发布了什么。不写我们无法兑现的目标日期。"
    },
    "developers": {
      "title": "面向开发者的 Keplar：API、可嵌入的 Ask、Teams",
      "description": "用 Bearer API 密钥在你自己的代码中向 Keplar 提问，或用一个 script 标签把 Ask 小组件放到你的网站上。OpenAPI 规范、流式传输，各方案限制清楚列明。"
    },
    "signin": {
      "title": "登录",
      "description": "登录 Keplar。"
    },
    "signup": {
      "title": "创建账户",
      "description": "创建免费的 Keplar 账户。"
    }
  },
  "status": {
    "live": "已上线",
    "beta": "测试版",
    "soon": "即将推出"
  },
  "chapters": {
    "demoKicker": "在线演示",
    "demoTitle": "就在这里试试。无需账户。",
    "proof": "由 {credit} 打造。公开开发：<changelog>更新日志</changelog>、<roadmap>路线图</roadmap>，以及说明哪些已完成、哪些未完成的<security>安全页面</security>。",
    "showcaseNote": "展示中的演示由 Keplar 团队制作，不是客户网站。<link>查看全部八个</link>",
    "closeTitle": "问 Keplar 任何问题。",
    "closeCta": "问 Keplar 任何问题",
    "closeSmall": "免费，无需银行卡。<link>Keplar 全部功能一页看完</link>，并注明哪些已上线、测试版和即将推出。",
    "voiceCaption": "Voice Live Create：开口说话，编辑器、终端和预览同步变化。停下它就等着；说“其实”它就修改。",
    "voiceLabel": "Voice Live Create：编辑器、终端和实时预览并排显示",
    "list": {
      "ask": {
        "label": "提问",
        "title": "问 Keplar 任何问题。",
        "lede": "一个问题发给多个 AI 模型。Keplar 比较它们，指出分歧，核实哪些站得住脚，然后写出一个答案。"
      },
      "understand": {
        "label": "理解",
        "title": "它会读你给它的内容。",
        "lede": "把你要问的东西拖进来。Keplar 只为这个问题读取它，不保留文件。"
      },
      "create": {
        "label": "创建",
        "title": "写出来，或说出来。得到不像是生成出来的作品。",
        "lede": "Create 根据你描述的业务规划设计，编写代码，测试每个页面，并拒绝紫色光晕、渐变色块和三卡片网格。"
      },
      "together": {
        "label": "一起构建",
        "title": "和别人一起做，再加一位评审。",
        "lede": "同时编辑同一个项目，并获得来自你之外的第二意见。"
      },
      "ship": {
        "label": "发布",
        "title": "一步发布。一步撤销。",
        "lede": "你的项目会在 Keplar 地址上线，需要时也可以用你自己的域名。"
      },
      "platform": {
        "label": "平台",
        "title": "随处使用 Keplar。",
        "lede": "同一个引擎，可通过 API 调用，在你的浏览器里，嵌在你网站的小组件里，也可以在团队中共享。"
      },
      "trust": {
        "label": "信任",
        "title": "坦白它做什么，以及如何对待你的数据。",
        "lede": "我们保护什么、怎么保护、还有什么没做，都写得明明白白。不挂没拿到的徽章。"
      }
    },
    "items": {
      "demo": {
        "name": "在线演示",
        "line": "在本页问一个真实问题。无需账户。"
      },
      "multi-model": {
        "name": "多个模型，一个答案",
        "line": "只用问题需要的模型，逐条论点比较。"
      },
      "disagreement": {
        "name": "分歧图",
        "line": "模型在哪里一致、在哪里分歧，以及答案为何如此。"
      },
      "debate": {
        "name": "辩论模式",
        "line": "在 Keplar 作答前，看模型分轮辩论。"
      },
      "voice": {
        "name": "语音模式",
        "line": "开口提问，听答案朗读。Keplar 从不录制或保存你的音频。"
      },
      "live-research": {
        "name": "实时研究",
        "line": "在桌面应用中，Keplar 会搜索网络并在你的电脑上读取网页，然后为每个网页标注引用并核对引用。",
        "note": "桌面应用 0.2.0 或更高版本。"
      },
      "images": {
        "name": "图片和截图",
        "line": "图表、收据、白板、界面。只发给能看图的模型。"
      },
      "video": {
        "name": "视频",
        "line": "关键帧在你的浏览器中抽取，视频本身不会上传。"
      },
      "docs": {
        "name": "文档、代码和数据",
        "line": "PDF、文本、CSV、JSON 和源代码文件，以文本形式读取。"
      },
      "office": {
        "name": "Word、PowerPoint、Excel 和音频",
        "line": "安全解析 Office 文件；音频会转写成文字。"
      },
      "links": {
        "name": "链接",
        "line": "粘贴网址，Keplar 通过受保护的抓取读取页面。"
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "开口说话，看编辑器、终端和预览同时搭建。说“其实”即可改变方向。",
        "note": "需要支持语音识别的浏览器（Chrome、Edge、Safari）。"
      },
      "showcase": {
        "name": "作品展示",
        "line": "Keplar 团队的八个演示，为 Create 设定标准。"
      },
      "surprise": {
        "name": "给我惊喜",
        "line": "一键生成：具体的需求、风格和深度，为你构建。"
      },
      "versions": {
        "name": "版本历史",
        "line": "每次构建都是一个版本。可恢复任一版本，或分支成新草稿。"
      },
      "community": {
        "name": "社区画廊",
        "line": "大家选择分享的网站。点赞、二次创作、举报。"
      },
      "anti-vibe": {
        "name": "反模板化设计规则",
        "line": "成文的评分标准和 lint 检查，在你看到之前就拒绝常见的 AI 风格。"
      },
      "collab": {
        "name": "实时协作",
        "line": "通过链接邀请，一起编辑同一个项目：实时光标、跟随模式、共享终端和预览。",
        "note": "在 Create 中打开应用，然后选择 Live。查看者可观看，编辑者可输入。"
      },
      "critic": {
        "name": "AI 评审",
        "line": "规则、真实浏览器中的 axe-core 和另一个模型审查你的构建，然后应用你选择的修复。"
      },
      "publish": {
        "name": "一键发布",
        "line": "从 Create 把草稿发布到线上地址。"
      },
      "previews": {
        "name": "预览",
        "line": "每个草稿在上线前都有私密预览链接。"
      },
      "rollback": {
        "name": "回滚",
        "line": "改动出错时恢复上一个版本。"
      },
      "domains": {
        "name": "自定义域名",
        "line": "连接你拥有的域名；Keplar 会检查 DNS 并告诉你需要改什么。"
      },
      "ssl": {
        "name": "自动 HTTPS",
        "line": "为已连接的域名签发和续期证书。"
      },
      "api": {
        "name": "公开 API",
        "line": "Bearer 密钥、按方案限制、OpenAPI 规范。免费密钥仅使用免费模型。"
      },
      "embed": {
        "name": "可嵌入小组件",
        "line": "一个 script 标签就能把 Keplar Ask 放到你的网站上，仅限你允许的来源。"
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "共享工作区，包含所有者、管理员、编辑者和查看者角色。",
        "note": "Business 方案。"
      },
      "referrals": {
        "name": "推荐计划",
        "line": "邀请好友，你们都能获得额外用量，绝不是现金。"
      },
      "roblox-studio": {
        "name": "Roblox Studio 模式",
        "line": "Roblox Studio 里的共同搭建者：地图、界面、序列帧特效和 Luau 脚本，由 Claude Opus 5.5 驱动。",
        "note": "桌面应用，Lite 及以上。"
      },
      "roblox-cloud": {
        "name": "Roblox Cloud",
        "line": "通宵处理你游戏的脚本，每处修改都经 Luau 分析器检查，由你决定何时在 Studio 中应用。",
        "note": "只处理脚本；无法试玩测试。"
      },
      "blender": {
        "name": "Blender 模式",
        "line": "在 Blender 4.2 或更高版本中建模、用 Poly Haven 的 PBR 材质贴图、布光并导出。",
        "note": "桌面应用 0.1.8 或更高版本。"
      },
      "blender-cloud": {
        "name": "Blender Cloud 云渲染",
        "line": "关掉电脑也能在 Keplar 的服务器上渲染场景，之后下载各帧和一个 MP4 视频。",
        "note": "桌面应用 0.1.10 或更高版本。"
      },
      "extension": {
        "name": "Keplar One 浏览器扩展",
        "line": "在 Chrome 或 Edge 中，用你的 API 密钥询问选中的文字或整个页面。",
        "note": "已提交至 Chrome 网上应用店。"
      },
      "lens": {
        "name": "Search with Keplar One",
        "line": "在页面上框选任意文字或图片，答案会在侧边面板中打开。",
        "note": "浏览器扩展的一部分。"
      },
      "security": {
        "name": "安全",
        "line": "加密、服务商、数据保留、账户保护以及如何报告问题。"
      },
      "changelog": {
        "name": "更新日志",
        "line": "何时发布了什么。"
      },
      "roadmap": {
        "name": "路线图",
        "line": "接下来要做什么，哪些还未上线。"
      }
    }
  },
  "featuresPage": {
    "kicker": "Keplar 全部功能",
    "crumb": "功能",
    "title": "每项功能，以及今天能否使用。",
    "lead": "<b>{live}</b> 项已上线，<b>{beta}</b> 项测试版，<b>{soon}</b> 项即将推出。测试版可以使用，但可能会变化或仅限部分方案。即将推出的功能尚不可用，也不会被当作可用功能来链接。",
    "sections": "分区",
    "thFeature": "功能",
    "thWhat": "用途",
    "thStatus": "状态",
    "foot": "最近的变化：<changelog>更新日志</changelog>。接下来：<roadmap>路线图</roadmap>。准备试试：<demo>在首页提一个问题</demo>，无需账户。"
  },
  "pricing": {
    "label": "价格",
    "title": "免费开始。需要更多时再升级。",
    "lede": "日常问题免费使用。升级即可使用高级模型、Deep Research，以及创建网站、图片和视频。经营企业？Business 为你量身定制。Keplar 用量按积分计算，而不是原始 token。",
    "tailored": "为你的企业量身定制",
    "custom": "定制",
    "cadence": {
      "forever": "永久",
      "per month": "每月",
      "custom": "定制"
    },
    "perMonth": "{price}/月",
    "fine": "可随时在账户中取消。结账由 Whop 处理。积分每月更新，按问题所需的模型工作量消耗：简单问题花费很少。",
    "tiers": {
      "free": {
        "summary": "用 Keplar-One 回答日常问题，基于免费开源模型。",
        "features": [
          "Keplar-One 编排",
          "仅限免费开源模型",
          "免费模型繁忙时可能较慢",
          "免费模型托管方可能记录提示词",
          "有限的共识",
          "不支持联网查询",
          "每天最多 50 个问题（合理使用）",
          "使用免费视觉模型提问图片和视频",
          "学习模式：上传文本型 PDF，生成抽认卡、测验和学习计划（免费模型，限额较小）",
          "登录后可保存对话并可选开启记忆"
        ],
        "cta": "试用 Keplar"
      },
      "lite": {
        "summary": "Free 的进阶：以更低价格用高级模型回答日常问题。",
        "features": [
          "高级模型和 Keplar-One 共识",
          "每月 2,400 积分，设有 5 小时和每周上限",
          "编程帮助和文件分析",
          "使用更强模型的学习模式",
          "创建一个小型个人网站（免费 keplar.site 地址）",
          "图片生成、Slides、Deep Research、视频、智能体和自定义域名从 Plus 起提供"
        ],
        "cta": "升级到 Lite"
      },
      "plus": {
        "summary": "日常使用：学习、工作、健康问题和重大决定。",
        "features": [
          "高级模型和进阶 Keplar-One",
          "更大的共识额度",
          "用于重大决定的 Deep Research",
          "编程帮助和文件分析",
          "联网查询默认关闭（尚未上线）",
          "创建个人网站和应用",
          "幻灯片制作，可导出 PowerPoint 和 PDF（图片创意为占位内容）",
          "使用更强模型、限额更高的学习模式",
          "图片生成",
          "更大的上下文和优先使用"
        ],
        "cta": "升级到 Plus"
      },
      "pro": {
        "summary": "面向重度用户和创作者：多得多的用量、创作和智能体。",
        "features": [
          "Plus 的全部功能",
          "每月积分是 Plus 的两倍以上",
          "视频生成",
          "限额最高的幻灯片制作和学习模式",
          "高级创作",
          "高级智能体",
          "更大的上下文",
          "更高的优先级和并发"
        ],
        "cta": "升级到 Pro"
      }
    },
    "fitTitle": "哪个方案适合你？",
    "fits": {
      "free": {
        "who": "你想看看它是怎么运作的。",
        "outcome": "用免费模型提日常问题，每天最多 50 个。无需银行卡。",
        "cta": "问 Keplar 任何问题"
      },
      "plus": {
        "who": "你每天都用 AI 来学习、工作或做重大决定。",
        "outcome": "高级模型、Deep Research、Slides、图片生成，以及为你的作品提供自定义域名。",
        "cta": "升级到 Plus"
      },
      "pro": {
        "who": "你经常构建和创作。",
        "outcome": "积分是 Plus 的两倍以上，视频，更多项目和智能体，以及更高优先级。",
        "cta": "升级到 Pro"
      }
    },
    "compareTitle": "比较所有方案",
    "compareLede": "包含产品目前执行的所有限制、逐项对比的完整表格位于英文价格页面。",
    "compareLink": "查看完整对比（英文）",
    "closingTitle": "还没想好？先免费开始。",
    "closingLede": "问一个真实问题，看看模型在哪里一致、在哪里分歧。无需银行卡，需要更多时可在应用内升级。",
    "closingAsk": "问 Keplar 任何问题",
    "closingCompare": "Keplar 与其他产品对比"
  },
  "roadmap": {
    "kicker": "路线图",
    "title": "我们正在构建什么，哪些还没完成。",
    "lead": "没有目标日期：能用了就发布。下面的一切要么正在构建，要么已在测试版中可用但存在已知不足。已发布的内容见<changelog>更新日志</changelog>；带状态的完整列表见<features>Keplar 全部功能</features>。",
    "nowNum": "现在",
    "nowTitle": "构建中",
    "nowLede": "尚不可用。在全站标注为“即将推出”。",
    "nextNum": "下一步",
    "nextTitle": "完善测试版功能",
    "nextLede": "这些今天就能用。以下是仍缺少的部分。",
    "doneNum": "已发布",
    "doneTitle": "最近",
    "doneLede": "最近几次发布。日期来自提交历史。",
    "englishNote": "发布说明为英文。",
    "finishing": [
      {
        "feature": "公开 API",
        "items": [
          "团队级密钥",
          "每个密钥的积分上限",
          "官方 SDK",
          "Webhooks"
        ]
      },
      {
        "feature": "可嵌入小组件",
        "items": [
          "签名的发布者令牌",
          "自定义样式"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "每位成员的上限和用量明细",
          "所有权转移",
          "单点登录"
        ]
      },
      {
        "feature": "语音",
        "items": [
          "为不支持语音识别的浏览器（Firefox）提供替代方案",
          "语言选择器"
        ]
      },
      {
        "feature": "来源核查",
        "items": [
          "经过实测后为付费方案开启网络来源核查"
        ]
      }
    ],
    "foot": "缺少你需要的功能？<feedback>告诉我们</feedback>。安全问题请发送至<security>安全页面</security>上的地址。"
  },
  "showcase": {
    "kicker": "作品展示",
    "title": "没有紫色光晕。没有三卡片网格。为需求中的业务而建。",
    "lead": "Create 根据你的描述规划设计，并拒绝那些让 AI 生成的网站千篇一律的套路。这些演示展示了我们对它的要求：像印刷卡片一样排版的酒单、烘焙坊的账本、快递调度看板。",
    "disclosure": "这些展示演示由 Keplar 团队制作，用于展示 Create 的目标。不是客户网站。其中的名称、价格和日期均为示例内容。",
    "sites": "网站",
    "apps": "应用",
    "styles": "视觉风格",
    "industries": "行业",
    "contentNote": "演示的标题和描述为英文。",
    "galleryKicker": "由 Keplar 用户制作",
    "gallery": "社区画廊",
    "yourTurn": "轮到你了",
    "openCreate": "打开 Create"
  },
  "developers": {
    "kicker": "开发者",
    "title": "用 Keplar 构建。",
    "lede": "一次请求就能把问题发给多个模型，进行比较，并返回一个答案，附上它们分歧之处的清晰记录。用 API 密钥从你的服务器调用，或用一个 script 标签把同样的 Ask 放到你自己的网站上。",
    "getKey": "获取 API 密钥",
    "widget": "创建小组件",
    "spec": "OpenAPI 规范",
    "endpoint": "主要端点",
    "products": [
      {
        "name": "公开 API",
        "text": "Bearer 密钥，JSON 或流式回答，每个响应都包含一致与分歧。"
      },
      {
        "name": "可嵌入的 Ask",
        "text": "可定制主题的 Ask 输入框，适合你的文档或产品。包含来源白名单和速率限制。"
      },
      {
        "name": "Keplar for Teams",
        "text": "共享工作区，包含管理员、编辑者和查看者角色，可通过邮件或链接邀请。"
      },
      {
        "name": "推荐",
        "text": "分享你的链接。好友加入后，你们各获得 {n} 用量积分。"
      }
    ],
    "platform": "平台",
    "refTitle": "完整参考",
    "refLede": "方案与限制、快速入门、请求与响应格式、流式传输、小组件、Teams 角色、错误和安全说明都在英文开发者页面上。代码、字段名和错误码在所有语言中都相同。",
    "sections": [
      "方案与限制",
      "快速入门",
      "POST /api/v1/ask",
      "流式传输",
      "可嵌入的 Ask 小组件",
      "Keplar for Teams",
      "错误",
      "安全与隐私",
      "尚未提供"
    ],
    "refLink": "打开完整参考（英文）"
  },
  "auth": {
    "signinTitle": "登录 Keplar",
    "signinLead": "继续你的对话、项目和方案。",
    "addTitle": "添加账户",
    "addLead": "用另一个账户登录。你正在使用的账户在此设备上保持登录。",
    "checkoutLead": "登录以继续结账。之后会直接进入付款。",
    "expired": "{email} 已退出登录。请重新登录以使用。",
    "signupTitle": "创建你的 Keplar 账户",
    "signupLead": "适用于作业和重大决定、旅行计划和副业项目，或经营企业。Free 基于免费开源模型运行，随时可以升级。",
    "invited": "好友邀请了你：你的邮箱验证后，你们都会获得额外的用量积分（绝不是现金）。详情见推荐条款。",
    "signUp": "注册",
    "logIn": "登录",
    "toggle": "注册或登录",
    "about": "关于 Keplar",
    "panel": {
      "signin": {
        "eyebrow": "欢迎回来",
        "title": "从上次停下的地方继续。",
        "lead": "你的对话、项目和方案都在等你，在你登录的每台设备上。"
      },
      "signup": {
        "eyebrow": "免费账户",
        "title": "别再只信一个 AI。",
        "lead": "Free 基于免费开源模型运行，随时可以升级。"
      }
    },
    "points": [
      "询问你的问题所需的模型",
      "告诉你它们的分歧",
      "一个答案，分歧一目了然"
    ]
  }
};

export default m;
