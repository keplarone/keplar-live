// pt-br marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — Uma pergunta. Várias inteligências. Uma resposta.",
      "description": "O Keplar envia sua pergunta para vários modelos de IA, encontra onde eles divergem, verifica e entrega uma única resposta sintetizada. Grátis para testar, sem cadastro."
    },
    "features": {
      "title": "Tudo no Keplar",
      "description": "Todos os recursos do Keplar em uma página, agrupados pelo que fazem: perguntar, ler arquivos, criar sites e apps, construir junto, publicar, a API e o widget, e confiança. Cada um diz se está disponível, em beta ou em breve."
    },
    "pricing": {
      "title": "Preços: Free, Plus $45, Pro $99",
      "description": "Comece grátis com o Keplar One. O Keplar Plus custa $45 por mês, o Keplar Pro $99 por mês, e os planos Business estão disponíveis com nossa equipe de vendas. Uso que você vê, nunca escondido."
    },
    "showcase": {
      "title": "Vitrine do Create: como um app feito com o Keplar deveria ser",
      "description": "Oito sites e apps de demonstração feitos pela equipe Keplar para mostrar o alcance que o Create busca: cardápios, livros-caixa, quadros, calendários e páginas editoriais, cada um com sua tipografia e paleta. Não são sites de clientes."
    },
    "roadmap": {
      "title": "Roadmap",
      "description": "O que o Keplar está construindo agora, o que está em beta e ainda sendo finalizado, e o que foi lançado recentemente. Sem prazos que não possamos cumprir."
    },
    "developers": {
      "title": "Keplar para desenvolvedores: API, Ask incorporável, Teams",
      "description": "Consulte o Keplar a partir do seu código com uma chave de API Bearer ou coloque o widget Ask no seu site com uma única tag script. Especificação OpenAPI, streaming e limites por plano explicados com clareza."
    },
    "signin": {
      "title": "Entrar",
      "description": "Entre no Keplar."
    },
    "signup": {
      "title": "Crie sua conta",
      "description": "Crie uma conta gratuita no Keplar."
    }
  },
  "status": {
    "live": "Disponível",
    "beta": "Beta",
    "soon": "Em breve"
  },
  "chapters": {
    "demoKicker": "Demo ao vivo",
    "demoTitle": "Experimente aqui. Sem conta.",
    "proof": "Criado por {credit}. Desenvolvido em público: <changelog>novidades</changelog>, <roadmap>roadmap</roadmap> e uma <security>página de segurança</security> que diz o que está pronto e o que não está.",
    "showcaseNote": "As demos da vitrine são feitas pela equipe Keplar, não são sites de clientes. <link>Ver as oito</link>",
    "closeTitle": "Pergunte qualquer coisa ao Keplar.",
    "closeCta": "Pergunte qualquer coisa ao Keplar",
    "closeSmall": "Grátis, sem cartão. <link>Tudo no Keplar em uma página</link>, com o que está disponível, em beta e em breve.",
    "voiceCaption": "Voice Live Create: fale, e o editor, o terminal e a pré-visualização avançam juntos. Faça uma pausa e ele espera; diga “na verdade” e ele revisa.",
    "voiceLabel": "Voice Live Create: editor, terminal e pré-visualização ao vivo lado a lado",
    "list": {
      "ask": {
        "label": "Perguntar",
        "title": "Pergunte qualquer coisa ao Keplar.",
        "lede": "Uma pergunta vai para vários modelos de IA. O Keplar compara as respostas, mostra onde divergem, verifica o que se sustenta e escreve uma resposta."
      },
      "understand": {
        "label": "Entender",
        "title": "Ele lê o que você entrega.",
        "lede": "Solte aqui aquilo sobre o que você está perguntando. O Keplar lê só para essa pergunta e não guarda o arquivo."
      },
      "create": {
        "label": "Create",
        "title": "Descreva ou fale. Receba algo que não parece gerado.",
        "lede": "O Create planeja um design para o negócio do seu briefing, escreve o código, testa cada tela e recusa brilho roxo, manchas de degradê e grades de três cartões."
      },
      "together": {
        "label": "Construir junto",
        "title": "Construa com alguém, e com um crítico.",
        "lede": "Trabalhem no mesmo projeto ao mesmo tempo e tenha uma segunda opinião que não seja a sua."
      },
      "ship": {
        "label": "Publicar",
        "title": "Publique em um passo. Desfaça em um passo.",
        "lede": "Seu projeto vai ao ar em um endereço do Keplar, com seu próprio domínio quando você quiser."
      },
      "platform": {
        "label": "Plataforma",
        "title": "Use o Keplar de qualquer lugar.",
        "lede": "O mesmo motor, por trás de uma API, no seu navegador, dentro de um widget no seu site e compartilhado com uma equipe."
      },
      "trust": {
        "label": "Confiança",
        "title": "Transparente sobre o que faz e sobre seus dados.",
        "lede": "O que protegemos, como, e o que ainda não fizemos, tudo por escrito. Nenhum selo que não tenhamos conquistado."
      }
    },
    "items": {
      "demo": {
        "name": "Demo ao vivo",
        "line": "Faça uma pergunta real nesta página. Sem conta."
      },
      "multi-model": {
        "name": "Vários modelos, uma resposta",
        "line": "Só os modelos de que a pergunta precisa, comparados afirmação por afirmação."
      },
      "disagreement": {
        "name": "Mapa de divergências",
        "line": "Onde os modelos concordam, onde se dividem e por que a resposta foi para um lado."
      },
      "debate": {
        "name": "Modo debate",
        "line": "Veja os modelos discutirem em rodadas antes de o Keplar responder."
      },
      "voice": {
        "name": "Modo voz",
        "line": "Pergunte em voz alta e ouça a resposta. O Keplar nunca grava nem armazena seu áudio."
      },
      "images": {
        "name": "Imagens e capturas de tela",
        "line": "Gráficos, recibos, quadros brancos, interfaces. Enviados só para modelos que enxergam."
      },
      "video": {
        "name": "Vídeo",
        "line": "Os quadros-chave são extraídos no seu navegador; o vídeo em si não é enviado."
      },
      "docs": {
        "name": "Documentos, código e dados",
        "line": "PDF, texto, CSV, JSON e arquivos de código, lidos como texto."
      },
      "office": {
        "name": "Word, PowerPoint, Excel e áudio",
        "line": "Arquivos do Office processados com segurança; áudio transcrito."
      },
      "links": {
        "name": "Links",
        "line": "Cole uma URL e o Keplar lê a página por meio de uma busca protegida."
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "Fale e veja o editor, o terminal e a pré-visualização se construírem ao mesmo tempo. Diga “na verdade” para mudar de rumo.",
        "note": "Precisa de um navegador com reconhecimento de voz (Chrome, Edge, Safari)."
      },
      "showcase": {
        "name": "Vitrine",
        "line": "Oito demos da equipe Keplar que definem o padrão exigido do Create."
      },
      "surprise": {
        "name": "Me surpreenda",
        "line": "Um toque: um briefing específico, um estilo e um nível de detalhe, construídos para você."
      },
      "versions": {
        "name": "Histórico de versões",
        "line": "Cada build é uma versão. Restaure qualquer uma ou transforme-a em um novo rascunho."
      },
      "community": {
        "name": "Galeria da comunidade",
        "line": "Sites que as pessoas escolheram compartilhar. Curta, remixe, denuncie."
      },
      "anti-vibe": {
        "name": "Regras de design antigenérico",
        "line": "Um critério por escrito e uma verificação automática que rejeitam a cara típica de IA antes de você ver."
      },
      "collab": {
        "name": "Colaboração em tempo real",
        "line": "Convide por link e editem juntos o mesmo projeto: cursores ao vivo, modo seguir, terminal e pré-visualização compartilhados.",
        "note": "Abra um app no Create e depois em Live. Quem assiste vê; quem edita digita."
      },
      "critic": {
        "name": "Crítico de IA",
        "line": "Regras, axe-core em um navegador real e um modelo separado revisam seu build e aplicam as correções que você escolher."
      },
      "publish": {
        "name": "Publicação em um clique",
        "line": "Publique um rascunho em um endereço ao vivo direto do Create."
      },
      "previews": {
        "name": "Pré-visualizações",
        "line": "Cada rascunho tem um link de pré-visualização privado antes de ir ao ar."
      },
      "rollback": {
        "name": "Reversão",
        "line": "Restaure a versão anterior se uma mudança der errado."
      },
      "domains": {
        "name": "Domínios próprios",
        "line": "Conecte um domínio seu; o Keplar verifica o DNS e diz o que mudar."
      },
      "ssl": {
        "name": "HTTPS automático",
        "line": "Os certificados são emitidos e renovados para domínios conectados."
      },
      "api": {
        "name": "API pública",
        "line": "Chaves Bearer, limites por plano, especificação OpenAPI. Chaves gratuitas usam só modelos gratuitos."
      },
      "embed": {
        "name": "Widget incorporável",
        "line": "Uma tag script coloca o Keplar Ask no seu site, limitado às origens que você permitir."
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "Espaços compartilhados com as funções de proprietário, administrador, editor e leitor.",
        "note": "Plano Business."
      },
      "referrals": {
        "name": "Programa de indicação",
        "line": "Indique alguém; vocês dois ganham uso extra, nunca dinheiro."
      },
      "roblox-studio": {
        "name": "Modo Roblox Studio",
        "line": "Um parceiro de construção dentro do Roblox Studio: mapas, UI, efeitos flipbook e scripts Luau, com Claude Opus 5.5.",
        "note": "App para desktop, a partir do Lite."
      },
      "roblox-cloud": {
        "name": "Roblox Cloud",
        "line": "Trabalhos noturnos nos scripts do seu jogo, cada edição verificada pelo analisador do Luau e aplicada no Studio quando você quiser.",
        "note": "Só scripts; não consegue testar o jogo."
      },
      "blender": {
        "name": "Modo Blender",
        "line": "Modele, texturize com conjuntos PBR do Poly Haven, ilumine e exporte no Blender 4.2 ou mais recente.",
        "note": "App para desktop 0.1.8 ou mais recente."
      },
      "blender-cloud": {
        "name": "Renderização no Blender Cloud",
        "line": "Renderize uma cena nos servidores da Keplar com o computador desligado e depois baixe os quadros e um MP4.",
        "note": "App para desktop 0.1.10 ou mais recente."
      },
      "extension": {
        "name": "Extensão de navegador Keplar One",
        "line": "Pergunte sobre uma seleção ou uma página no Chrome ou Edge, com sua chave de API.",
        "note": "Enviada à Chrome Web Store."
      },
      "lens": {
        "name": "Search with Keplar One",
        "line": "Arraste sobre qualquer texto ou imagem de uma página; a resposta abre em um painel lateral.",
        "note": "Parte da extensão de navegador."
      },
      "security": {
        "name": "Segurança",
        "line": "Criptografia, provedores, retenção, proteção da conta e como relatar um problema."
      },
      "changelog": {
        "name": "Novidades",
        "line": "O que foi lançado, e quando."
      },
      "roadmap": {
        "name": "Roadmap",
        "line": "O que vamos construir a seguir e o que ainda não está disponível."
      }
    }
  },
  "featuresPage": {
    "kicker": "Tudo no Keplar",
    "crumb": "Recursos",
    "title": "Cada recurso, e se você já pode usá-lo hoje.",
    "lead": "<b>{live}</b> disponíveis, <b>{beta}</b> em beta, <b>{soon}</b> em breve. Beta funciona, mas pode mudar ou ficar restrito a alguns planos. Em breve ainda não pode ser usado e não aparece com link como se pudesse.",
    "sections": "Seções",
    "thFeature": "Recurso",
    "thWhat": "O que faz",
    "thStatus": "Status",
    "foot": "O que mudou recentemente: <changelog>novidades</changelog>. O que vem aí: <roadmap>roadmap</roadmap>. Pronto para testar: <demo>faça uma pergunta na página inicial</demo>, sem conta."
  },
  "pricing": {
    "label": "Preços",
    "title": "Comece grátis. Faça upgrade quando precisar de mais.",
    "lede": "Comece grátis para as perguntas do dia a dia. Faça upgrade para ter modelos premium, Deep Research e criação de sites, imagens e vídeos. Tem uma empresa? O Business é feito sob medida para ela. O uso do Keplar é medido em créditos, não em tokens brutos.",
    "tailored": "Sob medida para sua empresa",
    "custom": "Personalizado",
    "cadence": {
      "forever": "para sempre",
      "per month": "por mês",
      "custom": "personalizado"
    },
    "perMonth": "{price}/mês",
    "fine": "Cancele quando quiser pela sua conta. O pagamento é processado pela Whop. Os créditos renovam todo mês e são usados conforme o trabalho de modelo que cada pergunta exige: perguntas simples custam muito pouco.",
    "tiers": {
      "free": {
        "summary": "Perguntas do dia a dia com o Keplar-One, em modelos abertos gratuitos.",
        "features": [
          "Orquestração Keplar-One",
          "Só modelos abertos gratuitos",
          "Pode ficar mais lento quando os modelos gratuitos estão ocupados",
          "Os provedores de modelos gratuitos podem registrar os prompts",
          "Consenso limitado",
          "Sem buscas na web",
          "Até 50 perguntas por dia (uso justo)",
          "Perguntas sobre imagens e vídeos com modelos de visão gratuitos",
          "Modo Estudo: envie um PDF com texto para gerar flashcards, quizzes e um plano (modelos gratuitos, limites menores)",
          "Conversas salvas e memória opcional quando conectado"
        ],
        "cta": "Experimente o Keplar"
      },
      "lite": {
        "summary": "O passo acima do Free: modelos premium para o dia a dia, por um preço menor.",
        "features": [
          "Modelos premium e consenso Keplar-One",
          "2.400 créditos por mês, com limite de 5 horas e limite semanal",
          "Ajuda com código e análise de arquivos",
          "Modo Estudo com modelos mais fortes",
          "Crie um pequeno site pessoal (endereço keplar.site gratuito)",
          "Geração de imagens, Slides, Deep Research, vídeo, agentes e domínios próprios a partir do Plus"
        ],
        "cta": "Fazer upgrade para Lite"
      },
      "plus": {
        "summary": "Para uso diário: escola, trabalho, dúvidas de saúde e grandes decisões.",
        "features": [
          "Modelos premium e Keplar-One avançado",
          "Cota de consenso maior",
          "Deep Research para grandes decisões",
          "Ajuda com código e análise de arquivos",
          "Buscas na web desligadas por padrão (ainda não disponíveis)",
          "Crie sites e apps pessoais",
          "Criador de apresentações com exportação para PowerPoint e PDF (as ideias de imagem são marcadores)",
          "Modo Estudo com modelos mais fortes e limites maiores",
          "Geração de imagens",
          "Mais contexto e uso prioritário"
        ],
        "cta": "Fazer upgrade para Plus"
      },
      "pro": {
        "summary": "Para usuários intensivos e criadores: muito mais uso, criação e agentes.",
        "features": [
          "Tudo do Plus",
          "Mais que o dobro de créditos mensais",
          "Geração de vídeo",
          "Criador de apresentações e modo Estudo com os maiores limites",
          "Criação avançada",
          "Agentes avançados",
          "Mais contexto",
          "Prioridade e concorrência maiores"
        ],
        "cta": "Fazer upgrade para Pro"
      }
    },
    "fitTitle": "Qual plano combina com você?",
    "fits": {
      "free": {
        "who": "Você quer ver como funciona.",
        "outcome": "Faça perguntas do dia a dia em modelos gratuitos, até 50 por dia. Sem cartão.",
        "cta": "Pergunte qualquer coisa ao Keplar"
      },
      "plus": {
        "who": "Você usa IA todo dia para estudar, trabalhar ou tomar grandes decisões.",
        "outcome": "Modelos premium, Deep Research, Slides, geração de imagens e um domínio próprio para o que você constrói.",
        "cta": "Fazer upgrade para Plus"
      },
      "pro": {
        "who": "Você constrói e cria muito.",
        "outcome": "Mais que o dobro dos créditos do Plus, vídeo, mais projetos e agentes, e prioridade maior.",
        "cta": "Fazer upgrade para Pro"
      }
    },
    "compareTitle": "Compare todos os planos",
    "compareLede": "A tabela completa, recurso por recurso, com todos os limites que o produto aplica hoje, está na página de preços em inglês.",
    "compareLink": "Ver a comparação completa (em inglês)",
    "closingTitle": "Ainda em dúvida? Comece grátis.",
    "closingLede": "Faça uma pergunta real e veja onde os modelos concordam e onde se dividem. Sem cartão, e você pode fazer upgrade dentro do app quando quiser mais.",
    "closingAsk": "Pergunte qualquer coisa ao Keplar",
    "closingCompare": "Como o Keplar se compara"
  },
  "roadmap": {
    "kicker": "Roadmap",
    "title": "O que estamos construindo, e o que ainda não está pronto.",
    "lead": "Sem datas-alvo: as coisas são lançadas quando funcionam. Tudo abaixo está sendo construído agora ou já pode ser usado em beta, com lacunas conhecidas. Para o que já foi lançado, veja as <changelog>novidades</changelog>; para a lista completa com status, veja <features>tudo no Keplar</features>.",
    "nowNum": "Agora",
    "nowTitle": "Em construção",
    "nowLede": "Ainda não pode ser usado. Aparece como Em breve em todo o site.",
    "nextNum": "Depois",
    "nextTitle": "Finalizando recursos em beta",
    "nextLede": "Eles já funcionam hoje. Isto é o que ainda falta.",
    "doneNum": "Lançado",
    "doneTitle": "Recentemente",
    "doneLede": "As últimas versões. As datas vêm do histórico de commits.",
    "englishNote": "As notas de versão estão em inglês.",
    "finishing": [
      {
        "feature": "API pública",
        "items": [
          "Chaves por equipe",
          "Limites de crédito por chave",
          "Um SDK oficial",
          "Webhooks"
        ]
      },
      {
        "feature": "Widget incorporável",
        "items": [
          "Tokens de publicador assinados",
          "Estilo personalizado"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "Limites por membro e detalhamento de uso",
          "Transferência de propriedade",
          "Login único (SSO)"
        ]
      },
      {
        "feature": "Voz",
        "items": [
          "Uma alternativa para navegadores sem reconhecimento de voz (Firefox)",
          "Um seletor de idioma"
        ]
      },
      {
        "feature": "Verificação de fontes",
        "items": [
          "Ativar a verificação de fontes na web nos planos pagos depois de um teste ao vivo"
        ]
      }
    ],
    "foot": "Falta algo de que você precisa? <feedback>Conte para a gente</feedback>. Problemas de segurança vão para o endereço na <security>página de segurança</security>."
  },
  "showcase": {
    "kicker": "Vitrine",
    "title": "Sem brilho roxo. Sem grade de três cartões. Feito para o negócio do briefing.",
    "lead": "O Create planeja um design para o que você descreve e recusa os padrões que deixam os sites feitos por IA todos iguais. Estas demos mostram o alcance que exigimos dele: uma carta de vinhos composta como um cardápio impresso, o livro-caixa de uma torrefação, o quadro de despacho de uma transportadora.",
    "disclosure": "Demos da vitrine feitas pela equipe Keplar para mostrar o que o Create busca. Não são sites de clientes. Nomes, preços e datas são conteúdo de exemplo.",
    "sites": "sites",
    "apps": "apps",
    "styles": "estilos visuais",
    "industries": "setores",
    "contentNote": "Os títulos e descrições das demos estão em inglês.",
    "galleryKicker": "Feito por quem usa o Keplar",
    "gallery": "Galeria da comunidade",
    "yourTurn": "Sua vez",
    "openCreate": "Abrir o Create"
  },
  "developers": {
    "kicker": "Desenvolvedores",
    "title": "Construa com o Keplar.",
    "lede": "Uma requisição envia uma pergunta para vários modelos, compara as respostas e devolve uma resposta com um registro claro de onde eles divergiram. Chame do seu servidor com uma chave de API ou coloque o mesmo Ask no seu site com uma única tag script.",
    "getKey": "Obter uma chave de API",
    "widget": "Criar um widget",
    "spec": "Especificação OpenAPI",
    "endpoint": "Endpoint principal",
    "products": [
      {
        "name": "API pública",
        "text": "Chaves Bearer, respostas em JSON ou streaming, concordâncias e divergências em cada resposta."
      },
      {
        "name": "Ask incorporável",
        "text": "Uma caixa Ask personalizável para sua documentação ou produto. Lista de origens permitidas e limites de taxa incluídos."
      },
      {
        "name": "Keplar for Teams",
        "text": "Espaços compartilhados com funções de administrador, editor e leitor, convites por e-mail ou link."
      },
      {
        "name": "Indicações",
        "text": "Compartilhe seu link. Você e a pessoa indicada ganham {n} créditos de uso cada quando ela entra."
      }
    ],
    "platform": "Plataforma",
    "refTitle": "A referência completa",
    "refLede": "Planos e limites, início rápido, formato de requisição e resposta, streaming, widget, funções do Teams, erros e notas de segurança estão na página de desenvolvedores em inglês. O código, os nomes de campos e os códigos de erro são os mesmos em todos os idiomas.",
    "sections": [
      "Planos e limites",
      "Início rápido",
      "POST /api/v1/ask",
      "Streaming",
      "Widget Ask incorporável",
      "Keplar for Teams",
      "Erros",
      "Segurança e privacidade",
      "Ainda não disponível"
    ],
    "refLink": "Abrir a referência completa (em inglês)"
  },
  "auth": {
    "signinTitle": "Entre no Keplar",
    "signinLead": "Retome suas conversas, projetos e plano.",
    "addTitle": "Adicionar uma conta",
    "addLead": "Entre com outra conta. A conta que você está usando continua conectada neste dispositivo.",
    "checkoutLead": "Entre para continuar para o pagamento. Depois, você vai direto para o pagamento.",
    "expired": "A sessão de {email} foi encerrada. Entre de novo para usá-la.",
    "signupTitle": "Crie sua conta no Keplar",
    "signupLead": "Para lição de casa e grandes decisões, planos de viagem e projetos pessoais, ou para tocar uma empresa. O Free usa modelos abertos gratuitos, e você pode fazer upgrade quando quiser.",
    "invited": "Alguém indicou você: quando seu e-mail for verificado, vocês dois ganham crédito de uso extra (nunca dinheiro). Detalhes nos termos do programa de indicação.",
    "signUp": "Cadastrar",
    "logIn": "Entrar",
    "toggle": "Cadastrar ou entrar",
    "about": "Sobre o Keplar",
    "panel": {
      "signin": {
        "eyebrow": "Que bom ver você de novo",
        "title": "Continue de onde parou.",
        "lead": "Suas conversas, projetos e plano estão esperando, em todo dispositivo em que você entrar."
      },
      "signup": {
        "eyebrow": "Conta gratuita",
        "title": "Pare de confiar em uma IA só.",
        "lead": "O Free usa modelos abertos gratuitos, e você pode fazer upgrade quando quiser."
      }
    },
    "points": [
      "Consulta os modelos de que sua pergunta precisa",
      "Mostra onde eles divergem",
      "Uma resposta, com as divergências à mostra"
    ]
  }
};

export default m;
