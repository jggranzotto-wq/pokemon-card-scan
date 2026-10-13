export const VISION_UNAVAILABLE_NOTE =
  "Photo recognition is unavailable right now. The card was read from the text in the photo instead.";

export const VISION_UNREAD_NOTE =
  "Photo recognition did not read a card name. The card was read from the text in the photo instead.";

export function isVisionFallbackMessage(message?: string): boolean {
  if (!message) return false;
  return message.startsWith(VISION_UNAVAILABLE_NOTE) || message.startsWith(VISION_UNREAD_NOTE);
}

export function withVisionFallbackNote(note: string, existing?: string): string {
  if (!existing) return note;
  if (existing.startsWith(note)) return existing;
  return `${note} ${existing}`;
}
