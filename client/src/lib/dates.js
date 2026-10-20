// Date ISO (« 2026-10-20T09:44:28.000Z ») -> « 20 octobre 2026 ».
export function formaterDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' })
}

// Date ISO -> « 20 oct. 2026, 10:44 » (liste admin : l'heure aide à repérer le dernier modifié).
export function formaterDateHeure(iso) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}