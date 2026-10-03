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

      {/* SECTION 1 (Odd: Deep Purple Background) - Hero Section */}
      <section className={styles.sectionOdd} id="hero">
        <div className={styles.heroSection}>
          <div className={styles.heroContent}>
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeDot}></span>
              WHO WE ARE
            </div>
            <h1>
              Smart, connected software for{" "}
              <span className={styles.gradientText}>growing healthcare</span>
            </h1>
            <p>
              Jido is a modern technology ecosystem focused on building smart, scalable, and
              user-friendly digital solutions for healthcare facilities, clinic appointments,
              and doctor queue management.
            </p>

            <div className={styles.heroActions}>
              <Link href="/signup" className={styles.btnGradient}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
                </svg>
                Get Started
              </Link>
              <Link href="/signin" className={styles.btnSecondaryDark}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
                </svg>
                Clinic Portal Login
              </Link>
            </div>
          </div>

          {/* Right Side: Laptop Screen with Mobile Mockup and ISO badge */}
          <div className={styles.heroVisuals} id="portal">
            <div className={styles.isoBadge}>
              <div className={styles.isoIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
                </svg>
              </div>
              <div className={styles.isoText}>
                <strong>ISO 9001:2015</strong>
                <span>Certified quality</span>
              </div>
            </div>

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
        </div>
      </section>

      {/* SECTION 2 (Even: Current Light Background) - Key Features Grid */}
      <section className={styles.sectionEven} id="features">
        <span className={styles.featuresWash} aria-hidden="true" />
        <div className={styles.sectionHead}>
          <span className={styles.stepsEyebrow}>Why Jido</span>
          <h2>
            Why You Should Choose{" "}
            <span className={styles.gradientText}>Jido Healthcare</span>
          </h2>
          <p>Modern tools designed to deliver smooth consultation and clinic management.</p>
        </div>

        <div className={styles.featuresGrid}>
          {[
            {
              accent: styles.icon1,
              title: "Verified Doctors",
              text: "Search qualified specialists by qualification, council registration, and fee structure.",
              icon: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
            },
            {
              accent: styles.icon2,
              title: "Real-time 30-Day Slots",
              text: "Dynamic availability calendar with instant leave tracking and sequential queue booking.",
              icon: "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z",
            },
            {
              accent: styles.icon3,
              title: "Fast & Secure Pay",
              text: "UPI, credit/debit card, and pay-at-clinic flexibility with instant receipt generation.",
              icon: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z",
            },
            {
              accent: styles.icon4,
              title: "Multi-Branch Portal",
              text: "Comprehensive admin controls to manage branch doctors, patient invites, and clinic details.",
              icon: "M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z",
            },
          ].map((feature, i) => (
            <div key={feature.title} className={`${styles.featureCard} ${styles.glassCard} ${feature.accent}`}>
              <span className={styles.featureNumber} aria-hidden="true">0{i + 1}</span>
              <div className={styles.featureIcon}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                  <path d={feature.icon} />
                </svg>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 3 (Odd: Deep Purple Background) - App Screenshots Section */}
      <section className={styles.sectionOdd} id="screenshots">
        <div className={`${styles.sectionHead} ${styles.sectionHeadLight}`}>
          <h2>App Screenshots</h2>
          <p>Explore the intuitive screens crafted for iOS, Android, and mobile web.</p>
        </div>

        <LandingSwiper />
      </section>

      {/* SECTION 4 (Even: Current Light Background) - 3-Steps Process Patient Section */}
      <section className={styles.sectionEven} id="steps">
        <div className={styles.stepsSection}>
          <div className={styles.stepsPhone}>
            <div className={styles.stepsPhoneStage}>
              <span className={styles.stepsGlow} aria-hidden="true" />
              <span className={styles.stepsRing} aria-hidden="true" />
              <div className={styles.stepsPhoneFrame}>
                <img
                  src="/images/landing/mobile_ss2.jpg"
                  alt="Mobile App Step Preview"
                />
              </div>
              <div className={`${styles.stepsChip} ${styles.stepsChipTop}`} aria-hidden="true">
                <span className={`${styles.stepsChipIcon} ${styles.chipGreen}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </span>
                <span>
                  <strong>Booking confirmed</strong>
                  Instant e-receipt
                </span>
              </div>
              <div className={`${styles.stepsChip} ${styles.stepsChipBottom}`} aria-hidden="true">
                <span className={`${styles.stepsChipIcon} ${styles.chipPurple}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </span>
                <span>
                  <strong>Verified doctors</strong>
                  Book in under a minute
                </span>
              </div>
            </div>
          </div>

          <div className={styles.stepsContent}>
            <span className={styles.stepsEyebrow}>For Patients</span>
            <h2>
              Very Easy To Use Just Following{" "}
              <span className={styles.gradientText}>3 Steps</span>
            </h2>
            <p className={styles.subDesc}>
              Get started with Jido Healthcare in three simple steps. Our intuitive
              platform makes healthcare accessible to everyone.
            </p>

            <ol className={styles.stepsList}>
              {[
                {
                  title: "Install This App",
                  text: "Download Jido Healthcare from the App Store or Google Play and create your account in seconds.",
                  icon: "M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14zm-1-6h-3V8h-2v5H8l4 4 4-4z",
                },
                {
                  title: "Login Or Signup",
                  text: "Create your profile, verify your details, and get ready to access quality healthcare services.",
                  icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z",
                },
                {
                  title: "Search Your Doctor & Book",
                  text: "Find verified doctors by specialty, check real-time availability, and book your appointment instantly.",
                  icon: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
                },
              ].map((step, i) => (
                <li key={step.title} className={`${styles.stepItemCard} ${styles.glassCard}`}>
                  <div className={styles.stepNumberBox}>0{i + 1}</div>
                  <div className={styles.stepText}>
                    <h4>{step.title}</h4>
                    <p>{step.text}</p>
                  </div>
                  <span className={styles.stepIcon} aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d={step.icon} />
                    </svg>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* SECTION 5 (Odd: Deep Purple Background) - Clinic 3-Steps Process Section */}
      <section className={styles.sectionOdd} id="clinic-steps">
        <div className={`${styles.stepsSection} ${styles.stepsReverse}`}>
          <div className={styles.stepsPhone}>
            <div className={styles.stepsPhoneStage}>
              <span className={`${styles.stepsGlow} ${styles.stepsGlowDark}`} aria-hidden="true" />
              <span className={`${styles.stepsRing} ${styles.stepsRingDark}`} aria-hidden="true" />
              <div className={`${styles.stepsPhoneFrame} ${styles.stepsPhoneFrameGlow} ${styles.stepsPhoneFrameClinic}`}>
                <img
                  src="/images/landing/clinic_mobile_step_clean.png"
                  alt="Clinic Portal Step Preview"
                />
              </div>
              <div className={`${styles.stepsChip} ${styles.stepsChipTop}`} aria-hidden="true">
                <span className={`${styles.stepsChipIcon} ${styles.chipAmber}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                  </svg>
                </span>
                <span>
                  <strong>Live queue</strong>
                  Updated in real time
                </span>
              </div>
              <div className={`${styles.stepsChip} ${styles.stepsChipBottom}`} aria-hidden="true">
                <span className={`${styles.stepsChipIcon} ${styles.chipCyan}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/>
                  </svg>
                </span>
                <span>
                  <strong>Multi-branch</strong>
                  One unified portal
                </span>
              </div>
            </div>
          </div>

          <div className={`${styles.stepsContent} ${styles.stepsContentLight}`}>
            <span className={`${styles.stepsEyebrow} ${styles.stepsEyebrowDark}`}>For Clinics</span>
            <h2>
              Empower Your Clinic in{" "}
              <span className={styles.stepsHighlightAmber}>3 Easy Steps</span>
            </h2>
            <p className={styles.subDescLight}>
              Streamline your clinic operations, patient queues, and appointment schedules with Jido Healthcare&apos;s
              powerful clinic management portal.
            </p>

            <ol className={`${styles.stepsList} ${styles.stepsListDark}`}>
              {[
                {
                  title: "Register Your Clinic",
                  text: "Set up your clinic profile, configure multiple branch locations, and invite doctors & clinic staff.",
                  icon: "M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z",
                },
                {
                  title: "Configure Doctors & Schedules",
                  text: "Assign doctors to branches, customize shift timings, configure slot limits, and manage consultation fees.",
                  icon: "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z",
                },
                {
                  title: "Manage Live Queues & Bookings",
                  text: "Track real-time patient queues, handle walk-in & online appointments seamlessly, and eliminate patient wait times.",
                  icon: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
                },
              ].map((step, i) => (
                <li key={step.title} className={`${styles.stepItemCard} ${styles.darkGlassCard}`}>
                  <div className={styles.stepNumberBox}>0{i + 1}</div>
                  <div className={styles.stepTextLight}>
                    <h4>{step.title}</h4>
                    <p>{step.text}</p>
                  </div>
                  <span className={`${styles.stepIcon} ${styles.stepIconDark}`} aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d={step.icon} />
                    </svg>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* SECTION 6 (Even: Current Light Background) - FAQ Section */}
      <section className={styles.sectionEven} id="faq">
        <div className={styles.faqSection}>
          <div className={styles.sectionHead}>
            <h2>Frequently Asked Questions</h2>
            <p>Have questions? We&apos;ve got answers to help you navigate Jido Healthcare effortlessly.</p>
          </div>

          <LandingFAQ />
        </div>
      </section>

      {/* SECTION 7 (Odd: Deep Purple Background) - Download App Call-to-Action */}
      <section className={styles.sectionOdd} id="download">
        <div className={styles.downloadContainer}>
          <div className={`${styles.downloadCard} ${styles.downloadCardDark}`}>
            <div className={styles.downloadContent}>
              <span className={styles.downloadEyebrow}>
                <span className={styles.downloadPulse} aria-hidden="true" />
                Now live on Android
              </span>
              <h2>
                Download and Start{" "}
                <span className={styles.downloadHighlight}>Booking Today</span>
              </h2>
              <p>Experience fast, hassle-free healthcare appointments right at your fingertips.</p>

              <div className={styles.storeButtons}>
                <a href="#" className={styles.storeBtn}>
                  <span className={`${styles.storeBtnIconWrap} ${styles.storeBtnIconPatient}`}>
                    <svg className={styles.storeBtnIcon} width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.24-.84-.76-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm.91-.91L19.59 12l-1.87-2.21-2.27 2.27 2.27 2.15zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z"/>
                    </svg>
                  </span>
                  <span className={styles.storeBtnText}>
                    Patient App on
                    <strong>Google Play</strong>
                  </span>
                  <svg className={styles.storeBtnArrow} width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                  </svg>
                </a>

                <a href="#" className={styles.storeBtn}>
                  <span className={`${styles.storeBtnIconWrap} ${styles.storeBtnIconClinic}`}>
                    <svg className={styles.storeBtnIcon} width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.24-.84-.76-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm.91-.91L19.59 12l-1.87-2.21-2.27 2.27 2.27 2.15zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z"/>
                    </svg>
                  </span>
                  <span className={styles.storeBtnText}>
                    Clinic App on
                    <strong>Google Play</strong>
                  </span>
                  <svg className={styles.storeBtnArrow} width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                  </svg>
                </a>
              </div>

              <ul className={styles.downloadPerks}>
                <li>Free to download</li>
                <li>Verified doctors</li>
                <li>Instant booking</li>
              </ul>
            </div>

            <div className={styles.downloadVisual} aria-hidden="true">
              <div className={`${styles.downloadPhone} ${styles.downloadPhoneBack} ${styles.screenWhite}`}>
                <img src="/images/landing/clinic_mobile_step_clean.png" alt="" />
              </div>
              <div className={`${styles.downloadPhone} ${styles.downloadPhoneFront}`}>
                <img src="/images/landing/mobile_ss1.jpg" alt="" />
              </div>
              <div className={styles.downloadToast}>
                <span className={styles.downloadToastIcon}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </span>
                <span>
                  <strong>Appointment booked</strong>
                  Confirmed instantly
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 8 (Even: Current Light Background) - Footer */}
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
            <h4>Get In Touch</h4>
            <ul className={styles.contactList}>
              <li>
                <span className={styles.contactItem}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={styles.contactIcon}>
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                  <span>Belari, P.S- Ausgram, Dist - Purba Bardhaman, West Bengal, India, Pin-713141</span>
                </span>
              </li>
              <li>
                <a href="mailto:services@jido.co.in" className={styles.contactItem}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={styles.contactIcon}>
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                  <span>
                    <span className={styles.contactLabel}>Support</span>
                    services@jido.co.in
                  </span>
                </a>
              </li>
              {[
                { label: "Hotline", phone: "+91-6294285613" },
                { label: "MD & CEO", phone: "+91-7001993236" },
                { label: "General Manager", phone: "+91-7001993236" },
                { label: "IT Support", phone: "+91-8918652481" },
              ].map(({ label, phone }) => (
                <li key={label}>
                  <a href={`tel:${phone.replace(/-/g, "")}`} className={styles.contactItem}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={styles.contactIcon}>
                      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                    </svg>
                    <span>
                      <span className={styles.contactLabel}>{label}</span>
                      {phone}
                    </span>
                  </a>
                </li>
              ))}
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
