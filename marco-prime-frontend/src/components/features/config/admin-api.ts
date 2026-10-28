import { apiHeaders, apiUrl } from "../../../config/api";

export async function adminJson<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method,
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error || `Erreur ${response.status}`);
  }
  return response.json() as Promise<T>;
}
