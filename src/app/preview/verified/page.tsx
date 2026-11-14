import { notFound } from 'next/navigation'
import VerifiedPreviewGallery from '@/components/verification/PreviewGallery'
import { verifiedPreviewEnabled } from '@/lib/verification/preview'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'JobLink Verified preview', robots: { index: false, follow: false } }

/** Every Verified screen with made-up data. Needs VERIFIED_PREVIEW=true; never served in production. */
export default async function VerifiedPreviewPage({ searchParams }: { searchParams: Promise<{ scene?: string }> }) {
  if (!verifiedPreviewEnabled()) notFound()
  return <VerifiedPreviewGallery initialScene={(await searchParams).scene} />
}
