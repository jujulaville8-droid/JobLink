"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  userRole: string | null;
  /** Whether the user has admin privileges (persists across role switches) */
  isAdminUser: boolean;
  avatarUrl: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  setAvatarUrl: (url: string | null) => void;
  setUserRole: (role: string | null) => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  userRole: null,
  isAdminUser: false,
  avatarUrl: null,
  isAuthenticated: false,
  isLoading: true,
  logout: async () => {},
  setAvatarUrl: () => {},
  setUserRole: () => {},
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

  // Derive avatarUrl from current role
  const avatarUrl = userRole === "employer" ? companyLogoUrl : seekerAvatarUrl;
  const setAvatarUrl = useCallback((url: string | null) => {
    if (userRole === "employer") {
      setCompanyLogoUrl(url);
    } else {
      setSeekerAvatarUrl(url);
    }
  }, [userRole]);

  const logout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setUserRole(null);
    setIsAdminUser(false);
    setSeekerAvatarUrl(null);
    setCompanyLogoUrl(null);
    window.location.href = "/login";
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    let initialized = false;

    // Fetch role and avatar in the background — never blocks isLoading
    async function fetchRoleInBackground(u: User) {
      try {
        const { data } = await supabase
          .from("users")
          .select("role, is_admin")
          .eq("id", u.id)
          .maybeSingle();
        if (!mounted) return;
        setUserRole((data?.role as string) ?? (u.user_metadata?.role as string) ?? "seeker");
        setIsAdminUser(data?.is_admin === true);
      } catch {
        if (!mounted) return;
        setUserRole((u.user_metadata?.role as string) ?? "seeker");
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
        fetchRoleInBackground(session.user);
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
          fetchRoleInBackground(session.user);
        } else if (event === "SIGNED_OUT") {
          setUser(null);
          setUserRole(null);
          setIsAdminUser(false);
          setSeekerAvatarUrl(null);
          setCompanyLogoUrl(null);
          setIsLoading(false);
        } else if (event === "TOKEN_REFRESHED" && session?.user) {
          setUser(session.user);
        }
      }
    );

    // Safety net: if INITIAL_SESSION hasn't fired within 2 seconds,
    // fall back to getSession(). Handles edge cases in certain
    // Supabase SSR versions where INITIAL_SESSION may not fire reliably.
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
    <AuthContext.Provider value={{ user, userRole, isAdminUser, avatarUrl, isAuthenticated: !!user, isLoading, logout, setAvatarUrl, setUserRole }}>
      {children}
    </AuthContext.Provider>
  );
}
