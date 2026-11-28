import { VerifiedFlagProvider } from '@/components/verification/VerifiedFlag'
import { verificationEnabled } from '@/lib/verification/server'


/** Lets the apply form know whether to offer "Send my verified documents". */
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return <VerifiedFlagProvider enabled={verificationEnabled()}>{children}</VerifiedFlagProvider>
}
