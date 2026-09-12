import type { LoginResponse } from './api';
import { sessionCookieName, sessionKey } from './auth-constants';

export type AuthSession = {
  accessToken: string;
  tenantId: string;
  tenantName: string;
  role: string;
  permissions: Record<string, boolean>;
  user: LoginResponse['user'];
  expiresAt: number;
};

const sessionChangeEvent = 'corestack-session-changed';
export function subscribeSession(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(sessionChangeEvent, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(sessionChangeEvent, callback);
  };
}
export function sessionSnapshot() {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(sessionKey);
}
export function updateSessionAccess(
  access: Pick<AuthSession, 'role' | 'permissions' | 'user'>,
  expectedToken: string,
  expectedTenant: string,
) {
  const current = getSession();
  if (
    !current ||
    current.accessToken !== expectedToken ||
    current.tenantId !== expectedTenant ||
    current.user.id !== access.user.id
  )
    return;
  const next = JSON.stringify({ ...current, ...access });
  if (next === sessionSnapshot()) return;
  window.localStorage.setItem(sessionKey, next);
  window.dispatchEvent(new Event(sessionChangeEvent));
}

export function saveSession(login: LoginResponse) {
  const membership = login.memberships[0];

  if (!membership) {
    throw new Error('User has no active tenant memberships.');
  }

  const session: AuthSession = {
    accessToken: login.accessToken,
    tenantId: membership.tenantId,
    tenantName: membership.tenantName,
    role: membership.role,
    permissions: membership.permissions,
    user: login.user,
    expiresAt: Date.now() + parseExpiresInSeconds(login.expiresIn) * 1000,
  };

  window.localStorage.setItem(sessionKey, JSON.stringify(session));
  window.dispatchEvent(new Event(sessionChangeEvent));
  setSessionCookie(parseExpiresInSeconds(login.expiresIn));
  return session;
}

export function getSession() {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(sessionKey);

  if (!raw) {
    return null;
  }

  const session = parseSessionSnapshot(raw);
  if (!session) clearSession();
  return session;
}

// Pure snapshot parsing: React subscribers must never write storage during render.
export function parseSessionSnapshot(raw: string | null): AuthSession | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AuthSession;

    if (
      !session.accessToken ||
      !session.tenantId ||
      !session.expiresAt ||
      session.expiresAt <= Date.now()
    ) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(sessionKey);
  window.dispatchEvent(new Event(sessionChangeEvent));
  document.cookie = `${sessionCookieName}=; Path=/; Max-Age=0; SameSite=Strict${getSecureCookieAttribute()}`;
}

function setSessionCookie(maxAgeSeconds: number) {
  document.cookie = `${sessionCookieName}=1; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Strict${getSecureCookieAttribute()}`;
}

function getSecureCookieAttribute() {
  return window.location.protocol === 'https:' ? '; Secure' : '';
}

function parseExpiresInSeconds(value: string) {
  const match = value.match(/^(\d+)([smhd])$/);

  if (!match) {
    return 8 * 60 * 60;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit === 's') {
    return amount;
  }

  if (unit === 'm') {
    return amount * 60;
  }

  if (unit === 'h') {
    return amount * 60 * 60;
  }

  return amount * 24 * 60 * 60;
}
