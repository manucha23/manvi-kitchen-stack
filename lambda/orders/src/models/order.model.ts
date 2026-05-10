export enum OrderStatus {
  CREATED = 'CREATED',
  CONFIRMED = 'CONFIRMED',
  INKITCHEN = 'INKITCHEN',
  READY = 'READY',
  DISPATCHED = 'DISPATCHED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum Slot {
  LUNCH = 'lunch',
  DINNER = 'dinner'
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
  customerPhone: string;
  deliveryAddress: string;
  status: OrderStatus;
  slot: Slot;
  slotDate: string; // YYYY-MM-DD
  items: OrderItem[];
  totalAmount: number;
  instructions?: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}
