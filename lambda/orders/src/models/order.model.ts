export enum OrderStatus {
  CREATED = 'CREATED',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  INKITCHEN = 'INKITCHEN',
  READY = 'READY',
  DISPATCHED = 'DISPATCHED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum PaymentMethod {
  COD = 'COD',
  ONLINE = 'ONLINE'
}

export enum PaymentStatus {
  NOT_REQUIRED = 'NOT_REQUIRED',
  PENDING = 'PENDING'
}

export enum OrderCreatedVia {
  ADMIN = 'ADMIN',
  CUSTOMER_WEB = 'CUSTOMER_WEB',
  WHATSAPP = 'WHATSAPP'
}

export interface OrderItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  amount: number;
}

export interface Order {
  orderId: string;
  orderedBy: string;
  createdVia: OrderCreatedVia;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  promisedDeliveryAt: string; // ISO timestamp
  items: OrderItem[];
  totalAmount: number;
  instructions?: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}
