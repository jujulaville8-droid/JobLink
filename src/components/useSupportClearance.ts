'use client'
import { useEffect, useRef } from 'react'

/** Keep the support bubble/panel above visible navigation, apply, or cookie UI. */
export function useSupportClearance() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observed = new Set<Element>()
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    function measure() {
      const viewport = window.visualViewport
      const visibleHeight = Math.min(window.innerHeight, viewport?.height ?? window.innerHeight)
      const keyboardInset = Math.max(0, window.innerHeight - visibleHeight - (viewport?.offsetTop ?? 0))
      let clearance = keyboardInset + 16
      const controls = new Set(document.querySelectorAll('[data-support-obstruction]'))
      for (const removed of observed) { if (!controls.has(removed)) { resize?.unobserve(removed); observed.delete(removed) } }
      for (const control of controls) {
        if (!observed.has(control)) { resize?.observe(control); observed.add(control) }
        const bounds = control.getBoundingClientRect()
        if (bounds.width > 0 && bounds.height > 0 && bounds.bottom > window.innerHeight / 2) {
          clearance = Math.max(clearance, window.innerHeight - bounds.top + 12)
        }
      }
      node!.style.setProperty('--support-clearance', `${Math.ceil(clearance)}px`)
      // Clearance already includes the keyboard inset. Subtract it only once
      // from layout height, while respecting a panned visual viewport's top.
      node!.style.setProperty('--support-layout-height', `${Math.floor(window.innerHeight - (viewport?.offsetTop ?? 0))}px`)
    }
    measure()
    // Route changes may mount a new bottom bar without resizing the viewport.
    const mutation = new MutationObserver(measure)
    mutation.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)
    return () => {
      resize?.disconnect(); mutation.disconnect()
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
    }
  }, [])
  return ref
}
