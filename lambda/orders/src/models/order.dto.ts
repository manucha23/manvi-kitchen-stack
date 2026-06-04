export interface OrderItemRequest {
  id: string;
  quantity: number;
}

export interface CreateOrderRequest {
  customerName: string;
  deliveryAddress: string;
  customerPhone: string;
  items: OrderItemRequest[];
  instructions?: string;
  createdVia?: 'ADMIN' | 'CUSTOMER_WEB' | 'WHATSAPP';
}

export interface UpdateOrderRequest {
  orderStatus?: string;
  feedbackProvided?: boolean;
  incrementFeedbackRequest?: boolean;
  instructions?: string;
}
