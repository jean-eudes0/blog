import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Markdown → HTML, puis nettoyage (docs/api.md §8). C'est la SEULE fonction du client
// autorisée à produire du HTML destiné à dangerouslySetInnerHTML : le HTML brut
// issu de marked ne doit jamais être affiché sans être passé par DOMPurify.
export function rendreMarkdown(markdown) {
  const html = marked.parse(markdown, { async: false })
  return DOMPurify.sanitize(html)
}
