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

    if (err.statusCode && err.statusCode < 500 && err.code) {
      envoyerErreur(reply, err.statusCode, err.code, err.message);
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
