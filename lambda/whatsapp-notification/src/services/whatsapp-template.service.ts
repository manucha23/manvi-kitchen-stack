import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CacheEntry, WhatsAppTemplateConfig } from '../types';

export class WhatsAppTemplateService {
  private docClient: DynamoDBDocumentClient;
  private templateCache: Map<string, CacheEntry<WhatsAppTemplateConfig | null>>;
  private ttlMs: number;

  constructor(docClient?: DynamoDBDocumentClient, ttlMs = 5 * 60 * 1000) {
    this.docClient = docClient || DynamoDBDocumentClient.from(new DynamoDBClient({}));
    this.templateCache = new Map<string, CacheEntry<WhatsAppTemplateConfig | null>>();
    this.ttlMs = ttlMs;
  }

  public getDefaultLanguage(): string {
    return process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US';
  }

  public getFallbackTemplateConfig(eventKey: string): WhatsAppTemplateConfig | null {
    switch (eventKey) {
      case 'STATUS_CREATED':
      case 'STATUS_CONFIRMED':
        return {
          eventKey,
          templateName: 'order_confirmed_v1',
          language: this.getDefaultLanguage(),
          params: ['customerName', 'orderId'],
          enabled: true,
        };
      case 'STATUS_DISPATCHED':
        return {
          eventKey,
          templateName: 'out_for_delivery_v1',
          language: this.getDefaultLanguage(),
          params: ['customerName', 'orderId'],
          enabled: true,
        };
      case 'STATUS_COMPLETED':
        return {
          eventKey,
          templateName: 'order_delivered_v1',
          language: this.getDefaultLanguage(),
          params: ['customerName', 'orderId'],
          enabled: true,
        };
      default:
        return null;
    }
  }

  public async getTemplateConfig(eventKey: string): Promise<WhatsAppTemplateConfig | null> {
    const now = Date.now();
    const cached = this.templateCache.get(eventKey);
    if (cached && now - cached.cachedAt < this.ttlMs) {
      return cached.data;
    }

    const tableName = process.env.WHATSAPP_TEMPLATE_TABLE;
    if (!tableName) {
      const fallback = this.getFallbackTemplateConfig(eventKey);
      this.templateCache.set(eventKey, { data: fallback, cachedAt: now });
      return fallback;
    }

    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { eventKey },
        })
      );

      if (result.Item) {
        const config: WhatsAppTemplateConfig = {
          eventKey: String(result.Item.eventKey),
          templateName: String(result.Item.templateName),
          language: result.Item.language ? String(result.Item.language) : this.getDefaultLanguage(),
          params: Array.isArray(result.Item.params) ? result.Item.params.map(String) : ['customerName', 'orderId'],
          enabled: result.Item.enabled !== false,
        };
        this.templateCache.set(eventKey, { data: config, cachedAt: now });
        return config;
      }
    } catch (error) {
      console.warn(`Failed to query WhatsApp template table for key ${eventKey}, falling back to defaults:`, error);
    }

    const fallback = this.getFallbackTemplateConfig(eventKey);
    this.templateCache.set(eventKey, { data: fallback, cachedAt: now });
    return fallback;
  }

  public clearCache(): void {
    this.templateCache.clear();
  }
}
