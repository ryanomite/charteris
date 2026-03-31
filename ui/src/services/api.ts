import axios from 'axios';

const rt = (window as any).__CHARTERIS__ || {};
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
const apiToken = rt.token || import.meta.env.VITE_API_TOKEN || '';

const api = axios.create({
  baseURL: apiBaseUrl ? `${apiBaseUrl}/api/v1` : '/api/v1',
  params: apiToken ? { token: apiToken } : {},
  headers: { 'Content-Type': 'application/json' },
});

export default api;
