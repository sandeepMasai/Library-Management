function ok(res, data = {}, statusCode = 200) {
  return res.status(statusCode).json({ ok: true, ...data });
}

function fail(res, message = "Request failed", statusCode = 400) {
  return res.status(statusCode).json({ ok: false, message });
}

module.exports = {
  ok,
  fail,
};
