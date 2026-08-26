"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { ChatMessage } from "@/lib/ai/types";
import { getAccessToken } from "@/lib/api";

interface AiChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  isLoading: boolean;
  conversationId: string | null;
  pendingConfirmation: ChatMessage["confirmationRequired"] | null;
}

interface AiChatContextValue extends AiChatState {
  toggleChat: () => void;
  openChat: () => void;
  closeChat: () => void;
  sendMessage: (message: string) => Promise<void>;
  respondConfirmation: (approved: boolean) => Promise<void>;
  clearMessages: () => void;
}

const AiChatContext = createContext<AiChatContextValue | undefined>(undefined);

export function AiChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<ChatMessage["confirmationRequired"]>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const toggleChat = useCallback(() => setIsOpen((prev) => !prev), []);
  const openChat = useCallback(() => setIsOpen(true), []);
  const closeChat = useCallback(() => setIsOpen(false), []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setPendingConfirmation(undefined);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setPendingConfirmation(undefined);

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const token = getAccessToken();
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: text.trim(),
            conversationId: conversationId ?? undefined,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          throw new Error(`Chat request failed (${res.status})`);
        }

        const data = await res.json();

        if (data.conversationId) {
          setConversationId(data.conversationId);
        }

        if (data.message) {
          setMessages((prev) => [...prev, data.message as ChatMessage]);

          if (data.message.confirmationRequired) {
            setPendingConfirmation(data.message.confirmationRequired);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const errorMsg: ChatMessage = {
          id: `error_${Date.now()}`,
          role: "assistant",
          content:
            "Sorry, I encountered an error processing your request. Please try again.",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, conversationId]
  );

  const respondConfirmation = useCallback(
    async (approved: boolean) => {
      if (!pendingConfirmation) return;

      const runId = pendingConfirmation.pendingRunId;
      setPendingConfirmation(undefined);

      const confirmMsg: ChatMessage = {
        id: `user_${Date.now()}`,
        role: "user",
        content: approved ? "Yes, proceed" : "No, cancel",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, confirmMsg]);
      setIsLoading(true);

      try {
        const token = getAccessToken();
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: approved ? "yes" : "no",
            conversationId: conversationId ?? undefined,
            confirmationResponse: {
              pendingRunId: runId,
              approved,
            },
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.message) {
            setMessages((prev) => [...prev, data.message as ChatMessage]);
          }
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `error_${Date.now()}`,
            role: "assistant",
            content: "Failed to process your response. Please try again.",
            timestamp: Date.now(),
          } as ChatMessage,
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [pendingConfirmation, conversationId]
  );

  return (
    <AiChatContext.Provider
      value={{
        isOpen,
        messages,
        isLoading,
        conversationId,
        pendingConfirmation,
        toggleChat,
        openChat,
        closeChat,
        sendMessage,
        respondConfirmation,
        clearMessages,
      }}
    >
      {children}
    </AiChatContext.Provider>
  );
}

export function useAiChat(): AiChatContextValue {
  const ctx = useContext(AiChatContext);
  if (!ctx) {
    throw new Error("useAiChat must be used within an AiChatProvider");
  }
  return ctx;
}
