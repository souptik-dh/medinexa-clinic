"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import FloatingAIButton from "./FloatingAIButton";
import ChatPanel from "./ChatPanel";
import { useAiChat } from "@/context/AiChatContext";

const AUTH_ROUTES = ["/signin", "/signup", "/reset-password", "/new_password", "/verify_email", "/super-admin-login"];

export default function AiAssistant() {
  const pathname = usePathname();
  const { user, isAuthReady } = useAuth();
  const { isOpen, toggleChat } = useAiChat();

  const isAuthPage = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"));

  if (!isAuthReady || !user || isAuthPage) return null;

  return (
    <>
      <FloatingAIButton isOpen={isOpen} onClick={toggleChat} />
      <ChatPanel />
    </>
  );
}
