/**
 * Shared template placeholder parsing + safe rendering for SMS / WhatsApp / email.
 * Keeps server-side behavior aligned with frontend `replaceVariables` semantics.
 */

/** Canonical placeholder keys (extend alongside KNOWN_PLACEHOLDER_KEYS in callers). */
const KNOWN_PLACEHOLDER_KEYS_LIST = [
  "student_name",
  "amount",
  "due_date",
  "library_name",
];

const KNOWN_PLACEHOLDER_KEYS = new Set(KNOWN_PLACEHOLDER_KEYS_LIST);

const PLACEHOLDER_TOKEN_RE = /\{([a-z][a-z0-9_]*)\}/g;

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractPlaceholderKeys(message) {
  const keys = new Set();
  let m;
  const re = new RegExp(PLACEHOLDER_TOKEN_RE.source, "g");
  const src = String(message || "");
  while ((m = re.exec(src)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

function validatePlaceholderSyntax(message) {
  const invalid = String(message || "").match(/\{[^}]*\}/g);
  if (!invalid) return true;
  return invalid.every((chunk) =>
    /^\{[a-z][a-z0-9_]*\}$/.test(chunk)
  );
}

function validateDraftOrMessage(message) {
  if (message == null || message === "") return true;
  return validatePlaceholderSyntax(message);
}

/**
 * Replace `{token}` from `data`. Missing keys → empty string (matches client preview).
 * @param {string} templateBody
 * @param {Record<string, string|number|undefined|null>} data
 * @param {{ onlyKnownKeys?: boolean }} [options]
 */
function renderTemplate(templateBody, data = {}, options = {}) {
  const onlyKnown = Boolean(options.onlyKnownKeys);
  const safe = (v) =>
    v === null || v === undefined ? "" : String(v);

  let out = String(templateBody || "");
  const keys = extractPlaceholderKeys(out);
  for (const key of keys) {
    if (onlyKnown && !KNOWN_PLACEHOLDER_KEYS.has(key)) {
      continue;
    }
    const val = Object.prototype.hasOwnProperty.call(data, key)
      ? safe(data[key])
      : "";
    const pattern = new RegExp(`\\{${escapeRegExp(key)}\\}`, "g");
    out = out.replace(pattern, val);
  }
  return out;
}

/**
 * Post-render hardening before handing text to carriers or HTML bodies.
 * @param {string} text
 * @param {'sms'|'whatsapp'|'email'} channel
 * @param {{ allowHtml?: boolean }} [opts]
 */
function sanitizeRenderedOutput(text, channel = "sms", opts = {}) {
  let s = String(text ?? "");
  s = s.replace(/\u0000/g, "");
  if (channel === "email" && !opts.allowHtml) {
    s = s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  if (channel === "sms" || channel === "whatsapp") {
    s = s.replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  }
  return s;
}

/**
 * Full pipeline: render placeholders then sanitize for channel.
 */
function renderAndSanitize(templateBody, data, channel, renderOpts, sanitizeOpts) {
  const rendered = renderTemplate(templateBody, data, renderOpts);
  return sanitizeRenderedOutput(rendered, channel, sanitizeOpts);
}

/**
 * Use the persisted template document's published `message` + `channel`.
 * @param {{ message?: string, channel?: string }} templateDoc — mongoose doc or lean object
 */
function renderPublishedTemplate(templateDoc, variables, options) {
  if (!templateDoc?.message) return "";
  const channel = templateDoc.channel || "sms";
  return renderAndSanitize(
    templateDoc.message,
    variables,
    channel,
    options?.render,
    options?.sanitize
  );
}

module.exports = {
  KNOWN_PLACEHOLDER_KEYS,
  KNOWN_PLACEHOLDER_KEYS_LIST,
  PLACEHOLDER_TOKEN_RE,
  extractPlaceholderKeys,
  validatePlaceholderSyntax,
  validateDraftOrMessage,
  renderTemplate,
  sanitizeRenderedOutput,
  renderAndSanitize,
  renderPublishedTemplate,
};
