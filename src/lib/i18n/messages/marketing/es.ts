// es marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — Una pregunta. Varias inteligencias. Una respuesta.",
      "description": "Keplar envía tu pregunta a varios modelos de IA, encuentra dónde discrepan, verifica y te da una sola respuesta sintetizada. Pruébalo gratis, sin registrarte."
    },
    "features": {
      "title": "Todo Keplar",
      "description": "Todas las funciones de Keplar en una página, agrupadas por su uso: preguntar, leer archivos, crear sitios y apps, construir en equipo, publicar, la API y el widget, y confianza. Cada una indica si está disponible, en beta o próximamente."
    },
    "pricing": {
      "title": "Precios: Free, Plus $45, Pro $99",
      "description": "Empieza gratis con Keplar One. Keplar Plus cuesta $45 al mes, Keplar Pro $99 al mes y los planes Business están disponibles con nuestro equipo de ventas. Un uso que puedes ver, nunca oculto."
    },
    "showcase": {
      "title": "Escaparate de Create: cómo debería verse una app hecha con Keplar",
      "description": "Ocho sitios y apps de demostración hechos por el equipo de Keplar para mostrar el alcance al que aspira Create: cartas, libros de cuentas, tableros, calendarios y páginas editoriales, cada uno con su propia tipografía y paleta. No son sitios de clientes."
    },
    "roadmap": {
      "title": "Hoja de ruta",
      "description": "Lo que Keplar está construyendo ahora, lo que está en beta y aún se está terminando, y lo que se lanzó hace poco. Sin fechas que no podamos cumplir."
    },
    "developers": {
      "title": "Keplar para desarrolladores: API, Ask insertable, Teams",
      "description": "Consulta a Keplar desde tu propio código con una clave API Bearer o pon el widget Ask en tu sitio con una sola etiqueta script. Especificación OpenAPI, streaming y límites por plan explicados con claridad."
    },
    "signin": {
      "title": "Iniciar sesión",
      "description": "Inicia sesión en Keplar."
    },
    "signup": {
      "title": "Crea tu cuenta",
      "description": "Crea una cuenta gratuita de Keplar."
    }
  },
  "status": {
    "live": "Disponible",
    "beta": "Beta",
    "soon": "Próximamente"
  },
  "chapters": {
    "demoKicker": "Demo en vivo",
    "demoTitle": "Pruébalo aquí. Sin cuenta.",
    "proof": "Creado por {credit}. Lanzamos en público: <changelog>novedades</changelog>, <roadmap>hoja de ruta</roadmap> y una <security>página de seguridad</security> que dice qué está hecho y qué no.",
    "showcaseNote": "Las demos del escaparate las hace el equipo de Keplar; no son sitios de clientes. <link>Ver las ocho</link>",
    "closeTitle": "Pregúntale a Keplar lo que quieras.",
    "closeCta": "Pregúntale a Keplar lo que quieras",
    "closeSmall": "Gratis, sin tarjeta. <link>Todo Keplar en una página</link>, con lo que está disponible, en beta y próximamente.",
    "voiceCaption": "Voice Live Create: habla y el editor, la terminal y la vista previa avanzan a la vez. Haz una pausa y espera; di «mejor» y lo corrige.",
    "voiceLabel": "Voice Live Create: editor, terminal y vista previa en vivo, uno al lado del otro",
    "list": {
      "ask": {
        "label": "Preguntar",
        "title": "Pregúntale a Keplar lo que quieras.",
        "lede": "Una pregunta va a varios modelos de IA. Keplar los compara, muestra dónde discrepan, comprueba qué se sostiene y redacta una respuesta."
      },
      "understand": {
        "label": "Entender",
        "title": "Lee lo que le das.",
        "lede": "Suelta aquí aquello sobre lo que preguntas. Keplar lo lee solo para esa pregunta y no guarda el archivo."
      },
      "create": {
        "label": "Create",
        "title": "Descríbelo o dilo en voz alta. Obtén algo que no parezca generado.",
        "lede": "Create planifica un diseño para el negocio de tu encargo, escribe el código, prueba cada pantalla y rechaza el brillo morado, las manchas de degradado y las cuadrículas de tres tarjetas."
      },
      "together": {
        "label": "Construir en equipo",
        "title": "Constrúyelo con alguien, y con un crítico.",
        "lede": "Trabaja con otra persona en el mismo proyecto al mismo tiempo y obtén una segunda opinión que no sea la tuya."
      },
      "ship": {
        "label": "Publicar",
        "title": "Publica en un paso. Deshaz en un paso.",
        "lede": "Tu proyecto se publica en una dirección de Keplar, y con tu propio dominio cuando quieras."
      },
      "platform": {
        "label": "Plataforma",
        "title": "Usa Keplar desde cualquier lugar.",
        "lede": "El mismo motor, detrás de una API, dentro de un widget en tu sitio y compartido en un equipo."
      },
      "trust": {
        "label": "Confianza",
        "title": "Claro sobre lo que hace y sobre tus datos.",
        "lede": "Qué protegemos, cómo, y qué no hemos hecho todavía, por escrito. Sin insignias que no nos hayamos ganado."
      }
    },
    "items": {
      "demo": {
        "name": "Demo en vivo",
        "line": "Haz una pregunta real en esta página. Sin cuenta."
      },
      "multi-model": {
        "name": "Varios modelos, una respuesta",
        "line": "Solo los modelos que necesita la pregunta, comparados afirmación por afirmación."
      },
      "disagreement": {
        "name": "Mapa de desacuerdos",
        "line": "Dónde coinciden los modelos, dónde se dividen y por qué la respuesta salió como salió."
      },
      "debate": {
        "name": "Modo debate",
        "line": "Mira cómo los modelos discuten por rondas antes de que Keplar responda."
      },
      "voice": {
        "name": "Modo voz",
        "line": "Pregunta en voz alta y escucha la respuesta. Keplar nunca graba ni guarda tu audio."
      },
      "images": {
        "name": "Imágenes y capturas",
        "line": "Gráficos, recibos, pizarras, interfaces. Solo se envían a modelos que pueden ver."
      },
      "video": {
        "name": "Video",
        "line": "Los fotogramas clave se extraen en tu navegador; el clip no se sube."
      },
      "docs": {
        "name": "Documentos, código y datos",
        "line": "PDF, texto, CSV, JSON y archivos de código, leídos como texto."
      },
      "office": {
        "name": "Word, PowerPoint, Excel y audio",
        "line": "Archivos de Office analizados de forma segura; audio transcrito."
      },
      "links": {
        "name": "Enlaces",
        "line": "Pega una URL y Keplar lee la página mediante una descarga protegida."
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "Habla y mira cómo el editor, la terminal y la vista previa se construyen a la vez. Di «mejor» para cambiar de rumbo.",
        "note": "Necesita un navegador con reconocimiento de voz (Chrome, Edge, Safari)."
      },
      "showcase": {
        "name": "Escaparate",
        "line": "Ocho demos del equipo de Keplar que marcan el nivel que se le exige a Create."
      },
      "surprise": {
        "name": "Sorpréndeme",
        "line": "Un toque: un encargo concreto, un estilo y un nivel de detalle, construidos para ti."
      },
      "versions": {
        "name": "Historial de versiones",
        "line": "Cada compilación es una versión. Restaura cualquiera o conviértela en un nuevo borrador."
      },
      "community": {
        "name": "Galería de la comunidad",
        "line": "Sitios que la gente decidió compartir. Dales me gusta, remézclalos, denúncialos."
      },
      "anti-vibe": {
        "name": "Reglas de diseño antigenérico",
        "line": "Una rúbrica escrita y una revisión automática que rechazan el típico aspecto de IA antes de que lo veas."
      },
      "collab": {
        "name": "Colaboración en tiempo real",
        "line": "Invita con un enlace y editen juntos el mismo proyecto: cursores en vivo, modo seguir, terminal y vista previa compartidas.",
        "note": "Abre una app en Create y luego Live. Quienes miran, ven; quienes editan, escriben."
      },
      "critic": {
        "name": "Crítico de IA",
        "line": "Reglas, axe-core en un navegador real y un modelo independiente revisan tu proyecto y aplican las correcciones que elijas."
      },
      "publish": {
        "name": "Publicación en un clic",
        "line": "Publica un borrador en una dirección en vivo desde Create."
      },
      "previews": {
        "name": "Vistas previas",
        "line": "Cada borrador tiene un enlace de vista previa privado antes de publicarse."
      },
      "rollback": {
        "name": "Reversión",
        "line": "Restaura la versión anterior si un cambio sale mal."
      },
      "domains": {
        "name": "Dominios propios",
        "line": "Conecta un dominio tuyo; Keplar revisa el DNS y te dice qué cambiar."
      },
      "ssl": {
        "name": "HTTPS automático",
        "line": "Los certificados se emiten y renuevan para los dominios conectados."
      },
      "api": {
        "name": "API pública",
        "line": "Claves Bearer, límites por plan, especificación OpenAPI. Las claves gratuitas usan solo modelos gratuitos."
      },
      "embed": {
        "name": "Widget insertable",
        "line": "Una etiqueta script pone Keplar Ask en tu sitio, limitado a los orígenes que permitas."
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "Espacios compartidos con roles de propietario, administrador, editor y lector.",
        "note": "Plan Business."
      },
      "referrals": {
        "name": "Programa de referidos",
        "line": "Invita a alguien; ambos reciben uso extra, nunca dinero."
      },
      "security": {
        "name": "Seguridad",
        "line": "Cifrado, proveedores, conservación de datos, protección de la cuenta y cómo informar de un problema."
      },
      "changelog": {
        "name": "Novedades",
        "line": "Qué se lanzó y cuándo."
      },
      "roadmap": {
        "name": "Hoja de ruta",
        "line": "Lo que construiremos a continuación y lo que aún no está disponible."
      }
    }
  },
  "featuresPage": {
    "kicker": "Todo Keplar",
    "crumb": "Funciones",
    "title": "Cada función, y si puedes usarla hoy.",
    "lead": "<b>{live}</b> disponibles, <b>{beta}</b> en beta, <b>{soon}</b> próximamente. Beta funciona, pero puede cambiar o estar limitada a algunos planes. Próximamente aún no se puede usar y no se enlaza como si se pudiera.",
    "sections": "Secciones",
    "thFeature": "Función",
    "thWhat": "Qué hace",
    "thStatus": "Estado",
    "foot": "Qué cambió hace poco: <changelog>novedades</changelog>. Qué viene: <roadmap>hoja de ruta</roadmap>. ¿Listo para probarlo? <demo>Haz una pregunta en la página de inicio</demo>, sin cuenta."
  },
  "pricing": {
    "label": "Precios",
    "title": "Empieza gratis. Mejora cuando necesites más.",
    "lede": "Empieza gratis para las preguntas del día a día. Mejora tu plan para tener modelos premium, Deep Research y la creación de sitios, imágenes y video. ¿Tienes un negocio? Business se adapta a él. El uso de Keplar se mide en créditos, no en tokens sin procesar.",
    "tailored": "A la medida de tu negocio",
    "custom": "A medida",
    "cadence": {
      "forever": "para siempre",
      "per month": "al mes",
      "custom": "a medida"
    },
    "perMonth": "{price}/mes",
    "fine": "Cancela cuando quieras desde tu cuenta. El pago lo gestiona Whop. Los créditos se renuevan cada mes y se gastan según cuánto trabajo de los modelos necesite una pregunta: las preguntas sencillas cuestan muy poco.",
    "tiers": {
      "free": {
        "summary": "Preguntas del día a día con Keplar-One, en modelos abiertos gratuitos.",
        "features": [
          "Orquestación Keplar-One",
          "Solo modelos abiertos gratuitos",
          "Puede ir más lento cuando los modelos gratuitos están saturados",
          "Los proveedores de modelos gratuitos pueden registrar los prompts",
          "Consenso limitado",
          "Sin búsquedas web",
          "Hasta 50 preguntas al día (uso razonable)",
          "Preguntas sobre imágenes y video con modelos de visión gratuitos",
          "Modo Estudio: sube un PDF con texto para obtener tarjetas, cuestionarios y un plan (modelos gratuitos, límites menores)",
          "Chats guardados y memoria opcional con la sesión iniciada"
        ],
        "cta": "Prueba Keplar"
      },
      "lite": {
        "summary": "El paso siguiente a Free: modelos premium para el día a día, a un precio menor.",
        "features": [
          "Modelos premium y consenso Keplar-One",
          "2400 créditos al mes con un límite de 5 horas y otro semanal",
          "Ayuda con código y análisis de archivos",
          "Modo Estudio con modelos más potentes",
          "Crea un sitio personal pequeño (dirección keplar.site gratuita)",
          "Generación de imágenes, Slides, Deep Research, video, agentes y dominios propios desde Plus"
        ],
        "cta": "Mejorar a Lite"
      },
      "plus": {
        "summary": "Para el uso diario: estudios, trabajo, preguntas de salud y grandes decisiones.",
        "features": [
          "Modelos premium y Keplar-One avanzado",
          "Más margen de consenso",
          "Deep Research para grandes decisiones",
          "Ayuda con código y análisis de archivos",
          "Búsquedas web desactivadas por defecto (aún no disponibles)",
          "Crea sitios y apps personales",
          "Creador de presentaciones con exportación a PowerPoint y PDF (las ideas de imagen son marcadores de posición)",
          "Modo Estudio con modelos más potentes y límites mayores",
          "Generación de imágenes",
          "Más contexto y uso prioritario"
        ],
        "cta": "Mejorar a Plus"
      },
      "pro": {
        "summary": "Para usuarios intensivos y creadores: mucho más uso, creación y agentes.",
        "features": [
          "Todo lo de Plus",
          "Más del doble de créditos mensuales",
          "Generación de video",
          "Creador de presentaciones y modo Estudio con los límites más altos",
          "Creación avanzada",
          "Agentes avanzados",
          "Más contexto",
          "Mayor prioridad y concurrencia"
        ],
        "cta": "Mejorar a Pro"
      }
    },
    "fitTitle": "¿Qué plan te encaja?",
    "fits": {
      "free": {
        "who": "Quieres ver cómo funciona.",
        "outcome": "Haz preguntas del día a día con modelos gratuitos, hasta 50 al día. Sin tarjeta.",
        "cta": "Pregúntale a Keplar lo que quieras"
      },
      "plus": {
        "who": "Usas IA cada día para estudiar, trabajar o tomar grandes decisiones.",
        "outcome": "Modelos premium, Deep Research, Slides, generación de imágenes y un dominio propio para lo que construyas.",
        "cta": "Mejorar a Plus"
      },
      "pro": {
        "who": "Construyes y creas mucho.",
        "outcome": "Más del doble de créditos que Plus, video, más proyectos y agentes, y mayor prioridad.",
        "cta": "Mejorar a Pro"
      }
    },
    "compareTitle": "Compara todos los planes",
    "compareLede": "La tabla completa, función por función, con cada límite que aplica hoy el producto, está en la página de precios en inglés.",
    "compareLink": "Ver la comparación completa (en inglés)",
    "closingTitle": "¿Aún no lo tienes claro? Empieza gratis.",
    "closingLede": "Haz una pregunta real y mira dónde coinciden los modelos y dónde se dividen. Sin tarjeta, y puedes mejorar tu plan desde la app cuando quieras más.",
    "closingAsk": "Pregúntale a Keplar lo que quieras",
    "closingCompare": "Cómo se compara Keplar"
  },
  "roadmap": {
    "kicker": "Hoja de ruta",
    "title": "Lo que estamos construyendo y lo que aún no está hecho.",
    "lead": "Sin fechas objetivo: las cosas se lanzan cuando funcionan. Todo lo de abajo se está construyendo ahora o ya se puede usar en beta con carencias conocidas. Para lo que ya se lanzó, mira las <changelog>novedades</changelog>; para la lista completa con su estado, mira <features>todo Keplar</features>.",
    "nowNum": "Ahora",
    "nowTitle": "En construcción",
    "nowLede": "Aún no se puede usar. Aparece como Próximamente en todo el sitio.",
    "nextNum": "Después",
    "nextTitle": "Terminando las funciones beta",
    "nextLede": "Esto ya funciona hoy. Esto es lo que todavía falta.",
    "doneNum": "Lanzado",
    "doneTitle": "Recientemente",
    "doneLede": "Las últimas versiones. Las fechas salen del historial de commits.",
    "englishNote": "Las notas de versión están en inglés.",
    "finishing": [
      {
        "feature": "API pública",
        "items": [
          "Claves a nivel de equipo",
          "Topes de créditos por clave",
          "Un SDK oficial",
          "Webhooks"
        ]
      },
      {
        "feature": "Widget insertable",
        "items": [
          "Tokens de editor firmados",
          "Estilos personalizados"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "Topes por miembro y desglose de uso",
          "Transferencia de propiedad",
          "Inicio de sesión único"
        ]
      },
      {
        "feature": "Voz",
        "items": [
          "Una alternativa para navegadores sin reconocimiento de voz (Firefox)",
          "Un selector de idioma"
        ]
      },
      {
        "feature": "Comprobación de fuentes",
        "items": [
          "Activar la comprobación de fuentes web en los planes de pago tras una prueba en vivo"
        ]
      }
    ],
    "foot": "¿Echas en falta algo que necesitas? <feedback>Cuéntanoslo</feedback>. Los problemas de seguridad van a la dirección de la <security>página de seguridad</security>."
  },
  "showcase": {
    "kicker": "Escaparate",
    "title": "Sin brillo morado. Sin cuadrícula de tres tarjetas. Hecho para el negocio del encargo.",
    "lead": "Create planifica un diseño para lo que describes y rechaza los patrones que hacen que los sitios hechos con IA se parezcan. Estas demos muestran el alcance que le exigimos: una carta de vinos compuesta como una tarjeta impresa, el libro de cuentas de un tostador de café, el tablero de despacho de una mensajería.",
    "disclosure": "Demos del escaparate hechas por el equipo de Keplar para mostrar a qué aspira Create. No son sitios de clientes. Los nombres, precios y fechas que aparecen son contenido de ejemplo.",
    "sites": "sitios",
    "apps": "apps",
    "styles": "estilos visuales",
    "industries": "sectores",
    "contentNote": "Los títulos y descripciones de las demos están en inglés.",
    "galleryKicker": "Hecho por personas que usan Keplar",
    "gallery": "Galería de la comunidad",
    "yourTurn": "Tu turno",
    "openCreate": "Abrir Create"
  },
  "developers": {
    "kicker": "Desarrolladores",
    "title": "Construye con Keplar.",
    "lede": "Una sola solicitud envía una pregunta a varios modelos, los compara y devuelve una respuesta con un registro claro de dónde discreparon. Llámala desde tu servidor con una clave API o pon el mismo Ask en tu sitio con una sola etiqueta script.",
    "getKey": "Obtener una clave API",
    "widget": "Crear un widget",
    "spec": "Especificación OpenAPI",
    "endpoint": "Endpoint principal",
    "products": [
      {
        "name": "API pública",
        "text": "Claves Bearer, respuestas en JSON o en streaming, acuerdos y desacuerdos en cada respuesta."
      },
      {
        "name": "Ask insertable",
        "text": "Una caja Ask personalizable para tu documentación o producto. Incluye lista de orígenes permitidos y límites de uso."
      },
      {
        "name": "Keplar for Teams",
        "text": "Espacios compartidos con roles de administrador, editor y lector, e invitaciones por correo o enlace."
      },
      {
        "name": "Referidos",
        "text": "Comparte tu enlace. Tú y la persona que invites reciben {n} créditos de uso cada uno cuando se una."
      }
    ],
    "platform": "Plataforma",
    "refTitle": "La referencia completa",
    "refLede": "Planes y límites, la guía rápida, el formato de solicitud y respuesta, el streaming, el widget, los roles de Teams, los errores y las notas de seguridad están en la página de desarrolladores en inglés. El código, los nombres de campos y los códigos de error son los mismos en todos los idiomas.",
    "sections": [
      "Planes y límites",
      "Guía rápida",
      "POST /api/v1/ask",
      "Streaming",
      "Widget Ask insertable",
      "Keplar for Teams",
      "Errores",
      "Seguridad y privacidad",
      "Aún no disponible"
    ],
    "refLink": "Abrir la referencia completa (en inglés)"
  },
  "auth": {
    "signinTitle": "Inicia sesión en Keplar",
    "signinLead": "Retoma tus conversaciones, proyectos y plan.",
    "addTitle": "Añadir una cuenta",
    "addLead": "Inicia sesión con otra cuenta. La cuenta que estás usando sigue con la sesión iniciada en este dispositivo.",
    "checkoutLead": "Inicia sesión para continuar con el pago. Irás directamente al pago después.",
    "expired": "Se cerró la sesión de {email}. Vuelve a iniciar sesión para usarla.",
    "signupTitle": "Crea tu cuenta de Keplar",
    "signupLead": "Para deberes y grandes decisiones, planes de viaje y proyectos personales, o para llevar un negocio. Free funciona con modelos abiertos gratuitos y puedes mejorar tu plan cuando quieras.",
    "invited": "Alguien te invitó: cuando verifiques tu correo, ambos recibirán crédito de uso extra (nunca dinero). Detalles en las condiciones del programa de referidos.",
    "signUp": "Registrarse",
    "logIn": "Iniciar sesión",
    "toggle": "Registrarse o iniciar sesión",
    "about": "Acerca de Keplar",
    "panel": {
      "signin": {
        "eyebrow": "Hola de nuevo",
        "title": "Sigue donde lo dejaste.",
        "lead": "Tus conversaciones, proyectos y plan te esperan en cada dispositivo en el que inicies sesión."
      },
      "signup": {
        "eyebrow": "Cuenta gratuita",
        "title": "Deja de confiar en una sola IA.",
        "lead": "Free funciona con modelos abiertos gratuitos y puedes mejorar tu plan cuando quieras."
      }
    },
    "points": [
      "Consulta a los modelos que necesita tu pregunta",
      "Te muestra dónde discrepan",
      "Una respuesta, con los desacuerdos a la vista"
    ]
  }
};

export default m;
