// fr marketing catalog. Keys mirror messages/marketing/en.ts; anything missing falls back to English.
import type { MarketingCatalog } from "../../types";

const m: MarketingCatalog = {
  "meta": {
    "home": {
      "title": "Keplar One — Une question. Plusieurs intelligences. Une réponse.",
      "description": "Keplar envoie votre question à plusieurs modèles d’IA, repère leurs désaccords, vérifie et vous donne une seule réponse synthétisée. Gratuit à l’essai, sans inscription."
    },
    "features": {
      "title": "Tout Keplar",
      "description": "Toutes les fonctionnalités de Keplar sur une page, regroupées par usage : poser des questions, lire des fichiers, créer des sites et des apps, travailler à plusieurs, publier, l’API et le widget, la confiance. Chacune indique si elle est disponible, en bêta ou à venir."
    },
    "pricing": {
      "title": "Tarifs : Free, Plus $45, Pro $99",
      "description": "Commencez gratuitement avec Keplar One. Keplar Plus coûte $45 par mois, Keplar Pro $99 par mois, et les offres Business sont proposées par notre équipe commerciale. Une consommation visible, jamais cachée."
    },
    "showcase": {
      "title": "Vitrine Create : à quoi devrait ressembler une app créée avec Keplar",
      "description": "Huit sites et apps de démonstration réalisés par l’équipe Keplar pour montrer l’ambition de Create : cartes, registres, tableaux, calendriers et pages éditoriales, chacun avec sa typographie et sa palette. Ce ne sont pas des sites clients."
    },
    "roadmap": {
      "title": "Feuille de route",
      "description": "Ce que Keplar construit en ce moment, ce qui est en bêta et encore en finition, et ce qui est sorti récemment. Aucune date que nous ne pourrions pas tenir."
    },
    "developers": {
      "title": "Keplar pour les développeurs : API, Ask intégrable, Teams",
      "description": "Interrogez Keplar depuis votre code avec une clé API Bearer, ou ajoutez le widget Ask à votre site avec une seule balise script. Spécification OpenAPI, streaming, limites par offre clairement indiquées."
    },
    "signin": {
      "title": "Se connecter",
      "description": "Connectez-vous à Keplar."
    },
    "signup": {
      "title": "Créer votre compte",
      "description": "Créez un compte Keplar gratuit."
    }
  },
  "status": {
    "live": "Disponible",
    "beta": "Bêta",
    "soon": "Bientôt"
  },
  "chapters": {
    "demoKicker": "Démo en direct",
    "demoTitle": "Essayez ici. Sans compte.",
    "proof": "Conçu par {credit}. Développé au grand jour : <changelog>nouveautés</changelog>, <roadmap>feuille de route</roadmap> et une <security>page sécurité</security> qui dit ce qui est fait et ce qui ne l’est pas.",
    "showcaseNote": "Les démos de la vitrine sont réalisées par l’équipe Keplar, pas par des clients. <link>Voir les huit</link>",
    "closeTitle": "Demandez n’importe quoi à Keplar.",
    "closeCta": "Demandez n’importe quoi à Keplar",
    "closeSmall": "Gratuit, sans carte. <link>Tout Keplar sur une page</link>, avec ce qui est disponible, en bêta ou à venir.",
    "voiceCaption": "Voice Live Create : parlez, et l’éditeur, le terminal et l’aperçu avancent ensemble. Faites une pause, il attend ; dites « en fait », il corrige.",
    "voiceLabel": "Voice Live Create : éditeur, terminal et aperçu en direct côte à côte",
    "list": {
      "ask": {
        "label": "Demander",
        "title": "Demandez n’importe quoi à Keplar.",
        "lede": "Une question part vers plusieurs modèles d’IA. Keplar les compare, montre leurs désaccords, vérifie ce qui tient et rédige une seule réponse."
      },
      "understand": {
        "label": "Comprendre",
        "title": "Il lit ce que vous lui donnez.",
        "lede": "Déposez l’élément sur lequel porte votre question. Keplar le lit uniquement pour cette question et ne conserve pas le fichier."
      },
      "create": {
        "label": "Create",
        "title": "Décrivez-le ou dites-le. Obtenez un résultat qui n’a pas l’air généré.",
        "lede": "Create conçoit un design pour l’activité décrite dans votre brief, écrit le code, teste chaque écran et refuse les halos violets, les taches en dégradé et les grilles à trois cartes."
      },
      "together": {
        "label": "Créer ensemble",
        "title": "Construisez avec quelqu’un, et avec un critique.",
        "lede": "Travaillez sur le même projet en même temps, et obtenez un second avis qui n’est pas le vôtre."
      },
      "ship": {
        "label": "Publier",
        "title": "Publiez en une étape. Annulez en une étape.",
        "lede": "Votre projet est mis en ligne sur une adresse Keplar, avec votre propre domaine quand vous le souhaitez."
      },
      "platform": {
        "label": "Plateforme",
        "title": "Utilisez Keplar où que vous soyez.",
        "lede": "Le même moteur, derrière une API, dans un widget sur votre site et partagé au sein d’une équipe."
      },
      "trust": {
        "label": "Confiance",
        "title": "Transparent sur ce qu’il fait, et sur vos données.",
        "lede": "Ce que nous protégeons, comment, et ce que nous n’avons pas encore fait, noir sur blanc. Aucun badge que nous n’avons pas mérité."
      }
    },
    "items": {
      "demo": {
        "name": "Démo en direct",
        "line": "Posez une vraie question sur cette page. Sans compte."
      },
      "multi-model": {
        "name": "Plusieurs modèles, une réponse",
        "line": "Seulement les modèles dont la question a besoin, comparés affirmation par affirmation."
      },
      "disagreement": {
        "name": "Carte des désaccords",
        "line": "Où les modèles s’accordent, où ils divergent, et pourquoi la réponse a tranché ainsi."
      },
      "debate": {
        "name": "Mode débat",
        "line": "Regardez les modèles débattre en plusieurs tours avant que Keplar réponde."
      },
      "voice": {
        "name": "Mode vocal",
        "line": "Posez votre question à voix haute et écoutez la réponse. Keplar n’enregistre ni ne conserve jamais votre audio."
      },
      "images": {
        "name": "Images et captures d’écran",
        "line": "Graphiques, tickets, tableaux blancs, interfaces. Envoyés uniquement aux modèles capables de voir."
      },
      "video": {
        "name": "Vidéo",
        "line": "Les images clés sont extraites dans votre navigateur ; la vidéo elle-même n’est pas envoyée."
      },
      "docs": {
        "name": "Documents, code et données",
        "line": "PDF, texte, CSV, JSON et fichiers sources, lus comme du texte."
      },
      "office": {
        "name": "Word, PowerPoint, Excel et audio",
        "line": "Fichiers Office analysés en toute sécurité ; audio transcrit."
      },
      "links": {
        "name": "Liens",
        "line": "Collez une URL et Keplar lit la page via une récupération sécurisée."
      },
      "voice-create": {
        "name": "Voice Live Create",
        "line": "Parlez et regardez l’éditeur, le terminal et l’aperçu se construire en même temps. Dites « en fait » pour changer de cap.",
        "note": "Nécessite un navigateur avec reconnaissance vocale (Chrome, Edge, Safari)."
      },
      "showcase": {
        "name": "Vitrine",
        "line": "Huit démos de l’équipe Keplar qui fixent le niveau exigé de Create."
      },
      "surprise": {
        "name": "Surprenez-moi",
        "line": "Un seul clic : un brief précis, un style et un niveau de détail, construits pour vous."
      },
      "versions": {
        "name": "Historique des versions",
        "line": "Chaque génération est une version. Restaurez-en une, ou dérivez-la en nouveau brouillon."
      },
      "community": {
        "name": "Galerie de la communauté",
        "line": "Des sites que les gens ont choisi de partager. Aimez, remixez, signalez."
      },
      "anti-vibe": {
        "name": "Règles de design anti-générique",
        "line": "Une grille écrite et une vérification automatique qui écartent le look IA habituel avant que vous ne le voyiez."
      },
      "collab": {
        "name": "Collaboration en temps réel",
        "line": "Invitez par lien et modifiez le même projet ensemble : curseurs en direct, mode suivi, terminal et aperçu partagés.",
        "note": "Ouvrez une app dans Create, puis Live. Les lecteurs regardent ; les éditeurs écrivent."
      },
      "critic": {
        "name": "Critique IA",
        "line": "Des règles, axe-core dans un vrai navigateur et un modèle distinct examinent votre projet, puis appliquent les corrections choisies."
      },
      "publish": {
        "name": "Publication en un clic",
        "line": "Publiez un brouillon sur une adresse en ligne depuis Create."
      },
      "previews": {
        "name": "Aperçus",
        "line": "Chaque brouillon a un lien d’aperçu privé avant sa mise en ligne."
      },
      "rollback": {
        "name": "Retour arrière",
        "line": "Restaurez la version précédente si un changement tourne mal."
      },
      "domains": {
        "name": "Domaines personnalisés",
        "line": "Connectez un domaine qui vous appartient ; Keplar vérifie le DNS et vous dit quoi modifier."
      },
      "ssl": {
        "name": "HTTPS automatique",
        "line": "Les certificats sont émis et renouvelés pour les domaines connectés."
      },
      "api": {
        "name": "API publique",
        "line": "Clés Bearer, limites par offre, spécification OpenAPI. Les clés gratuites n’utilisent que des modèles gratuits."
      },
      "embed": {
        "name": "Widget intégrable",
        "line": "Une seule balise script ajoute Keplar Ask à votre site, limité aux origines que vous autorisez."
      },
      "teams": {
        "name": "Keplar for Teams",
        "line": "Espaces partagés avec les rôles propriétaire, admin, éditeur et lecteur.",
        "note": "Offre Business."
      },
      "referrals": {
        "name": "Programme de parrainage",
        "line": "Invitez un ami : vous recevez tous les deux de l’usage en plus, jamais d’argent."
      },
      "security": {
        "name": "Sécurité",
        "line": "Chiffrement, fournisseurs, conservation, protection du compte et signalement d’un problème."
      },
      "changelog": {
        "name": "Nouveautés",
        "line": "Ce qui est sorti, et quand."
      },
      "roadmap": {
        "name": "Feuille de route",
        "line": "Ce que nous construisons ensuite, et ce qui n’est pas encore disponible."
      }
    }
  },
  "featuresPage": {
    "kicker": "Tout Keplar",
    "crumb": "Fonctionnalités",
    "title": "Chaque fonctionnalité, et si vous pouvez l’utiliser aujourd’hui.",
    "lead": "<b>{live}</b> disponibles, <b>{beta}</b> en bêta, <b>{soon}</b> à venir. Une fonctionnalité en bêta marche, mais peut évoluer ou être réservée à certaines offres. « Bientôt » signifie qu’elle n’est pas encore utilisable, et elle n’est pas présentée comme si elle l’était.",
    "sections": "Sections",
    "thFeature": "Fonctionnalité",
    "thWhat": "Ce qu’elle fait",
    "thStatus": "Statut",
    "foot": "Ce qui a changé récemment : <changelog>nouveautés</changelog>. Ce qui arrive : <roadmap>feuille de route</roadmap>. Prêt à essayer : <demo>posez une question sur la page d’accueil</demo>, sans compte."
  },
  "pricing": {
    "label": "Tarifs",
    "title": "Commencez gratuitement. Passez à la vitesse supérieure quand il le faut.",
    "lede": "Commencez gratuitement pour les questions du quotidien. Passez à une offre payante pour les modèles premium, Deep Research et la création de sites, d’images et de vidéos. Vous dirigez une entreprise ? Business s’adapte à elle. L’usage de Keplar se mesure en crédits, pas en tokens bruts.",
    "tailored": "Adapté à votre entreprise",
    "custom": "Sur mesure",
    "cadence": {
      "forever": "pour toujours",
      "per month": "par mois",
      "custom": "sur mesure"
    },
    "perMonth": "{price}/mois",
    "fine": "Résiliez à tout moment depuis votre compte. Le paiement est géré par Whop. Les crédits se renouvellent chaque mois et sont consommés selon le travail que demande une question aux modèles : une question simple coûte très peu.",
    "tiers": {
      "free": {
        "summary": "Les questions du quotidien avec Keplar-One, sur des modèles ouverts gratuits.",
        "features": [
          "Orchestration Keplar-One",
          "Modèles ouverts gratuits uniquement",
          "Peut être plus lent quand les modèles gratuits sont saturés",
          "Les hébergeurs de modèles gratuits peuvent journaliser les prompts",
          "Consensus limité",
          "Pas de recherche web",
          "Jusqu’à 50 questions par jour (usage raisonnable)",
          "Questions sur images et vidéos avec des modèles de vision gratuits",
          "Mode Étude : importez un PDF textuel pour obtenir fiches, quiz et planning (modèles gratuits, limites réduites)",
          "Conversations enregistrées et mémoire facultative une fois connecté"
        ],
        "cta": "Essayer Keplar"
      },
      "lite": {
        "summary": "Le cran au-dessus de Free : des modèles premium pour le quotidien, à un prix plus bas.",
        "features": [
          "Modèles premium et consensus Keplar-One",
          "2 400 crédits par mois, avec une limite sur 5 heures et une limite hebdomadaire",
          "Aide au code et analyse de fichiers",
          "Mode Étude sur des modèles plus puissants",
          "Créez un petit site personnel (adresse keplar.site gratuite)",
          "Génération d’images, Slides, Deep Research, vidéo, agents et domaines personnalisés à partir de Plus"
        ],
        "cta": "Passer à Lite"
      },
      "plus": {
        "summary": "Pour un usage quotidien : études, travail, questions de santé et grandes décisions.",
        "features": [
          "Modèles premium et Keplar-One avancé",
          "Quota de consensus plus large",
          "Deep Research pour les grandes décisions",
          "Aide au code et analyse de fichiers",
          "Recherche web désactivée par défaut (pas encore disponible)",
          "Créez des sites et des apps personnels",
          "Créateur de présentations avec export PowerPoint et PDF (les idées d’images sont des emplacements réservés)",
          "Mode Étude sur des modèles plus puissants avec des limites plus élevées",
          "Génération d’images",
          "Contexte plus large et usage prioritaire"
        ],
        "cta": "Passer à Plus"
      },
      "pro": {
        "summary": "Pour les utilisateurs intensifs et les créateurs : beaucoup plus d’usage, de création et d’agents.",
        "features": [
          "Tout ce qu’offre Plus",
          "Plus du double de crédits mensuels",
          "Génération de vidéos",
          "Créateur de présentations et mode Étude avec les limites les plus élevées",
          "Création avancée",
          "Agents avancés",
          "Contexte plus large",
          "Priorité et simultanéité accrues"
        ],
        "cta": "Passer à Pro"
      },
      "business": {
        "summary": "Vous dirigez une entreprise ? Répondre, puis créer, puis agir.",
        "features": [
          "Commerce, CRM, boîte de réception et tableau de bord",
          "Agents autonomes qui continuent à travailler après la fermeture de l’onglet",
          "Plafonds de dépenses stricts et validations humaines",
          "Permissions fines, jusqu’au niveau de chaque outil",
          "Journaux d’audit, retour arrière et arrêt d’urgence",
          "Isolation des secrets et sandboxing",
          "Validations des déploiements en production et des paiements"
        ],
        "cta": "Contacter Keplar"
      }
    },
    "fitTitle": "Quelle offre vous convient ?",
    "fits": {
      "free": {
        "who": "Vous voulez voir comment ça marche.",
        "outcome": "Posez vos questions du quotidien sur des modèles gratuits, jusqu’à 50 par jour. Sans carte.",
        "cta": "Demandez n’importe quoi à Keplar"
      },
      "plus": {
        "who": "Vous utilisez l’IA chaque jour pour vos études, votre travail ou vos grandes décisions.",
        "outcome": "Modèles premium, Deep Research, Slides, génération d’images et domaine personnalisé pour ce que vous créez.",
        "cta": "Passer à Plus"
      },
      "pro": {
        "who": "Vous construisez et créez beaucoup.",
        "outcome": "Plus du double des crédits de Plus, la vidéo, davantage de projets et d’agents, et une priorité plus élevée.",
        "cta": "Passer à Pro"
      },
      "business": {
        "who": "Votre entreprise en dépend.",
        "outcome": "Commerce, CRM et agents avec plafonds de dépenses, validations et journaux d’audit.",
        "cta": "Contacter Keplar"
      }
    },
    "compareTitle": "Comparer toutes les offres",
    "compareLede": "Le tableau complet, fonctionnalité par fonctionnalité, avec chaque limite appliquée aujourd’hui par le produit, se trouve sur la page des tarifs en anglais.",
    "compareLink": "Voir la comparaison complète (en anglais)",
    "closingTitle": "Pas encore sûr ? Commencez gratuitement.",
    "closingLede": "Posez une vraie question et voyez où les modèles s’accordent et où ils divergent. Sans carte, et vous pouvez changer d’offre depuis l’app quand vous voulez plus.",
    "closingAsk": "Demandez n’importe quoi à Keplar",
    "closingCompare": "Keplar face aux autres"
  },
  "roadmap": {
    "kicker": "Feuille de route",
    "title": "Ce que nous construisons, et ce qui n’est pas encore fait.",
    "lead": "Pas de dates cibles : les choses sortent quand elles fonctionnent. Tout ce qui suit est soit en cours de construction, soit déjà utilisable en bêta avec des manques connus. Pour ce qui est sorti, consultez les <changelog>nouveautés</changelog> ; pour la liste complète avec les statuts, consultez <features>tout Keplar</features>.",
    "nowNum": "Maintenant",
    "nowTitle": "En construction",
    "nowLede": "Pas encore utilisable. Indiqué « Bientôt » partout sur le site.",
    "nextNum": "Ensuite",
    "nextTitle": "Finition des fonctionnalités bêta",
    "nextLede": "Elles marchent déjà. Voici ce qui manque encore.",
    "doneNum": "Sorti",
    "doneTitle": "Récemment",
    "doneLede": "Les dernières versions. Les dates proviennent de l’historique des commits.",
    "englishNote": "Les notes de version sont en anglais.",
    "finishing": [
      {
        "feature": "API publique",
        "items": [
          "Clés au niveau de l’équipe",
          "Plafonds de crédits par clé",
          "Un SDK officiel",
          "Webhooks"
        ]
      },
      {
        "feature": "Widget intégrable",
        "items": [
          "Jetons d’éditeur signés",
          "Style personnalisé"
        ]
      },
      {
        "feature": "Keplar for Teams",
        "items": [
          "Plafonds par membre et détail de la consommation",
          "Transfert de propriété",
          "Authentification unique (SSO)"
        ]
      },
      {
        "feature": "Voix",
        "items": [
          "Une solution de repli pour les navigateurs sans reconnaissance vocale (Firefox)",
          "Un sélecteur de langue"
        ]
      },
      {
        "feature": "Vérification des sources",
        "items": [
          "Activer la vérification des sources web sur les offres payantes après un test en conditions réelles"
        ]
      }
    ],
    "foot": "Il vous manque quelque chose ? <feedback>Dites-le-nous</feedback>. Les problèmes de sécurité sont à signaler à l’adresse indiquée sur la <security>page sécurité</security>."
  },
  "showcase": {
    "kicker": "Vitrine",
    "title": "Pas de halo violet. Pas de grille à trois cartes. Conçu pour l’activité du brief.",
    "lead": "Create conçoit un design pour ce que vous décrivez, puis refuse les motifs qui font que les sites créés par IA se ressemblent tous. Ces démos montrent le niveau que nous exigeons : une carte des vins composée comme un menu imprimé, le registre d’un torréfacteur, le tableau de répartition d’un service de coursiers.",
    "disclosure": "Démos de la vitrine réalisées par l’équipe Keplar pour montrer l’ambition de Create. Ce ne sont pas des sites clients. Les noms, prix et dates sont des contenus d’exemple.",
    "sites": "sites",
    "apps": "apps",
    "styles": "styles visuels",
    "industries": "secteurs",
    "contentNote": "Les titres et descriptions des démos sont en anglais.",
    "galleryKicker": "Créé par des utilisateurs de Keplar",
    "gallery": "Galerie de la communauté",
    "yourTurn": "À vous",
    "openCreate": "Ouvrir Create"
  },
  "developers": {
    "kicker": "Développeurs",
    "title": "Construisez avec Keplar.",
    "lede": "Une seule requête envoie une question à plusieurs modèles, les compare et renvoie une réponse accompagnée d’un relevé clair de leurs désaccords. Appelez-la depuis votre serveur avec une clé API, ou placez le même Ask sur votre site avec une seule balise script.",
    "getKey": "Obtenir une clé API",
    "widget": "Créer un widget",
    "spec": "Spécification OpenAPI",
    "endpoint": "Endpoint principal",
    "products": [
      {
        "name": "API publique",
        "text": "Clés Bearer, réponses en JSON ou en streaming, accords et désaccords dans chaque réponse."
      },
      {
        "name": "Ask intégrable",
        "text": "Un champ Ask personnalisable pour votre documentation ou votre produit. Liste d’origines autorisées et limites de débit incluses."
      },
      {
        "name": "Keplar for Teams",
        "text": "Espaces partagés avec les rôles admin, éditeur et lecteur, invitations par e-mail ou par lien."
      },
      {
        "name": "Parrainage",
        "text": "Partagez votre lien. Votre ami et vous recevez chacun {n} crédits d’usage quand il s’inscrit."
      }
    ],
    "platform": "Plateforme",
    "refTitle": "La référence complète",
    "refLede": "Offres et limites, démarrage rapide, format des requêtes et réponses, streaming, widget, rôles Teams, erreurs et notes de sécurité se trouvent sur la page développeurs en anglais. Le code, les noms de champs et les codes d’erreur sont identiques dans toutes les langues.",
    "sections": [
      "Offres et limites",
      "Démarrage rapide",
      "POST /api/v1/ask",
      "Streaming",
      "Widget Ask intégrable",
      "Keplar for Teams",
      "Erreurs",
      "Sécurité et confidentialité",
      "Pas encore disponible"
    ],
    "refLink": "Ouvrir la référence complète (en anglais)"
  },
  "auth": {
    "signinTitle": "Connectez-vous à Keplar",
    "signinLead": "Retrouvez vos conversations, vos projets et votre offre.",
    "addTitle": "Ajouter un compte",
    "addLead": "Connectez-vous avec un autre compte. Le compte que vous utilisez reste connecté sur cet appareil.",
    "checkoutLead": "Connectez-vous pour poursuivre le paiement. Vous irez directement à l’étape de paiement ensuite.",
    "expired": "{email} a été déconnecté. Reconnectez-vous pour l’utiliser.",
    "signupTitle": "Créez votre compte Keplar",
    "signupLead": "Pour les devoirs et les grandes décisions, les voyages et les projets perso, ou pour gérer une entreprise. Free fonctionne avec des modèles ouverts gratuits, et vous pouvez changer d’offre à tout moment.",
    "invited": "Un ami vous a invité : une fois votre e-mail vérifié, vous recevez tous les deux un crédit d’usage supplémentaire (jamais d’argent). Détails dans les conditions du parrainage.",
    "signUp": "S’inscrire",
    "logIn": "Se connecter",
    "toggle": "S’inscrire ou se connecter",
    "about": "À propos de Keplar",
    "panel": {
      "signin": {
        "eyebrow": "Bon retour",
        "title": "Reprenez là où vous vous étiez arrêté.",
        "lead": "Vos conversations, vos projets et votre offre vous attendent, sur chaque appareil où vous vous connectez."
      },
      "signup": {
        "eyebrow": "Compte gratuit",
        "title": "Arrêtez de vous fier à une seule IA.",
        "lead": "Free fonctionne avec des modèles ouverts gratuits, et vous pouvez changer d’offre à tout moment."
      }
    },
    "points": [
      "Interroge les modèles dont votre question a besoin",
      "Vous montre leurs désaccords",
      "Une réponse, avec les désaccords affichés"
    ]
  }
};

export default m;
