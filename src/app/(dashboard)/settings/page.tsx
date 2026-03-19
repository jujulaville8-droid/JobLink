"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import type { VisibilityMode, UserMessagingSettings } from "@/lib/types";

const VISIBILITY_OPTIONS: {
  value: VisibilityMode;
  label: string;
  description: string;
}[] = [
  {
    value: "actively_looking",
    label: "Actively Looking",
    description: "Your profile is visible to all employers",
  },
  {
    value: "open",
    label: "Open to Opportunities",
    description: "Only visible to employers when you apply",
  },
  {
    value: "not_looking",
    label: "Not Looking",
    description: "Your profile is hidden, but you can still browse and apply",
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Email preferences (placeholder)
  const [emailPrefs, setEmailPrefs] = useState({
    newJobs: true,
    applicationUpdates: true,
    weeklyDigest: false,
    marketing: false,
  });

  // Visibility
  const [visibility, setVisibility] = useState<VisibilityMode>("actively_looking");

  // Password
  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });
  const [changingPassword, setChangingPassword] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Messaging settings
  const [msgSettings, setMsgSettings] = useState<UserMessagingSettings>({
    email_notifications: true,
    sms_notifications: false,
    show_online_status: true,
    show_read_receipts: true,
    notification_cooldown_minutes: 5,
  });
  const [savingMsgSettings, setSavingMsgSettings] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!authUser) {
      setLoading(false);
      return;
    }

    async function load() {
      const supabase = createClient();

      // Get role
      const { data: userData } = await supabase
        .from("users")
        .select("role")
        .eq("id", authUser!.id)
        .maybeSingle();

      const userRole =
        (userData?.role as string) ??
        (authUser!.user_metadata?.role as string) ??
        "seeker";
      setRole(userRole);

      // Get visibility for seekers
      if (userRole === "seeker") {
        const { data: profile } = await supabase
          .from("seeker_profiles")
          .select("visibility")
          .eq("user_id", authUser!.id)
          .maybeSingle();

        if (profile?.visibility) {
          setVisibility(profile.visibility as VisibilityMode);
        }
      }

      // Load messaging settings
      try {
        const msgRes = await fetch("/api/messages/settings");
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          setMsgSettings(msgData);
        }
      } catch { /* use defaults */ }

      setLoading(false);
    }

    load();
  }, [authLoading, authUser]);

  const handleVisibilityChange = async (mode: VisibilityMode) => {
    setVisibility(mode);
    setMessage(null);

    if (!authUser) return;

    const supabase = createClient();
    const { error } = await supabase
      .from("seeker_profiles")
      .update({ visibility: mode, updated_at: new Date().toISOString() })
      .eq("user_id", authUser.id);

    if (error) {
      setMessage({ type: "error", text: "Failed to update visibility." });
    } else {
      setMessage({ type: "success", text: "Visibility updated." });
    }
  };

  const handleChangePassword = async () => {
    setMessage(null);

    if (passwords.new.length < 8) {
      setMessage({
        type: "error",
        text: "New password must be at least 8 characters.",
      });
      return;
    }

    if (passwords.new !== passwords.confirm) {
      setMessage({ type: "error", text: "New passwords do not match." });
      return;
    }

    setChangingPassword(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password: passwords.new,
    });

    if (error) {
      setMessage({
        type: "error",
        text: error.message || "Failed to change password.",
      });
    } else {
      setMessage({ type: "success", text: "Password changed successfully." });
      setPasswords({ current: "", new: "", confirm: "" });
    }

    setChangingPassword(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-[#0d7377]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold font-display text-text sm:text-3xl">Settings</h1>
      <p className="mt-1 text-text-light">
        Manage your account preferences.
      </p>

      {/* Message */}
      {message && (
        <div
          className={`mt-4 rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Email Preferences */}
      <section className="mt-6 rounded-[--radius-card] border border-border bg-[--color-surface] p-6 shadow-sm">
        <h2 className="text-lg font-semibold font-display text-text">
          Email Notifications
        </h2>
        <p className="mt-1 text-sm text-text-light">
          Choose which emails you&apos;d like to receive.
        </p>

        <div className="mt-4 space-y-4">
          {[
            {
              key: "newJobs" as const,
              label: "New job matches",
              desc: "Get notified when jobs match your skills and preferences",
            },
            {
              key: "applicationUpdates" as const,
              label: "Application updates",
              desc: "Status changes on your applications",
            },
            {
              key: "weeklyDigest" as const,
              label: "Weekly digest",
              desc: "A weekly summary of new jobs and platform activity",
            },
            {
              key: "marketing" as const,
              label: "Tips and announcements",
              desc: "Career tips, platform updates, and new features",
            },
          ].map((pref) => (
            <label
              key={pref.key}
              className="flex items-start gap-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={emailPrefs[pref.key]}
                onChange={(e) =>
                  setEmailPrefs((prev) => ({
                    ...prev,
                    [pref.key]: e.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 rounded accent-[#0d7377]"
              />
              <div>
                <p className="text-sm font-medium text-text">{pref.label}</p>
                <p className="text-xs text-text-light">{pref.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Visibility (seekers only) */}
      {role === "seeker" && (
        <section className="mt-6 rounded-[--radius-card] border border-border bg-[--color-surface] p-6 shadow-sm">
          <h2 className="text-lg font-semibold font-display text-text">
            Profile Visibility
          </h2>
          <p className="mt-1 text-sm text-text-light">
            Control who can see your profile.
          </p>

          <div className="mt-4 space-y-3">
            {VISIBILITY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                  visibility === opt.value
                    ? "border-primary bg-blue-50"
                    : "border-border hover:border-border"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={opt.value}
                  checked={visibility === opt.value}
                  onChange={() => handleVisibilityChange(opt.value)}
                  className="mt-0.5 h-4 w-4 accent-[#0d7377]"
                />
                <div>
                  <p className="text-sm font-medium text-text">{opt.label}</p>
                  <p className="text-xs text-text-light">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Messaging Settings */}
      <section className="mt-6 rounded-[--radius-card] border border-border bg-[--color-surface] p-6 shadow-sm">
        <h2 className="text-lg font-semibold font-display text-text">
          Messaging Preferences
        </h2>
        <p className="mt-1 text-sm text-text-light">
          Control how messaging and notifications work for you.
        </p>

        <div className="mt-4 space-y-4">
          {[
            {
              key: "email_notifications" as const,
              label: "Email notifications for new messages",
              desc: "Receive an email when someone sends you a new message",
            },
            {
              key: "show_online_status" as const,
              label: "Show online status",
              desc: "Let others see when you're active on the platform",
            },
            {
              key: "show_read_receipts" as const,
              label: "Show read receipts",
              desc: "Let others know when you've read their messages",
            },
          ].map((pref) => (
            <label
              key={pref.key}
              className="flex items-start gap-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={msgSettings[pref.key]}
                onChange={async (e) => {
                  const newVal = e.target.checked;
                  setMsgSettings((prev) => ({ ...prev, [pref.key]: newVal }));
                  setSavingMsgSettings(true);
                  setMessage(null);
                  try {
                    const res = await fetch("/api/messages/settings", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ [pref.key]: newVal }),
                    });
                    if (res.ok) {
                      setMessage({ type: "success", text: "Messaging preference updated." });
                    } else {
                      setMessage({ type: "error", text: "Failed to save preference." });
                      setMsgSettings((prev) => ({ ...prev, [pref.key]: !newVal }));
                    }
                  } catch {
                    setMessage({ type: "error", text: "Failed to save preference." });
                    setMsgSettings((prev) => ({ ...prev, [pref.key]: !newVal }));
                  }
                  setSavingMsgSettings(false);
                }}
                disabled={savingMsgSettings}
                className="mt-0.5 h-4 w-4 rounded accent-[#0d7377]"
              />
              <div>
                <p className="text-sm font-medium text-text">{pref.label}</p>
                <p className="text-xs text-text-light">{pref.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Change Password */}
      <section className="mt-6 rounded-[--radius-card] border border-border bg-[--color-surface] p-6 shadow-sm">
        <h2 className="text-lg font-semibold font-display text-text">Change Password</h2>
        <p className="mt-1 text-sm text-text-light">
          Update your account password.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={passwords.current}
              onChange={(e) =>
                setPasswords((p) => ({ ...p, current: e.target.value }))
              }
              className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#0d7377] focus:outline-none focus:ring-1 focus:ring-[#0d7377]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              New Password
            </label>
            <input
              type="password"
              value={passwords.new}
              onChange={(e) =>
                setPasswords((p) => ({ ...p, new: e.target.value }))
              }
              className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#0d7377] focus:outline-none focus:ring-1 focus:ring-[#0d7377]"
              placeholder="Min. 8 characters"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={passwords.confirm}
              onChange={(e) =>
                setPasswords((p) => ({ ...p, confirm: e.target.value }))
              }
              className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#0d7377] focus:outline-none focus:ring-1 focus:ring-[#0d7377]"
            />
          </div>
          <button
            type="button"
            onClick={handleChangePassword}
            disabled={changingPassword || !passwords.new || !passwords.confirm}
            className="rounded-[10px] bg-[#0d7377] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#095355] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:-translate-y-px hover:shadow-md hover:shadow-[#0d7377]/20"
          >
            {changingPassword ? "Updating..." : "Update Password"}
          </button>
        </div>
      </section>

      {/* Delete Account */}
      <section className="mt-6 mb-12 rounded-[--radius-card] border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-800">
          Delete Account
        </h2>
        <p className="mt-1 text-sm text-red-600">
          Permanently delete your account and all associated data. This action
          cannot be undone.
        </p>

        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="mt-4 rounded-lg border border-red-300 bg-white px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
          >
            Delete My Account
          </button>
        ) : (
          <div className="mt-4 rounded-lg border border-red-300 bg-white p-4">
            <p className="text-sm font-medium text-red-800">
              Are you sure you want to delete your account?
            </p>
            <p className="mt-1 text-xs text-red-600">
              This will permanently delete your profile, applications, saved
              jobs, and all other data. You will not be able to recover your
              account.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-light hover:bg-bg-alt transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
              >
                Yes, Delete My Account
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
