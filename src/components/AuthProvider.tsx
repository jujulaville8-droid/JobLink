"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setUserRole(null);
    // Full page navigation (not client-side) to ensure cookies are cleared
    // and all server components re-evaluate auth state from scratch
    window.location.href = "/login";
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function fetchRole(u: User) {
      const { data } = await supabase
        .from("users")
        .select("role")
        .eq("id", u.id)
        .maybeSingle();
      return (data?.role as string) ?? (u.user_metadata?.role as string) ?? "seeker";
    }

    // Use getSession() first — it reads from cookies/storage synchronously
    // and auto-refreshes if needed. getUser() makes a network call that can fail.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        const role = await fetchRole(session.user);
        if (mounted) setUserRole(role);
      }
      if (mounted) setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === "SIGNED_IN" && session?.user) {
          setUser(session.user);
          const role = await fetchRole(session.user);
          if (mounted) setUserRole(role);
          if (mounted) setIsLoading(false);
        } else if (event === "SIGNED_OUT") {
          setUser(null);
          setUserRole(null);
          setIsLoading(false);
        } else if (event === "TOKEN_REFRESHED" && session?.user) {
          setUser(session.user);
        } else if (event === "INITIAL_SESSION") {
          // INITIAL_SESSION fires once when the client first loads.
          // If there's a session, update state; if not, mark loading done.
          if (session?.user) {
            setUser(session.user);
            const role = await fetchRole(session.user);
            if (mounted) setUserRole(role);
          }
          if (mounted) setIsLoading(false);
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
