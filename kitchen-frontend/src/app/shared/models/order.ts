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

export type OrderSearchMode = 'phone' | 'orderId';

export const ORDER_ID_PATTERN = /^[A-Z0-9]{6}$/;

export interface OrderListFilterState {
  searchMode: OrderSearchMode;
  searchText: string;
  rangeDates?: Date[];
  selectedStatus?: OrderStatus;
}

export enum OrderListFilterChangeType {
  SEARCH = 'search',
  DATE = 'date',
  STATUS = 'status',
}

export interface OrderListFilterChange {
  type: OrderListFilterChangeType;
  state: OrderListFilterState;
}

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

export type AuditChangeType = 'CREATED' | 'STATUS_CHANGE' | 'UPDATED' | 'DELETED';

export type AuditEventType = 'INSERT' | 'MODIFY' | 'REMOVE';

export interface FieldChange {
  from?: unknown;
  to?: unknown;
}

export interface OrderAuditRecord {
  orderId: string;
  timestamp: string;
  eventType: AuditEventType;
  changeType: AuditChangeType;
  oldStatus?: string;
  newStatus?: string;
  changedFields?: string[];
  changes?: Record<string, FieldChange>;
  oldImage?: Record<string, unknown>;
  newImage?: Record<string, unknown>;
}

export interface OrderHistoryResponse {
  orderId: string;
  history: OrderAuditRecord[];
}

export interface BulkOrderVersion {
  orderId: string;
  version: number;
}

export interface BulkUpdateOrdersRequest {
  orders: BulkOrderVersion[];
  update: { status: OrderStatus };
}

export interface BulkUpdateFailure {
  orderId: string;
  message: string;
}

export interface BulkUpdateOrdersResponse {
  updated: Order[];
  failed: BulkUpdateFailure[];
  updatedCount: number;
  failedCount: number;
}
