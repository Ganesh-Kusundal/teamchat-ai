import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Organization } from '../types.js';

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

  // Fetch all organizations for evaluation & tenant switcher
  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await fetch('/api/orgs');
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
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setOrganization(data.organization);
        setToken(sessionToken);
        localStorage.setItem('teamchat_token', sessionToken);

        // Fetch users in this org
        const usersRes = await fetch('/api/org/users', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
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
    fetchOrganizations();
    if (token) {
      fetchMe(token);
    } else {
      // Default to login screen or auto-login default test user if needed
      setIsLoading(false);
    }
  }, [fetchMe, fetchOrganizations, token]);

  const login = async (email: string, password = 'password123'): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const usersRes = await fetch('/api/org/users', {
        headers: { Authorization: `Bearer ${data.token}` },
      });
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
      fetch('/api/presence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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

      // Seed email conventions:
      const defaultEmail =
        orgSlug === 'northside-health'
          ? 'sarah@northside-health.test'
          : orgSlug === 'valley-primary-care'
          ? 'elena@valley-primary-care.test'
          : 'marcus@metro-cardiology.test';

      await login(defaultEmail, 'password123');
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
