"use client";
import { Toaster } from "react-hot-toast";
import { useTheme } from "@/context/ThemeContext";

export default function AppToaster() {
  const { theme } = useTheme();
  const dark = theme === "dark";

  return (
    <Toaster
      position="top-right"
      containerStyle={{ zIndex: 999999 }}
      toastOptions={{
        duration: 4000,
        style: {
          background: dark ? "#1e293b" : "#ffffff",
          color: dark ? "#e2e8f0" : "#1f2937",
          border: `1px solid ${dark ? "#334155" : "#e5e7eb"}`,
          fontSize: "0.875rem",
        },
        success: { iconTheme: { primary: "#12b76a", secondary: "#ffffff" } },
        error: { iconTheme: { primary: "#f04438", secondary: "#ffffff" } },
      }}
    />
  );
}
