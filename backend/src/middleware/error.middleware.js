function errorHandler(error, _req, res, _next) {
  const statusCode = error && error.statusCode ? error.statusCode : 500;
  const message = error && error.message ? error.message : "Internal server error";
  res.status(statusCode).json({ message });
}

module.exports = {
  errorHandler,
};
