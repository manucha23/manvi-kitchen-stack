import { buildInboundMessageQueueInput } from '../index';
import { extractInboundTextMessages } from '../whatsapp-payload';

const textPayload: any = {
  object: 'whatsapp_business_account',
  entry: [{
    changes: [{
      value: {
        contacts: [{
          profile: { name: 'Rahul Sharma' },
          wa_id: '919999999999',
        }],
        messages: [{
          from: '919999999999',
          id: 'wamid.abc123',
          timestamp: '1778841600',
          type: 'text',
          text: { body: 'Hi' },
        }],
      },
    }],
  }],
};

describe('WhatsApp payload extraction', () => {
  it('extracts a valid inbound text message with profile first name', () => {
    expect(extractInboundTextMessages(textPayload)).toEqual([{
      messageId: 'wamid.abc123',
      from: '919999999999',
      firstName: 'Rahul',
      text: 'Hi',
      receivedAt: '2026-05-15T10:40:00.000Z',
    }]);
  });

  it('uses there when the profile name is missing', () => {
    const payload = structuredClone(textPayload);
    payload.entry[0].changes[0].value.contacts[0] = {
      wa_id: '919999999999',
    };

    expect(extractInboundTextMessages(payload)[0].firstName).toBe('there');
  });

  it('ignores status-only webhooks', () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            statuses: [{ id: 'wamid.status', status: 'delivered' }],
          },
        }],
      }],
    };

    expect(extractInboundTextMessages(payload)).toEqual([]);
  });

  it('ignores non-text messages', () => {
    const payload = structuredClone(textPayload);
    payload.entry[0].changes[0].value.messages[0] = {
      from: '919999999999',
      id: 'wamid.abc123',
      timestamp: '1778841600',
      type: 'image',
    };

    expect(extractInboundTextMessages(payload)).toEqual([]);
  });

  it('maps WhatsApp message and sender IDs to FIFO deduplication and group IDs', () => {
    const message = extractInboundTextMessages(textPayload)[0];

    expect(buildInboundMessageQueueInput(message, 'https://sqs.test/queue.fifo')).toMatchObject({
      QueueUrl: 'https://sqs.test/queue.fifo',
      MessageGroupId: '919999999999',
      MessageDeduplicationId: 'wamid.abc123',
      MessageBody: JSON.stringify(message),
    });
  });

});
