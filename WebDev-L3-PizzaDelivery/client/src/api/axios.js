import axios from 'axios';

export const TOKEN_KEY = 'slice.token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach the bearer token on every request so components never think about it.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalize every failure into a plain Error with a friendly message and, on
// 401, clear the stale session so guards send the user back to login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;

    let message = data?.message || error.message || 'Something went wrong';
    if (Array.isArray(data?.details) && data.details.length) {
      const first = data.details[0];
      message = typeof first === 'string' ? first : first.message || message;
    }

    if (status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event('slice:unauthorized'));
    }

    error.status = status;
    error.friendlyMessage = message;
    return Promise.reject(error);
  },
);

export default api;