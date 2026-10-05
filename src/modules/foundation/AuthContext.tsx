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

interface AuthContextType {
  currentUser: UserRecord;
  currentFirm: FirmRecord | null;
  usersList: UserRecord[];
  subscription: SubscriptionEvaluation;
  isReadOnly: boolean;
  isAuthenticated: boolean;
  can: (permission: PermissionKey) => boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchUser: (userId: string) => Promise<void>;
  refreshState: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserRecord>(INITIAL_USERS[0]);
  const [currentFirm, setCurrentFirm] = useState<FirmRecord | null>(null);
  const [usersList, setUsersList] = useState<UserRecord[]>(INITIAL_USERS);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!isRestMode);
  const [isLoading, setIsLoading] = useState(true);

  const repos = useMemo(() => getRepositories(), []);

  const refreshState = async () => {
    try {
      if (isRestMode) {
        // In REST mode, verify session via /auth/me
        const authUrl = getApiBase().replace('/api/v1', '') + '/auth/me';
        const res = await fetch(authUrl, {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.user);
          setCurrentFirm(data.firm);
          setIsAuthenticated(true);
          const users = await repos.user.list({ currentUser: data.user });
          setUsersList(users);
        } else {
          setIsAuthenticated(false);
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
    } catch (err) {
      console.error('Failed to refresh auth state:', err);
      if (isRestMode) setIsAuthenticated(false);
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
    refreshState();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (isRestMode) {
      try {
        const authUrl = getApiBase().replace('/api/v1', '') + '/auth/login';
        const res = await fetch(authUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (!res.ok) {
          return { success: false, error: data.message || data.error || 'Login failed' };
        }

        setCurrentUser(data.user);
        setCurrentFirm(data.firm);
        setIsAuthenticated(true);
        await refreshState();
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
        const logoutUrl = getApiBase().replace('/api/v1', '') + '/auth/logout';
        await fetch(logoutUrl, {
          method: 'POST',
          credentials: 'include',
        });
      } catch (err) {
        console.error('Logout error:', err);
      }
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
