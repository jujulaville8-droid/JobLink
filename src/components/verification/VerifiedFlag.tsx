'use client'

import { createContext, useContext } from 'react'

const VerifiedFlag = createContext(false)

/**
 * Tells client components whether JobLink Verified is switched on, so they
 * make no request at all while it is off. Set by server layouts from
 * VERIFICATION_ENABLED; defaults to off anywhere it is not provided.
 */
export function VerifiedFlagProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <VerifiedFlag.Provider value={enabled}>{children}</VerifiedFlag.Provider>
}

export const useVerifiedEnabled = () => useContext(VerifiedFlag)
