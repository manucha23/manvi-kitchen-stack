export enum OrderStatus {
  CREATED = 'CREATED',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  INKITCHEN = 'INKITCHEN',
  READY = 'READY',
  DISPATCHED = 'DISPATCHED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
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
  customerName: string;
  deliveryAddress: string;
  customerPhone: string;
  customerEmail?: string;
  status: OrderStatus;
  promisedDeliveryAt: string;
  items: OrderItem[];
  totalAmount: number;
  instructions?: string;
  feedbackProvided: boolean;
  feedbackRequestCount: number;
  timestamp: string;
  createdAt?: string;
  version?: number;
  updatedAt?: string;
  acceptanceStatus?: string; // 'accepted' or 'rejected'
  rejectionReason?: string;
}

export type OrderSortOrder = 'asc' | 'desc';

export interface IOrderFilters {
  orderedBy?: string;
  /** Exact match on customerPhone GSI (admin list). */
  customerPhone?: string;
  /** ISO timestamps — filters on order createdAt. */
  fromDate?: string;
  toDate?: string;
  /** Single status value; key on status index or filter when searching by phone. */
  orderStatus?: OrderStatus;
  /** API sorts by createdAt; default is desc when omitted. */
  sortOrder?: OrderSortOrder;
}
