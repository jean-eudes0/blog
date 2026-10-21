import { useState } from 'react'
import { LIMITES, estModifie, validerArticle } from '../lib/validation-article.js'

// Formulaire commun à la création et à l'édition. Il ne parle pas à l'API : il valide, puis
// appelle `surEnvoyer(valeurs)` ; la page décide quoi en faire. `surEnvoyer` renvoie
// { erreurs } (champ -> message, refus de l'API) ou ne renvoie rien si tout s'est bien passé.
//
// `valeursInitiales` : le contenu de départ. `reference` : la dernière version enregistrée,
// pour savoir si quelque chose a changé (le bouton Enregistrer reste grisé sinon).
export default function FormulaireArticle({ valeursInitiales, reference, libelleEnvoi, surEnvoyer }) {
  const [valeurs, setValeurs] = useState(valeursInitiales)
  const [erreurs, setErreurs] = useState({})
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  const modifie = estModifie(valeurs, reference)

  function changer(champ) {
    return (evenement) => setValeurs((v) => ({ ...v, [champ]: evenement.target.value }))
  }

  async function envoyer(evenement) {
    evenement.preventDefault()
    if (envoiEnCours) return
    const erreursLocales = validerArticle(valeurs)
    setErreurs(erreursLocales)
    if (Object.keys(erreursLocales).length > 0) return // rien n'est envoyé au serveur

    setEnvoiEnCours(true)
    try {
      const retour = await surEnvoyer(valeurs)
      if (retour?.erreurs) setErreurs(retour.erreurs)
    } finally {
      setEnvoiEnCours(false)
    }
  }

  return (
    <form onSubmit={envoyer} className="formulaire formulaire-article" noValidate>
      <Champ id="title" libelle="Titre" erreur={erreurs.title} aide={`${[...valeurs.title.trim()].length}/${LIMITES.titre}`}>
        <input id="title" name="title" type="text" value={valeurs.title} onChange={changer('title')} aria-invalid={!!erreurs.title} aria-describedby={erreurs.title ? 'title-erreur' : undefined} />
      </Champ>

      <Champ id="excerpt" libelle="Extrait (facultatif)" erreur={erreurs.excerpt} aide={`${[...valeurs.excerpt.trim()].length}/${LIMITES.extrait}`}>
        <textarea id="excerpt" name="excerpt" rows={3} value={valeurs.excerpt} onChange={changer('excerpt')} aria-invalid={!!erreurs.excerpt} aria-describedby={erreurs.excerpt ? 'excerpt-erreur' : undefined} />
      </Champ>

      <Champ id="coverUrl" libelle="Image de couverture : adresse (facultatif)" erreur={erreurs.coverUrl}>
        <input id="coverUrl" name="coverUrl" type="text" inputMode="url" placeholder="https://…" value={valeurs.coverUrl} onChange={changer('coverUrl')} aria-invalid={!!erreurs.coverUrl} aria-describedby={erreurs.coverUrl ? 'coverUrl-erreur' : undefined} />
      </Champ>

      <Champ id="tags" libelle="Tags, séparés par des virgules (facultatif)" erreur={erreurs.tags} aide={`au plus ${LIMITES.tags}, ${LIMITES.tag} caractères chacun`}>
        <input id="tags" name="tags" type="text" placeholder="react, erreurs" value={valeurs.tags} onChange={changer('tags')} aria-invalid={!!erreurs.tags} aria-describedby={erreurs.tags ? 'tags-erreur' : undefined} />
      </Champ>

      <Champ id="contentMd" libelle="Contenu (Markdown)" erreur={erreurs.contentMd}>
        <textarea id="contentMd" name="contentMd" rows={18} value={valeurs.contentMd} onChange={changer('contentMd')} aria-invalid={!!erreurs.contentMd} aria-describedby={erreurs.contentMd ? 'contentMd-erreur' : undefined} />
      </Champ>

      {erreurs.general && (
        <p role="alert" className="erreur">
          {erreurs.general}
        </p>
      )}

      <div>
        <button type="submit" disabled={envoiEnCours || !modifie}>
          {envoiEnCours ? 'Enregistrement…' : libelleEnvoi}
        </button>
      </div>
    </form>
  )
}

function Champ({ id, libelle, erreur, aide, children }) {
  return (
    <div className="champ">
      <label htmlFor={id}>
        {libelle}
        {aide && <span className="aide"> ({aide})</span>}
      </label>
      {children}
      {erreur && (
        <p id={`${id}-erreur`} role="alert" className="erreur">
          {erreur}
        </p>
      )}
    </div>
  )
}