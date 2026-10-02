import fp from "fastify-plugin";

// Une seule forme de réponse d'erreur pour toute l'API (voir docs/api.md §5) :
// { error: { code, message, details? } }

function envoyerErreur(reply, statut, code, message, details) {
  reply
    .code(statut)
    .send({ error: { code, message, ...(details ? { details } : {}) } });
}

export default fp(async function errorsPlugin(app) {
  app.setNotFoundHandler((request, reply) => {
    envoyerErreur(reply, 404, "NOT_FOUND", "Route inconnue");
  });

  app.setErrorHandler((err, request, reply) => {
    if (err.validation) {
      const details = err.validation.map((v) => ({
        field:
          v.instancePath.replace(/^\//, "") ||
          v.params?.missingProperty ||
          "(corps)",
        message: v.message,
      }));
      envoyerErreur(
        reply,
        400,
        "VALIDATION_ERROR",
        "Données invalides",
        details,
      );
      return;
    }

    if (err.statusCode && err.statusCode < 500) {
      // Nos propres erreurs métier portent un code (ex: NOT_FOUND).
      const aUnCodeMetier = err.code && !String(err.code).startsWith("FST_");
      if (aUnCodeMetier) {
        envoyerErreur(reply, err.statusCode, err.code, err.message);
        return;
      }
      // Erreurs internes de Fastify (JSON mal formé, corps trop gros...) :
      // on ne laisse pas fuiter leur code ni leur message en anglais.
      envoyerErreur(reply, err.statusCode, "VALIDATION_ERROR", "Requête invalide");
      return;
    }

    request.log.error(err);
    envoyerErreur(
      reply,
      500,
      "INTERNAL_ERROR",
      "Une erreur interne est survenue",
    );
  });
});