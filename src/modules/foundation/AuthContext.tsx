import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import {
  can as checkPermission,
  evaluateSubscription,
  PermissionKey,
  SubscriptionEvaluation,
} from '../../permissions';
import { getRepositories } from '../../data/repositories';
import { FirmRecord, UserRecord } from '../../data/types';
import { INITIAL_USERS } from '../../data/mockStore';

import { getApiBaseUrl } from '../../data/repositories/rest/restCommon';

const isRestMode =
  typeof import.meta !== 'undefined' &&
  import.meta.env?.VITE_DATA_SOURCE === 'rest';

const getApiBase = () => (isRestMode ? getApiBaseUrl() : 'http://localhost:4000/api/v1');

const getAuthEndpoint = (path: string) => {
  const base = getApiBase();
  const cleanBase = base.replace(/\/api\/v1\/?$/, '');
  return `${cleanBase}${path.startsWith('/') ? path : '/' + path}`;
};

const emptyUser: UserRecord = {
  id: '',
  firmId: '',
  name: '',
  email: '',
  role: 'Staff',
  permissions: [],
  language: 'en',
  active: true,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  createdBy: '',
  updatedBy: '',
};

interface AuthContextType {
  currentUser: UserRecord;
  currentFirm: FirmRecord | null;
  usersList: UserRecord[];
  subscription: SubscriptionEvaluation;
  isReadOnly: boolean;
  isAuthenticated: boolean;
  can: (permission: PermissionKey) => boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; code?: string; device?: any }>;
  logout: () => Promise<void>;
  switchUser: (userId: string) => Promise<void>;
  refreshState: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserRecord>(isRestMode ? emptyUser : INITIAL_USERS[0]);
  const [currentFirm, setCurrentFirm] = useState<FirmRecord | null>(null);
  const [usersList, setUsersList] = useState<UserRecord[]>(isRestMode ? [] : INITIAL_USERS);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!isRestMode);
  const [isLoading, setIsLoading] = useState(true);

  const repos = useMemo(() => getRepositories(), []);

  const refreshState = async () => {
    // If running in an admin route context, skip member auth checks entirely.
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      setIsLoading(false);
      return;
    }
    try {
      if (isRestMode) {
        // In REST mode, verify session strictly via /auth/me. Never use INITIAL_USERS or mock users.
        const authUrl = getAuthEndpoint('/auth/me');
        const res = await fetch(authUrl, {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.user);
          setCurrentFirm(data.firm);
          setIsAuthenticated(true);
          // usersList stays empty or is loaded from GET /users only for users who may manage users
          if (checkPermission('users.manage', data.user) || data.user.role === 'Owner') {
            try {
              const users = await repos.user.list({ currentUser: data.user });
              setUsersList(users);
            } catch {
              setUsersList([]);
            }
          } else {
            setUsersList([]);
          }
        } else {
          // 401 Unauthorized is the normal, expected response when no active session cookie is present
          setIsAuthenticated(false);
          setCurrentUser(emptyUser);
          setUsersList([]);
        }
      } else {
        // In Mock mode
        const securityContext = { currentUser };
        const [firmData, usersData] = await Promise.all([
          repos.firm.getFirm(securityContext),
          repos.user.list(securityContext),
        ]);
        setCurrentFirm(firmData);
        setUsersList(usersData);
        const syncedUser = usersData.find((u) => u.id === currentUser.id);
        if (syncedUser) {
          setCurrentUser(syncedUser);
        }
      }
    } catch {
      if (isRestMode) {
        setIsAuthenticated(false);
        setCurrentUser(emptyUser);
        setUsersList([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    try {
      localStorage.removeItem('bd_legal_token');
    } catch {
      // Ignore
    }
    if (!isRestMode) {
      const savedUserId = localStorage.getItem('bd_legal_active_user_id');
      if (savedUserId) {
        const found = INITIAL_USERS.find((u) => u.id === savedUserId);
        if (found) {
          setCurrentUser(found);
        }
      }
    }

    // Listen to global 401 unauthorized events to immediately reset session without reloading
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setCurrentUser(emptyUser);
      setUsersList([]);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('auth:unauthorized', handleUnauthorized);
    }

    refreshState();

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('auth:unauthorized', handleUnauthorized);
      }
    };
  }, []);

  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string; code?: string; device?: any }> => {
    if (isRestMode) {
      try {
        const authUrl = getAuthEndpoint('/auth/login');
        const res = await fetch(authUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (!res.ok) {
          return {
            success: false,
            error: data.message || data.error || 'Login failed',
            code: data.code,
            device: data.device,
          };
        }

        setCurrentUser(data.user);
        setCurrentFirm(data.firm);
        setIsAuthenticated(true);

        if (checkPermission('users.manage', data.user) || data.user.role === 'Owner') {
          try {
            const users = await repos.user.list({ currentUser: data.user });
            setUsersList(users);
          } catch {
            setUsersList([]);
          }
        } else {
          setUsersList([]);
        }

        return { success: true };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Network error during login';
        return { success: false, error: errorMsg };
      }
    } else {
      // Mock mode login
      const foundUser = usersList.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!foundUser) {
        return { success: false, error: 'User not found with this email' };
      }
      setCurrentUser(foundUser);
      setIsAuthenticated(true);
      localStorage.setItem('bd_legal_active_user_id', foundUser.id);
      return { success: true };
    }
  };

  const logout = async () => {
    if (isRestMode) {
      try {
        const logoutUrl = getAuthEndpoint('/auth/logout');
        await fetch(logoutUrl, {
          method: 'POST',
          credentials: 'include',
        });
      } catch (err) {
        console.error('Logout error:', err);
      }
      setCurrentUser(emptyUser);
      setUsersList([]);
    }
    localStorage.removeItem('bd_legal_active_user_id');
    setIsAuthenticated(false);
  };

  const subscription: SubscriptionEvaluation = useMemo(() => {
    if (!currentFirm) {
      return {
        status: 'active',
        isReadOnly: false,
        daysRemaining: 365,
        graceDaysRemaining: 5,
        formattedExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        isExpired: false,
        isExpiringSoon: false,
        inGracePeriod: false,
      };
    }
    return evaluateSubscription(currentFirm.status, currentFirm.licenseExpiresAt);
  }, [currentFirm]);

  const switchUser = async (userId: string) => {
    // In REST mode, user switching is prohibited
    if (isRestMode) return;

    const targetUser = usersList.find((u) => u.id === userId);
    if (!targetUser) return;

    const previousUser = currentUser;
    setCurrentUser(targetUser);
    localStorage.setItem('bd_legal_active_user_id', targetUser.id);

    if ('record' in repos.auditLog && typeof repos.auditLog.record === 'function') {
      try {
        await repos.auditLog.record(
          { currentUser: targetUser },
          {
            entity: 'Session',
            entityId: targetUser.id,
            action: 'USER_SWITCH',
            oldValue: { userId: previousUser.id, name: previousUser.name, role: previousUser.role },
            newValue: { userId: targetUser.id, name: targetUser.name, role: targetUser.role },
          }
        );
      } catch (err) {
        console.error('Audit log failed during user switch:', err);
      }
    }
  };

  const can = (permission: PermissionKey): boolean => {
    return checkPermission(permission, currentUser);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentFirm,
        usersList,
        subscription,
        isReadOnly: subscription.isReadOnly,
        isAuthenticated,
        can,
        login,
        logout,
        switchUser,
        refreshState,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
