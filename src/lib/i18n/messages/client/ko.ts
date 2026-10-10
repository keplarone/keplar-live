// ko client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "하나의 질문.",
      "여러 지능.",
      "하나의 답."
    ],
    "sub": "Keplar는 여러 AI 모델을 사용해 각각의 관점을 비교하고, 명확하게 종합된 하나의 답을 드립니다.",
    "note": "모델 이름은 Keplar가 연결할 수 있는 모델 계열의 예시입니다. 어떤 모델이 답할지는 요금제, 질문, 사용 가능 여부에 따라 달라집니다. 각 이름은 해당 소유자에게 귀속됩니다. 앱에서 열리며, 보내기를 누르기 전에는 아무것도 전송되지 않습니다.",
    "ask": "Keplar에게 무엇이든 물어보세요",
    "questionLabel": "질문",
    "builtBy": "만든 사람: {credit}",
    "tryDemo": "라이브 데모 사용해 보기",
    "everything": "Keplar의 모든 것",
    "families": "모델 계열 예시",
    "storyLabel": "Keplar의 작동 방식",
    "kickers": [
      "질문",
      "배분",
      "응답",
      "비교",
      "검증",
      "답변"
    ],
    "index": [
      "질문",
      "물음",
      "배분",
      "응답",
      "비교",
      "검증",
      "답변"
    ],
    "questionPrompt": "올해 집을 사야 할까, 계속 전세·월세로 살아야 할까?",
    "questionCaption": "하나의 질문이 시스템에 들어옵니다.",
    "distributionTitle": "누구에게 물을지는 Keplar-One이 정합니다.",
    "distributionBody": "매번 모든 모델에 묻지 않습니다. 이 질문에 필요한 지능만, 품질·신뢰성·지연 시간·비용을 따져 고릅니다.",
    "routeNote": "이름은 예시입니다. 어떤 모델이 답할지는 요금제, 질문, 사용 가능 여부에 따라 달라집니다. 각 이름은 해당 소유자에게 귀속됩니다.",
    "responsesTitle": "각자 독립적으로 답합니다.",
    "responsesBody": "다른 추론, 다른 근거. 일치하는 답도 있고, 그렇지 않은 답도 있습니다.",
    "respondNote": "예시 그림이며, 실제 결과가 아닙니다.",
    "agree": "5개 일치.",
    "dissent": "1개는 다름.",
    "detected": "의견 차이 발견.",
    "follow": "Keplar가 이유를 살펴봅니다.",
    "disagreeNote": "예시 질문을 사용한 그림입니다. 숫자는 예시이며, 실제 결과가 아닙니다.",
    "verificationTitle": "투표가 아니라 평가입니다.",
    "verificationBody": "Keplar는 각 응답 뒤의 근거와 추론을 따져 봅니다. 관련 근거는 모이고, 모순은 분리되며, 잡음은 걸러집니다. 소수 의견이 맞을 수도 있습니다.",
    "verifySteps": [
      "근거 따져 보기",
      "모순 분리하기",
      "잡음 걸러내기"
    ],
    "closingTitle": "하나의 답.",
    "convergenceBody": "검증을 통과한 내용으로 종합하고, 일치점과 차이점을 함께 보여 줍니다.",
    "closingSecondary": "Keplar-One의 작동 방식",
    "beats": {
      "question": {
        "text": "모든 것은 질문에서 시작됩니다.",
        "short": "질문에서 시작됩니다."
      },
      "minds": {
        "text": "Keplar는 여러 지능에 동시에 묻습니다.",
        "short": "여러 지능에, 동시에."
      },
      "disagree": {
        "text": "의견이 갈리는 지점을 찾습니다.",
        "short": "의견이 갈리는 지점."
      },
      "verify": {
        "text": "확실한 것을 확인합니다.",
        "short": "확실한 것."
      },
      "answer": {
        "text": "그리고 믿을 수 있는 하나의 답을 드립니다.",
        "short": "믿을 수 있는 하나의 답."
      }
    }
  },
  "demo": {
    "samples": [
      "추운 겨울에는 히트펌프와 가스보일러 중 어느 쪽이 더 저렴할까?",
      "2인 스타트업은 델라웨어에 법인을 세워야 할까?",
      "크레아틴은 기억력에도 도움이 될까, 아니면 근육에만?"
    ],
    "stages": {
      "understand": "질문 이해 중",
      "select": "물어볼 모델 선택 중",
      "compare": "답변 비교 중",
      "disagree": "의견 차이 찾는 중",
      "verify": "확실한 내용 확인 중",
      "synthesize": "하나의 답 작성 중"
    },
    "dailyDemo": "오늘의 데모 질문 {n}개를 모두 사용했습니다. 앱에서 무료로, 카드 없이 계속하세요.",
    "slowDown": "잠시만요. 데모에서는 1분에 몇 개만 질문할 수 있습니다. 잠시 후 다시 시도하세요.",
    "dailyFree": "오늘의 무료 질문을 모두 사용했습니다. 무료로 가입해 계속하거나 내일 다시 오세요.",
    "tooBig": "이 질문은 무료 한도를 넘습니다. 더 짧은 질문으로 시도해 보세요.",
    "offline": "Keplar에 연결할 수 없습니다. 연결을 확인하고 다시 시도하세요.",
    "label": "질문",
    "placeholder": "두 번 확인하고 싶은 것을 무엇이든 물어보세요.",
    "asking": "여러 모델에 묻는 중…",
    "ask": "Keplar에게 무엇이든 물어보세요",
    "examples": "질문 예시",
    "idleHead": "보게 될 내용",
    "disagreement": "의견 차이",
    "fullCard": "전체 답변 카드 보기",
    "signup": "무료 계정을 만들어 기록 저장하기",
    "left": "오늘 남은 데모 질문 {left}/{n}개",
    "metaTail": "무료 모델 · 계정 불필요",
    "models": "모델",
    "answered": "응답함",
    "consensus": "모델 {consulted}개 중 {responded}개 응답 · {agree}개 일치",
    "disagreeCount": ", {n}개 불일치"
  },
  "authForm": {
    "checkEmail": "이메일을 확인하세요",
    "sentVerify": "<b>{email}</b>(으)로 인증 링크를 보냈습니다. 링크를 열고 “인증하고 계속”을 누르면 계정 만들기가 완료됩니다. 24시간 후 만료됩니다.",
    "sentLink": "<b>{email}</b>(으)로 로그인 링크를 보냈습니다. 링크를 열고 “로그인”을 누르세요. 15분 후 만료됩니다.",
    "notThere": "메일이 없나요? 스팸함을 확인하거나 잠시 기다려 주세요. 이미 계정이 있다면 메일에 안내되어 있습니다.",
    "sending": "보내는 중…",
    "resendIn": "{n}초 후 다시 보내기",
    "resend": "이메일 다시 보내기",
    "differentEmail": "다른 이메일 사용",
    "linkInstead": "대신 로그인 링크를 이메일로 받기",
    "link": "로그인 링크를 이메일로 받기",
    "oauthConsent": "Google 또는 Microsoft로 계속하면 만 13세 이상임을 확인하고 <terms>이용약관</terms>에 동의하며 <privacy>개인정보처리방침</privacy>을 확인한 것으로 간주됩니다.",
    "or": "또는 이메일 사용",
    "name": "이름",
    "optional": "(선택)",
    "email": "이메일",
    "password": "비밀번호",
    "forgot": "비밀번호를 잊으셨나요?",
    "confirm": "비밀번호 확인",
    "terms": "만 13세 이상이며(만 18세 미만은 부모나 보호자의 허락을 받음), <terms>이용약관</terms>에 동의하고 <privacy>개인정보처리방침</privacy>을 읽었습니다.",
    "remember": "이 기기에서 로그인 상태 유지",
    "unverified": "이메일이 아직 인증되지 않았습니다.",
    "resendVerify": "인증 이메일 다시 보내기",
    "creating": "계정 만드는 중…",
    "loggingIn": "로그인 중…",
    "create": "계정 만들기",
    "logIn": "로그인",
    "noPassword": "비밀번호가 필요 없습니다. 주소를 확인하는 일회용 링크를 이메일로 보내 드립니다.",
    "errEmail": "you@example.com처럼 올바른 이메일 주소를 입력하세요.",
    "errEmailEmpty": "이메일 주소를 입력하세요.",
    "errEmailAbove": "위에 이메일을 입력한 다음 다시 누르세요.",
    "errPassword": "비밀번호를 입력하세요.",
    "errWeak": "더 강력한 비밀번호를 선택하세요.",
    "errMatch": "두 비밀번호가 일치하지 않습니다.",
    "errTerms": "계정을 만들려면 이용약관과 개인정보처리방침에 동의하세요.",
    "errTooMany": "로그인 이메일 요청이 너무 많습니다. 몇 분 후 다시 시도하세요.",
    "continueWith": "{name}(으)로 계속",
    "opening": "{name} 여는 중…",
    "soon": "출시 예정",
    "passkey": "패스키로 로그인",
    "passkeyWaiting": "기기 응답을 기다리는 중…"
  }
};

export default m;
