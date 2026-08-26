"use client";
import React from "react";
import { useAuth } from "@/context/AuthContext";
import FloatingAIButton from "./FloatingAIButton";
import ChatPanel from "./ChatPanel";
import { useAiChat } from "@/context/AiChatContext";

export default function AiAssistant() {
  const { user, isAuthReady } = useAuth();
  const { isOpen, toggleChat } = useAiChat();

  if (!isAuthReady || !user) return null;

  return (
    <>
      <FloatingAIButton isOpen={isOpen} onClick={toggleChat} />
      <ChatPanel />
    </>
  );
}
