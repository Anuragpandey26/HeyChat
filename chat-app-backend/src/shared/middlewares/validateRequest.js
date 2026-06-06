export const validateRequest = (schema) => {
  return (req, res, next) => {
    const parsed = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!parsed.success) {
      const formattedErrors = parsed.error.issues.map((err) => ({
        field: err.path.slice(1).join('.') || err.path.join('.'),
        message: err.message,
      }));

      return res.status(400).json({
        status: 'fail',
        message: 'Validation failed',
        errors: formattedErrors,
      });
    }

    // Assign parsed and coerced data back.
    // req.query is a read-only getter on raw IncomingMessage (router package),
    // so we must mutate in-place with Object.assign instead of direct assignment.
    if (parsed.data.body) req.body = parsed.data.body;
    if (parsed.data.query) Object.assign(req.query, parsed.data.query);
    if (parsed.data.params) Object.assign(req.params, parsed.data.params);

    next();
  };
};

