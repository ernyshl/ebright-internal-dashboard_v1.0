import { getToken } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface ApiFetchOptions {
  method?: string;
  token?: string;
  headers?: Record<string, string>;
  json?: boolean;
  body?: any;
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<any> {
  const token = options.token ?? getToken();
  const headers = new Headers(options.headers || {});

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.json !== false) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => '');

  if (!res.ok) {
    throw new ApiError(data?.error || 'Request failed', res.status, data);
  }

  return data;
}

