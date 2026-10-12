// ko marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — 하나의 질문. 여러 지능. 하나의 답.",
      "description": "Keplar는 질문을 여러 AI 모델에 보내고, 의견이 갈리는 지점을 찾아 검증한 뒤, 종합된 하나의 답을 드립니다. 무료로 사용해 볼 수 있으며 가입이 필요 없습니다."
    },
    "features": {
      "title": "Keplar의 모든 것",
      "description": "Keplar의 모든 기능을 용도별로 한 페이지에 모았습니다. 질문, 파일 읽기, 사이트와 앱 만들기, 함께 만들기, 배포, API와 위젯, 신뢰. 각 기능이 출시됨, 베타, 출시 예정 중 무엇인지 표시합니다."
    },
    "pricing": {
      "title": "요금: Free, Plus $45, Pro $99",
      "description": "Keplar One을 무료로 시작하세요. Keplar Plus는 월 $45, Keplar Pro는 월 $99이며, Business 요금제는 영업팀을 통해 이용할 수 있습니다. 사용량은 언제나 보이고, 숨기지 않습니다."
    },
    "showcase": {
      "title": "Create 쇼케이스: Keplar로 만든 앱이 갖춰야 할 모습",
      "description": "Create가 지향하는 폭을 보여 주기 위해 Keplar 팀이 만든 데모 사이트와 앱 8개. 메뉴, 장부, 보드, 캘린더, 에디토리얼 페이지가 각자의 서체와 색상으로. 고객 사이트가 아닙니다."
    },
    "roadmap": {
      "title": "로드맵",
      "description": "Keplar가 지금 만들고 있는 것, 베타로 마무리 중인 것, 최근 출시한 것. 지키지 못할 목표 날짜는 적지 않습니다."
    },
    "developers": {
      "title": "개발자를 위한 Keplar: API, 임베드 Ask, Teams",
      "description": "Bearer API 키로 내 코드에서 Keplar에 질문하거나, script 태그 하나로 사이트에 Ask 위젯을 넣으세요. OpenAPI 명세, 스트리밍, 요금제별 한도를 명확히 안내합니다."
    },
    "signin": {
      "title": "로그인",
      "description": "Keplar에 로그인합니다."
    },
    "signup": {
      "title": "계정 만들기",
      "description": "무료 Keplar 계정을 만듭니다."
    }
  },
  "status": {
    "live": "출시됨",
    "beta": "베타",
    "soon": "출시 예정"
  },
  "chapters": {
    "demoKicker": "라이브 데모",
    "demoTitle": "여기서 바로 써 보세요. 계정 없이.",
    "proof": "만든 사람: {credit}. 공개적으로 개발합니다: <changelog>변경 내역</changelog>, <roadmap>로드맵</roadmap>, 그리고 된 것과 안 된 것을 밝히는 <security>보안 페이지</security>.",
    "showcaseNote": "쇼케이스 데모는 Keplar 팀이 만든 것으로, 고객 사이트가 아닙니다. <link>8개 모두 보기</link>",
    "closeTitle": "Keplar에게 무엇이든 물어보세요.",
    "closeCta": "Keplar에게 무엇이든 물어보세요",
    "closeSmall": "무료, 카드 불필요. <link>Keplar의 모든 것을 한 페이지에</link>, 출시됨·베타·출시 예정 여부와 함께.",
    "voiceCaption": "Voice Live Create: 말하면 에디터, 터미널, 미리보기가 함께 움직입니다. 멈추면 기다리고, \"아니 그게\"라고 하면 고칩니다.",
    "voiceLabel": "Voice Live Create: 에디터, 터미널, 실시간 미리보기를 나란히",
    "list": {
      "ask": {
        "label": "질문",
        "title": "Keplar에게 무엇이든 물어보세요.",
        "lede": "하나의 질문이 여러 AI 모델로 갑니다. Keplar는 이를 비교하고, 의견이 갈리는 곳을 보여 주며, 확실한 것을 확인해 하나의 답을 씁니다."
      },
      "understand": {
        "label": "이해",
        "title": "주는 것을 읽습니다.",
        "lede": "질문 대상을 끌어다 놓으세요. Keplar는 그 질문을 위해서만 읽고 파일을 보관하지 않습니다."
      },
      "create": {
        "label": "만들기",
        "title": "글로 쓰거나 말로 하세요. 생성된 티가 나지 않는 결과물을 받으세요.",
        "lede": "Create는 요청에 담긴 비즈니스에 맞는 디자인을 계획하고, 코드를 쓰고, 모든 화면을 테스트하며, 보라색 광채, 그라데이션 덩어리, 카드 3개 그리드를 거부합니다."
      },
      "together": {
        "label": "함께 만들기",
        "title": "누군가와 함께, 그리고 비평가와 함께 만드세요.",
        "lede": "같은 프로젝트를 동시에 작업하고, 내가 아닌 두 번째 의견을 받으세요."
      },
      "ship": {
        "label": "배포",
        "title": "한 번에 게시. 한 번에 되돌리기.",
        "lede": "프로젝트가 Keplar 주소로 공개되며, 원하면 내 도메인도 쓸 수 있습니다."
      },
      "platform": {
        "label": "플랫폼",
        "title": "어디서든 Keplar를.",
        "lede": "같은 엔진을 API 뒤에서, 브라우저에서, 내 사이트의 위젯 안에서, 팀과 함께."
      },
      "trust": {
        "label": "신뢰",
        "title": "하는 일과 데이터 다루는 방식에 솔직하게.",
        "lede": "무엇을, 어떻게 보호하는지, 아직 하지 못한 것은 무엇인지 적어 두었습니다. 받지 않은 배지는 달지 않습니다."
      }
    },
    "items": {
      "demo": {
        "name": "라이브 데모",
        "line": "이 페이지에서 실제 질문을 해 보세요. 계정 없이."
      },
      "multi-model": {
        "name": "여러 모델, 하나의 답",
        "line": "질문에 필요한 모델만 사용해 주장별로 비교합니다."
      },
      "disagreement": {
        "name": "의견 차이 지도",
        "line": "모델이 일치한 곳, 갈린 곳, 그리고 답이 그렇게 나온 이유."
      },
      "debate": {
        "name": "토론 모드",
        "line": "Keplar가 답하기 전에 모델들이 여러 라운드에 걸쳐 토론하는 모습을 보세요."
      },
      "voice": {
        "name": "음성 모드",
        "line": "소리 내어 묻고 답을 들으세요. Keplar는 음성을 녹음하거나 저장하지 않습니다."
      },
      "images": {
        "name": "이미지와 스크린샷",
        "line": "차트, 영수증, 화이트보드, UI. 이미지를 볼 수 있는 모델에만 보냅니다."
      },
      "video": {
        "name": "동영상",
        "line": "키프레임은 브라우저에서 추출되며, 영상 자체는 업로드되지 않습니다."
      },
      "docs": {
        "name": "문서, 코드, 데이터",
        "line": "PDF, 텍스트, CSV, JSON, 소스 파일을 텍스트로 읽습니다."
      },
      "office": {
        "name": "Word, PowerPoint, Excel, 오디오",
        "line": "Office 파일은 안전하게 분석하고, 오디오는 텍스트로 변환합니다."
      },
      "links": {
        "name": "링크",
        "line": "URL을 붙여 넣으면 Keplar가 보호된 방식으로 페이지를 가져와 읽습니다."
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "말하면 에디터, 터미널, 미리보기가 동시에 만들어집니다. \"아니 그게\"라고 하면 방향을 바꿉니다.",
        "note": "음성 인식을 지원하는 브라우저(Chrome, Edge, Safari)가 필요합니다."
      },
      "showcase": {
        "name": "쇼케이스",
        "line": "Create가 지켜야 할 기준을 세운 Keplar 팀의 데모 8개."
      },
      "surprise": {
        "name": "알아서 해 줘",
        "line": "한 번 누르면 구체적인 요청, 스타일, 완성도를 정해 만들어 드립니다."
      },
      "versions": {
        "name": "버전 기록",
        "line": "빌드할 때마다 버전이 남습니다. 어느 것이든 복원하거나 새 초안으로 분기하세요."
      },
      "community": {
        "name": "커뮤니티 갤러리",
        "line": "사람들이 공유하기로 한 사이트. 좋아요, 리믹스, 신고."
      },
      "anti-vibe": {
        "name": "뻔한 디자인 방지 규칙",
        "line": "문서화된 기준과 린트 검사로 흔한 AI 느낌을 보기 전에 걸러냅니다."
      },
      "collab": {
        "name": "실시간 협업",
        "line": "링크로 초대해 같은 프로젝트를 함께 편집하세요. 실시간 커서, 따라가기 모드, 공유 터미널과 미리보기.",
        "note": "Create에서 앱을 열고 Live를 선택하세요. 보기 권한은 보기만, 편집 권한은 입력할 수 있습니다."
      },
      "critic": {
        "name": "AI 비평",
        "line": "규칙, 실제 브라우저의 axe-core, 별도 모델이 빌드를 검토하고, 고른 수정 사항을 적용합니다."
      },
      "publish": {
        "name": "원클릭 게시",
        "line": "Create에서 초안을 실제 주소로 게시합니다."
      },
      "previews": {
        "name": "미리보기",
        "line": "모든 초안에는 공개 전 비공개 미리보기 링크가 있습니다."
      },
      "rollback": {
        "name": "롤백",
        "line": "변경이 잘못되면 이전 버전으로 되돌립니다."
      },
      "domains": {
        "name": "맞춤 도메인",
        "line": "소유한 도메인을 연결하면 Keplar가 DNS를 확인하고 무엇을 바꿔야 할지 알려 줍니다."
      },
      "ssl": {
        "name": "자동 HTTPS",
        "line": "연결된 도메인의 인증서를 발급하고 갱신합니다."
      },
      "api": {
        "name": "공개 API",
        "line": "Bearer 키, 요금제별 한도, OpenAPI 명세. 무료 키는 무료 모델만 사용합니다."
      },
      "embed": {
        "name": "임베드 위젯",
        "line": "script 태그 하나로 허용한 출처에서만 Keplar Ask를 사이트에 넣을 수 있습니다."
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "소유자, 관리자, 편집자, 뷰어 역할이 있는 공유 워크스페이스.",
        "note": "Business 요금제."
      },
      "referrals": {
        "name": "추천 프로그램",
        "line": "친구를 초대하면 둘 다 추가 사용량을 받습니다. 현금은 아닙니다."
      },
      "roblox-studio": {
        "name": "Roblox Studio 모드",
        "line": "Roblox Studio 안의 공동 빌더: 맵, UI, 플립북 이펙트, Luau 스크립트를 Claude Opus 5.5로.",
        "note": "데스크톱 앱, Lite 이상."
      },
      "roblox-cloud": {
        "name": "Roblox Cloud",
        "line": "게임 스크립트를 밤새 작업하고, 모든 수정은 Luau 분석기로 확인하며, 원할 때 Studio에 적용합니다.",
        "note": "스크립트만 다루며 플레이 테스트는 할 수 없습니다."
      },
      "blender": {
        "name": "Blender 모드",
        "line": "Blender 4.2 이상에서 모델링, Poly Haven PBR 세트로 텍스처, 조명, 내보내기.",
        "note": "데스크톱 앱 0.1.8 이상."
      },
      "extension": {
        "name": "Keplar One 브라우저 확장 프로그램",
        "line": "Chrome이나 Edge에서 선택한 글이나 페이지에 대해 API 키로 질문하세요.",
        "note": "Chrome 웹 스토어에 제출됨."
      },
      "lens": {
        "name": "Search with Keplar One",
        "line": "페이지의 글이나 그림을 드래그하면 답이 사이드 패널에 열립니다.",
        "note": "브라우저 확장 프로그램의 일부."
      },
      "security": {
        "name": "보안",
        "line": "암호화, 제공업체, 보관 기간, 계정 보호, 문제 신고 방법."
      },
      "changelog": {
        "name": "변경 내역",
        "line": "언제 무엇을 출시했는지."
      },
      "roadmap": {
        "name": "로드맵",
        "line": "다음에 만들 것과 아직 출시되지 않은 것."
      }
    }
  },
  "featuresPage": {
    "kicker": "Keplar의 모든 것",
    "crumb": "기능",
    "title": "모든 기능, 그리고 오늘 쓸 수 있는지.",
    "lead": "출시됨 <b>{live}</b>개, 베타 <b>{beta}</b>개, 출시 예정 <b>{soon}</b>개. 베타는 작동하지만 바뀌거나 일부 요금제로 제한될 수 있습니다. 출시 예정은 아직 쓸 수 없으며, 쓸 수 있는 것처럼 링크하지 않습니다.",
    "sections": "섹션",
    "thFeature": "기능",
    "thWhat": "하는 일",
    "thStatus": "상태",
    "foot": "최근 변경: <changelog>변경 내역</changelog>. 다음 계획: <roadmap>로드맵</roadmap>. 써 볼 준비가 됐다면: <demo>홈페이지에서 질문하기</demo>, 계정 없이."
  },
  "pricing": {
    "label": "요금",
    "title": "무료로 시작하고, 더 필요할 때 업그레이드하세요.",
    "lede": "일상적인 질문은 무료로. 프리미엄 모델, Deep Research, 사이트·이미지·동영상 제작이 필요하면 업그레이드하세요. 사업을 운영하시나요? Business가 맞춰 드립니다. Keplar 사용량은 원시 토큰이 아니라 크레딧으로 측정합니다.",
    "tailored": "비즈니스에 맞춤",
    "custom": "맞춤",
    "cadence": {
      "forever": "평생",
      "per month": "월",
      "custom": "맞춤"
    },
    "perMonth": "월 {price}",
    "fine": "계정에서 언제든 해지할 수 있습니다. 결제는 Whop이 처리합니다. 크레딧은 매월 갱신되며, 질문에 필요한 모델 작업량에 따라 사용됩니다. 간단한 질문은 아주 적게 듭니다.",
    "tiers": {
      "free": {
        "summary": "무료 오픈 모델로 Keplar-One과 함께하는 일상 질문.",
        "features": [
          "Keplar-One 오케스트레이션",
          "무료 오픈 모델만",
          "무료 모델이 붐비면 느려질 수 있음",
          "무료 모델 호스트가 프롬프트를 기록할 수 있음",
          "제한된 합의",
          "웹 검색 없음",
          "하루 최대 50개 질문(공정 사용)",
          "무료 비전 모델로 이미지·동영상 질문",
          "학습 모드: 텍스트 기반 PDF를 올려 플래시카드, 퀴즈, 학습 계획 만들기(무료 모델, 더 작은 한도)",
          "로그인 시 대화 저장과 선택적 메모리"
        ],
        "cta": "Keplar 사용해 보기"
      },
      "lite": {
        "summary": "Free 다음 단계: 일상 질문에 프리미엄 모델을 더 낮은 가격으로.",
        "features": [
          "프리미엄 모델과 Keplar-One 합의",
          "월 2,400 크레딧, 5시간 한도와 주간 한도",
          "코딩 도움과 파일 분석",
          "더 강력한 모델의 학습 모드",
          "작은 개인 사이트 만들기(무료 keplar.site 주소)",
          "이미지 생성, Slides, Deep Research, 동영상, 에이전트, 맞춤 도메인은 Plus부터"
        ],
        "cta": "Lite로 업그레이드"
      },
      "plus": {
        "summary": "매일 쓰는 분께: 학교, 일, 건강 질문, 큰 결정.",
        "features": [
          "프리미엄 모델과 고급 Keplar-One",
          "더 큰 합의 한도",
          "큰 결정을 위한 Deep Research",
          "코딩 도움과 파일 분석",
          "웹 검색 기본 꺼짐(아직 출시 전)",
          "개인 사이트와 앱 만들기",
          "PowerPoint와 PDF로 내보내는 슬라이드 제작(이미지 아이디어는 자리표시자)",
          "더 강력한 모델과 더 큰 한도의 학습 모드",
          "이미지 생성",
          "더 큰 컨텍스트와 우선 사용"
        ],
        "cta": "Plus로 업그레이드"
      },
      "pro": {
        "summary": "파워 유저와 크리에이터를 위해: 훨씬 많은 사용량, 제작, 에이전트.",
        "features": [
          "Plus의 모든 기능",
          "월 크레딧 2배 이상",
          "동영상 생성",
          "가장 큰 한도의 슬라이드 제작과 학습 모드",
          "고급 제작",
          "고급 에이전트",
          "더 큰 컨텍스트",
          "더 높은 우선순위와 동시 실행"
        ],
        "cta": "Pro로 업그레이드"
      }
    },
    "fitTitle": "어떤 요금제가 맞을까요?",
    "fits": {
      "free": {
        "who": "어떻게 작동하는지 보고 싶어요.",
        "outcome": "무료 모델로 일상 질문을 하루 50개까지. 카드 불필요.",
        "cta": "Keplar에게 무엇이든 물어보세요"
      },
      "plus": {
        "who": "학교, 일, 큰 결정에 AI를 매일 써요.",
        "outcome": "프리미엄 모델, Deep Research, Slides, 이미지 생성, 그리고 만든 것에 맞춤 도메인.",
        "cta": "Plus로 업그레이드"
      },
      "pro": {
        "who": "많이 만들고 많이 창작해요.",
        "outcome": "Plus의 2배 이상 크레딧, 동영상, 더 많은 프로젝트와 에이전트, 더 높은 우선순위.",
        "cta": "Pro로 업그레이드"
      }
    },
    "compareTitle": "모든 요금제 비교",
    "compareLede": "현재 제품이 적용하는 모든 한도를 담은 기능별 전체 비교표는 영어 요금 페이지에 있습니다.",
    "compareLink": "전체 비교 보기(영어)",
    "closingTitle": "아직 고민 중이라면? 무료로 시작하세요.",
    "closingLede": "실제 질문을 해 보고 모델이 어디서 일치하고 어디서 갈리는지 확인하세요. 카드가 필요 없고, 더 필요할 때 앱 안에서 업그레이드할 수 있습니다.",
    "closingAsk": "Keplar에게 무엇이든 물어보세요",
    "closingCompare": "Keplar 비교"
  },
  "roadmap": {
    "kicker": "로드맵",
    "title": "만들고 있는 것, 아직 끝나지 않은 것.",
    "lead": "목표 날짜는 없습니다. 작동하면 출시합니다. 아래는 모두 지금 만들고 있거나, 알려진 한계가 있지만 베타로 이미 쓸 수 있는 것입니다. 출시된 것은 <changelog>변경 내역</changelog>에서, 상태가 포함된 전체 목록은 <features>Keplar의 모든 것</features>에서 확인하세요.",
    "nowNum": "지금",
    "nowTitle": "개발 중",
    "nowLede": "아직 쓸 수 없습니다. 사이트 전체에서 출시 예정으로 표시됩니다.",
    "nextNum": "다음",
    "nextTitle": "베타 기능 마무리",
    "nextLede": "오늘 작동합니다. 아직 부족한 부분은 다음과 같습니다.",
    "doneNum": "출시됨",
    "doneTitle": "최근",
    "doneLede": "최근 몇 번의 릴리스. 날짜는 커밋 기록에서 가져옵니다.",
    "englishNote": "릴리스 노트는 영어로 제공됩니다.",
    "finishing": [
      {
        "feature": "공개 API",
        "items": [
          "팀 단위 키",
          "키별 크레딧 한도",
          "공식 SDK",
          "웹훅"
        ]
      },
      {
        "feature": "임베드 위젯",
        "items": [
          "서명된 게시자 토큰",
          "맞춤 스타일"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "구성원별 한도와 사용량 내역",
          "소유권 이전",
          "싱글 사인온"
        ]
      },
      {
        "feature": "음성",
        "items": [
          "음성 인식이 없는 브라우저(Firefox)용 대안",
          "언어 선택"
        ]
      },
      {
        "feature": "출처 확인",
        "items": [
          "실사용 테스트 후 유료 요금제에서 웹 출처 확인 켜기"
        ]
      }
    ],
    "foot": "필요한 게 빠졌나요? <feedback>알려 주세요</feedback>. 보안 문제는 <security>보안 페이지</security>에 있는 주소로 보내 주세요."
  },
  "showcase": {
    "kicker": "쇼케이스",
    "title": "보라색 광채 없이. 카드 3개 그리드 없이. 요청에 담긴 비즈니스를 위해.",
    "lead": "Create는 설명한 내용에 맞춰 디자인을 계획하고, AI로 만든 사이트를 비슷해 보이게 하는 패턴을 거부합니다. 이 데모들은 우리가 요구하는 폭을 보여 줍니다. 인쇄된 카드 같은 와인 리스트, 로스터리 장부, 배송 배차 보드.",
    "disclosure": "Create가 지향하는 바를 보여 주기 위해 Keplar 팀이 만든 쇼케이스 데모입니다. 고객 사이트가 아닙니다. 안에 있는 이름, 가격, 날짜는 샘플입니다.",
    "sites": "사이트",
    "apps": "앱",
    "styles": "비주얼 스타일",
    "industries": "업종",
    "contentNote": "데모 제목과 설명은 영어입니다.",
    "galleryKicker": "Keplar 사용자들이 만든 것",
    "gallery": "커뮤니티 갤러리",
    "yourTurn": "이제 당신 차례",
    "openCreate": "Create 열기"
  },
  "developers": {
    "kicker": "개발자",
    "title": "Keplar로 만드세요.",
    "lede": "요청 한 번으로 질문을 여러 모델에 보내 비교하고, 의견이 갈린 지점을 명확히 기록한 하나의 답을 돌려줍니다. API 키로 서버에서 호출하거나, script 태그 하나로 같은 Ask를 내 사이트에 넣으세요.",
    "getKey": "API 키 받기",
    "widget": "위젯 만들기",
    "spec": "OpenAPI 명세",
    "endpoint": "주요 엔드포인트",
    "products": [
      {
        "name": "공개 API",
        "text": "Bearer 키, JSON 또는 스트리밍 답변, 모든 응답에 일치점과 차이점."
      },
      {
        "name": "임베드 Ask",
        "text": "문서나 제품에 넣는 테마 지원 Ask 상자. 출처 허용 목록과 속도 제한 포함."
      },
      {
        "name": "Keplar for Teams",
        "text": "관리자, 편집자, 뷰어 역할이 있는 공유 워크스페이스. 이메일이나 링크로 초대."
      },
      {
        "name": "추천",
        "text": "링크를 공유하세요. 친구가 가입하면 둘 다 {n} 사용 크레딧을 받습니다."
      }
    ],
    "platform": "플랫폼",
    "refTitle": "전체 레퍼런스",
    "refLede": "요금제와 한도, 빠른 시작, 요청·응답 형식, 스트리밍, 위젯, Teams 역할, 오류, 보안 안내는 영어 개발자 페이지에 있습니다. 코드, 필드 이름, 오류 코드는 모든 언어에서 같습니다.",
    "sections": [
      "요금제와 한도",
      "빠른 시작",
      "POST /api/v1/ask",
      "스트리밍",
      "임베드 Ask 위젯",
      "Keplar for Teams",
      "오류",
      "보안과 개인정보",
      "아직 제공되지 않음"
    ],
    "refLink": "전체 레퍼런스 열기(영어)"
  },
  "auth": {
    "signinTitle": "Keplar에 로그인",
    "signinLead": "대화, 프로젝트, 요금제를 이어서 사용하세요.",
    "addTitle": "계정 추가",
    "addLead": "다른 계정으로 로그인하세요. 사용 중인 계정은 이 기기에서 로그인 상태로 유지됩니다.",
    "checkoutLead": "로그인하고 결제를 계속하세요. 로그인 후 바로 결제로 이동합니다.",
    "expired": "{email} 계정이 로그아웃되었습니다. 사용하려면 다시 로그인하세요.",
    "signupTitle": "Keplar 계정 만들기",
    "signupLead": "숙제와 큰 결정, 여행 계획과 사이드 프로젝트, 또는 사업 운영을 위해. Free는 무료 오픈 모델로 작동하며, 언제든 업그레이드할 수 있습니다.",
    "invited": "친구가 초대했어요. 이메일이 인증되면 두 분 모두 추가 사용 크레딧을 받습니다(현금 아님). 자세한 내용은 추천 약관을 확인하세요.",
    "signUp": "가입",
    "logIn": "로그인",
    "toggle": "가입 또는 로그인",
    "about": "Keplar 소개",
    "panel": {
      "signin": {
        "eyebrow": "다시 오신 것을 환영합니다",
        "title": "하던 곳에서 이어서.",
        "lead": "대화, 프로젝트, 요금제가 로그인하는 모든 기기에서 기다리고 있습니다."
      },
      "signup": {
        "eyebrow": "무료 계정",
        "title": "AI 하나만 믿지 마세요.",
        "lead": "Free는 무료 오픈 모델로 작동하며, 언제든 업그레이드할 수 있습니다."
      }
    },
    "points": [
      "질문에 필요한 모델에 묻습니다",
      "의견이 갈리는 곳을 보여 줍니다",
      "차이점까지 보여 주는 하나의 답"
    ]
  }
};

export default m;
