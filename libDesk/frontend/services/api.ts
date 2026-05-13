import axios, { AxiosError } from 'axios';
import { resolveApiBaseUrl } from '../constants/apiUrl';

/**
 * Central API client (Axios)
 *
 * Why this exists:
 * - Single place to set baseURL
 * - Automatically attach Authorization header using persisted auth state
 * - Global error handling (401 logout, 403 normalized message)
 *
 * This avoids duplicating fetch/headers/error parsing across screens/stores.
 */

export type ApiError = {
  status?: number;
  message: string;
};

export const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 20_000,
});

// Attach Bearer token automatically from global auth state
api.interceptors.request.use((config) => {
  // Lazy-require to avoid require-cycle: store.ts <-> services/api.ts
  // This prevents uninitialized values after fast refresh / reload.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAppStore } = require('../store');
  const token = useAppStore.getState().token || useAppStore.getState().authToken;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<any>) => {
    const status = err.response?.status;
    const message =
      err.response?.data?.message ||
      (typeof err.message === 'string' && err.message) ||
      'Request failed';

    // Global auth handling
    if (status === 401) {
      // Session expired / invalid token → clear auth state
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useAppStore } = require('../store');
      useAppStore.getState().logout();
    }

    // For 403 we don't show UI here (keeps service UI-agnostic).
    // Callers can display `message`.

    const apiError: ApiError = { status, message };
    return Promise.reject(apiError);
  }
);

// Small helpers for consistent usage patterns
export const apiGet = async <T>(path: string, params?: Record<string, any>) => {
  const res = await api.get<T>(path, { params });
  return res.data;
};

export const apiPost = async <T>(path: string, body?: any, params?: Record<string, any>) => {
  const res = await api.post<T>(path, body, { params });
  return res.data;
};

export const apiPut = async <T>(path: string, body?: any) => {
  const res = await api.put<T>(path, body);
  return res.data;
};

export const apiPatch = async <T>(path: string, body?: any) => {
  const res = await api.patch<T>(path, body);
  return res.data;
};

export const apiDelete = async <T>(path: string) => {
  const res = await api.delete<T>(path);
  return res.data;
};

