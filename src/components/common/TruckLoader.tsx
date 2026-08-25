"use client";

import React from "react";

// Healthcare-themed fullscreen loader adapted from the fullpage health-loader
// design: a fixed overlay covering the whole viewport with a rotating
// conic-gradient ring around a pulsing medical cross, the contextual label
// and three bouncing progress dots.
export default function TruckLoader({ label }: { label?: string }) {
  return (
    <div className="hl-scope fixed inset-0 z-99999 flex flex-col items-center justify-center bg-white/30 backdrop-blur-[2px] dark:bg-gray-900/30">
      <style
        dangerouslySetInnerHTML={{
          __html: `
.hl-scope{--hl-purple:#7C3AED;--hl-blue:#2563EB;--hl-teal:#00C1CB}
@keyframes hl-rotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes hl-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
@keyframes hl-dot{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-6px);opacity:1}}
.hl-circle{position:relative;width:110px;height:110px;border-radius:50%;background:conic-gradient(var(--hl-purple),var(--hl-blue),var(--hl-teal),var(--hl-purple));animation:hl-rotate 1.6s linear infinite;display:flex;align-items:center;justify-content:center}
.hl-circle::before{content:"";position:absolute;width:88px;height:88px;border-radius:50%;background:#ffffff}
.dark .hl-circle::before{background:#111827}
.hl-cross{position:relative;z-index:2;width:38px;height:38px;border-radius:9px;background:linear-gradient(135deg,var(--hl-purple),var(--hl-blue),var(--hl-teal));box-shadow:0 8px 25px rgba(37,99,235,.25);animation:hl-pulse 1.2s ease-in-out infinite}
.hl-cross::before,.hl-cross::after{content:"";position:absolute;background:#ffffff;border-radius:3px}
.hl-cross::before{width:22px;height:7px;top:15px;left:8px}
.hl-cross::after{width:7px;height:22px;top:8px;left:15px}
.hl-dots{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:18px}
.hl-dots span{width:7px;height:7px;border-radius:50%;animation:hl-dot 1.2s infinite ease-in-out}
.hl-dots span:nth-child(1){background:var(--hl-purple)}
.hl-dots span:nth-child(2){background:var(--hl-blue);animation-delay:.15s}
.hl-dots span:nth-child(3){background:var(--hl-teal);animation-delay:.3s}
`,
        }}
      />
      <div className="hl-circle">
        <div className="hl-cross" />
      </div>
      {label && (
        <p className="mt-6 text-lg font-bold tracking-wide text-gray-800 dark:text-white/90">
          {label}
        </p>
      )}
      <div className="hl-dots">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
