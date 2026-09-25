"use client"

import { cn } from "@/lib/utils"

interface Avatar {
  imageUrl: string
  profileUrl: string
}
interface AvatarCirclesProps {
  className?: string
  numPeople?: number
  avatarUrls: Avatar[]
  decorative?: boolean
}

export const AvatarCircles = ({
  numPeople,
  className,
  avatarUrls,
  decorative = false,
}: AvatarCirclesProps) => {
  const Wrapper = decorative ? 'span' : 'a'
  return (
    <div className={cn("z-10 flex -space-x-4 rtl:space-x-reverse", className)}>
      {avatarUrls.map((url, index) => (
        <Wrapper
          key={index}
          {...(!decorative ? { href: url.profileUrl, target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          <img
            key={index}
            className="h-10 w-10 rounded-full border-2 border-white dark:border-gray-800"
            src={url.imageUrl}
            width={40}
            height={40}
            alt={decorative ? '' : `Avatar ${index + 1}`}
          />
        </Wrapper>
      ))}
      {(numPeople ?? 0) > 0 && (
        <Wrapper
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-black text-center text-xs font-medium text-white hover:bg-gray-600 dark:border-gray-800 dark:bg-white dark:text-black"
          {...(!decorative ? { href: '' } : { 'aria-hidden': true as const })}
        >
          +{numPeople}
        </Wrapper>
      )}
    </div>
  )
}
