"use client"

import { Star, MessageCircle, UserPlus, MapPin, Briefcase, GraduationCap } from "lucide-react"
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
  userId,
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
    <div className="group relative overflow-hidden rounded-2xl bg-white border border-border transition-all duration-300 hover:shadow-lg hover:border-primary/20 hover:-translate-y-0.5 flex flex-col">
      {/* Status indicator */}
      <div className="absolute right-3 top-3 z-10">
        <div className="relative">
          <div
            className={cn(
              "h-2.5 w-2.5 rounded-full border-2 border-white transition-all duration-300",
              status === "actively_looking"
                ? "bg-green-500"
                : status === "open"
                  ? "bg-amber-500"
                  : "bg-gray-400",
            )}
          />
          {status === "actively_looking" && (
            <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-green-500 animate-ping opacity-30" />
          )}
        </div>
      </div>

      {/* Top section — avatar + name */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3.5">
          <div className="shrink-0">
            {avatar ? (
              <img
                src={avatar}
                alt={name}
                className="h-14 w-14 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <div
                className={`h-14 w-14 rounded-full ${colors[colorIndex]} flex items-center justify-center text-white text-lg font-bold ring-2 ring-white`}
              >
                {initial}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-text truncate group-hover:text-primary transition-colors">
              {name}
            </h3>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted">
              {location && (
                <span className="flex items-center gap-0.5 truncate">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {location}
                </span>
              )}
              {experienceYears != null && (
                <span className="flex items-center gap-0.5 shrink-0">
                  <Briefcase className="h-3 w-3" />
                  {experienceYears} {experienceYears === 1 ? "yr" : "yrs"}
                </span>
              )}
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium mt-1.5",
                status === "actively_looking"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-blue-50 text-blue-700"
              )}
            >
              {status === "actively_looking" ? "Actively Looking" : "Open"}
            </span>
          </div>
        </div>
      </div>

      {/* Bio snippet */}
      {bio && (
        <div className="px-5 pb-2">
          <p className="text-xs text-text-light leading-relaxed line-clamp-2">
            {bio}
          </p>
        </div>
      )}

      {/* Education */}
      {education && (
        <div className="px-5 pb-2">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <GraduationCap className="h-3 w-3 shrink-0" />
            <span className="truncate">{education}</span>
          </div>
        </div>
      )}

      {/* Skills */}
      <div className="px-5 pb-3 flex flex-wrap gap-1 min-h-[24px]">
        {tags.length > 0
          ? tags.map((tag, i) => (
              <span
                key={i}
                className="inline-block rounded-md bg-bg-alt px-2 py-0.5 text-[10px] font-medium text-text-muted truncate max-w-[100px]"
              >
                {tag}
              </span>
            ))
          : null
        }
      </div>

      {/* Actions */}
      <div className="mt-auto border-t border-border flex">
        <Link
          href={`/candidates/${id}`}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-text-light hover:text-primary hover:bg-primary/5 transition-colors border-r border-border"
        >
          <UserPlus className="h-3.5 w-3.5" />
          View Profile
        </Link>
        <Link
          href={`/candidates/${id}?invite=true`}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Invite to Apply
        </Link>
      </div>
    </div>
  )
}
