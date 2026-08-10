import type { Metadata } from "next";
import Link from "next/link";
import React from "react";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Medinexa - Unified Patient & Practice Platform",
  description:
    "Streamline clinical operations, improve patient care delivery, and securely scale your healthcare practice on a single cloud platform.",
};

export default function LandingPage() {
  return (
    <div className={styles.page}>
      {/* Navigation Header */}
      <header className={styles.navbar}>
        <div className={`${styles.container} ${styles.navContainer}`}>
          <Link href="/" className={styles.brandLogo}>
            <span className={styles.logoAccent}>Medinexa</span> Health Cloud
          </Link>
          <nav className={styles.navLinks}>
            <a href="#grid">Health Grid</a>
            <a href="#suite">App Suite</a>
            <a href="#security">Security</a>
          </nav>
          <div className={styles.navActions}>
            <Link href="/signin" className={`${styles.btn} ${styles.btnTertiary}`}>
              Sign In
            </Link>
            <Link href="/signup" className={`${styles.btn} ${styles.btnPrimary}`}>
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={`${styles.container} ${styles.heroContent}`}>
          <span className={styles.badge}>Healthcare Solutions Platform</span>
          <h1>
            Enhanced patient engagement, staff collaboration, analytics, and
            data security.
          </h1>
          <p className={styles.heroSubtext}>
            Streamline clinical operations, improve patient care delivery,
            and securely scale your healthcare practice on a single cloud
            platform.
          </p>
          <div className={styles.heroButtons}>
            <Link href="/signup" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`}>
              Get Started
            </Link>
            <Link href="/signin" className={`${styles.btn} ${styles.btnSecondary} ${styles.btnLg}`}>
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Health Grid / Solutions Grid */}
      <section id="grid" className={styles.healthGrid}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2>Healthcare software solutions</h2>
            <p>Our comprehensive Health Grid powers every side of your medical practice.</p>
          </div>

          <div className={styles.gridCards}>
            <article className={styles.card}>
              <div className={styles.cardIcon}>🏥</div>
              <h3>Practice Management</h3>
              <p>Streamline appointment scheduling, medical record keeping, billing, and patient claims to boost clinic efficiency.</p>
              <Link href="/signup" className={styles.cardLink}>Learn more &rarr;</Link>
            </article>

            <article className={styles.card}>
              <div className={styles.cardIcon}>🤝</div>
              <h3>Branch & Staff Management</h3>
              <p>Manage multi-branch clinics, invite doctors, and control fine-grained staff permissions from one dashboard.</p>
              <Link href="/signup" className={styles.cardLink}>Learn more &rarr;</Link>
            </article>

            <article className={styles.card}>
              <div className={styles.cardIcon}>🩺</div>
              <h3>Doctor Scheduling</h3>
              <p>Configure doctor availability, slot templates, and consultation fees, and let patients book in real time.</p>
              <Link href="/signup" className={styles.cardLink}>Learn more &rarr;</Link>
            </article>

            <article className={styles.card}>
              <div className={styles.cardIcon}>💳</div>
              <h3>Payments & Ledger</h3>
              <p>Record consultation payments, track per-branch monthly totals, and keep a clear audit trail for every clinic.</p>
              <Link href="/signup" className={styles.cardLink}>Learn more &rarr;</Link>
            </article>

            <article className={styles.card}>
              <div className={styles.cardIcon}>📈</div>
              <h3>Patient Records</h3>
              <p>Track patient visit history, prescriptions, and medical documents securely across every branch.</p>
              <Link href="/signup" className={styles.cardLink}>Learn more &rarr;</Link>
            </article>
          </div>
        </div>
      </section>

      {/* Custom Solutions Banner */}
      <section className={styles.customSolutions}>
        <div className={`${styles.container} ${styles.customContent}`}>
          <div className={styles.customText}>
            <h2>Built for how clinics actually run</h2>
            <p>Multi-branch clinics, staff permissions, doctor invites, and payment tracking — all in one place, purpose-built for healthcare teams.</p>
          </div>
          <div className={styles.customAction}>
            <Link href="/signup" className={`${styles.btn} ${styles.btnLight} ${styles.btnLg}`}>
              Get Started
            </Link>
          </div>
        </div>
      </section>

      {/* Suite Breakdown Section */}
      <section id="suite" className={styles.appSuite}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2>A suite of tools for every healthcare business</h2>
            <p>Purpose-built modules to elevate every department in your medical organization.</p>
          </div>

          <div className={styles.suiteGrid}>
            <div className={styles.suiteItem}>
              <h3>For Patient Experience</h3>
              <p>Deliver a smooth booking, confirmation, and payment journey from a single patient-facing flow.</p>
            </div>

            <div className={styles.suiteItem}>
              <h3>For Clinic Owners</h3>
              <p>Manage clinics, branches, licenses, and payment ledgers with full visibility across locations.</p>
            </div>

            <div className={styles.suiteItem}>
              <h3>For Branch Staff</h3>
              <p>Confirm bookings, record payments, and manage patients with permissions scoped to your role.</p>
            </div>

            <div className={styles.suiteItem}>
              <h3>For Doctors</h3>
              <p>Set your availability, manage your profile, and issue prescriptions from anywhere.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Compliance & Security */}
      <section id="security" className={`${styles.securitySection} ${styles.textCenter}`}>
        <div className={styles.container}>
          <h2>Keep patient health information secure</h2>
          <p>Built with strict access control and role-based permissions at every layer.</p>

          <div className={styles.badgesRow}>
            <div className={styles.badgeItem}>Role-based access</div>
            <div className={styles.badgeItem}>Signed uploads</div>
            <div className={styles.badgeItem}>Audited payments</div>
            <div className={styles.badgeItem}>Encrypted sessions</div>
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className={`${styles.finalCta} ${styles.textCenter}`}>
        <div className={styles.container}>
          <h2>Bring your clinic online today.</h2>
          <p>Join clinics that trust Medinexa to run their day-to-day operations.</p>
          <Link href="/signup" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`}>
            Get Started
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.siteFooter}>
        <div className={`${styles.container} ${styles.footerContent}`}>
          <p>&copy; 2026 Medinexa. All rights reserved.</p>
          <div className={styles.footerLinks}>
            <Link href="/signin">Sign In</Link>
            <Link href="/signup">Sign Up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
