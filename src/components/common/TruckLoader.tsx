"use client";

import Image from "next/image";
import React from "react";

export default function TruckLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center py-10">
      <Image
        src="/images/blood-pressure-monitor.gif"
        alt="Loading"
        width={160}
        height={160}
        unoptimized
        priority
      />
      {label && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{label}</p>
      )}
    </div>
  );
}
