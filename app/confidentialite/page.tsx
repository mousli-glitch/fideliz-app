import Link from "next/link"

export const metadata = {
  title: "Politique de confidentialité — Fidéliz",
}

export default function ConfidentialitePage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
        <h1 className="text-3xl font-black text-slate-900 mb-1">Politique de confidentialité — Fidéliz</h1>
        <p className="text-sm text-slate-400 mb-8">Dernière mise à jour : 8 juin 2026</p>

        <div className="space-y-8 text-slate-700 leading-relaxed text-[15px]">
          <p>
            La présente politique de confidentialité a pour objectif d'informer les utilisateurs de la plateforme
            <strong> Fidéliz</strong> sur la manière dont leurs données personnelles sont collectées, utilisées, conservées
            et protégées dans le cadre des jeux marketing proposés par les commerces partenaires. Fidéliz permet à des
            commerces de proximité (restaurants, cafés, salons, boutiques…) de proposer à leurs clients des jeux par QR code
            (roue de la chance, jeu à gratter…) permettant de gagner une récompense à récupérer en magasin.
          </p>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">1. Qui édite la solution Fidéliz ?</h2>
            <p>La solution Fidéliz est éditée par :</p>
            <p className="mt-2">
              <strong>ComDesign</strong> — Entreprise individuelle<br />
              SIREN : 979 294 394 — SIRET : 979 294 394 00023<br />
              Adresse : 60 rue François Ier, 75008 Paris, France<br />
              E-mail de contact : <a className="text-blue-600 underline" href="mailto:contact@fideliz.net">contact@fideliz.net</a><br />
              Site / application : <a className="text-blue-600 underline" href="https://fideliz-app.fr">https://fideliz-app.fr</a>
            </p>
            <p className="mt-2">Le terme « Fidéliz » désigne la solution technique éditée par ComDesign.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">2. Qui est responsable du traitement des données ?</h2>
            <p>
              Dans le cadre des jeux organisés par les commerces partenaires, le <strong>commerce qui organise le jeu</strong> est
              le <strong>responsable du traitement</strong> des données des participants (organiser le jeu, permettre la participation,
              attribuer une récompense, valider le gain en caisse, et envoyer des offres si la personne l'a accepté).
            </p>
            <p className="mt-2">
              <strong>Fidéliz agit comme sous-traitant technique</strong> pour le compte du commerce. Pour ses propres activités
              (comptes professionnels, facturation, support, sécurité, obligations légales), Fidéliz agit en tant que responsable de traitement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">3. Quelles données personnelles sont collectées ?</h2>
            <p className="font-bold mt-1">3.1 Données des participants aux jeux</p>
            <ul className="list-disc pl-6 mt-1 space-y-1">
              <li>prénom ; adresse e-mail ; numéro de téléphone (si demandé par le commerce) ;</li>
              <li>consentement marketing (si la personne l'accepte) ;</li>
              <li>date et heure de participation ; lot gagné ; statut du lot (disponible, validé, expiré) ; date d'expiration ;</li>
              <li>identifiant du ticket gagnant ; QR code de validation ; commerce concerné ;</li>
              <li>informations techniques nécessaires au fonctionnement et à la sécurité du service, dont une <strong>adresse IP pseudonymisée (hachée)</strong> utilisée uniquement pour la prévention de la fraude et la limitation des abus (jamais conservée en clair, jamais utilisée à des fins publicitaires).</li>
            </ul>
            <p className="mt-2">
              Les champs obligatoires (en général prénom et e-mail) sont indiqués dans le formulaire. Aucune donnée sensible au sens du RGPD n'est volontairement collectée.
            </p>
            <p className="font-bold mt-3">3.2 Données des professionnels</p>
            <ul className="list-disc pl-6 mt-1 space-y-1">
              <li>e-mail professionnel ; mot de passe (haché, jamais en clair) ; nom du commerce ; rôle utilisateur ;</li>
              <li>historique de connexion ; actions effectuées dans l'administration ; données de facturation et de gestion.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">4. Pourquoi les données sont-elles collectées ?</h2>
            <ul className="list-disc pl-6 mt-1 space-y-1">
              <li><strong>Gestion de la participation</strong> — base légale : exécution de la participation au jeu et/ou intérêt légitime du commerce.</li>
              <li><strong>Attribution et validation du lot</strong> — base légale : exécution + intérêt légitime (éviter fraudes et doubles validations).</li>
              <li><strong>Offres et actualités</strong> — uniquement si la case de consentement est cochée. Base légale : consentement (libre, spécifique, éclairé, univoque ; case jamais pré-cochée ; retirable à tout moment).</li>
              <li><strong>Sécurité et prévention des abus</strong> — base légale : intérêt légitime.</li>
              <li><strong>Gestion des comptes professionnels</strong> — base légale : exécution du contrat, intérêt légitime, obligations légales.</li>
              <li><strong>Facturation et obligations légales</strong> — base légale : obligation légale.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">5. Qui peut accéder aux données ?</h2>
            <p>Le commerce organisateur et ses utilisateurs autorisés, Fidéliz en tant que prestataire technique, les prestataires techniques nécessaires au service, et les autorités lorsque la loi l'exige. Les données ne sont jamais vendues à des tiers.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">6. Prestataires techniques utilisés</h2>
            <ul className="list-disc pl-6 mt-1 space-y-1">
              <li><strong>Supabase</strong> — base de données, authentification ; données hébergées dans l'Union européenne (Allemagne).</li>
              <li><strong>Vercel</strong> — hébergement de l'application web.</li>
              <li><strong>Twilio</strong> — envoi de SMS (confirmations / informations liées à un gain). Twilio est une société établie aux États-Unis : certaines données (numéro de téléphone, contenu technique du message) peuvent être traitées hors UE, dans le cadre de garanties appropriées (clauses contractuelles types).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">7. Transferts hors Union européenne</h2>
            <p>Fidéliz privilégie l'hébergement dans l'UE. Certains prestataires (Vercel, Twilio) peuvent impliquer des traitements hors UE ; ces transferts sont encadrés par des garanties appropriées conformément au RGPD.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">8. Durées de conservation</h2>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm border border-slate-200">
                <thead className="bg-slate-50">
                  <tr><th className="text-left p-2 border-b border-slate-200">Catégorie</th><th className="text-left p-2 border-b border-slate-200">Durée</th></tr>
                </thead>
                <tbody>
                  <tr><td className="p-2 border-b border-slate-100">Participation au jeu</td><td className="p-2 border-b border-slate-100">≤ 12-24 mois après validation/expiration, puis suppression ou anonymisation</td></tr>
                  <tr><td className="p-2 border-b border-slate-100">Ticket gagnant</td><td className="p-2 border-b border-slate-100">12-24 mois après validation/expiration (preuve de remise)</td></tr>
                  <tr><td className="p-2 border-b border-slate-100">Données marketing (consenties)</td><td className="p-2 border-b border-slate-100">Jusqu'au retrait, max 36 mois après le dernier contact actif</td></tr>
                  <tr><td className="p-2 border-b border-slate-100">Preuve du consentement</td><td className="p-2 border-b border-slate-100">Durée d'utilisation des données marketing, puis archivage en cas de preuve</td></tr>
                  <tr><td className="p-2 border-b border-slate-100">Opposition / désinscription</td><td className="p-2 border-b border-slate-100">Minimum 3 ans (pour ne plus solliciter)</td></tr>
                  <tr><td className="p-2 border-b border-slate-100">Comptes professionnels</td><td className="p-2 border-b border-slate-100">Durée du contrat, puis archivage légal</td></tr>
                  <tr><td className="p-2 border-b border-slate-100">Facturation / comptabilité</td><td className="p-2 border-b border-slate-100">10 ans</td></tr>
                  <tr><td className="p-2">Journaux techniques / sécurité</td><td className="p-2">Durée limitée nécessaire à la sécurité</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              À l'expiration de ces durées, Fidéliz privilégie l'<strong>anonymisation</strong> plutôt que la suppression pure :
              les données permettant d'identifier la personne (prénom, e-mail, téléphone) sont effacées de façon irréversible,
              tandis que les seules données statistiques et anonymes (nombre de participations, de gains, dates…) peuvent être
              conservées sans limite de durée, car elles ne constituent plus des données personnelles au sens du RGPD. Le délai
              repart à zéro à chaque nouvelle interaction de la personne avec le commerce.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">9. Droits des personnes concernées</h2>
            <p>Accès, rectification, effacement, limitation, opposition (traitement fondé sur l'intérêt légitime), retrait du consentement marketing, portabilité, et directives post-mortem.</p>
            <p className="mt-2">Pour un jeu organisé par un commerce, la demande doit en priorité être adressée au commerce (responsable du traitement) ; Fidéliz l'assiste en tant que prestataire technique.</p>
            <p className="mt-2">Contact Fidéliz / ComDesign : <a className="text-blue-600 underline" href="mailto:contact@fideliz.net">contact@fideliz.net</a>. Réponse sous un mois maximum.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">10. Retrait du consentement marketing</h2>
            <p>Le consentement peut être retiré à tout moment : via le lien de désinscription des e-mails, en répondant STOP aux SMS (si disponible), en contactant le commerce, ou Fidéliz. Le retrait n'affecte pas la participation passée ni la validité d'un lot déjà obtenu.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">11. Participation des mineurs</h2>
            <p>Les jeux sont destinés au grand public. Chaque commerce définit l'âge minimum. Il est recommandé de réserver les jeux aux personnes d'au moins 15 ans, ou majeures. En participant, le joueur confirme avoir au moins 15 ans ou disposer de l'autorisation de son représentant légal.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">12. Sécurité des données</h2>
            <p>Mesures techniques et organisationnelles : mots de passe hachés, accès limité aux utilisateurs autorisés, contrôle d'accès par rôle, séparation des droits entre commerces, accès aux données limité aux besoins du service, sauvegardes, vérification des mots de passe contre les fuites connues. Aucun système n'offre une sécurité absolue ; en cas d'incident, Fidéliz agit conformément à la réglementation.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">13. Cookies et traceurs</h2>
            <p>Fidéliz n'utilise que des cookies strictement nécessaires au fonctionnement (connexion à l'espace professionnel, sécurité, préférences techniques), exemptés de consentement. Aucun cookie publicitaire ni traceur marketing sur les pages de jeu. L'ajout futur d'un outil de mesure d'audience non exempté ou d'un pixel publicitaire nécessiterait un bandeau de consentement.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">14. Réclamation auprès de la CNIL</h2>
            <p>Toute personne peut introduire une réclamation auprès de la CNIL — <a className="text-blue-600 underline" href="https://www.cnil.fr">www.cnil.fr</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">15. Modification de la politique</h2>
            <p>La présente politique peut être modifiée à tout moment. La date de mise à jour en haut de page indique la dernière version applicable.</p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200">
          <Link href="/" className="text-blue-600 font-bold text-sm hover:underline">← Retour</Link>
        </div>
      </div>
    </div>
  )
}
