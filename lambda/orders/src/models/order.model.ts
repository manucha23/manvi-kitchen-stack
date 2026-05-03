export enum OrderStatus {
  CREATED = 'Created',
  ACCEPTED = 'Accepted',
  COOKING = 'Cooking',
  READY = 'Ready',
  DELIVERED = 'Delivered'
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
  total: number;
  instructions?: string;
  feedbackProvided: boolean;
  feedbackRequestCount: number;
  timestamp: string;
  acceptanceStatus?: string; // 'accepted' or 'rejected'
  rejectionReason?: string;
}
