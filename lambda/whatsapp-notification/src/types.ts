export interface WhatsAppTemplateConfig {
  eventKey: string;
  templateName: string;
  language?: string;
  params: string[];
  enabled: boolean;
}

export interface OrderEventMessage {
  eventName: 'INSERT' | 'MODIFY';
  status: string;
  oldStatus?: string;
  orderId: string;
  customerName?: string;
  customerPhone?: string;
  dynamodb?: {
    NewImage?: Record<string, any>;
    OldImage?: Record<string, any>;
  };
}

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}
