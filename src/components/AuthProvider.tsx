"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  userRole: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  userRole: null,
  isAuthenticated: false,
  isLoading: true,
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setUserRole(null);
    window.location.href = "/login";
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    let initialized = false;

    // Fetch role in the background — never blocks isLoading
    async function fetchRoleInBackground(u: User) {
      try {
        const { data } = await supabase
          .from("users")
          .select("role")
          .eq("id", u.id)
          .maybeSingle();
        if (!mounted) return;
        setUserRole((data?.role as string) ?? (u.user_metadata?.role as string) ?? "seeker");
      } catch {
        if (!mounted) return;
        setUserRole((u.user_metadata?.role as string) ?? "seeker");
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
    <AuthContext.Provider value={{ user, userRole, isAuthenticated: !!user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
