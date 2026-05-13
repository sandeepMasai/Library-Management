import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

function isLocalOnlyHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === 'localhost' || h === '127.0.0.1';
}

function getHostFromUrl(url: string): string | null {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^:/?#]+)(?::\d+)?/i.exec(url);
  return m?.[1] || null;
}

function getBundledUrlHost(url: string | undefined): string | null {
  if (!url || typeof url !== 'string') return null;

  const nestedUrl = /[?&]url=([^&#]+)/i.exec(url)?.[1];
  if (nestedUrl) {
    const nestedHost = getHostFromUrl(decodeURIComponent(nestedUrl));
    if (nestedHost && !isLocalOnlyHost(nestedHost)) return nestedHost;
  }

  const directHost = getHostFromUrl(url);
  if (directHost && directHost !== 'expo-development-client') return directHost;
  return null;
}

/**
 * Override host only (without scheme/port).
 * Prefer this on real devices when Expo resolves to 127.0.0.1 due to USB/adb reverse.
 *
 * Examples:
 * - EXPO_PUBLIC_API_HOST=10.18.153.128
 * - app.json: { "expo": { "extra": { "apiHost": "10.18.153.128" } } }
 */
export function getApiHostOverride(): string | null {
  const env = process.env.EXPO_PUBLIC_API_HOST;
  if (env && env.trim()) return env.trim();
  const extra = Constants.expoConfig?.extra as { apiHost?: string } | undefined;
  if (extra?.apiHost && String(extra.apiHost).trim()) return String(extra.apiHost).trim();
  return null;
}

/**
 * Backend HTTP port — must match `PORT` in `backend/.env`.
 * Override: set `EXPO_PUBLIC_API_PORT` or `expo.extra.apiPort` in app.json.
 */
export function getApiPort(): number {
  const env = process.env.EXPO_PUBLIC_API_PORT;
  if (env !== undefined && env !== '' && !Number.isNaN(Number(env))) {
    return Number(env);
  }
  const extra = Constants.expoConfig?.extra as { apiPort?: number | string } | undefined;
  const p = extra?.apiPort;
  if (p !== undefined && p !== '' && !Number.isNaN(Number(p))) {
    return Number(p);
  }
  // Default backend port (match `libDesk/backend/.env` PORT)
  return 1998;
}

/** Base URL for API (no trailing slash). Set EXPO_PUBLIC_API_URL to override host+port entirely. */
export function resolveApiBaseUrl(): string {
  const full = process.env.EXPO_PUBLIC_API_URL;
  if (full) {
    return full.replace(/\/$/, '');
  }

  const overrideHost = getApiHostOverride();
  const port = getApiPort();
  if (overrideHost && (Platform.OS === 'web' || !isLocalOnlyHost(overrideHost))) {
    return `http://${overrideHost}:${port}`;
  }

  // Try to infer host from the running JS bundle URL.
  // This works reliably on physical devices/dev-client where `expoConfig.hostUri` can be undefined.
  // Example scriptURL: http://10.18.153.128:8081/index.bundle?platform=android&dev=true...
  const scriptURL: string | undefined = (NativeModules as any)?.SourceCode?.scriptURL;
  const scriptHost = getBundledUrlHost(scriptURL);

  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any)?.expoGoConfig?.debuggerHost ||
    (Constants as any)?.manifest?.debuggerHost ||
    (Constants as any)?.manifest?.hostUri ||
    (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } }).manifest2?.extra
      ?.expoGo?.debuggerHost;

  // Another reliable signal for dev-client / real device is linkingUri:
  // Example: exp://10.18.153.128:8081
  const linkingHost = getBundledUrlHost((Constants as any)?.linkingUri as string | undefined);

  const hostUriHost = hostUri?.split(':')[0] || null;
  const candidates = [scriptHost, linkingHost, hostUriHost].filter(Boolean) as string[];
  const host = candidates.find((h) => !isLocalOnlyHost(h)) || candidates[0] || null;

  // NOTE:
  // On physical devices (especially via USB/adb reverse), Expo can report the packager host as 127.0.0.1.
  // That is fine for Metro, but WRONG for your backend. In that case you must use EXPO_PUBLIC_API_HOST
  // (or EXPO_PUBLIC_API_URL) so the app points to your Mac LAN IP.
  if (host && !isLocalOnlyHost(host)) {
    return `http://${host}:${port}`;
  }

  if (Platform.OS === 'android') {
    /**
     * Android fallback:
     * - Emulator: 10.0.2.2 points to host machine localhost
     * - Physical device: prefer localhost (requires `adb reverse tcp:<port> tcp:<port>`)
     *
     * If you don't use adb reverse on a physical device, set:
     * - EXPO_PUBLIC_API_HOST=<your Mac LAN IP>
     * - or EXPO_PUBLIC_API_URL=http://<your Mac LAN IP>:<port>
     */
    const isPhysicalDevice = Boolean((Constants as any)?.isDevice);
    return isPhysicalDevice ? `http://localhost:${port}` : `http://10.0.2.2:${port}`;
  }

  return `http://localhost:${port}`;
}
