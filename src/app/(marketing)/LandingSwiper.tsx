"use client";

import React, { useEffect, useRef, useState } from "react";
import { Swiper } from "swiper/bundle";
import "swiper/swiper-bundle.css";
import styles from "./landing.module.css";

const screenshots = [
  { src: "/images/landing/mobile_ss1.jpg", alt: "Patient Dashboard" },
  { src: "/images/landing/mobile_ss2.jpg", alt: "Doctor Search" },
  { src: "/images/landing/mobile_ss3.jpg", alt: "Doctor Profile" },
  { src: "/images/landing/mobile_ss4.jpg", alt: "Select Appointment Date" },
  { src: "/images/landing/mobile_ss5.jpg", alt: "Booking Appointment" },
  { src: "/images/landing/mobile_ss6.jpg", alt: "My Bookings" },
];

export function LandingSwiper() {
  const containerRef = useRef<HTMLDivElement>(null);
  const swiperRef = useRef<Swiper | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    swiperRef.current = new Swiper(containerRef.current, {
      effect: "coverflow",
      grabCursor: true,
      centeredSlides: true,
      slidesPerView: "auto",
      loop: true,
      autoplay: {
        delay: 3200,
        disableOnInteraction: false,
      },
      coverflowEffect: {
        rotate: 0,
        stretch: 70,
        depth: 180,
        modifier: 1,
        slideShadows: false,
      },
      on: {
        slideChange: (swiper) => setActiveIndex(swiper.realIndex),
      },
    });

    return () => {
      swiperRef.current?.destroy();
    };
  }, []);

  const total = String(screenshots.length).padStart(2, "0");

  return (
    <div className={styles.screenshotSliderArea}>
      {/* Swiper 3D Coverflow Container */}
      <div ref={containerRef} className={`swiper-container ${styles.swiperContainer}`}>
        {/* Fixed Centered Smartphone Frame Overlay — positioned inside swiperContainer */}
        <div className={styles.screenshotFrame}></div>

        <div className="swiper-wrapper">
          {screenshots.map((screenshot, index) => (
            <div key={index} className={`swiper-slide ${styles.swiperSlide}`}>
              <div className={styles.sliderImage}>
                <img src={screenshot.src} alt={screenshot.alt} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prev / screen name / next */}
      <div className={styles.sliderControls}>
        <button
          type="button"
          className={styles.sliderNavBtn}
          onClick={() => swiperRef.current?.slidePrev()}
          aria-label="Previous screenshot"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
          </svg>
        </button>

        <div className={styles.sliderCaption} aria-live="polite">
          <span className={styles.sliderCaptionCount}>
            {String(activeIndex + 1).padStart(2, "0")} / {total}
          </span>
          <strong key={activeIndex}>{screenshots[activeIndex].alt}</strong>
        </div>

        <button
          type="button"
          className={styles.sliderNavBtn}
          onClick={() => swiperRef.current?.slideNext()}
          aria-label="Next screenshot"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
