// zh-cn client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "一个问题。",
      "多种智能。",
      "一个答案。"
    ],
    "sub": "Keplar 调用多个 AI 模型，比较它们的观点，给你一个清晰的综合答案。",
    "note": "模型名称是 Keplar 可调度的模型系列示例；由哪些模型回答取决于你的方案、问题和可用性。名称归其所有者所有。将在应用中打开；在你点击发送之前不会发送任何内容。",
    "ask": "问 Keplar 任何问题",
    "questionLabel": "你的问题",
    "builtBy": "由 {credit} 打造",
    "tryDemo": "试用在线演示",
    "everything": "Keplar 全部功能",
    "families": "模型系列示例",
    "storyLabel": "Keplar 如何运作",
    "kickers": [
      "提问",
      "分配",
      "作答",
      "比较",
      "核实",
      "答案"
    ],
    "index": [
      "提问",
      "问题",
      "分配",
      "作答",
      "比较",
      "核实",
      "答案"
    ],
    "questionPrompt": "今年该买房，还是继续租房？",
    "questionCaption": "一个问题进入系统。",
    "distributionTitle": "由 Keplar-One 决定问谁。",
    "distributionBody": "不是每次都问所有模型。只选这个问题需要的智能，综合考量质量、可靠性、延迟和成本。",
    "routeNote": "名称仅为示例。由哪些模型回答取决于你的方案、问题和可用性。名称归其所有者所有。",
    "responsesTitle": "每个模型独立作答。",
    "responsesBody": "不同的推理，不同的证据。有些回答一致，有些不一致。",
    "respondNote": "示意图，并非实时结果。",
    "agree": "5 个一致。",
    "dissent": "1 个不同。",
    "detected": "发现分歧。",
    "follow": "Keplar 会调查原因。",
    "disagreeNote": "以示例问题作示意。数量仅为示例，并非实时结果。",
    "verificationTitle": "是评估，不是投票。",
    "verificationBody": "Keplar 权衡每个回答背后的证据和推理。相关证据汇集，矛盾被分开，噪音被滤除。少数也可能是对的。",
    "verifySteps": [
      "权衡证据",
      "分开矛盾",
      "滤除噪音"
    ],
    "closingTitle": "一个答案。",
    "convergenceBody": "基于经得起检验的内容综合而成，并展示一致与分歧之处。",
    "closingSecondary": "Keplar-One 如何运作",
    "beats": {
      "question": {
        "text": "从一个问题开始。",
        "short": "从一个问题开始。"
      },
      "minds": {
        "text": "Keplar 同时询问多个智能。",
        "short": "多个智能，同时作答。"
      },
      "disagree": {
        "text": "找出它们的分歧所在。",
        "short": "分歧所在。"
      },
      "verify": {
        "text": "核实哪些站得住脚。",
        "short": "站得住脚的内容。"
      },
      "answer": {
        "text": "然后给你一个值得信赖的答案。",
        "short": "一个值得信赖的答案。"
      }
    }
  },
  "demo": {
    "samples": [
      "寒冷的冬天，用热泵还是燃气锅炉更省钱？",
      "两人的初创公司应该在特拉华州注册吗？",
      "肌酸对记忆力有帮助，还是只对肌肉有用？"
    ],
    "stages": {
      "understand": "正在理解问题",
      "select": "正在选择要询问的模型",
      "compare": "正在比较它们的回答",
      "disagree": "正在寻找分歧",
      "verify": "正在核实可靠内容",
      "synthesize": "正在写出一个答案"
    },
    "dailyDemo": "今天的 {n} 个演示问题已用完。可以在应用中继续，免费，无需银行卡。",
    "slowDown": "请稍等：演示每分钟只能提几个问题。请稍后再试。",
    "dailyFree": "今天的免费问题已用完。免费注册即可继续，或者明天再来。",
    "tooBig": "这个问题超出了免费额度。请试试更短的问题。",
    "offline": "无法连接到 Keplar。请检查网络连接后重试。",
    "label": "你的问题",
    "placeholder": "问任何你会再三确认的问题。",
    "asking": "正在询问多个模型…",
    "ask": "问 Keplar 任何问题",
    "examples": "示例问题",
    "idleHead": "你将看到",
    "disagreement": "分歧",
    "fullCard": "查看完整答案卡片",
    "signup": "创建免费账户以保存历史记录",
    "left": "今天还剩 {left}/{n} 个演示问题",
    "metaTail": "免费模型 · 无需账户",
    "models": "模型",
    "answered": "已作答",
    "consensus": "{consulted} 个模型中 {responded} 个作答 · {agree} 个一致",
    "disagreeCount": "，{n} 个不一致"
  },
  "authForm": {
    "checkEmail": "请查收邮件",
    "sentVerify": "我们已向 <b>{email}</b> 发送验证链接。打开后点击“验证并继续”即可完成账户创建。链接 24 小时内有效。",
    "sentLink": "我们已向 <b>{email}</b> 发送登录链接。打开后点击“登录”。链接 15 分钟内有效。",
    "notThere": "没收到？请检查垃圾邮件，或稍等一分钟。如果你已有账户，邮件中会说明。",
    "sending": "发送中…",
    "resendIn": "{n} 秒后可重新发送",
    "resend": "重新发送邮件",
    "differentEmail": "使用其他邮箱",
    "linkInstead": "改为通过邮件接收登录链接",
    "link": "通过邮件接收登录链接",
    "oauthConsent": "使用 Google 或 Microsoft 继续，即表示你确认已年满 13 岁，同意<terms>条款</terms>，并已知悉<privacy>隐私政策</privacy>。",
    "or": "或使用你的邮箱",
    "name": "姓名",
    "optional": "（可选）",
    "email": "邮箱",
    "password": "密码",
    "forgot": "忘记密码？",
    "confirm": "确认密码",
    "terms": "我已年满 13 岁（未满 18 岁需经父母或监护人许可），同意<terms>条款</terms>，并已阅读<privacy>隐私政策</privacy>。",
    "remember": "在此设备上保持登录",
    "unverified": "你的邮箱尚未验证。",
    "resendVerify": "重新发送验证邮件",
    "creating": "正在创建账户…",
    "loggingIn": "正在登录…",
    "create": "创建账户",
    "logIn": "登录",
    "noPassword": "无需密码。我们会向你发送一次性链接来验证你的邮箱地址。",
    "errEmail": "请输入有效的邮箱地址，例如 you@example.com。",
    "errEmailEmpty": "请输入你的邮箱地址。",
    "errEmailAbove": "请先在上方输入邮箱，再点击此按钮。",
    "errPassword": "请输入密码。",
    "errWeak": "请选择更强的密码。",
    "errMatch": "两次输入的密码不一致。",
    "errTerms": "请接受条款和隐私政策以创建账户。",
    "errTooMany": "登录邮件请求过多。请几分钟后再试。",
    "continueWith": "使用 {name} 继续",
    "opening": "正在打开 {name}…",
    "soon": "即将推出",
    "passkey": "使用通行密钥登录",
    "passkeyWaiting": "正在等待你的设备…"
  }
};

export default m;
