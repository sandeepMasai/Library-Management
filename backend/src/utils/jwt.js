const jwt = require("jsonwebtoken");

function signJwt(payload, secret, options = {}) {
  return jwt.sign(payload, secret, options);
}

function verifyJwt(token, secret) {
  return jwt.verify(token, secret);
}

module.exports = {
  signJwt,
  verifyJwt,
};
