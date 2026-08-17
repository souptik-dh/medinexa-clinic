"use client";

import React, { useEffect, useRef } from "react";
import { Swiper } from "swiper/bundle";
import "swiper/swiper-bundle.css";
import styles from "./landing.module.css";

const screenshots = [
  { src: "/images/landing/mobile_ss1.jpg", alt: "Doctor Profile" },
  { src: "/images/landing/mobile_ss2.jpg", alt: "Doctor Search" },
  { src: "/images/landing/mobile_ss3.jpg", alt: "Appointment Schedule" },
  { src: "/images/landing/mobile_ss4.jpg", alt: "Payment Checkout" },
  { src: "/images/landing/mobile_ss5.jpg", alt: "Clinic Details" },
  { src: "/images/landing/mobile_ss6.jpg", alt: "Patient Dashboard" },
];

export function LandingSwiper() {
  const containerRef = useRef<HTMLDivElement>(null);
  const swiperRef = useRef<Swiper | null>(null);

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
      pagination: {
        el: `.${styles.swiperPagination}`,
        clickable: true,
      },
    });

    return () => {
      swiperRef.current?.destroy();
    };
  }, []);

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

        {/* Pagination Bullets */}
        <div className={`swiper-pagination ${styles.swiperPagination}`}></div>
      </div>
    </div>
  );
}
