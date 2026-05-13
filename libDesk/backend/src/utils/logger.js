const isProduction = process.env.NODE_ENV === "production";

function format(level, message, meta) {
  const timestamp = new Date().toISOString();
  const suffix = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;
  return `[${timestamp}] [${level}] ${message}${suffix}`;
}

function info(message, meta) {
  console.log(format("info", message, meta));
}

function warn(message, meta) {
  console.warn(format("warn", message, meta));
}

function error(message, meta) {
  console.error(format("error", message, meta));
}

function debug(message, meta) {
  if (!isProduction) {
    console.debug(format("debug", message, meta));
  }
}

module.exports = {
  debug,
  error,
  info,
  warn,
};
