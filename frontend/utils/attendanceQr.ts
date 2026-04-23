/** Normalize barcode / QR scanner output to the raw attendance token. */
export function normalizeAttendanceQrPayload(raw: string): string {
  let s = String(raw ?? '').trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1).trim();

  if (s.startsWith('{')) {
    try {
      const o = JSON.parse(s) as { token?: string; t?: string };
      if (typeof o.token === 'string') return o.token.trim();
      if (typeof o.t === 'string') return o.t.trim();
    } catch {
      /* ignore */
    }
  }

  try {
    if (s.startsWith('http://') || s.startsWith('https://')) {
      const u = new URL(s);
      const d = u.searchParams.get('data');
      if (d) return decodeURIComponent(d).trim();
    }
  } catch {
    /* ignore */
  }

  const dataMatch = s.match(/(?:^|[?&])data=([^&]+)/);
  if (dataMatch) {
    try {
      return decodeURIComponent(dataMatch[1]).trim();
    } catch {
      /* ignore */
    }
  }

  return s;
}

/** Same rules as the server: strip whitespace/control chars inside the token. */
export function prepareAttendanceQrPayload(raw: string): string {
  return normalizeAttendanceQrPayload(raw).replace(/[\s\u0000-\u001F\u007F-\u009F]+/g, '');
}
