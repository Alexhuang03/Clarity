// Textes juridiques de Clarity (CGU, confidentialité, mentions légales, licences, droits d'auteur).
// Éditeur non professionnel : il peut ne pas publier son adresse, à condition d'avoir communiqué
// son identité à l'hébergeur (LCEN, art. 6-III-2). Le nom de l'hébergeur reste obligatoire.

/** Changer la version oblige à tracer un nouveau consentement (enregistré à l'inscription). */
export const LEGAL_VERSION = "2026-11-14";
export const LEGAL_UPDATED_AT = "14 novembre 2026";

export const LEGAL_INFO = {
  publisher: "Alex Huang",
  contactLabel: "github.com/Alexhuang03",
  contactUrl: "https://github.com/Alexhuang03",
  siteUrl: "https://clarity.alexhbh.com",
};

/** Lien de contact (profil GitHub de l'éditeur). */
function Contact() {
  return (
    <a href={LEGAL_INFO.contactUrl} target="_blank" rel="noopener noreferrer" className="text-accent-text underline-offset-4 hover:underline">
      {LEGAL_INFO.contactLabel}
    </a>
  );
}

export type LegalTab = "cgu" | "confidentialite" | "mentions" | "licence" | "droits";

export const LEGAL_TABS: { id: LegalTab; label: string; short: string }[] = [
  { id: "cgu", label: "Conditions d'utilisation", short: "Conditions" },
  { id: "confidentialite", label: "Confidentialité (RGPD)", short: "Confidentialité" },
  { id: "mentions", label: "Mentions légales", short: "Mentions" },
  { id: "licence", label: "Licences", short: "Licences" },
  { id: "droits", label: "Droits d'auteur", short: "Droits" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
      <div className="space-y-2 text-[0.94rem] leading-7 text-foreground/80 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

function Cgu() {
  return (
    <>
      <Section title="1. Objet du service">
        <p>
          <strong>Clarity</strong> est une application web de révision. Tu y importes tes supports de cours (PDF,
          documents Word ou PowerPoint, liens web) et une intelligence artificielle t&apos;aide à les comprendre :
          résumés, questions-réponses, annotations, quiz, flashcards, fiches de révision, examens blancs et cartes
          mentales.
        </p>
      </Section>
      <Section title="2. Acceptation et compte">
        <p>
          Créer un compte implique l&apos;acceptation des présentes conditions. Tu t&apos;engages à fournir une
          adresse email valide, à garder ton mot de passe confidentiel et à ne pas partager ton compte. Les comptes
          dont l&apos;adresse n&apos;est pas vérifiée sont supprimés automatiquement après 24 heures.
        </p>
      </Section>
      <Section title="3. Contenus que tu importes">
        <p>
          Tu restes propriétaire de tes documents. Tu garantis avoir le droit de les utiliser (cours fournis par ton
          établissement, notes personnelles, contenus libres de droits…) et tu n&apos;importes pas de contenu
          illicite, de données personnelles de tiers ni d&apos;informations confidentielles.
        </p>
        <p>
          Clarity ne revendique aucun droit sur tes contenus : ils servent uniquement à te rendre le service.
        </p>
      </Section>
      <Section title="4. Intelligence artificielle">
        <p>
          Les réponses, résumés, corrections et questions sont générés automatiquement. Ils peuvent contenir des
          erreurs ou des approximations : <strong>ils ne remplacent ni ton cours ni tes enseignants</strong>.
          Vérifie toujours les points importants dans tes documents (les sources citées sont là pour ça).
        </p>
      </Section>
      <Section title="5. Usage acceptable">
        <ul>
          <li>Ne pas tenter de contourner les limites d&apos;utilisation ou les protections du service.</li>
          <li>Ne pas détourner l&apos;IA de son usage (génération de contenus sans rapport avec tes cours, tentative
            d&apos;obtenir ses instructions internes…).</li>
          <li>Ne pas utiliser le service pour frauder lors d&apos;un examen ou d&apos;une évaluation.</li>
        </ul>
        <p>
          Pour préserver le service pour tous, le nombre de générations par utilisateur est limité. En cas
          d&apos;abus, un compte peut être suspendu ou supprimé.
        </p>
      </Section>
      <Section title="6. Liens de partage">
        <p>
          Quand tu crées un lien de partage, <strong>toute personne qui possède ce lien</strong> peut consulter la
          conversation partagée, sans compte. Tu peux révoquer un lien à tout moment.
        </p>
      </Section>
      <Section title="7. Disponibilité et responsabilité">
        <p>
          Clarity est un projet personnel, fourni gratuitement et « en l&apos;état », sans garantie de
          disponibilité. Les fournisseurs d&apos;IA gratuits utilisés peuvent être temporairement indisponibles.
          Garde une copie de tes documents : Clarity n&apos;est pas un service de sauvegarde.
        </p>
      </Section>
      <Section title="8. Fin et modification">
        <p>
          Tu peux supprimer ton compte à tout moment depuis ton espace personnel : toutes tes données sont alors
          effacées. Ces conditions peuvent évoluer ; en cas de changement important, ton accord te sera redemandé.
          Elles sont soumises au droit français.
        </p>
      </Section>
    </>
  );
}

function Privacy() {
  return (
    <>
      <Section title="1. Responsable du traitement">
        <p>
          {LEGAL_INFO.publisher}, joignable via GitHub : <Contact />.
        </p>
      </Section>
      <Section title="2. Données collectées">
        <ul>
          <li><strong>Compte</strong> : adresse email et mot de passe (stocké uniquement sous forme chiffrée).</li>
          <li><strong>Contenus de cours</strong> : documents importés, texte extrait, liens, titres et matières, et,
            en mode professeur, le sujet, le niveau et l&apos;objectif que tu saisis.</li>
          <li><strong>Utilisation du service</strong> : conversations avec l&apos;IA, annotations, quiz, réponses et
            scores, flashcards, fiches, cartes mentales et progression par notion.</li>
          <li><strong>Préférences</strong> : modèles d&apos;IA choisis, émotes personnalisées, thème.</li>
          <li><strong>Sécurité</strong> : compteurs d&apos;utilisation (pour limiter les abus) et journaux techniques.</li>
        </ul>
        <p>Aucune donnée n&apos;est vendue, ni utilisée à des fins publicitaires.</p>
      </Section>
      <Section title="3. Finalités et bases légales">
        <ul>
          <li>Fournir le service (exécution du contrat) : stocker tes cours, générer les contenus de révision,
            suivre ta progression.</li>
          <li>Sécuriser le service (intérêt légitime) : limites d&apos;utilisation, prévention des abus.</li>
          <li>T&apos;envoyer les emails indispensables (vérification de l&apos;adresse, réinitialisation du mot de
            passe).</li>
        </ul>
      </Section>
      <Section title="4. Intelligence artificielle et sous-traitants">
        <p>
          Pour générer les réponses, <strong>des extraits de tes documents et tes messages sont envoyés</strong> à
          des fournisseurs d&apos;IA : Google (Gemini API), Groq et, selon la configuration, OpenRouter. Certains
          sont situés hors de l&apos;Union européenne (notamment aux États-Unis).
        </p>
        <p>
          En <strong>mode professeur</strong> (cours rédigé à partir d&apos;un sujet, sans document), le sujet que tu
          saisis (ainsi que le niveau et l&apos;objectif éventuels) est envoyé à <strong>Google</strong> (Gemini API
          avec la recherche Google) pour rechercher des sources sur le web et rédiger le cours. Le sujet peut
          aussi être envoyé à l&apos;API publique de <strong>Wikipédia</strong> (Wikimedia Foundation, États-Unis)
          pour trouver des articles à citer. En secours (fournisseur indisponible ou limite atteinte), le sujet et
          le plan du cours peuvent aussi être envoyés aux autres fournisseurs d&apos;IA cités ci-dessus (Groq,
          OpenRouter) pour rédiger le cours. N&apos;y saisis donc aucune information personnelle.
        </p>
        <p>
          Les offres gratuites de ces fournisseurs peuvent prévoir que les contenus envoyés soient conservés,
          relus par des humains ou utilisés pour améliorer leurs modèles : consulte leurs politiques respectives.
          C&apos;est une raison de plus pour <strong>ne jamais importer de données sensibles</strong> (santé,
          données personnelles de tiers, documents confidentiels).
        </p>
        <p>
          Le site est hébergé en France par <strong>OVH</strong>. Les données sont stockées dans une base Supabase
          (authentification, base de données et fichiers). Le trafic transite par <strong>Cloudflare</strong>
          (sécurité, protection contre les attaques et accélération), qui traite à ce titre ton adresse IP.
        </p>
      </Section>
      <Section title="5. Durée de conservation">
        <ul>
          <li>Tant que ton compte existe ; tout est effacé lorsque tu le supprimes.</li>
          <li>Comptes non vérifiés : supprimés après 24 heures.</li>
          <li>Compteurs d&apos;utilisation : quelques jours au plus.</li>
        </ul>
      </Section>
      <Section title="6. Cookies et stockage local">
        <p>
          Clarity n&apos;utilise <strong>aucun cookie publicitaire ni outil de mesure d&apos;audience</strong>.
          Seuls des cookies strictement nécessaires sont déposés : maintien de ta session et, le cas échéant,
          cookies de sécurité de Cloudflare (protection contre les robots). Ton navigateur garde
          aussi localement ton thème clair/sombre et tes réponses en cours de quiz, pour ne rien perdre en cas de
          rechargement.
        </p>
      </Section>
      <Section title="7. Tes droits">
        <p>
          Tu disposes d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de limitation,
          d&apos;opposition et de portabilité de tes données. Tu peux supprimer ton compte toi-même depuis ton
          espace personnel ; pour les autres demandes, contacte l&apos;éditeur via GitHub : <Contact />.
        </p>
        <p>
          Tu peux aussi introduire une réclamation auprès de la CNIL (www.cnil.fr).
        </p>
      </Section>
    </>
  );
}

function Mentions() {
  return (
    <>
      <Section title="Éditeur">
        <p>
          Le site {LEGAL_INFO.siteUrl.replace("https://", "")} est édité par {LEGAL_INFO.publisher}, à titre non
          professionnel.
        </p>
        <p>
          Conformément à l&apos;article 6-III-2 de la loi pour la confiance dans l&apos;économie numérique, les
          coordonnées personnelles de l&apos;éditeur ont été communiquées à l&apos;hébergeur.
        </p>
        <p>Contact : <Contact /></p>
        <p>Directeur de la publication : {LEGAL_INFO.publisher}</p>
      </Section>
      <Section title="Hébergement">
        <p>
          <strong>OVH SAS</strong>, 2 rue Kellermann, 59100 Roubaix, France. Téléphone : 1007 (depuis la France).
        </p>
        <p>
          Réseau de diffusion et sécurité : <strong>Cloudflare, Inc.</strong>, 101 Townsend Street, San Francisco,
          CA 94107, États-Unis.
        </p>
      </Section>
      <Section title="Propriété intellectuelle">
        <p>
          La structure, le design et le code de Clarity sont protégés. Les contenus importés par les utilisateurs
          restent leur propriété. Le détail figure dans l&apos;onglet « Droits d&apos;auteur ».
        </p>
      </Section>
      <Section title="Signaler un contenu">
        <p>
          Pour signaler un contenu illicite accessible via un lien de partage, contacte l&apos;éditeur via GitHub (<Contact />){" "}
          en précisant le lien concerné.
        </p>
      </Section>
    </>
  );
}

function Licences() {
  return (
    <>
      <Section title="Clarity">
        <p>
          Le code de Clarity est la propriété de son éditeur, tous droits réservés (voir l&apos;onglet « Droits
          d&apos;auteur »). Toute reproduction ou réutilisation sans autorisation est interdite.
        </p>
      </Section>
      <Section title="Éléments de Riot Games">
        <p>
          Icônes de pings, sons et émotes © Riot Games, Inc., via le projet lolPing. Clarity n&apos;est pas approuvé
          par Riot Games et ne reflète pas les opinions de Riot Games ni de quiconque ayant officiellement participé
          à la production ou à la gestion de ses propriétés. Riot Games et toutes les propriétés associées sont des
          marques ou des marques déposées de Riot Games, Inc.
        </p>
      </Section>
      <Section title="Bibliothèques et composants tiers">
        <ul>
          <li><strong>React Bits</strong> (David Haz) : animations et effets visuels, licence MIT + Commons Clause.</li>
          <li><strong>Next.js</strong>, <strong>React</strong>, <strong>Tailwind CSS</strong>, <strong>Motion</strong> : licence MIT.</li>
          <li><strong>KaTeX</strong>, <strong>react-markdown</strong>, <strong>remark</strong> / <strong>rehype</strong> : licence MIT.</li>
          <li><strong>Supabase</strong> (client JavaScript) : licence MIT.</li>
          <li><strong>Mozilla Readability</strong> : licence Apache 2.0. <strong>Mammoth</strong>, <strong>JSZip</strong>,
            <strong> pdf-lib</strong>, <strong>unpdf</strong>, <strong>Turndown</strong>, <strong>sharp</strong> : licences
            MIT, BSD ou Apache 2.0.</li>
          <li>Polices <strong>Geist</strong> et <strong>Instrument Serif</strong> : SIL Open Font License.</li>
        </ul>
      </Section>
    </>
  );
}

function Copyright() {
  return (
    <>
      <Section title="1. Titulaire des droits">
        <p>
          <strong>© 2026 {LEGAL_INFO.publisher}. Tous droits réservés.</strong> Clarity est un projet personnel conçu
          et développé par {LEGAL_INFO.publisher}.
        </p>
        <p>
          Sont protégés au titre du droit d&apos;auteur : le code source, le design et l&apos;interface, les textes du
          site, le logo, ainsi que le nom « Clarity » tel qu&apos;il est utilisé pour ce site (ce nom n&apos;est pas
          présenté comme une marque déposée).
        </p>
      </Section>
      <Section title="2. Utilisations interdites">
        <p>
          Toute reproduction, représentation, modification, adaptation, diffusion ou réutilisation, totale ou
          partielle, de ces éléments, par quelque procédé que ce soit, sans l&apos;autorisation écrite et préalable de
          {" "}{LEGAL_INFO.publisher}, est interdite et constitue une contrefaçon sanctionnée par les articles L.111-1,
          L.122-4 et L.335-2 du Code de la propriété intellectuelle.
        </p>
      </Section>
      <Section title="3. Tes contenus">
        <p>
          Les contenus que tu importes ou crées (cours, documents, annotations, notes, réponses aux quiz)
          <strong> restent ta propriété</strong>. Clarity n&apos;en revendique aucun droit et ne les traite que pour te
          fournir le service, dans les conditions décrites dans les Conditions d&apos;utilisation et la Politique de
          confidentialité.
        </p>
      </Section>
      <Section title="4. Contenus générés par l'IA">
        <p>
          Les contenus générés par l&apos;intelligence artificielle (résumés, réponses, quiz, flashcards, fiches, cours
          rédigés en mode professeur) te sont fournis pour ton <strong>usage personnel d&apos;étude</strong>.
        </p>
        <p>
          Les extraits et informations provenant de sources tierces restent soumis à leurs propres licences : par
          exemple, les contenus de Wikipédia sont diffusés sous licence Creative Commons Attribution - Partage dans
          les mêmes conditions (CC BY-SA). Les sources utilisées sont citées dans chaque cours concerné.
        </p>
      </Section>
      <Section title="5. Éléments tiers">
        <p>
          Les éléments appartenant à des tiers restent la propriété de leurs auteurs : icônes, sons et émotes de
          Riot Games (via le projet lolPing, licence MIT), effets visuels React Bits (licence MIT + Commons Clause),
          bibliothèques et polices open source. Le détail figure dans l&apos;onglet « Licences ».
        </p>
      </Section>
      <Section title="6. Demande d'autorisation">
        <p>
          Pour toute demande d&apos;autorisation ou question relative aux droits, contacte l&apos;éditeur via GitHub :{" "}
          <Contact />.
        </p>
      </Section>
    </>
  );
}

export function LegalContent({ tab }: { tab: LegalTab }) {
  return (
    <div className="space-y-6">
      {tab === "cgu" && <Cgu />}
      {tab === "confidentialite" && <Privacy />}
      {tab === "mentions" && <Mentions />}
      {tab === "licence" && <Licences />}
      {tab === "droits" && <Copyright />}
      <p className="border-t border-line pt-4 text-xs text-muted">Dernière mise à jour : {LEGAL_UPDATED_AT}</p>
    </div>
  );
}
