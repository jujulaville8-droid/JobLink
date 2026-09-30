"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { ArrowRight, LockKeyhole, Pause, Play, UserRound } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { Marquee } from "@/components/magicui/marquee"
import styles from "./TalentPreview.module.css"

// These are illustrative categories, never records or aggregates from the
// candidate directory. Removing the blur must not reveal anyone's data.
const categories = ["Hospitality", "Office & admin", "Skilled trades", "Retail"]
const subscribe = () => () => {}
const clientReady = () => true
const serverReady = () => false

export default function TalentPreview() {
  const { isAuthenticated, userRole } = useAuth()
  const [paused, setPaused] = useState(false)
  // Keep the illustration still until its pause control can work, including
  // when JavaScript is disabled. The copy and links are always server-rendered.
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady)
  const employer = isAuthenticated && userRole === "employer"
  // /members rechecks the server account, verification and ban state, then
  // forwards employers to /browse-candidates. Client auth only changes copy.
  const href = isAuthenticated
    ? "/members"
    : "/signup?role=employer&returnTo=%2Fmembers"

  return (
    <section
      className={`${styles.section} ${ready && !paused ? styles.moving : ""}`}
      aria-labelledby="talent-preview-title"
    >
      <div className={styles.copy}>
        <p className="home-eyebrow">For your next hire</p>
        <h2 id="talent-preview-title">Meet your next<br />team member.</h2>
        <p className={styles.description}>
          Look beyond the vacancy. Explore candidate profiles with an employer
          account on JobLink.
        </p>
        <p className={styles.access}>
          Verify your employer email and complete your company profile to browse.
          Candidates choose whether employers can discover their profiles.
        </p>
        <Link href={href} prefetch={false} className={`home-button ${styles.cta}`}>
          {employer ? "View candidates" : isAuthenticated ? "Employer access" : "Create employer account"}
          <ArrowRight aria-hidden="true" />
        </Link>
        {!isAuthenticated && (
          <p className={styles.signIn}>
            Already an employer?{" "}
            <Link href="/login?returnTo=%2Fmembers" prefetch={false}>Sign in to view candidates</Link>
          </p>
        )}
      </div>

      <div className={styles.preview}>
        <div className={styles.wall}>
          <div id="talent-preview-illustration" className={styles.illustration} aria-hidden="true">
            {[false, true].map((reverse) => (
              <Marquee key={String(reverse)} reverse={reverse} repeat={2} className={styles.row}>
                {(reverse ? [...categories].reverse() : categories).map((category, index) => (
                  <div key={category} className={`${styles.card} ${index % 2 ? styles.warm : ""}`}>
                    <div className={styles.avatar}><UserRound /></div>
                    <span className={styles.nameLine} />
                    <span className={styles.category}>{category}</span>
                    <div className={styles.lines}><span /><span /></div>
                    <div className={styles.tags}><span /><span /></div>
                  </div>
                ))}
              </Marquee>
            ))}
          </div>
          <div className={styles.frost} aria-hidden="true" />
          <div className={styles.lock} aria-hidden="true">
            <span><LockKeyhole /></span>
            <strong>Candidate profiles</strong>
            <small>Employer access</small>
          </div>
        </div>
        <div className={styles.caption}>
          <p>Illustrative preview. No real profiles shown.</p>
          {ready && (
            <button
              type="button"
              className={styles.control}
              aria-label={paused ? "Resume profile preview animation" : "Pause profile preview animation"}
              aria-pressed={paused}
              aria-controls="talent-preview-illustration"
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              <span>{paused ? "Resume" : "Pause"}</span>
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
