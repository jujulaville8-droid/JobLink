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
    // Full page navigation to ensure cookies are cleared
    // and all server components re-evaluate auth state
    window.location.href = "/login";
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    // Fetch role in the background — never blocks isLoading
    async function fetchRoleInBackground(u: User) {
      try {
        const { data } = await supabase
          .from("users")
          .select("role")
          .eq("id", u.id)
          .maybeSingle();
        if (!mounted) return;
        const role = (data?.role as string) ?? (u.user_metadata?.role as string) ?? "seeker";
        setUserRole(role);
      } catch {
        if (!mounted) return;
        // Fallback to metadata role if DB query fails
        setUserRole((u.user_metadata?.role as string) ?? "seeker");
      }
    }

    // Single source of truth: onAuthStateChange handles ALL auth events
    // including INITIAL_SESSION which fires once on first load.
    // No separate getSession() call needed — eliminates race conditions.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        if (event === "INITIAL_SESSION") {
          // First load — set user immediately, mark loading done,
          // then fetch role in the background
          if (session?.user) {
            setUser(session.user);
            fetchRoleInBackground(session.user);
          }
          setIsLoading(false);
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

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, userRole, isAuthenticated: !!user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
