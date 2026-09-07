import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { User, Organization } from '../types.js';
import { api, setAuthToken } from '../services/api.js';

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  allOrganizations: Organization[];
  orgUsers: User[];
  token: string | null;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
  logout: () => void;
  switchUser: (targetUser: User) => Promise<void>;
  switchOrganization: (orgSlug: string) => Promise<void>;
  refreshOrgData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
  const [orgUsers, setOrgUsers] = useState<User[]>([]);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('teamchat_token'));
  const [isLoading, setIsLoading] = useState(true);

  useLayoutEffect(() => {
    setAuthToken(token);
  }, [token]);

  // Fetch organizations for authenticated session (tenant-scoped)
  const fetchOrganizations = useCallback(async (sessionToken?: string) => {
    if (!sessionToken) {
      setAllOrganizations([]);
      return;
    }
    try {
      const res = await api('/api/orgs', { token: sessionToken });
      if (res.ok) {
        const orgs = await res.json();
        setAllOrganizations(orgs);
      }
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  }, []);

  // Fetch current user and organization details
  const fetchMe = useCallback(async (sessionToken: string) => {
    try {
      const res = await api('/api/auth/me', { token: sessionToken });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setOrganization(data.organization);
        setToken(sessionToken);
        localStorage.setItem('teamchat_token', sessionToken);

        // Fetch users in this org
        const usersRes = await api('/api/org/users', { token: sessionToken });
        if (usersRes.ok) {
          const usersList = await usersRes.json();
          setOrgUsers(usersList);
        }
        return true;
      } else {
        // Stale or invalid token
        localStorage.removeItem('teamchat_token');
        setToken(null);
        setUser(null);
        setOrganization(null);
        return false;
      }
    } catch (err) {
      console.error('Failed to fetch auth session:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchOrganizations(token);
      fetchMe(token);
    } else {
      setAllOrganizations([]);
      setIsLoading(false);
    }
  }, [fetchMe, fetchOrganizations, token]);

  const login = async (email: string, password = 'password123'): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        setIsLoading(false);
        return false;
      }

      const data = await res.json();
      setToken(data.token);
      setUser(data.user);
      setOrganization(data.organization);
      localStorage.setItem('teamchat_token', data.token);

      // Fetch org users
      const usersRes = await api('/api/org/users', { token: data.token });
      if (usersRes.ok) {
        setOrgUsers(await usersRes.json());
      }

      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('Login error:', err);
      setIsLoading(false);
      return false;
    }
  };

  const logout = () => {
    if (token) {
      // Notify server offline
      api('/api/presence', {
        method: 'POST',
        body: JSON.stringify({ isOnline: false }),
      }).catch(() => {});
    }
    localStorage.removeItem('teamchat_token');
    setToken(null);
    setUser(null);
    setOrganization(null);
    setOrgUsers([]);
  };

  const switchUser = async (targetUser: User) => {
    await login(targetUser.email, 'password123');
  };

  const switchOrganization = async (orgSlug: string) => {
    // Find the first user in that organization to log in as
    try {
      const org = allOrganizations.find((o) => o.slug === orgSlug);
      if (!org) return;

      const res = await api('/api/demo/accounts');
      if (!res.ok) return;
      const accounts: { email: string; orgSlug: string; role: string }[] = await res.json();
      const admin = accounts.find((a) => a.orgSlug === orgSlug && a.role === 'admin') ??
                    accounts.find((a) => a.orgSlug === orgSlug);
      if (admin) await login(admin.email, 'password123');
    } catch (err) {
      console.error('Failed to switch organization:', err);
    }
  };

  const refreshOrgData = async () => {
    if (token) {
      await fetchMe(token);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        allOrganizations,
        orgUsers,
        token,
        isLoading,
        login,
        logout,
        switchUser,
        switchOrganization,
        refreshOrgData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
