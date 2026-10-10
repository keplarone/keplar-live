// ja client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "ひとつの質問。",
      "複数の知性。",
      "ひとつの答え。"
    ],
    "sub": "Keplar は複数の AI モデルを使い、それぞれの見方を比べて、明快に統合されたひとつの答えを返します。",
    "note": "モデル名は Keplar が振り分けられるモデルファミリーの例です。どのモデルが答えるかはプラン、質問、利用状況によって変わります。各名称はその所有者に帰属します。アプリで開きます。送信を押すまで何も送られません。",
    "ask": "Keplar に何でも聞く",
    "questionLabel": "あなたの質問",
    "builtBy": "開発：{credit}",
    "tryDemo": "ライブデモを試す",
    "everything": "Keplar のすべて",
    "families": "モデルファミリーの例",
    "storyLabel": "Keplar の仕組み",
    "kickers": [
      "質問",
      "振り分け",
      "回答",
      "比較",
      "検証",
      "答え"
    ],
    "index": [
      "質問",
      "問い",
      "振り分け",
      "回答",
      "比較",
      "検証",
      "答え"
    ],
    "questionPrompt": "今年家を買うべき？それとも賃貸を続けるべき？",
    "questionCaption": "ひとつの質問がシステムに入ります。",
    "distributionTitle": "誰に聞くかは Keplar-One が決めます。",
    "distributionBody": "毎回すべてのモデルではありません。この質問に必要な知性だけを、品質、信頼性、速度、コストで見極めて選びます。",
    "routeNote": "名前は例です。どのモデルが答えるかはプラン、質問、利用状況によって変わります。各名称はその所有者に帰属します。",
    "responsesTitle": "それぞれが独自に答えます。",
    "responsesBody": "異なる推論。異なる根拠。一致する答えもあれば、そうでないものもあります。",
    "respondNote": "イメージ図です。実際の結果ではありません。",
    "agree": "5 つが一致。",
    "dissent": "1 つは違う。",
    "detected": "意見の相違を検出。",
    "follow": "Keplar がその理由を調べます。",
    "disagreeNote": "サンプルの質問によるイメージ図です。数は例であり、実際の結果ではありません。",
    "verificationTitle": "多数決ではなく、評価。",
    "verificationBody": "Keplar は各回答の根拠と推論を比べます。関連する根拠は集まり、矛盾は切り分けられ、ノイズは消えていきます。少数意見が正しいこともあります。",
    "verifySteps": [
      "根拠を比べる",
      "矛盾を切り分ける",
      "ノイズを取り除く"
    ],
    "closingTitle": "ひとつの答え。",
    "convergenceBody": "確かだったものから統合し、一致点と相違点もあわせて示します。",
    "closingSecondary": "Keplar-One の仕組み",
    "beats": {
      "question": {
        "text": "始まりは、ひとつの質問。",
        "short": "始まりは、ひとつの質問。"
      },
      "minds": {
        "text": "Keplar は複数の知性に同時に尋ねます。",
        "short": "複数の知性に、同時に。"
      },
      "disagree": {
        "text": "意見が分かれる点を見つけます。",
        "short": "意見が分かれる点。"
      },
      "verify": {
        "text": "確かなものを確かめます。",
        "short": "確かなもの。"
      },
      "answer": {
        "text": "そして、信頼できるひとつの答えを返します。",
        "short": "信頼できるひとつの答え。"
      }
    }
  },
  "demo": {
    "samples": [
      "寒い冬は、ヒートポンプとガスボイラーのどちらが安く済む？",
      "2 人のスタートアップはデラウェアで法人化すべき？",
      "クレアチンは記憶力にも効く？それとも筋肉だけ？"
    ],
    "stages": {
      "understand": "質問を理解しています",
      "select": "尋ねるモデルを選んでいます",
      "compare": "回答を比べています",
      "disagree": "相違点を探しています",
      "verify": "確かなものを確認しています",
      "synthesize": "ひとつの答えを書いています"
    },
    "dailyDemo": "本日のデモ質問 {n} 件を使い切りました。アプリで続けられます。無料、カード不要です。",
    "slowDown": "少しお待ちください。デモでは 1 分間に数件までです。しばらくしてからお試しください。",
    "dailyFree": "本日の無料の質問を使い切りました。無料で登録して続けるか、明日またお越しください。",
    "tooBig": "この質問は無料枠を超えます。もっと短い質問でお試しください。",
    "offline": "Keplar に接続できませんでした。接続を確認して、もう一度お試しください。",
    "label": "あなたの質問",
    "placeholder": "二度確かめたくなることを、何でも聞いてください。",
    "asking": "複数のモデルに質問中…",
    "ask": "Keplar に何でも聞く",
    "examples": "質問の例",
    "idleHead": "表示される内容",
    "disagreement": "相違点",
    "fullCard": "回答カードをすべて見る",
    "signup": "無料アカウントを作成して履歴を保存",
    "left": "本日のデモ質問：残り {left} / {n} 件",
    "metaTail": "無料モデル · アカウント不要",
    "models": "モデル",
    "answered": "回答済み",
    "consensus": "{consulted} モデル中 {responded} が回答 · {agree} が一致",
    "disagreeCount": "、{n} が不一致"
  },
  "authForm": {
    "checkEmail": "メールを確認してください",
    "sentVerify": "<b>{email}</b> に確認リンクを送りました。開いて「確認して続行」を押すとアカウント作成が完了します。有効期限は 24 時間です。",
    "sentLink": "<b>{email}</b> にログインリンクを送りました。開いて「ログイン」を押してください。有効期限は 15 分です。",
    "notThere": "届いていませんか？迷惑メールを確認するか、少しお待ちください。すでにアカウントがある場合は、メールにその旨が書かれています。",
    "sending": "送信中…",
    "resendIn": "{n} 秒後に再送信",
    "resend": "メールを再送信",
    "differentEmail": "別のメールアドレスを使う",
    "linkInstead": "代わりにログインリンクをメールで受け取る",
    "link": "ログインリンクをメールで受け取る",
    "oauthConsent": "Google または Microsoft で続行すると、13 歳以上であることを確認し、<terms>利用規約</terms>に同意し、<privacy>プライバシーポリシー</privacy>を確認したものとみなされます。",
    "or": "またはメールアドレスを使う",
    "name": "名前",
    "optional": "（任意）",
    "email": "メールアドレス",
    "password": "パスワード",
    "forgot": "パスワードをお忘れですか？",
    "confirm": "パスワードの確認",
    "terms": "13 歳以上であり（18 歳未満の場合は保護者の許可を得ています）、<terms>利用規約</terms>に同意し、<privacy>プライバシーポリシー</privacy>を読みました。",
    "remember": "このデバイスでログインしたままにする",
    "unverified": "メールアドレスがまだ確認されていません。",
    "resendVerify": "確認メールを再送信",
    "creating": "アカウントを作成中…",
    "loggingIn": "ログイン中…",
    "create": "アカウントを作成",
    "logIn": "ログイン",
    "noPassword": "パスワードは不要です。アドレスを確認するための 1 回限りのリンクをメールでお送りします。",
    "errEmail": "you@example.com のような有効なメールアドレスを入力してください。",
    "errEmailEmpty": "メールアドレスを入力してください。",
    "errEmailAbove": "上にメールアドレスを入力してから、もう一度押してください。",
    "errPassword": "パスワードを入力してください。",
    "errWeak": "より強力なパスワードを選んでください。",
    "errMatch": "2 つのパスワードが一致しません。",
    "errTerms": "アカウントを作成するには、利用規約とプライバシーポリシーに同意してください。",
    "errTooMany": "ログインメールのリクエストが多すぎます。数分後にもう一度お試しください。",
    "continueWith": "{name} で続行",
    "opening": "{name} を開いています…",
    "soon": "近日公開",
    "passkey": "パスキーでログイン",
    "passkeyWaiting": "デバイスの応答を待っています…"
  }
};

export default m;
