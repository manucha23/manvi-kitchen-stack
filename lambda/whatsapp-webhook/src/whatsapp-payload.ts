export interface WhatsAppInboundTextMessage {
  messageId: string;
  from: string;
  firstName: string;
  text: string;
  receivedAt: string;
}

interface WhatsAppContact {
  wa_id?: unknown;
  profile?: {
    name?: unknown;
  };
}

interface WhatsAppMessage {
  id?: unknown;
  from?: unknown;
  timestamp?: unknown;
  type?: unknown;
  text?: {
    body?: unknown;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

export const deriveFirstName = (fullName: unknown): string => {
  const name = asString(fullName);
  if (!name) {
    return 'there';
  }

  return name.trim().split(/\s+/)[0] || 'there';
};

const getContactName = (contacts: WhatsAppContact[], from: string): unknown => {
  const contact = contacts.find((candidate) => candidate.wa_id === from);
  return contact?.profile?.name;
};

const toReceivedAt = (timestamp: unknown): string => {
  const timestampString = asString(timestamp);
  if (!timestampString) {
    return new Date().toISOString();
  }

  const seconds = Number(timestampString);
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
};

const extractFromValue = (value: Record<string, unknown>): WhatsAppInboundTextMessage[] => {
  const contacts = asArray(value.contacts) as WhatsAppContact[];
  const messages = asArray(value.messages) as WhatsAppMessage[];
  const extractedMessages: WhatsAppInboundTextMessage[] = [];

  for (const message of messages) {
    const messageId = asString(message.id);
    const from = asString(message.from);
    const text = message.type === 'text' ? asString(message.text?.body) : undefined;

    if (!messageId || !from || !text) {
      continue;
    }

    extractedMessages.push({
      messageId,
      from,
      firstName: deriveFirstName(getContactName(contacts, from)),
      text,
      receivedAt: toReceivedAt(message.timestamp),
    });
  }

  return extractedMessages;
};

export const extractInboundTextMessages = (payload: unknown): WhatsAppInboundTextMessage[] => {
  if (!isRecord(payload)) {
    return [];
  }

  const extractedMessages: WhatsAppInboundTextMessage[] = [];
  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) {
      continue;
    }

    for (const change of asArray(entry.changes)) {
      if (!isRecord(change) || !isRecord(change.value)) {
        continue;
      }

      extractedMessages.push(...extractFromValue(change.value));
    }
  }

  return extractedMessages;
};
