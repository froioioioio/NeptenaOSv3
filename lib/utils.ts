import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely parses API responses, preventing "Unexpected token '<', <!doctype..." syntax errors
 * when a server error returns HTML instead of JSON.
 */
export async function parseJsonResponse<T = any>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  let rawText = '';

  if (res.redirected && (res.url.includes('__cookie_check') || res.url.includes('google.com/login'))) {
    throw new Error('Authentication session expired or blocked by iframe. Please open the app in a new tab or refresh the page.');
  }

  try {
    rawText = await res.text();
  } catch {
    rawText = '';
  }

  if (contentType.includes('application/json') && rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }

  if (!data) {
    if (!res.ok) {
      const cleanSnippet = rawText.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
      throw new Error(cleanSnippet || `Server returned error status ${res.status}`);
    }
    try {
      data = JSON.parse(rawText);
    } catch {
      if (rawText.includes('<html') || rawText.includes('__cookie_check')) {
        throw new Error('Authentication session expired or blocked by iframe. Please open the app in a new tab or refresh the page.');
      }
      throw new Error(`Server returned unexpected response format (Status ${res.status}). Body: ${rawText.slice(0, 50)}...`);
    }
  }

  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || data?.message || `Request failed with status ${res.status}`);
  }

  return data as T;
}
