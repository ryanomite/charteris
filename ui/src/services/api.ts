import axios from 'axios';

const LS_TOKEN_KEY = 'charteris_token';
const rt = (window as any).__CHARTERIS__ || {};
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
let apiToken = rt.token || import.meta.env.VITE_API_TOKEN || '';

if (apiToken) {
  localStorage.setItem(LS_TOKEN_KEY, apiToken);
} else {
  apiToken = localStorage.getItem(LS_TOKEN_KEY) || '';
}

const api = axios.create({
  baseURL: apiBaseUrl ? `${apiBaseUrl}/api/v1` : '/api/v1',
  params: apiToken ? { token: apiToken } : {},
  headers: { 'Content-Type': 'application/json' },
});

export default api;
