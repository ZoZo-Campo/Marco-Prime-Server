const configuredApiUrl = import.meta.env.VITE_API_URL || "/api/v1";

export const API_BASE_URL = configuredApiUrl.replace(/\/$/, "");

export function apiUrl(path: string) {
  return `${API_BASE_URL}/${path.replace(/^\//, "")}`;
}

export function apiHeaders(headers: HeadersInit = {}) {
  const token = import.meta.env.VITE_API_TOKEN;

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };
}
