import {
  buildTemplatePayload,
  extractParamValue,
  getFallbackTemplateConfig,
  normalizeFirstName,
  normalizePhoneNumber,
  OrderEventMessage,
} from '../index';

describe('WhatsApp Notification Service', () => {
  describe('normalizeFirstName', () => {
    it('extracts first name correctly', () => {
      expect(normalizeFirstName('Rahul Kumar')).toBe('Rahul');
      expect(normalizeFirstName(' Mohit ')).toBe('Mohit');
    });

    it('returns default Customer when undefined or empty', () => {
      expect(normalizeFirstName(undefined)).toBe('Customer');
      expect(normalizeFirstName('')).toBe('Customer');
      expect(normalizeFirstName('   ')).toBe('Customer');
    });
  });

  describe('normalizePhoneNumber', () => {
    it('formats 10-digit Indian numbers with 91 prefix', () => {
      expect(normalizePhoneNumber('9999999999')).toBe('919999999999');
    });

    it('preserves country code if already present', () => {
      expect(normalizePhoneNumber('+919999999999')).toBe('919999999999');
      expect(normalizePhoneNumber('919999999999')).toBe('919999999999');
    });

    it('returns empty string if invalid', () => {
      expect(normalizePhoneNumber(undefined)).toBe('');
    });
  });

  describe('getFallbackTemplateConfig', () => {
    it('returns order_confirmed_v1 for CONFIRMED status', () => {
      const config = getFallbackTemplateConfig('STATUS_CONFIRMED');
      expect(config?.templateName).toBe('order_confirmed_v1');
      expect(config?.params).toEqual(['customerName', 'orderId']);
    });

    it('returns out_for_delivery_v1 for DISPATCHED status', () => {
      const config = getFallbackTemplateConfig('STATUS_DISPATCHED');
      expect(config?.templateName).toBe('out_for_delivery_v1');
      expect(config?.params).toEqual(['customerName', 'orderId']);
    });

    it('returns order_delivered_v1 for COMPLETED status', () => {
      const config = getFallbackTemplateConfig('STATUS_COMPLETED');
      expect(config?.templateName).toBe('order_delivered_v1');
      expect(config?.params).toEqual(['customerName', 'orderId']);
    });

    it('returns null for unmapped events', () => {
      expect(getFallbackTemplateConfig('STATUS_CANCELLED')).toBeNull();
    });
  });

  describe('buildTemplatePayload', () => {
    it('constructs correct Meta Graph API payload for order_confirmed_v1', () => {
      const payload = buildTemplatePayload('919999999999', 'order_confirmed_v1', 'en_US', ['Rahul', 'ORD123456']);

      expect(payload).toEqual({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '919999999999',
        type: 'template',
        template: {
          name: 'order_confirmed_v1',
          language: {
            code: 'en_US',
          },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: 'Rahul' },
                { type: 'text', text: 'ORD123456' },
              ],
            },
          ],
        },
      });
    });

    it('constructs correct payload for out_for_delivery_v1', () => {
      const payload = buildTemplatePayload('919999999999', 'out_for_delivery_v1', 'en_US', ['Mohit', 'ORD654321']);

      expect(payload).toEqual({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '919999999999',
        type: 'template',
        template: {
          name: 'out_for_delivery_v1',
          language: {
            code: 'en_US',
          },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: 'Mohit' },
                { type: 'text', text: 'ORD654321' },
              ],
            },
          ],
        },
      });
    });

    it('constructs correct payload for order_delivered_v1', () => {
      const payload = buildTemplatePayload('919999999999', 'order_delivered_v1', 'en_US', ['Ananya', 'ORD789012']);

      expect(payload).toEqual({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '919999999999',
        type: 'template',
        template: {
          name: 'order_delivered_v1',
          language: {
            code: 'en_US',
          },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: 'Ananya' },
                { type: 'text', text: 'ORD789012' },
              ],
            },
          ],
        },
      });
    });
  });

  describe('extractParamValue', () => {
    const sampleEvent: OrderEventMessage = {
      eventName: 'MODIFY',
      status: 'DISPATCHED',
      orderId: 'ORD-999',
      customerName: 'Mohit Manucha',
      customerPhone: '+919999999999',
    };

    it('extracts first name for customerName', () => {
      expect(extractParamValue('customerName', sampleEvent)).toBe('Mohit');
    });

    it('extracts order ID for orderId', () => {
      expect(extractParamValue('orderId', sampleEvent)).toBe('ORD-999');
    });
  });
});
