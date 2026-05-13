function createHttpError(statusCode, message, data = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.data = data;
  return error;
}

function getHttpStatus(error, fallback = 500) {
  return Number(error?.statusCode || error?.status || fallback);
}

module.exports = {
  createHttpError,
  getHttpStatus,
};
