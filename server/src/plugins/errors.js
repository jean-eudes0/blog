import fp from "fastify-plugin";

function envoyerErreur(reply, statut, code, message, details) {
  reply
    .code(statut)
    .send({ error: { code, message, ...(details ? { details } : {}) } });
}

// Nomme le champ en cause à partir d'une erreur Ajv. Pour "additionalProperties",
// Ajv ne donne ni instancePath utile ni missingProperty : on lit alors
// params.additionalProperty, qui contient le nom du champ en trop.
function nommerChamp(v) {
  if (v.instancePath) return v.instancePath.replace(/^\//, "");
  if (v.params?.missingProperty) return v.params.missingProperty;
  if (v.params?.additionalProperty) return v.params.additionalProperty;
  return "(corps)";
}

export default fp(async function errorsPlugin(app) {
  app.setNotFoundHandler((request, reply) => {
    envoyerErreur(reply, 404, "NOT_FOUND", "Route inconnue");
  });

  app.setErrorHandler((err, request, reply) => {
    if (err.validation) {
      const details = err.validation.map((v) => ({
        field: nommerChamp(v),
        message: v.message,
      }));
      envoyerErreur(reply, 400, "VALIDATION_ERROR", "Données invalides", details);
      return;
    }

    if (err.statusCode && err.statusCode < 500) {
      const aUnCodeMetier = err.code && !String(err.code).startsWith("FST_");
      if (aUnCodeMetier) {
        envoyerErreur(reply, err.statusCode, err.code, err.message);
        return;
      }
      envoyerErreur(reply, err.statusCode, "VALIDATION_ERROR", "Requête invalide");
      return;
    }

    request.log.error(err);
    envoyerErreur(reply, 500, "INTERNAL_ERROR", "Une erreur interne est survenue");
  });
});