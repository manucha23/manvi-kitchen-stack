export type Channel = 'WHATSAPP' | 'WEBSITE';

export type CartStatus =
  | 'ACTIVE'
  | 'CHECKOUT_STARTED'
  | 'ABANDONED'
  | 'CONVERTED'
  | 'CANCELLED';

export type CartEventType =
  | 'CART_CREATED'
  | 'ITEM_ADDED'
  | 'ITEM_REMOVED'
  | 'QUANTITY_CHANGED'
  | 'CHECKOUT_STARTED'
  | 'SPECIAL_REQUEST_ADDED'
  | 'ADDRESS_ADDED'
  | 'ORDER_CREATED'
  | 'CART_ABANDONED'
  | 'HANDOFF_REQUIRED';

export type DeliveryArea = 'TOWNSHIP' | 'OUTSIDE' | 'UNKNOWN';

export interface Address {
  addressId?: string;
  text: string;
  label?: string;
  isDefault?: boolean;
  deliveryArea?: DeliveryArea;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerProfile {
  phoneNumber: string;
  customerId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  savedAddresses?: Address[];
  savedAddress?: Address;
  defaultAddressId?: string;
  marketingOptIn?: boolean;
  marketingOptInSource?: string;
  marketingOptInAt?: string;
  lastOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
  itemId: string;
  name: string;
  description?: string;
  category?: string;
  price: number;
  available: boolean;
}

export interface CartItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  amount: number;
}

export interface Cart {
  cartId: string;
  customerId: string;
  phoneNumber: string;
  channel: Channel;
  status: CartStatus;
  items: CartItem[];
  totalAmount: number;
  specialRequest?: string;
  deliveryAddress?: Address;
  paymentMethod?: 'COD' | 'ONLINE';
  orderId?: string;
  createdAt: string;
  updatedAt: string;
  lastInteractionAt: string;
  checkoutStartedAt?: string;
  abandonedAt?: string;
  convertedAt?: string;
  expiresAt: number;
}

export interface CartEvent {
  cartId: string;
  eventId: string;
  eventType: CartEventType;
  customerId: string;
  phoneNumber: string;
  channel: Channel;
  createdAt: string;
  expiresAt: number;
  metadata?: Record<string, unknown>;
}

export interface CreateOrderPayload {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  paymentMethod: 'COD' | 'ONLINE';
  items: Array<{ id: string; quantity: number }>;
  instructions?: string;
  sourceCartId?: string;
}
