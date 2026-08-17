"use client";

import React, { useState } from "react";
import styles from "./landing.module.css";

const faqData = [
  {
    question: "How do I book an appointment with a doctor?",
    answer:
      "Simply search for your preferred doctor or specialty, choose an available green slot from the 30-day calendar, fill in patient details, and confirm via online payment or pay at the clinic.",
  },
  {
    question: "What do the green and red calendar dates mean?",
    answer:
      "Green dates represent days when the doctor is available for appointments. Red dates indicate doctor leave or unavailability, and gray dates represent regular clinic off-days.",
  },
  {
    question: "Can clinics manage multiple branches and doctors?",
    answer:
      "Yes! The Jido Healthcare Clinic Portal allows clinics to switch between branches, configure fixed or sequential booking queues, invite doctors, and update schedules in real time.",
  },
  {
    question: "Is online payment mandatory?",
    answer:
      "No. You can pay securely online using UPI or cards, or select the \"Pay at Clinic\" option to pay during your visit at the reception desk.",
  },
];

export function LandingFAQ() {
  const [activeIndex, setActiveIndex] = useState(0);

  const toggleFAQ = (index: number) => {
    setActiveIndex(activeIndex === index ? -1 : index);
  };

  return (
    <div className={styles.faqAccordion}>
      {faqData.map((item, index) => (
        <div
          key={index}
          className={`${styles.faqItem} ${styles.glassCard} ${
            activeIndex === index ? styles.faqItemActive : ""
          }`}
          onClick={() => toggleFAQ(index)}
        >
          <div className={styles.faqQuestion}>
            <span>{item.question}</span>
            <svg
              className={styles.faqArrow}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
            </svg>
          </div>
          <div className={styles.faqAnswer}>{item.answer}</div>
        </div>
      ))}
    </div>
  );
}
