// es client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "Una pregunta.",
      "Varias inteligencias.",
      "Una respuesta."
    ],
    "sub": "Keplar usa varios modelos de IA, compara sus perspectivas y te da una respuesta clara y sintetizada.",
    "note": "Los nombres de modelos son ejemplos de familias a las que Keplar puede dirigir la pregunta; qué modelos responden depende de tu plan, de la pregunta y de la disponibilidad. Los nombres pertenecen a sus dueños. Se abre en la app; no se envía nada hasta que pulses Enviar.",
    "ask": "Pregúntale a Keplar lo que quieras",
    "questionLabel": "Tu pregunta",
    "builtBy": "Creado por {credit}",
    "tryDemo": "Prueba la demo en vivo",
    "everything": "Todo Keplar",
    "families": "Familias de modelos de ejemplo",
    "storyLabel": "Cómo funciona Keplar",
    "kickers": [
      "Pregunta",
      "Reparte",
      "Responde",
      "Compara",
      "Verifica",
      "Respuesta"
    ],
    "index": [
      "Pregunta",
      "La pregunta",
      "Reparte",
      "Responde",
      "Compara",
      "Verifica",
      "Respuesta"
    ],
    "questionPrompt": "¿Me compro una casa este año o sigo alquilando?",
    "questionCaption": "Una pregunta entra en el sistema.",
    "distributionTitle": "Keplar-One decide a quién preguntar.",
    "distributionBody": "No a todos los modelos, ni siempre. Solo a las inteligencias que necesita esta pregunta, según calidad, fiabilidad, latencia y costo.",
    "routeNote": "Los nombres son ejemplos. Qué modelos responden depende de tu plan, de la pregunta y de la disponibilidad. Los nombres pertenecen a sus dueños.",
    "responsesTitle": "Cada uno responde por su cuenta.",
    "responsesBody": "Razonamientos distintos. Pruebas distintas. Algunas respuestas coinciden. Otras no.",
    "respondNote": "Ilustración, no un resultado en vivo.",
    "agree": "5 coinciden.",
    "dissent": "1 no.",
    "detected": "Desacuerdo detectado.",
    "follow": "Keplar investiga por qué.",
    "disagreeNote": "Ilustración con una pregunta de ejemplo. Los números son un ejemplo, no un resultado en vivo.",
    "verificationTitle": "Evaluar, no votar.",
    "verificationBody": "Keplar sopesa las pruebas y el razonamiento detrás de cada respuesta. Las pruebas relacionadas se agrupan, las contradicciones se separan y el ruido desaparece. La minoría puede tener razón.",
    "verifySteps": [
      "Sopesar las pruebas",
      "Separar las contradicciones",
      "Dejar que el ruido desaparezca"
    ],
    "closingTitle": "Una respuesta.",
    "convergenceBody": "Sintetizada a partir de lo que se sostiene, mostrando los acuerdos y los desacuerdos.",
    "closingSecondary": "Cómo funciona Keplar-One",
    "beats": {
      "question": {
        "text": "Todo empieza con una pregunta.",
        "short": "Todo empieza con una pregunta."
      },
      "minds": {
        "text": "Keplar consulta a varias mentes a la vez.",
        "short": "Varias mentes, a la vez."
      },
      "disagree": {
        "text": "Encuentra dónde no están de acuerdo.",
        "short": "Dónde discrepan."
      },
      "verify": {
        "text": "Comprueba qué se sostiene.",
        "short": "Qué se sostiene."
      },
      "answer": {
        "text": "Y te da una respuesta en la que puedes confiar.",
        "short": "Una respuesta fiable."
      }
    }
  },
  "demo": {
    "samples": [
      "En un invierno frío, ¿sale más barata una bomba de calor o una caldera de gas?",
      "¿Le conviene a una startup de dos personas constituirse en Delaware?",
      "¿La creatina ayuda a la memoria o solo a los músculos?"
    ],
    "stages": {
      "understand": "Entendiendo la pregunta",
      "select": "Eligiendo qué modelos consultar",
      "compare": "Comparando sus respuestas",
      "disagree": "Buscando desacuerdos",
      "verify": "Comprobando qué se sostiene",
      "synthesize": "Redactando una respuesta"
    },
    "dailyDemo": "Esas eran las {n} preguntas de demo de hoy. Sigue en la app, gratis y sin tarjeta.",
    "slowDown": "Un momento: en la demo se permiten pocas preguntas por minuto. Vuelve a intentarlo enseguida.",
    "dailyFree": "Ya usaste las preguntas gratis de hoy. Regístrate gratis para seguir o vuelve mañana.",
    "tooBig": "Esta pregunta necesita más de lo que permite el plan gratis. Prueba con una más corta.",
    "offline": "No se pudo conectar con Keplar. Revisa tu conexión y vuelve a intentarlo.",
    "label": "Tu pregunta",
    "placeholder": "Pregunta algo que comprobarías dos veces.",
    "asking": "Consultando a varios modelos…",
    "ask": "Pregúntale a Keplar lo que quieras",
    "examples": "Preguntas de ejemplo",
    "idleHead": "Lo que vas a ver",
    "disagreement": "Desacuerdo",
    "fullCard": "Ver la respuesta completa",
    "signup": "Crea una cuenta gratis para guardar tu historial",
    "left": "Te quedan {left} de {n} preguntas de demo hoy",
    "metaTail": "modelos gratuitos · sin cuenta",
    "models": "Modelos",
    "answered": "respondieron",
    "consensus": "Respondieron {responded} de {consulted} modelos · {agree} coinciden",
    "disagreeCount": ", {n} discrepan"
  },
  "authForm": {
    "checkEmail": "Revisa tu correo",
    "sentVerify": "Enviamos un enlace de verificación a <b>{email}</b>. Ábrelo y pulsa «Verificar y continuar» para terminar de crear tu cuenta. Caduca en 24 horas.",
    "sentLink": "Enviamos un enlace de inicio de sesión a <b>{email}</b>. Ábrelo y pulsa «Iniciar sesión». Caduca en 15 minutos.",
    "notThere": "¿No lo ves? Revisa la carpeta de spam o espera un minuto. Si ya tienes una cuenta, el correo te lo indicará.",
    "sending": "Enviando…",
    "resendIn": "Reenviar en {n} s",
    "resend": "Reenviar correo",
    "differentEmail": "Usar otro correo",
    "linkInstead": "Mejor envíame un enlace de inicio de sesión",
    "link": "Envíame un enlace de inicio de sesión",
    "oauthConsent": "Al continuar con Google o Microsoft confirmas que tienes al menos 13 años, aceptas los <terms>Términos</terms> y reconoces la <privacy>Política de privacidad</privacy>.",
    "or": "o usa tu correo",
    "name": "Nombre",
    "optional": "(opcional)",
    "email": "Correo electrónico",
    "password": "Contraseña",
    "forgot": "¿Olvidaste tu contraseña?",
    "confirm": "Confirmar contraseña",
    "terms": "Tengo al menos 13 años (con permiso de mi madre, padre o tutor si soy menor de 18), acepto los <terms>Términos</terms> y he leído la <privacy>Política de privacidad</privacy>.",
    "remember": "Mantener la sesión iniciada en este dispositivo",
    "unverified": "Tu correo aún no está verificado.",
    "resendVerify": "Volver a enviar el correo de verificación",
    "creating": "Creando la cuenta…",
    "loggingIn": "Iniciando sesión…",
    "create": "Crear cuenta",
    "logIn": "Iniciar sesión",
    "noPassword": "No necesitas contraseña. Te enviamos un enlace de un solo uso que confirma tu dirección.",
    "errEmail": "Introduce un correo válido, como tu@ejemplo.com.",
    "errEmailEmpty": "Introduce tu correo electrónico.",
    "errEmailAbove": "Introduce tu correo arriba y vuelve a pulsar aquí.",
    "errPassword": "Introduce tu contraseña.",
    "errWeak": "Elige una contraseña más segura.",
    "errMatch": "Las dos contraseñas no coinciden.",
    "errTerms": "Acepta los Términos y la Política de privacidad para crear una cuenta.",
    "errTooMany": "Se pidieron demasiados correos de inicio de sesión. Vuelve a intentarlo en unos minutos.",
    "continueWith": "Continuar con {name}",
    "opening": "Abriendo {name}…",
    "soon": "Próximamente",
    "passkey": "Iniciar sesión con una llave de acceso",
    "passkeyWaiting": "Esperando a tu dispositivo…"
  }
};

export default m;
