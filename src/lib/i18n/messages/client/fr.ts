// fr client catalog. Keys mirror messages/client/en.ts; anything missing falls back to English.
import type { ClientCatalog } from "../../types";

const m: ClientCatalog = {
  "home": {
    "lead": [
      "Une question.",
      "Plusieurs intelligences.",
      "Une réponse."
    ],
    "sub": "Keplar fait appel à plusieurs modèles d’IA, compare leurs points de vue et vous donne une réponse claire et synthétisée.",
    "note": "Les noms de modèles sont des exemples de familles vers lesquelles Keplar peut orienter une question ; les modèles qui répondent dépendent de votre offre, de la question et de leur disponibilité. Les noms appartiennent à leurs propriétaires. S’ouvre dans l’app ; rien n’est envoyé avant que vous appuyiez sur Envoyer.",
    "ask": "Demandez n’importe quoi à Keplar",
    "questionLabel": "Votre question",
    "builtBy": "Conçu par {credit}",
    "tryDemo": "Essayer la démo en direct",
    "everything": "Tout Keplar",
    "families": "Exemples de familles de modèles",
    "storyLabel": "Comment fonctionne Keplar",
    "kickers": [
      "Demander",
      "Orienter",
      "Répondre",
      "Comparer",
      "Vérifier",
      "Réponse"
    ],
    "index": [
      "Demander",
      "Question",
      "Orienter",
      "Répondre",
      "Comparer",
      "Vérifier",
      "Réponse"
    ],
    "questionPrompt": "Dois-je acheter un logement cette année ou rester locataire ?",
    "questionCaption": "Une question entre dans le système.",
    "distributionTitle": "Keplar-One décide qui interroger.",
    "distributionBody": "Pas tous les modèles, pas à chaque fois. Seulement les intelligences dont cette question a besoin, choisies selon la qualité, la fiabilité, la latence et le coût.",
    "routeNote": "Les noms sont des exemples. Les modèles qui répondent dépendent de votre offre, de la question et de leur disponibilité. Les noms appartiennent à leurs propriétaires.",
    "responsesTitle": "Chacun répond de son côté.",
    "responsesBody": "Des raisonnements différents. Des preuves différentes. Certaines réponses concordent. D’autres non.",
    "respondNote": "Illustration, pas un résultat en direct.",
    "agree": "5 sont d’accord.",
    "dissent": "1 ne l’est pas.",
    "detected": "Désaccord détecté.",
    "follow": "Keplar cherche à comprendre pourquoi.",
    "disagreeNote": "Illustration avec une question d’exemple. Les chiffres sont un exemple, pas un résultat en direct.",
    "verificationTitle": "Évaluer, pas voter.",
    "verificationBody": "Keplar pèse les preuves et le raisonnement derrière chaque réponse. Les preuves liées se regroupent, les contradictions se séparent, le bruit s’efface. La minorité peut avoir raison.",
    "verifySteps": [
      "Peser les preuves",
      "Séparer les contradictions",
      "Laisser le bruit s’effacer"
    ],
    "closingTitle": "Une réponse.",
    "convergenceBody": "Synthétisée à partir de ce qui tient la route, avec les accords et les désaccords affichés.",
    "closingSecondary": "Comment fonctionne Keplar-One",
    "beats": {
      "question": {
        "text": "Tout commence par une question.",
        "short": "Tout commence par une question."
      },
      "minds": {
        "text": "Keplar interroge plusieurs esprits à la fois.",
        "short": "Plusieurs esprits, à la fois."
      },
      "disagree": {
        "text": "Il repère leurs désaccords.",
        "short": "Là où ils divergent."
      },
      "verify": {
        "text": "Il vérifie ce qui tient la route.",
        "short": "Ce qui tient la route."
      },
      "answer": {
        "text": "Et vous donne une réponse digne de confiance.",
        "short": "Une réponse fiable."
      }
    }
  },
  "demo": {
    "samples": [
      "Par un hiver froid, est-il moins cher de faire tourner une pompe à chaleur ou une chaudière à gaz ?",
      "Une startup de deux personnes devrait-elle s’immatriculer dans le Delaware ?",
      "La créatine aide-t-elle la mémoire, ou seulement les muscles ?"
    ],
    "stages": {
      "understand": "Compréhension de la question",
      "select": "Choix des modèles à interroger",
      "compare": "Comparaison de leurs réponses",
      "disagree": "Recherche des désaccords",
      "verify": "Vérification de ce qui tient",
      "synthesize": "Rédaction d’une réponse"
    },
    "dailyDemo": "C’étaient les {n} questions de démo du jour. Continuez dans l’app, gratuitement et sans carte.",
    "slowDown": "Un instant : la démo n’accepte que quelques questions par minute. Réessayez dans un moment.",
    "dailyFree": "Vous avez utilisé vos questions gratuites du jour. Inscrivez-vous gratuitement pour continuer, ou revenez demain.",
    "tooBig": "Cette question demande plus que le quota gratuit. Essayez une question plus courte.",
    "offline": "Impossible de joindre Keplar. Vérifiez votre connexion et réessayez.",
    "label": "Votre question",
    "placeholder": "Posez une question que vous vérifieriez deux fois.",
    "asking": "Interrogation de plusieurs modèles…",
    "ask": "Demandez n’importe quoi à Keplar",
    "examples": "Exemples de questions",
    "idleHead": "Ce que vous allez voir",
    "disagreement": "Désaccord",
    "fullCard": "Voir la réponse complète",
    "signup": "Créez un compte gratuit pour garder votre historique",
    "left": "Il vous reste {left} questions de démo sur {n} aujourd’hui",
    "metaTail": "modèles gratuits · sans compte",
    "models": "Modèles",
    "answered": "ont répondu",
    "consensus": "{responded} modèles sur {consulted} ont répondu · {agree} d’accord",
    "disagreeCount": ", {n} en désaccord"
  },
  "authForm": {
    "checkEmail": "Vérifiez vos e-mails",
    "sentVerify": "Nous avons envoyé un lien de vérification à <b>{email}</b>. Ouvrez-le et appuyez sur « Vérifier et continuer » pour finir de créer votre compte. Il expire dans 24 heures.",
    "sentLink": "Nous avons envoyé un lien de connexion à <b>{email}</b>. Ouvrez-le et appuyez sur « Se connecter ». Il expire dans 15 minutes.",
    "notThere": "Rien reçu ? Vérifiez vos spams ou patientez une minute. Si vous avez déjà un compte, l’e-mail vous le dira.",
    "sending": "Envoi…",
    "resendIn": "Renvoyer dans {n} s",
    "resend": "Renvoyer l’e-mail",
    "differentEmail": "Utiliser une autre adresse",
    "linkInstead": "M’envoyer plutôt un lien de connexion",
    "link": "M’envoyer un lien de connexion",
    "oauthConsent": "En continuant avec Google ou Microsoft, vous confirmez avoir au moins 13 ans, acceptez les <terms>Conditions</terms> et prenez connaissance de la <privacy>Politique de confidentialité</privacy>.",
    "or": "ou utilisez votre e-mail",
    "name": "Nom",
    "optional": "(facultatif)",
    "email": "E-mail",
    "password": "Mot de passe",
    "forgot": "Mot de passe oublié ?",
    "confirm": "Confirmer le mot de passe",
    "terms": "J’ai au moins 13 ans (avec l’autorisation d’un parent ou tuteur si j’ai moins de 18 ans), j’accepte les <terms>Conditions</terms> et j’ai lu la <privacy>Politique de confidentialité</privacy>.",
    "remember": "Rester connecté sur cet appareil",
    "unverified": "Votre adresse e-mail n’est pas encore vérifiée.",
    "resendVerify": "Renvoyer l’e-mail de vérification",
    "creating": "Création du compte…",
    "loggingIn": "Connexion…",
    "create": "Créer un compte",
    "logIn": "Se connecter",
    "noPassword": "Pas besoin de mot de passe. Nous vous envoyons un lien à usage unique qui confirme votre adresse.",
    "errEmail": "Saisissez une adresse e-mail valide, par exemple vous@exemple.com.",
    "errEmailEmpty": "Saisissez votre adresse e-mail.",
    "errEmailAbove": "Saisissez votre e-mail ci-dessus, puis appuyez de nouveau ici.",
    "errPassword": "Saisissez votre mot de passe.",
    "errWeak": "Choisissez un mot de passe plus solide.",
    "errMatch": "Les deux mots de passe ne correspondent pas.",
    "errTerms": "Acceptez les Conditions et la Politique de confidentialité pour créer un compte.",
    "errTooMany": "Trop d’e-mails de connexion demandés. Réessayez dans quelques minutes.",
    "continueWith": "Continuer avec {name}",
    "opening": "Ouverture de {name}…",
    "soon": "Bientôt",
    "passkey": "Se connecter avec une clé d’accès",
    "passkeyWaiting": "En attente de votre appareil…"
  }
};

export default m;
