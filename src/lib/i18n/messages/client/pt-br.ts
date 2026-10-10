// pt-br client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "Uma pergunta.",
      "Várias inteligências.",
      "Uma resposta."
    ],
    "sub": "O Keplar usa vários modelos de IA, compara as perspectivas deles e entrega a você uma resposta clara e sintetizada.",
    "note": "Os nomes de modelos são exemplos de famílias para as quais o Keplar pode encaminhar perguntas; quais modelos respondem depende do seu plano, da pergunta e da disponibilidade. Os nomes pertencem aos seus donos. Abre no app; nada é enviado até você tocar em Enviar.",
    "ask": "Pergunte qualquer coisa ao Keplar",
    "questionLabel": "Sua pergunta",
    "builtBy": "Criado por {credit}",
    "tryDemo": "Experimente a demo ao vivo",
    "everything": "Tudo no Keplar",
    "families": "Exemplos de famílias de modelos",
    "storyLabel": "Como o Keplar funciona",
    "kickers": [
      "Pergunte",
      "Encaminhe",
      "Responda",
      "Compare",
      "Verifique",
      "Resposta"
    ],
    "index": [
      "Pergunte",
      "Pergunta",
      "Encaminhe",
      "Responda",
      "Compare",
      "Verifique",
      "Resposta"
    ],
    "questionPrompt": "Devo comprar um imóvel este ano ou continuar no aluguel?",
    "questionCaption": "Uma pergunta entra no sistema.",
    "distributionTitle": "O Keplar-One decide a quem perguntar.",
    "distributionBody": "Nem todo modelo, nem toda vez. Só as inteligências de que esta pergunta precisa, avaliadas por qualidade, confiabilidade, latência e custo.",
    "routeNote": "Os nomes são exemplos. Quais modelos respondem depende do seu plano, da pergunta e da disponibilidade. Os nomes pertencem aos seus donos.",
    "responsesTitle": "Cada um responde por conta própria.",
    "responsesBody": "Raciocínios diferentes. Evidências diferentes. Algumas respostas concordam. Outras, não.",
    "respondNote": "Ilustração, não um resultado ao vivo.",
    "agree": "5 concordam.",
    "dissent": "1 não.",
    "detected": "Divergência detectada.",
    "follow": "O Keplar investiga o porquê.",
    "disagreeNote": "Ilustração com uma pergunta de exemplo. Os números são um exemplo, não um resultado ao vivo.",
    "verificationTitle": "Avaliação, não votação.",
    "verificationBody": "O Keplar pondera as evidências e o raciocínio por trás de cada resposta. Evidências relacionadas se agrupam, contradições se separam, o ruído some. A minoria pode estar certa.",
    "verifySteps": [
      "Ponderar as evidências",
      "Separar as contradições",
      "Deixar o ruído sumir"
    ],
    "closingTitle": "Uma resposta.",
    "convergenceBody": "Sintetizada a partir do que se sustentou, com as concordâncias e divergências à mostra.",
    "closingSecondary": "Como o Keplar-One funciona",
    "beats": {
      "question": {
        "text": "Tudo começa com uma pergunta.",
        "short": "Tudo começa com uma pergunta."
      },
      "minds": {
        "text": "O Keplar consulta várias mentes ao mesmo tempo.",
        "short": "Várias mentes, ao mesmo tempo."
      },
      "disagree": {
        "text": "Ele encontra onde elas divergem.",
        "short": "Onde elas divergem."
      },
      "verify": {
        "text": "Ele verifica o que se sustenta.",
        "short": "O que se sustenta."
      },
      "answer": {
        "text": "E entrega uma resposta em que você pode confiar.",
        "short": "Uma resposta confiável."
      }
    }
  },
  "demo": {
    "samples": [
      "Num inverno rigoroso, sai mais barato usar uma bomba de calor ou um aquecedor a gás?",
      "Uma startup de duas pessoas deve abrir a empresa em Delaware?",
      "A creatina ajuda a memória ou só os músculos?"
    ],
    "stages": {
      "understand": "Entendendo a pergunta",
      "select": "Escolhendo quais modelos consultar",
      "compare": "Comparando as respostas",
      "disagree": "Procurando divergências",
      "verify": "Verificando o que se sustenta",
      "synthesize": "Escrevendo uma resposta"
    },
    "dailyDemo": "Essas foram as {n} perguntas de demo de hoje. Continue no app, de graça e sem cartão.",
    "slowDown": "Só um momento: a demo aceita poucas perguntas por minuto. Tente de novo daqui a pouco.",
    "dailyFree": "Você usou as perguntas gratuitas de hoje. Cadastre-se de graça para continuar ou volte amanhã.",
    "tooBig": "Esta pergunta precisa de mais do que o limite gratuito. Tente uma mais curta.",
    "offline": "Não foi possível conectar ao Keplar. Verifique sua conexão e tente de novo.",
    "label": "Sua pergunta",
    "placeholder": "Pergunte algo que você conferiria duas vezes.",
    "asking": "Consultando vários modelos…",
    "ask": "Pergunte qualquer coisa ao Keplar",
    "examples": "Perguntas de exemplo",
    "idleHead": "O que você vai ver",
    "disagreement": "Divergência",
    "fullCard": "Ver a resposta completa",
    "signup": "Crie uma conta gratuita para guardar seu histórico",
    "left": "Restam {left} de {n} perguntas de demo hoje",
    "metaTail": "modelos gratuitos · sem conta",
    "models": "Modelos",
    "answered": "responderam",
    "consensus": "{responded} de {consulted} modelos responderam · {agree} concordam",
    "disagreeCount": ", {n} divergem"
  },
  "authForm": {
    "checkEmail": "Confira seu e-mail",
    "sentVerify": "Enviamos um link de verificação para <b>{email}</b>. Abra e toque em “Verificar e continuar” para concluir a criação da conta. Ele expira em 24 horas.",
    "sentLink": "Enviamos um link de acesso para <b>{email}</b>. Abra e toque em “Entrar”. Ele expira em 15 minutos.",
    "notThere": "Não chegou? Confira o spam ou espere um minuto. Se você já tem uma conta, o e-mail vai avisar.",
    "sending": "Enviando…",
    "resendIn": "Reenviar em {n} s",
    "resend": "Reenviar e-mail",
    "differentEmail": "Usar outro e-mail",
    "linkInstead": "Prefiro receber um link de acesso por e-mail",
    "link": "Receber um link de acesso por e-mail",
    "oauthConsent": "Ao continuar com Google ou Microsoft, você confirma que tem pelo menos 13 anos, concorda com os <terms>Termos</terms> e reconhece a <privacy>Política de Privacidade</privacy>.",
    "or": "ou use seu e-mail",
    "name": "Nome",
    "optional": "(opcional)",
    "email": "E-mail",
    "password": "Senha",
    "forgot": "Esqueceu a senha?",
    "confirm": "Confirmar senha",
    "terms": "Tenho pelo menos 13 anos (com permissão dos pais ou responsável se tiver menos de 18), concordo com os <terms>Termos</terms> e li a <privacy>Política de Privacidade</privacy>.",
    "remember": "Manter conectado neste dispositivo",
    "unverified": "Seu e-mail ainda não foi verificado.",
    "resendVerify": "Reenviar o e-mail de verificação",
    "creating": "Criando conta…",
    "loggingIn": "Entrando…",
    "create": "Criar conta",
    "logIn": "Entrar",
    "noPassword": "Não precisa de senha. Enviamos um link de uso único que comprova seu endereço.",
    "errEmail": "Digite um e-mail válido, como voce@exemplo.com.",
    "errEmailEmpty": "Digite seu e-mail.",
    "errEmailAbove": "Digite seu e-mail acima e toque aqui de novo.",
    "errPassword": "Digite sua senha.",
    "errWeak": "Escolha uma senha mais forte.",
    "errMatch": "As duas senhas não coincidem.",
    "errTerms": "Aceite os Termos e a Política de Privacidade para criar uma conta.",
    "errTooMany": "Muitos e-mails de acesso solicitados. Tente de novo em alguns minutos.",
    "continueWith": "Continuar com {name}",
    "opening": "Abrindo {name}…",
    "soon": "Em breve",
    "passkey": "Entrar com uma chave de acesso",
    "passkeyWaiting": "Aguardando seu dispositivo…"
  }
};

export default m;
