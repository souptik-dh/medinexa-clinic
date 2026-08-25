import type { Metadata } from "next";
import Link from "next/link";
import React from "react";
import styles from "./landing.module.css";
import { LandingFAQ } from "./LandingFAQ";
import { LandingSwiper } from "./LandingSwiper";

export const metadata: Metadata = {
  title: "Jido Healthcare - Better Care, Better Life",
  description:
    "Connect patients with top verified doctors and clinics, while empowering medical facilities with unified branch controls, sequential queue bookings, and doctor schedule management.",
};

export default function LandingPage() {
  return (
    <div className={styles.page}>
      {/* Sticky Navigation Header */}
      <header className={styles.navbar}>
        <div className={styles.navContainer}>
          <Link href="/" className={styles.logo}>
            <img
              src="/_next/image?url=%2Fimages%2Flogo%2Flogo.png&w=640&q=75"
              alt="Jido Healthcare"
              width={160}
              height={78}
              className={styles.logoImage}
            />
          </Link>
          <nav className={styles.navLinks}>
            <a href="#features">Features</a>
            <a href="#screenshots">Screenshots</a>
            <a href="#steps">How It Works</a>
            <a href="#faq">FAQ</a>
            <Link href="/signin" className={styles.btnGradient}>
              Clinic Portal
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            Healthcare Simplified
          </div>
          <h1>
            Launch Your Healthcare Journey with{" "}
            <span className={styles.gradientText}>Confidence</span>.
          </h1>
          <p>
            Connect patients with top verified doctors and clinics, while
            empowering medical facilities with unified branch controls,
            sequential queue bookings, and doctor schedule management.
          </p>

          <div className={styles.heroActions}>
            <Link href="/signup" className={styles.btnGradient}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
              </svg>
              Book Appointment
            </Link>
            <Link href="/signin" className={styles.btnSecondary}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
              </svg>
              Clinic Portal Login
            </Link>
          </div>
        </div>

        {/* Right Side: Laptop Screen with Mobile Mockup */}
        <div className={styles.heroVisuals} id="portal">
          <div className={styles.laptopContainer}>
            <div className={styles.laptopFrame}>
              <img
                src="/images/landing/Screenshot_1.png"
                alt="Jido Healthcare Clinic Portal Dashboard"
              />
            </div>
            <div className={styles.laptopBaseBar}></div>
          </div>

          <div className={styles.floatingPhoneWrap}>
            <img
              src="/images/landing/mobile_ss1.jpg"
              alt="Jido Healthcare Mobile App"
            />
          </div>
        </div>
      </section>

      {/* Key Features Grid */}
      <section className={styles.sectionHead} id="features">
        <h2>Why You Should Choose Jido Healthcare</h2>
        <p>Modern tools designed to deliver smooth consultation and clinic management.</p>
      </section>

      <div className={styles.featuresGrid}>
        <div className={`${styles.featureCard} ${styles.glassCard}`}>
          <div className={`${styles.featureIcon} ${styles.icon1}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
          <h3>Verified Doctors</h3>
          <p>Search qualified specialists by qualification, council registration, and fee structure.</p>
        </div>

        <div className={`${styles.featureCard} ${styles.glassCard}`}>
          <div className={`${styles.featureIcon} ${styles.icon2}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
            </svg>
          </div>
          <h3>Real-time 30-Day Slots</h3>
          <p>Dynamic availability calendar with instant leave tracking and sequential queue booking.</p>
        </div>

        <div className={`${styles.featureCard} ${styles.glassCard}`}>
          <div className={`${styles.featureIcon} ${styles.icon3}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
            </svg>
          </div>
          <h3>Fast & Secure Pay</h3>
          <p>UPI, credit/debit card, and pay-at-clinic flexibility with instant receipt generation.</p>
        </div>

        <div className={`${styles.featureCard} ${styles.glassCard}`}>
          <div className={`${styles.featureIcon} ${styles.icon4}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/>
            </svg>
          </div>
          <h3>Multi-Branch Portal</h3>
          <p>Comprehensive admin controls to manage branch doctors, patient invites, and clinic details.</p>
        </div>
      </div>

      {/* App Screenshots Section */}
      <section className={styles.sectionHead} id="screenshots">
        <h2>App Screenshots</h2>
        <p>Explore the intuitive screens crafted for iOS, Android, and mobile web.</p>
      </section>

      <LandingSwiper />

      {/* 3-Steps Process Section */}
      <section className={styles.stepsSection} id="steps">
        <div className={styles.stepsPhone}>
          <div className={styles.stepsPhoneFrame}>
            <img
              src="/images/landing/mobile_ss2.jpg"
              alt="Mobile App Step Preview"
            />
          </div>
        </div>

        <div className={styles.stepsContent}>
          <h2>Very Easy To Use Just Following 3 Steps</h2>
          <p className={styles.subDesc}>
            Get started with Jido Healthcare in three simple steps. Our intuitive
            platform makes healthcare accessible to everyone.
          </p>

          <div className={`${styles.stepItemCard} ${styles.glassCard}`}>
            <div className={styles.stepNumberBox}>01</div>
            <div className={styles.stepText}>
              <h4>Install This App</h4>
              <p>Download Jido Healthcare from the App Store or Google Play and create your account in seconds.</p>
            </div>
          </div>

          <div className={`${styles.stepItemCard} ${styles.glassCard}`}>
            <div className={styles.stepNumberBox}>02</div>
            <div className={styles.stepText}>
              <h4>Login Or Signup</h4>
              <p>Create your profile, verify your details, and get ready to access quality healthcare services.</p>
            </div>
          </div>

          <div className={`${styles.stepItemCard} ${styles.glassCard}`}>
            <div className={styles.stepNumberBox}>03</div>
            <div className={styles.stepText}>
              <h4>Search Your Doctor & Book</h4>
              <p>Find verified doctors by specialty, check real-time availability, and book your appointment instantly.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className={styles.faqSection} id="faq">
        <div className={styles.sectionHead}>
          <h2>Frequently Asked Questions</h2>
          <p>Have questions? We&apos;ve got answers to help you navigate Jido Healthcare effortlessly.</p>
        </div>

        <LandingFAQ />
      </section>

      {/* Download App Call-to-Action */}
      <section className={`${styles.downloadCard} ${styles.glassCard}`} id="download">
        <h2>Download and Start Booking Today</h2>
        <p>Experience fast, hassle-free healthcare appointments right at your fingertips.</p>

        <div className={styles.storeButtons}>
          <a href="#" className={styles.storeBtn}>
            <svg className={styles.storeBtnIcon} width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.24-.84-.76-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm.91-.91L19.59 12l-1.87-2.21-2.27 2.27 2.27 2.15zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z"/>
            </svg>
            <span className={styles.storeBtnText}>
              Get it on<br />
              <strong>Google Play</strong>
            </span>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerGrid}>
          <div className={styles.footerCol}>
            <Link href="/" className={styles.logo} style={{ marginBottom: 12, display: "inline-flex" }}>
              <img
                src="/_next/image?url=%2Fimages%2Flogo%2Flogo.png&w=640&q=75"
                alt="Jido Healthcare"
                width={160}
                height={78}
                className={styles.logoImage}
              />
            </Link>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
              Unified healthcare appointment and clinic management ecosystem.
            </p>
          </div>

          <div className={styles.footerCol}>
            <h4>Navigation</h4>
            <ul>
              <li><a href="#features">Features</a></li>
              <li><a href="#screenshots">Screenshots</a></li>
              <li><a href="#steps">How It Works</a></li>
              <li><Link href="/signin">Clinic Portal</Link></li>
            </ul>
          </div>

          <div className={styles.footerCol}>
            <h4>Legal</h4>
            <ul>
              <li><a href="#">Terms & Conditions</a></li>
              <li><a href="#">Privacy Policy</a></li>
            </ul>
          </div>

          <div className={styles.footerCol}>
            <h4>Contact</h4>
            <ul>
              <li>
                <a href="mailto:support@jidohealthcare.com">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                  support@jidohealthcare.com
                </a>
              </li>
              <li>
                <a href="#">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
                    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/>
                  </svg>
                  healthcare.jidohealthcare.com
                </a>
              </li>
              <li>
                <a href="#">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                  Belari, West Bengal, India
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className={styles.footerBottom}>
          &copy; 2026 Jido Healthcare. All rights reserved. Better Care, Better Life.
        </div>
      </footer>
    </div>
  );
}
