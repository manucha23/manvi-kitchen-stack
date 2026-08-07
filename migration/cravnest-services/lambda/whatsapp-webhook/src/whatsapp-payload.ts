export type WhatsAppInboundMessageKind = 'text' | 'button' | 'list' | 'flow';

export interface WhatsAppInboundTextMessage {
  kind: WhatsAppInboundMessageKind;
  messageId: string;
  from: string;
  firstName: string;
  text: string;
  actionId?: string;
  actionTitle?: string;
  buttonId?: string;
  buttonTitle?: string;
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
  interactive?: {
    type?: unknown;
    button_reply?: {
      id?: unknown;
      title?: unknown;
    };
    list_reply?: {
      id?: unknown;
      title?: unknown;
      description?: unknown;
    };
    nfm_reply?: {
      response_json?: unknown;
      body?: unknown;
      name?: unknown;
    };
  };
  button?: {
    payload?: unknown;
    text?: unknown;
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
    const interactiveButtonId = message.type === 'interactive' && message.interactive?.type === 'button_reply'
      ? asString(message.interactive.button_reply?.id)
      : undefined;
    const interactiveButtonTitle = message.type === 'interactive' && message.interactive?.type === 'button_reply'
      ? asString(message.interactive.button_reply?.title)
      : undefined;
    const interactiveListId = message.type === 'interactive' && message.interactive?.type === 'list_reply'
      ? asString(message.interactive.list_reply?.id)
      : undefined;
    const interactiveListTitle = message.type === 'interactive' && message.interactive?.type === 'list_reply'
      ? asString(message.interactive.list_reply?.title)
      : undefined;
    const interactiveFlowId = message.type === 'interactive' && message.interactive?.type === 'nfm_reply'
      ? asString(message.interactive.nfm_reply?.name) || 'flow_reply'
      : undefined;
    const interactiveFlowTitle = message.type === 'interactive' && message.interactive?.type === 'nfm_reply'
      ? asString(message.interactive.nfm_reply?.body) || asString(message.interactive.nfm_reply?.response_json)
      : undefined;
    const templateButtonId = message.type === 'button' ? asString(message.button?.payload) : undefined;
    const templateButtonTitle = message.type === 'button' ? asString(message.button?.text) : undefined;
    const actionId = interactiveButtonId || interactiveListId || interactiveFlowId || templateButtonId;
    const actionTitle = interactiveButtonTitle || interactiveListTitle || interactiveFlowTitle || templateButtonTitle;

    if (!messageId || !from || (!text && !actionId)) {
      continue;
    }

    const kind: WhatsAppInboundMessageKind = text
      ? 'text'
      : interactiveListId
        ? 'list'
        : interactiveFlowId
          ? 'flow'
          : 'button';

    extractedMessages.push({
      kind,
      messageId,
      from,
      firstName: deriveFirstName(getContactName(contacts, from)),
      text: (text || actionTitle || actionId) as string,
      ...(actionId ? { actionId } : {}),
      ...(actionTitle ? { actionTitle } : {}),
      ...(kind === 'button' && actionId ? { buttonId: actionId } : {}),
      ...(kind === 'button' && actionTitle ? { buttonTitle: actionTitle } : {}),
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
