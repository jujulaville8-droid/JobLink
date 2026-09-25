"use client"

import Image from "next/image"
import { useState } from "react"

export default function CompanyLogo({ src, name }: { src: string | null; name: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "JL"

  if (!src || src === failedSrc) return <span aria-hidden="true">{initials}</span>

  // The company name is already visible in the same card; the logo is decorative.
  return <Image src={src} alt="" width={52} height={52} onError={() => setFailedSrc(src)} />
}
