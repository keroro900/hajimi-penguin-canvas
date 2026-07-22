import type { LlmContentPart, LlmMessage } from '../services/generation';

export interface LlmConversationTurn {
  role: 'user' | 'assistant';
  text: string;
  images?: string[];
  videos?: string[];
}

interface BuildLlmConversationMessagesInput {
  systemPrompt: string;
  history: LlmConversationTurn[];
  userText: string;
  userImages: string[];
  userVideos: string[];
}

export function buildLlmConversationMessages({
  systemPrompt,
  history,
  userText,
  userImages,
  userVideos,
}: BuildLlmConversationMessagesInput): LlmMessage[] {
  const messages: LlmMessage[] = [];
  if (systemPrompt.trim()) messages.push({ role: 'system', content: systemPrompt.trim() });

  // Connected media is attached to the current turn below. Replaying historical
  // Base64 attachments makes each follow-up request grow exponentially.
  history.forEach((turn) => {
    if (turn.text) messages.push({ role: turn.role, content: turn.text });
  });

  if (userImages.length || userVideos.length) {
    const parts: LlmContentPart[] = [];
    if (userText) parts.push({ type: 'text', text: userText });
    userImages.forEach((url) => parts.push({ type: 'image_url', image_url: { url } }));
    userVideos.forEach((url) => parts.push({ type: 'video_url', video_url: { url } }));
    messages.push({ role: 'user', content: parts });
  } else {
    messages.push({ role: 'user', content: userText });
  }

  return messages;
}

