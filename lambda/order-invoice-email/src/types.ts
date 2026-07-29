export interface OrderItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  amount: number;
}

export interface Order {
  orderId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  status: string;
  paymentMethod?: string;
  paymentStatus?: string;
  promisedDeliveryAt?: string;
  items: OrderItem[];
  totalAmount: number;
  instructions?: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  invoiceEmailProcessingAt?: string;
  invoiceEmailSentAt?: string;
  invoiceWhatsAppSentAt?: string;
  invoiceS3Key?: string;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}
