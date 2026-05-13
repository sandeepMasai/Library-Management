function sendSuccess(res, data = null, message = "Success", statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
  });
}

function sendError(res, message = "Request failed", statusCode = 400, data = null) {
  return res.status(statusCode).json({
    success: false,
    data,
    message,
  });
}

module.exports = {
  sendError,
  sendSuccess,
};
