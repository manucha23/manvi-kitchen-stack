
export interface OrderItem {
  id: number;
  name: string;
  amount: number;
  quantity: number;
}

export interface Order {
  orderId: string;
  userId: string;
  name: string;
  address: string;
  pinCode: number;
  status: 'placed' | 'accepted' | 'cooking' | 'ready' | 'delivered';
  instructions: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
  version: number;
}