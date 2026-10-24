import type { LegalTexts } from './types'

/*
 * À RELIRE PAR NINA : ces textes décrivent ce que fait réellement l'application (vérifié dans le code, voir DEVELOPER.md § 20.13),
 * mais ce n'est PAS un avis juridique. Faites-les relire (modèles de la CNIL, service-public.fr) avant la mise en ligne.
 * À vérifier avant publication :
 *  - l'adresse de contact (variable NUXT_PUBLIC_CONTACT_EMAIL, après l'achat du domaine) ;
 *  - dans Sentry : « Prevent Storing of IP Addresses » activé (la page l'affirme) ;
 *  - les adresses des hébergeurs (copiées des pages officielles le 2026-10-24) ;
 *  - les durées : aucune purge automatique n'existe pour les signalements (voir la page de confidentialité) ;
 *  - les sauvegardes de l'hébergeur (ce que Supabase conserve après suppression).
 */
export const legalFr: LegalTexts = {
  contactLabel: 'Contact : ',
  contactFallback: 'Une adresse de contact dédiée sera publiée ici prochainement. En attendant, vous pouvez exercer l\'essentiel de vos droits vous-même depuis la page Réglages (export et suppression de vos données).',
  updatedLabel: 'Dernière mise à jour : ',
  pages: {
    mentions: {
      title: 'Mentions légales',
      intro: 'Informations légales sur le site et son hébergement.',
      sections: [
        {
          id: 'editeur',
          title: 'Éditeur du site',
          blocks: [
            { type: 'p', text: 'Ce site est édité à titre non professionnel par une personne physique, sans but commercial : il est gratuit et ne contient aucune publicité.' },
            { type: 'p', text: 'Conformément à l\'article 6, III, 2 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l\'économie numérique (LCEN), l\'éditrice a choisi de ne pas rendre publics son nom et son adresse. Elle a communiqué son identité à ses hébergeurs, auxquels une autorité judiciaire peut la demander.' },
            { type: 'contact' }
          ]
        },
        {
          id: 'hebergement',
          title: 'Hébergement',
          blocks: [
            { type: 'p', text: 'Le site (pages et fonctions serveur) est hébergé par :' },
            { type: 'ul', items: ['Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis — vercel.com.'] },
            { type: 'p', text: 'La base de données, la connexion des comptes et le stockage des fichiers sont fournis par :' },
            { type: 'ul', items: ['Supabase, Inc., 3500 S. DuPont Highway, Dover, DE 19901, États-Unis — supabase.com. Les données du site sont hébergées dans l\'Union européenne (région de Paris).'] }
          ]
        },
        {
          id: 'contenus',
          title: 'Contenus publiés par les utilisateurs',
          blocks: [
            { type: 'p', text: 'Les recettes, photos et textes sont publiés par les personnes qui ont un compte, qui en sont responsables (voir les conditions d\'utilisation). Pour signaler un contenu, utilisez le lien « Signaler » présent sur chaque recette qui n\'est pas la vôtre et sur les pages publiques.' }
          ]
        },
        {
          id: 'donnees',
          title: 'Données personnelles',
          blocks: [
            { type: 'p', text: 'Le traitement de vos données est décrit dans la politique de confidentialité.' }
          ]
        }
      ]
    },

    privacy: {
      title: 'Politique de confidentialité',
      intro: 'Quelles données le site utilise, pourquoi, avec qui elles sont partagées, combien de temps elles sont conservées, et comment exercer vos droits.',
      sections: [
        {
          id: 'responsable',
          title: 'Qui est responsable ?',
          blocks: [
            { type: 'p', text: 'Le responsable du traitement est l\'éditrice du site (une personne physique, voir les mentions légales).' },
            { type: 'contact' }
          ]
        },
        {
          id: 'donnees',
          title: 'Les données que nous traitons',
          blocks: [
            { type: 'ul', items: [
              'Compte : adresse e-mail, nom saisi à l\'inscription et mot de passe (conservé uniquement sous forme chiffrée par le service d\'authentification, jamais lisible) ; avec la connexion Google, le nom et l\'adresse e-mail que Google transmet.',
              'Profil : pseudonyme (visible des autres personnes), titre de votre carnet, thème, langue préférée, réglage des notifications, choix d\'apparaître ou non dans la recherche.',
              'Contenu : vos recettes (titre, ingrédients, étapes, notes, étiquettes, catégorie, traduction automatique), vos catégories, vos photos si vous en ajoutez, vos favoris, votre planning de repas et vos listes de courses.',
              'Partage : vos amis et demandes d\'amis, vos groupes, invitations et droits de partage, vos liens publics, vos notifications dans l\'application, les bandeaux que vous avez fermés.',
              'Signalements : ceux que vous envoyez (motif, détails, recette concernée).',
              'Intelligence artificielle : un journal d\'usage (date, fonction, modèle utilisé, nombre de jetons, coût estimé, réussite ou échec) pour appliquer la limite quotidienne et suivre les coûts. Le contenu envoyé n\'est pas conservé dans ce journal.',
              'Données techniques : l\'hébergeur tient des journaux de fonctionnement (adresse IP, date, page demandée) pour la sécurité et le bon fonctionnement du service ; l\'application n\'y ajoute rien.'
            ] },
            { type: 'p', text: 'Nous ne vendons aucune donnée, nous n\'affichons aucune publicité et nous n\'utilisons aucun outil de mesure d\'audience ni aucun profilage.' }
          ]
        },
        {
          id: 'finalites',
          title: 'Pourquoi, et sur quelle base légale',
          blocks: [
            { type: 'ul', items: [
              'Fournir le service (créer un compte, conserver et afficher vos recettes, les partager, planning, courses) : exécution du service que vous demandez en créant un compte.',
              'Importer et traduire des recettes avec l\'IA, à votre demande : exécution du service.',
              'Sécurité, prévention des abus et modération (limites d\'usage, signalements, traitement des contenus illicites) : intérêt légitime de l\'éditrice et obligation de réagir aux contenus manifestement illicites.',
              'Détecter et corriger les erreurs techniques : intérêt légitime.',
              'E-mails de confirmation de compte et de réinitialisation du mot de passe : nécessaires au service. Le réglage « notifications par e-mail » est enregistré, mais aucun e-mail de ce type n\'est envoyé pour le moment ; si cela change, ce sera sur la base de ce réglage (votre consentement) et cette page sera mise à jour.'
            ] }
          ]
        },
        {
          id: 'destinataires',
          title: 'Avec qui les données sont partagées',
          blocks: [
            { type: 'p', text: 'Les autres utilisateurs ne voient de vous que votre pseudonyme et ce que vous choisissez de partager (jamais votre adresse e-mail). Côté prestataires techniques (sous-traitants) :' },
            { type: 'ul', items: [
              'Supabase (base de données, comptes, stockage des photos) : hébergé dans l\'Union européenne (Paris).',
              'Vercel (hébergement du site et des fonctions serveur) : société américaine.',
              'OpenAI (intelligence artificielle) : société américaine. Reçoivent un envoi pour extraction ou traduction : le texte que vous collez ou dictez (la dictée est envoyée sous forme d\'enregistrement audio pour être transcrite), les photos et PDF que vous déposez, et le texte d\'une recette lorsqu\'elle est traduite vers l\'autre langue. Ni votre adresse e-mail ni votre identifiant ne sont joints. D\'après les conditions publiées par OpenAI pour son API, ces données ne servent pas à entraîner ses modèles et peuvent être conservées jusqu\'à 30 jours pour détecter les abus.',
              'Sentry (suivi des erreurs) : données hébergées dans l\'Union européenne. L\'application n\'envoie à Sentry ni cookies, ni en-têtes de requête, ni contenu des requêtes, ni identité ou adresse e-mail ; seulement le message technique de l\'erreur, la page concernée (sans paramètres) et des informations sur le navigateur. Le projet est réglé pour ne pas conserver les adresses IP.',
              'Google : uniquement si vous choisissez la connexion Google (Google reçoit votre connexion) ou l\'import depuis Google Drive (chargé seulement au moment où vous cliquez sur le bouton ; l\'application ne peut lire que les fichiers que vous choisissez, directement depuis votre navigateur).'
            ] },
            { type: 'p', text: 'Plusieurs de ces prestataires sont situés ou ont des activités hors de l\'Union européenne (États-Unis). Les transferts reposent sur les garanties prévues par le RGPD, en particulier les clauses contractuelles types de la Commission européenne ou le cadre de protection des données UE–États-Unis, selon le prestataire.' }
          ]
        },
        {
          id: 'photos',
          title: 'Photos des recettes',
          blocks: [
            { type: 'p', text: 'Les photos sont stockées chez Supabase et sont privées : une photo n\'est visible que des personnes qui ont le droit de voir la recette. Il n\'existe pas d\'adresse publique de photo. L\'application affiche chaque photo par un lien temporaire (valable environ une heure), délivré seulement si votre compte a accès à la recette.' },
            {
              type: 'ul',
              items: [
                'Lien public d\'une recette : si vous créez un lien de partage, la photo de la recette est visible par toute personne qui a ce lien, sans compte, tant que le lien est actif. Révoquer le lien (ou supprimer la recette) arrête l\'accès : les liens temporaires délivrés sont très courts (2 minutes).',
                'Copie d\'une recette : la personne qui copie votre recette obtient sa propre copie de la photo, qui lui appartient ensuite et reste chez elle même si vous supprimez l\'original.',
                'Remplacement ou suppression : l\'ancienne photo est effacée du stockage quand vous la remplacez ou la retirez, et toutes les photos d\'une recette sont effacées avec la recette (et avec votre compte).'
              ]
            }
          ]
        },
        {
          id: 'durees',
          title: 'Combien de temps',
          blocks: [
            { type: 'ul', items: [
              'Vos données sont conservées tant que votre compte existe. Quand vous supprimez votre compte, votre profil, vos recettes, photos, favoris, planning, listes de courses, relations, notifications et journal d\'usage de l\'IA sont supprimés.',
              'Les copies qu\'une autre personne a faites de l\'une de vos recettes lui appartiennent et restent dans son carnet. Les recettes que d\'autres avaient ajoutées « telles quelles » disparaissent de leur carnet (elles en sont averties).',
              'Les signalements que vous avez envoyés sont conservés, détachés de votre compte, pour le suivi de la modération. Aucune durée automatique de purge n\'est programmée à ce jour.',
              'Les sauvegardes techniques de l\'hébergeur peuvent conserver certaines données quelque temps après une suppression, avant d\'être renouvelées.'
            ] }
          ]
        },
        {
          id: 'droits',
          title: 'Vos droits',
          blocks: [
            { type: 'p', text: 'Vous avez un droit d\'accès, de rectification, d\'effacement, de portabilité, de limitation et d\'opposition. La plupart s\'exercent directement dans l\'application, page Réglages :' },
            { type: 'ul', items: [
              'Accès et portabilité : « Télécharger mes données » fournit un fichier JSON lisible (profil, recettes, droits de partage, carnet, catégories, groupes, amis, favoris, planning, listes de courses, notifications, signalements, journal d\'usage de l\'IA). Les autres personnes n\'y figurent que par leur pseudonyme. Les photos ne sont pas incluses. Limite : 3 exports par jour.',
              'Rectification : vous modifiez votre pseudonyme, le titre de votre carnet, vos préférences et vos recettes.',
              'Effacement : « Supprimer mon compte » supprime votre compte et vos données (voir « Combien de temps »).',
              'Opposition, limitation, ou toute autre demande : par le contact indiqué ci-dessus.'
            ] },
            { type: 'contact' },
            { type: 'p', text: 'Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL :' },
            { type: 'link', label: 'cnil.fr/fr/plaintes', href: 'https://www.cnil.fr/fr/plaintes' }
          ]
        },
        {
          id: 'mineurs',
          title: 'Mineurs',
          blocks: [
            { type: 'p', text: 'Le service s\'adresse aux personnes de 15 ans et plus. En dessous, l\'accord d\'un parent est nécessaire.' }
          ]
        },
        {
          id: 'modifications',
          title: 'Modifications',
          blocks: [
            { type: 'p', text: 'Cette page est mise à jour quand le fonctionnement du site change ; la date de dernière mise à jour figure en haut de page.' }
          ]
        }
      ]
    },

    terms: {
      title: 'Conditions d\'utilisation',
      intro: 'Les règles simples de ce service gratuit de carnets de recettes partagés.',
      sections: [
        {
          id: 'service',
          title: 'Le service',
          blocks: [
            { type: 'p', text: 'Le site permet de conserver ses recettes, de les partager avec des amis et des groupes, de planifier ses repas et de faire ses listes de courses. Il est gratuit, proposé sans garantie de disponibilité, et peut évoluer ou s\'arrêter. Les fonctions d\'intelligence artificielle sont limitées par un quota quotidien.' },
            { type: 'p', text: 'Pour créer un compte, il faut avoir 15 ans ou plus (ou l\'accord d\'un parent) et fournir une adresse e-mail valide, ou utiliser la connexion Google. Vous êtes responsable de la confidentialité de votre mot de passe.' }
          ]
        },
        {
          id: 'contenu',
          title: 'Vos recettes et ce que vous publiez',
          blocks: [
            { type: 'p', text: 'Vous restez propriétaire de vos recettes. En les partageant, vous autorisez les personnes que vous avez choisies à les voir et, selon le droit que vous leur donnez, à les copier ou à les modifier. Vous êtes responsable de ce que vous publiez.' },
            { type: 'ul', items: [
              'Ne publiez que des contenus dont vous avez le droit de vous servir. Recopier mot pour mot une recette de livre ou de blog protégée et la rendre accessible à d\'autres peut porter atteinte aux droits de son auteur.',
              'Sont interdits : les contenus illicites, haineux, violents ou portant atteinte à la vie privée, le spam, la publicité et l\'usurpation d\'identité.'
            ] }
          ]
        },
        {
          id: 'partage',
          title: 'Partage et lien public',
          blocks: [
            { type: 'p', text: 'Une recette peut être privée, visible de vos groupes, partagée avec des personnes précises, ou accessible par un lien public. Toute personne qui possède un lien public peut lire la recette sans compte et le transmettre : ne créez un lien que pour ce que vous acceptez de rendre accessible ainsi. Vous pouvez révoquer le lien à tout moment ; une copie déjà faite par quelqu\'un reste à cette personne. Les pages publiques ne sont pas référencées par les moteurs de recherche.' },
            { type: 'p', text: 'Supprimer une recette la retire du carnet des personnes qui l\'avaient ajoutée telle quelle, mais pas des copies qu\'elles en ont faites.' }
          ]
        },
        {
          id: 'signalement',
          title: 'Signalement et modération',
          blocks: [
            { type: 'p', text: 'Toute personne connectée peut signaler une recette (contenu illicite, atteinte au droit d\'auteur, spam, autre) avec le lien « Signaler ». Le nombre de signalements est limité à 10 par jour et par personne pour éviter les abus. L\'éditrice examine les signalements, peut supprimer un contenu manifestement illicite ou contraire à ces conditions et peut suspendre ou supprimer un compte en cas d\'abus.' }
          ]
        },
        {
          id: 'responsabilite',
          title: 'Responsabilité',
          blocks: [
            { type: 'p', text: 'Les recettes sont celles de leurs auteurs : l\'éditrice ne garantit ni leur exactitude, ni leur innocuité (allergies, cuissons, conservation). Les traductions et extractions faites par l\'IA peuvent contenir des erreurs : relisez-les avant de cuisiner. Le service est fourni « en l\'état ». Conservez une copie de ce qui vous est précieux : vous pouvez télécharger vos données à tout moment.' }
          ]
        },
        {
          id: 'fin',
          title: 'Fin du compte',
          blocks: [
            { type: 'p', text: 'Vous pouvez supprimer votre compte à tout moment depuis les Réglages. Les modalités sont décrites dans la politique de confidentialité.' },
            { type: 'contact' }
          ]
        }
      ]
    },

    cookies: {
      title: 'Cookies et suivi',
      intro: 'Ce que le site enregistre dans votre navigateur, et pourquoi il n\'y a pas de bandeau de consentement.',
      sections: [
        {
          id: 'resume',
          title: 'En bref',
          blocks: [
            { type: 'p', text: 'Le site n\'utilise que des cookies et stockages strictement nécessaires à son fonctionnement ou à des préférences que vous choisissez vous-même. Il n\'y a ni statistiques de fréquentation, ni publicité, ni traceur de réseau social, ni outil de suivi tiers. Ces stockages ne demandent pas de consentement (ils sont exemptés par la réglementation sur les cookies, qui ne les soumet pas à votre accord) : c\'est pourquoi le site n\'affiche pas de bandeau de cookies.' }
          ]
        },
        {
          id: 'liste',
          title: 'Ce qui est enregistré',
          blocks: [
            { type: 'ul', items: [
              'Cookie de session « sb-…-auth-token » (Supabase) : vous garde connecté·e. Il n\'existe que si vous vous connectez, et disparaît à la déconnexion.',
              'Cookie « i18n_redirected » : retient la langue de l\'interface (français ou anglais).',
              'Stockage local du navigateur « nuxt-color-mode » : retient le mode clair, sombre ou automatique.',
              'Stockage local « shopping:prefs » : retient la façon dont vous affichez vos listes de courses.',
              'Stockage local « offline:shopping:v1 » : copie de vos listes de courses pour les consulter sans réseau ; effacée à la déconnexion.',
              'Stockage de session « auth:redirect » : retient la page où revenir après une connexion Google ; effacé aussitôt après.',
              'Service worker et caches de l\'application installable (PWA) : mémorisent des pages visitées, images, icônes et polices pour accélérer le site et le consulter hors ligne ; les pages en cache sont vidées à la déconnexion. Les requêtes vers la base de données et vers les fonctions serveur ne sont jamais mises en cache.'
            ] }
          ]
        },
        {
          id: 'tiers',
          title: 'Services tiers',
          blocks: [
            { type: 'ul', items: [
              'Sentry reçoit les erreurs techniques, sans cookies et sans identité (voir la politique de confidentialité).',
              'Google n\'est contacté que si vous choisissez la connexion Google, ou si vous cliquez sur l\'import depuis Google Drive.',
              'Les polices du site sont servies par le site lui-même.'
            ] },
            { type: 'p', text: 'Si un outil de mesure d\'audience ou un autre traceur devait être ajouté un jour, cette page serait mise à jour et votre accord serait demandé avant tout dépôt non nécessaire.' }
          ]
        },
        {
          id: 'effacer',
          title: 'Les effacer',
          blocks: [
            { type: 'p', text: 'Vous pouvez effacer ces éléments à tout moment dans les réglages de votre navigateur. Cela vous déconnecte et remet vos préférences d\'affichage à zéro.' }
          ]
        }
      ]
    }
  }
}
