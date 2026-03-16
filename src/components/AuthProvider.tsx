"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { AuthStatus } from "@/lib/auth-verify";
import { getAuthStatus } from "@/lib/auth-verify";

interface AuthState {
  user: User | null;
  userRole: string | null;
  /** Whether the user has admin privileges (persists across role switches) */
  isAdminUser: boolean;
  avatarUrl: string | null;
  isAuthenticated: boolean;
  /** Whether the user's email has been verified (auth-level + DB-level) */
  isEmailVerified: boolean;
  /** Whether the user can access protected parts of the app */
  canAccessApp: boolean;
  /** Current auth status: anonymous | authenticating | authenticated_unverified | authenticated_verified */
  authStatus: AuthStatus;
  isLoading: boolean;
  logout: () => Promise<void>;
  setAvatarUrl: (url: string | null) => void;
  setUserRole: (role: string | null) => void;
  /** Re-check verification status from server (for "I've verified" button) */
  refreshVerification: () => Promise<boolean>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  userRole: null,
  isAdminUser: false,
  avatarUrl: null,
  isAuthenticated: false,
  isEmailVerified: false,
  canAccessApp: false,
  authStatus: 'anonymous',
  isLoading: true,
  logout: async () => {},
  setAvatarUrl: () => {},
  setUserRole: () => {},
  refreshVerification: async () => false,
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [seekerAvatarUrl, setSeekerAvatarUrl] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  // Derive avatarUrl from current role
  const avatarUrl = userRole === "employer" ? companyLogoUrl : seekerAvatarUrl;
  const setAvatarUrl = useCallback((url: string | null) => {
    if (userRole === "employer") {
      setCompanyLogoUrl(url);
    } else {
      setSeekerAvatarUrl(url);
    }
  }, [userRole]);

  const isAuthenticated = !!user;
  const canAccessApp = isAuthenticated && isEmailVerified;
  const authStatus = getAuthStatus(user, isLoading, isEmailVerified);

  const logout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setUserRole(null);
    setIsAdminUser(false);
    setIsEmailVerified(false);
    setSeekerAvatarUrl(null);
    setCompanyLogoUrl(null);
    window.location.href = "/login";
  }, []);

  // Re-check verification status from server
  const refreshVerification = useCallback(async (): Promise<boolean> => {
    const supabase = createClient();
    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (!freshUser) return false;

    // Update the user object with fresh data
    setUser(freshUser);

    // Check auth-level verification
    if (!freshUser.email_confirmed_at) return false;

    // Check DB-level verification
    const { data } = await supabase
      .from('users')
      .select('email_verified')
      .eq('id', freshUser.id)
      .single();

    const verified = !!(data?.email_verified === true);
    setIsEmailVerified(verified);
    return verified;
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    let initialized = false;

    // Fetch role, verification status, and avatar in the background
    async function fetchUserDataInBackground(u: User) {
      // Check email verification
      const authVerified = !!u.email_confirmed_at;

      try {
        const { data } = await supabase
          .from("users")
          .select("role, is_admin, email_verified")
          .eq("id", u.id)
          .maybeSingle();
        if (!mounted) return;
        setUserRole((data?.role as string) ?? (u.user_metadata?.role as string) ?? "seeker");
        setIsAdminUser(data?.is_admin === true);

        // Both auth-level and DB-level must be true
        const dbVerified = data?.email_verified === true;
        setIsEmailVerified(authVerified && dbVerified);
      } catch {
        if (!mounted) return;
        setUserRole((u.user_metadata?.role as string) ?? "seeker");
        setIsEmailVerified(authVerified);
      }

      // Fetch seeker avatar and company logo in parallel
      try {
        const [seekerRes, companyRes] = await Promise.all([
          supabase.from("seeker_profiles").select("avatar_url").eq("user_id", u.id).maybeSingle(),
          supabase.from("companies").select("logo_url").eq("user_id", u.id).maybeSingle(),
        ]);
        if (!mounted) return;
        if (seekerRes.data?.avatar_url) {
          setSeekerAvatarUrl(seekerRes.data.avatar_url as string);
        }
        if (companyRes.data?.logo_url) {
          setCompanyLogoUrl(companyRes.data.logo_url as string);
        }
      } catch {
        // Non-critical — avatars stay null
      }
    }

    function handleSession(session: { user: User } | null) {
      if (!mounted || initialized) return;
      initialized = true;

      if (session?.user) {
        setUser(session.user);
        fetchUserDataInBackground(session.user);
      }
      setIsLoading(false);
    }

    // Primary: onAuthStateChange with INITIAL_SESSION
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        if (event === "INITIAL_SESSION") {
          handleSession(session);
        } else if (event === "SIGNED_IN" && session?.user) {
          setUser(session.user);
          setIsLoading(false);
          fetchUserDataInBackground(session.user);
        } else if (event === "SIGNED_OUT") {
          setUser(null);
          setUserRole(null);
          setIsAdminUser(false);
          setIsEmailVerified(false);
          setSeekerAvatarUrl(null);
          setCompanyLogoUrl(null);
          setIsLoading(false);
        } else if (event === "TOKEN_REFRESHED" && session?.user) {
          setUser(session.user);
        }
      }
    );

    // Safety net: if INITIAL_SESSION hasn't fired within 2 seconds,
    // fall back to getSession().
    const fallbackTimer = setTimeout(() => {
      if (!initialized && mounted) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          handleSession(session);
        });
      }
    }, 2000);

    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{
      user, userRole, isAdminUser, avatarUrl,
      isAuthenticated, isEmailVerified, canAccessApp, authStatus,
      isLoading, logout, setAvatarUrl, setUserRole, refreshVerification,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
