/**
 * authService.ts
 * ---------------
 * Abstraction layer for authentication.
 *
 * FRONTEND-ONLY MODE (current): credentials are validated against a local
 * mock list. Session is stored in sessionStorage so the tab remembers the
 * logged-in user but clears on browser close.
 *
 * BACKEND INTEGRATION: Replace the body of each function with the appropriate
 * fetch() call. The function signatures and return types must NOT change.
 *
 * Expected future endpoints (example — adjust to your API contract):
 *   POST /api/auth/login    { email, password } → { token, user }
 *   POST /api/auth/register { name, email, password } → { token, user }
 *   POST /api/auth/logout   → 204
 *   GET  /api/auth/me       → { user }
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

// ---------------------------------------------------------------------------
// Mock credential store
// BACKEND: remove this block entirely when connecting to the real API.
// ---------------------------------------------------------------------------
const MOCK_USERS: (AuthUser & { password: string })[] = [
  {
    id: 'u1',
    name: 'Analista Demo',
    email: 'demo@reconsec.com',
    password: 'demo123',
    role: 'Analista de Segurança',
  },
  {
    id: 'u2',
    name: 'Admin',
    email: 'admin@reconsec.com',
    password: 'admin123',
    role: 'Administrador',
  },
];

const SESSION_KEY = 'reconsec_user';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * login
 * BACKEND: replace body with:
 *   const res = await fetch('/api/auth/login', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ email, password }),
 *   });
 *   if (!res.ok) return { success: false, error: 'Credenciais inválidas.' };
 *   const { token, user } = await res.json();
 *   sessionStorage.setItem('reconsec_token', token);
 *   sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
 *   return { success: true, user };
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 800));

  const found = MOCK_USERS.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );

  if (!found) {
    return { success: false, error: 'E-mail ou senha incorretos.' };
  }

  const { password: _pw, ...user } = found;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return { success: true, user };
}

/**
 * register
 * BACKEND: replace body with:
 *   const res = await fetch('/api/auth/register', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ name, email, password }),
 *   });
 *   if (!res.ok) { const e = await res.json(); return { success: false, error: e.message }; }
 *   const { token, user } = await res.json();
 *   sessionStorage.setItem('reconsec_token', token);
 *   sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
 *   return { success: true, user };
 */
export async function register(name: string, email: string, password: string): Promise<AuthResult> {
  await new Promise((r) => setTimeout(r, 900));

  const exists = MOCK_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return { success: false, error: 'Este e-mail já está em uso.' };
  }

  const newUser: AuthUser = {
    id: 'u_' + Date.now(),
    name,
    email,
    role: 'Analista de Segurança',
  };

  // Add to mock store so the user can log in again in the same session
  MOCK_USERS.push({ ...newUser, password });
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(newUser));
  return { success: true, user: newUser };
}

/**
 * logout
 * BACKEND: optionally call POST /api/auth/logout before clearing storage.
 */
export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem('reconsec_token');
}

/**
 * getSession
 * Returns the currently logged-in user, or null if not authenticated.
 * BACKEND: optionally verify with GET /api/auth/me instead of reading storage.
 */
export function getSession(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}
