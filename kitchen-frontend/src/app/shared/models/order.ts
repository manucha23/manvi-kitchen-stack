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
  contactNumber: string;
  status: OrderStatus;
  orderScheduled: string;
  slot: string;
  slotDate: string;
  items: OrderItem[];
  totalAmount: number;
  instructions?: string;
  feedbackProvided: boolean;
  feedbackRequestCount: number;
  timestamp: string;
  version?: number;
  updatedAt?: string;
  acceptanceStatus?: string; // 'accepted' or 'rejected'
  rejectionReason?: string;
}

export interface IOrderFilters {
  orderedBy?: string;
  customerPhone?: string;
  fromDate?: string;
  toDate?: string;
  orderStatus?: string[];
}
