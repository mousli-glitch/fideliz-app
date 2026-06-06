import Link from "next/link"

export const metadata = {
  title: "Politique de confidentialité — Fidéliz",
}

// Page publique — modèle à personnaliser (champs entre [crochets]).
export default function ConfidentialitePage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
        <h1 className="text-3xl font-black text-slate-900 mb-2">Politique de confidentialité</h1>
        <p className="text-sm text-slate-400 mb-8">Dernière mise à jour : [JJ/MM/AAAA]</p>

        <div className="space-y-8 text-slate-700 leading-relaxed text-[15px]">
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">1. Qui traite vos données ?</h2>
            <p>
              Le jeu auquel vous participez est proposé par le commerce qui vous l'a présenté (le
              « Commerçant »), qui est <strong>responsable du traitement</strong> de vos données.
              La plateforme technique <strong>Fidéliz</strong> ([NOM DE LA SOCIÉTÉ], [ADRESSE])
              agit en tant que <strong>sous-traitant</strong>, pour le compte du Commerçant.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">2. Quelles données sont collectées ?</h2>
            <p>Lorsque vous jouez et remplissez le formulaire, nous collectons :</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>votre prénom et votre adresse e-mail (nécessaires pour vous remettre votre lot) ;</li>
              <li>votre numéro de téléphone (facultatif) ;</li>
              <li>votre éventuel consentement à recevoir des offres, et sa date ;</li>
              <li>l'historique de votre participation : lot gagné, date, statut, date d'expiration.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">3. Pourquoi (finalités et base légale) ?</h2>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Gérer votre participation et la remise de votre lot</strong> — base légale : exécution de la participation au jeu.</li>
              <li><strong>Vous envoyer des offres et actualités du Commerçant</strong> — uniquement si vous y avez consenti (case à cocher). Vous pouvez retirer ce consentement à tout moment.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">4. Combien de temps sont-elles conservées ?</h2>
            <p>
              Vos données sont conservées le temps nécessaire à la finalité, puis supprimées au plus
              tard <strong>[DURÉE — ex. 36 mois]</strong> après votre dernière participation, sauf
              obligation légale contraire.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">5. Qui a accès à vos données ?</h2>
            <p>
              Vos données sont accessibles au Commerçant et aux prestataires techniques strictement
              nécessaires au service :
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Supabase</strong> — hébergement de la base de données (Union européenne) ;</li>
              <li><strong>Vercel</strong> — hébergement de l'application ;</li>
              <li><strong>Twilio</strong> — envoi de SMS (le cas échéant).</li>
            </ul>
            <p className="mt-2">Vos données ne sont jamais vendues à des tiers.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">6. Où sont-elles hébergées ?</h2>
            <p>Vos données sont hébergées au sein de l'<strong>Union européenne</strong> (centre de données de Francfort, Allemagne).</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">7. Vos droits</h2>
            <p>Conformément au RGPD, vous disposez des droits d'accès, de rectification, d'effacement,
              d'opposition, de limitation, de portabilité, et du droit de retirer votre consentement.</p>
            <p className="mt-2">
              Pour les exercer, contactez : <strong>[EMAIL DE CONTACT]</strong>. Vous pouvez également
              introduire une réclamation auprès de la CNIL (www.cnil.fr).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">8. Cookies</h2>
            <p>L'application n'utilise que des cookies strictement nécessaires à son fonctionnement
              (connexion à l'espace professionnel). Aucun cookie publicitaire ou de traçage n'est utilisé.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">9. Contact</h2>
            <p>Pour toute question relative à vos données : <strong>[EMAIL DE CONTACT]</strong>.</p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200">
          <Link href="/" className="text-blue-600 font-bold text-sm hover:underline">← Retour</Link>
        </div>
      </div>
    </div>
  )
}
