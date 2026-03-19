"use client"

import { MessageCircle, UserPlus, MapPin, Briefcase, GraduationCap } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

type ProfileCardProps = {
  id: string
  name: string
  role: string
  status: "actively_looking" | "open" | "not_looking"
  avatar: string | null
  tags?: string[]
  isVerified?: boolean
  location?: string | null
  experienceYears?: number | null
  bio?: string | null
  education?: string | null
  userId?: string | null
}

export default function CandidateProfileCard({
  id,
  name,
  role,
  status,
  avatar,
  tags = [],
  location,
  experienceYears,
  bio,
  education,
}: ProfileCardProps) {
  const initial = name.charAt(0).toUpperCase() || "?"

  const colors = [
    "bg-primary",
    "bg-emerald-600",
    "bg-violet-600",
    "bg-sky-600",
    "bg-rose-600",
    "bg-cyan-600",
  ]
  const colorIndex =
    name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length

  return (
    <div className="group relative overflow-hidden rounded-3xl bg-white p-6 shadow-[8px_8px_16px_rgba(0,0,0,0.08),-8px_-8px_16px_rgba(255,255,255,0.9)] transition-all duration-500 hover:shadow-[12px_12px_24px_rgba(0,0,0,0.12),-12px_-12px_24px_rgba(255,255,255,1)] hover:scale-[1.02] hover:-translate-y-1 flex flex-col">
      {/* Status indicator */}
      <div className="absolute right-4 top-4 z-10">
        <div className="relative">
          <div
            className={cn(
              "h-3 w-3 rounded-full border-2 border-white transition-all duration-300 group-hover:scale-125",
              status === "actively_looking"
                ? "bg-green-500 group-hover:shadow-[0_0_20px_rgba(34,197,94,0.6)]"
                : status === "open"
                  ? "bg-amber-500"
                  : "bg-gray-400",
            )}
          />
          {status === "actively_looking" && (
            <div className="absolute inset-0 h-3 w-3 rounded-full bg-green-500 animate-ping opacity-30" />
          )}
        </div>
      </div>

      {/* Profile Photo */}
      <div className="mb-4 flex justify-center relative z-10">
        <div className="relative">
          <div className="h-24 w-24 overflow-hidden rounded-full bg-white p-1 shadow-[inset_4px_4px_8px_rgba(0,0,0,0.08),inset_-4px_-4px_8px_rgba(255,255,255,0.9)] transition-all duration-500 group-hover:shadow-[inset_6px_6px_12px_rgba(0,0,0,0.1),inset_-6px_-6px_12px_rgba(255,255,255,1)] group-hover:scale-110">
            {avatar ? (
              <img
                src={avatar}
                alt={name}
                className="h-full w-full rounded-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div
                className={`h-full w-full rounded-full ${colors[colorIndex]} flex items-center justify-center text-white text-2xl font-bold`}
              >
                {initial}
              </div>
            )}
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-primary/40 opacity-0 group-hover:opacity-100 transition-all duration-500" />
        </div>
      </div>

      {/* Profile Info */}
      <div className="text-center relative z-10 transition-transform duration-300 group-hover:-translate-y-1">
        <h3 className="text-base font-semibold text-text transition-colors duration-300 group-hover:text-primary truncate">
          {name}
        </h3>

        {/* Location + experience */}
        <div className="mt-1.5 flex items-center justify-center gap-3 text-sm text-text-light min-h-[20px]">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {location || "—"}
          </span>
          <span className="flex items-center gap-1">
            <Briefcase className="h-3.5 w-3.5" />
            {experienceYears != null
              ? `${experienceYears} ${experienceYears === 1 ? "yr" : "yrs"}`
              : "—"}
          </span>
        </div>

        {/* Status label */}
        <p className="mt-2 text-xs text-text-muted transition-all duration-300 group-hover:text-primary group-hover:font-medium">
          {status === "actively_looking" ? "Actively Looking" : "Open to Opportunities"}
        </p>
      </div>

      {/* Bio snippet */}
      {bio && (
        <p className="mt-3 text-xs text-text-light text-center leading-relaxed line-clamp-2 relative z-10">
          {bio}
        </p>
      )}

      {/* Education */}
      {education && (
        <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-text-muted relative z-10">
          <GraduationCap className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[180px]">{education}</span>
        </div>
      )}

      {/* Skill Tags */}
      <div className="mt-3 flex justify-center flex-wrap gap-1.5 relative z-10 min-h-[28px]">
        {tags.length > 0
          ? tags.map((tag, i) => (
              <span
                key={i}
                className="inline-block rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-text-light shadow-[2px_2px_4px_rgba(0,0,0,0.05),-2px_-2px_4px_rgba(255,255,255,0.8)] transition-all duration-300 group-hover:scale-105 truncate max-w-[120px]"
              >
                {tag}
              </span>
            ))
          : null
        }
      </div>

      {/* Action Buttons */}
      <div className="mt-auto pt-4 flex gap-2 relative z-10">
        <Link
          href={`/candidates/${id}`}
          className="flex-1 flex items-center justify-center rounded-full bg-white py-3 text-sm font-medium text-primary shadow-[4px_4px_8px_rgba(0,0,0,0.08),-4px_-4px_8px_rgba(255,255,255,0.9)] transition-all duration-300 hover:bg-primary/5 hover:shadow-[2px_2px_4px_rgba(0,0,0,0.05),-2px_-2px_4px_rgba(255,255,255,0.8)]"
        >
          <UserPlus className="h-4 w-4 mr-1.5" />
          <span className="text-xs">View Profile</span>
        </Link>
        <Link
          href={`/candidates/${id}?invite=true`}
          className="flex-1 flex items-center justify-center rounded-full bg-white py-3 text-sm font-medium text-text-light shadow-[4px_4px_8px_rgba(0,0,0,0.08),-4px_-4px_8px_rgba(255,255,255,0.9)] transition-all duration-300 hover:bg-gray-50 hover:shadow-[2px_2px_4px_rgba(0,0,0,0.05),-2px_-2px_4px_rgba(255,255,255,0.8)]"
        >
          <MessageCircle className="h-4 w-4 mr-1.5" />
          <span className="text-xs">Invite to Apply</span>
        </Link>
      </div>

      {/* Animated border on hover */}
      <div className="absolute inset-0 rounded-3xl border border-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
    </div>
  )
}
