"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  userRole: "seeker" | "employer" | "admin" | null;
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

interface AuthProviderProps {
  children: React.ReactNode;
  initialUser: User | null;
  initialRole: "seeker" | "employer" | "admin" | null;
}

export default function AuthProvider({
  children,
  initialUser,
  initialRole,
}: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(initialUser);
  const [userRole, setUserRole] = useState<AuthState["userRole"]>(initialRole);
  const [isLoading, setIsLoading] = useState(false);

  const logout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setUserRole(null);
    router.push("/login");
    router.refresh();
  }, [router]);

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user);
        // Fetch role from DB
        const { data } = await supabase
          .from("users")
          .select("role")
          .eq("id", session.user.id)
          .single();
        const role =
          (data?.role as AuthState["userRole"]) ??
          (session.user.user_metadata?.role as AuthState["userRole"]) ??
          "seeker";
        setUserRole(role);
        router.refresh();
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setUserRole(null);
        router.refresh();
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        setUser(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        userRole,
        isAuthenticated: !!user,
        isLoading,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
