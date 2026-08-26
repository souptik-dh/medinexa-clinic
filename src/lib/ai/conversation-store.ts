import type { Conversation, ChatMessage } from "./types";

const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES_PER_CONVERSATION = 100;
const CONVERSATION_TTL_MS = 60 * 60 * 1000;

const conversations = new Map<string, Conversation>();

function generateId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 9);
  return ts + "_" + rand;
}

function cleanup() {
  const now = Date.now();
  for (const [id, conv] of conversations) {
    if (now - conv.updatedAt > CONVERSATION_TTL_MS) {
      conversations.delete(id);
    }
  }
}

export function createConversation(userId: string): Conversation {
  cleanup();

  if (conversations.size >= MAX_CONVERSATIONS) {
    const oldest = Array.from(conversations.values()).sort(
      (a, b) => a.updatedAt - b.updatedAt
    )[0];
    if (oldest) {
      conversations.delete(oldest.id);
    }
  }

  const conv: Conversation = {
    id: generateId(),
    userId,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  conversations.set(conv.id, conv);
  return conv;
}

export function getConversation(id: string): Conversation | undefined {
  return conversations.get(id);
}

export function addMessageToConversation(
  conversationId: string,
  message: ChatMessage
): void {
  const conv = conversations.get(conversationId);
  if (!conv) return;

  conv.messages.push(message);

  if (conv.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    conv.messages = conv.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  }

  conv.updatedAt = Date.now();
}

export function getConversationMessages(conversationId: string): ChatMessage[] {
  const conv = conversations.get(conversationId);
  return conv?.messages ?? [];
}

export function deleteConversation(id: string): boolean {
  return conversations.delete(id);
}
