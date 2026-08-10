import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  BulkOrderVersion,
  BulkUpdateOrdersResponse,
  IOrderFilters,
  Order,
  OrderAuditRecord,
  OrderHistoryResponse,
  OrderStatus,
} from '../models/order';
import { environment } from '../../../environments/environment';
import { NotificationService } from './notification.service';

interface OrderListResponse {
  items: Order[];
  count: number;
  hasMore: boolean;
  nextToken?: string;
}

@Injectable({
  providedIn: 'root',
})
export class OrderService {
  private apiUrl = `${environment.adminApiUrl}/admin/orders`;

  // State signals
  private _orders = signal<Order[]>([]);
  public readonly orders = this._orders.asReadonly();

  private _loading = signal(false);
  public readonly loading = this._loading.asReadonly();

  private _hasMore = signal(true);
  public readonly hasMore = this._hasMore.asReadonly();

  private nextToken: string | undefined = undefined;
  private currentFilters: IOrderFilters | undefined = undefined;
  private requestGeneration = 0;

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
  ) {}

  loadOrders(filters?: IOrderFilters, limit: number = 10): void {
    this.currentFilters = filters;
    this.nextToken = undefined;
    this._hasMore.set(true);
    this._orders.set([]);
    this.requestGeneration++;

    this.fetchOrders(filters, limit, true);
  }

  loadOrderById(orderId: string, listFilters?: IOrderFilters): void {
    this.currentFilters = listFilters;
    this.nextToken = undefined;
    this._hasMore.set(false);
    this._orders.set([]);
    this.requestGeneration++;

    const requestGeneration = this.requestGeneration;
    this._loading.set(true);

    this.http.get<Order>(`${this.apiUrl}/${orderId}`).subscribe({
      next: (order) => {
        if (requestGeneration !== this.requestGeneration) {
          return;
        }
        const matches = !listFilters || this.matchesListFilters(order, listFilters);
        this._orders.set(matches ? [order] : []);
        this._loading.set(false);
      },
      error: (error) => {
        if (requestGeneration !== this.requestGeneration) {
          return;
        }
        if (error.status === 404) {
          this._orders.set([]);
        } else {
          console.error('Error loading order:', error);
          const errorMsg = error?.error?.error || 'Failed to load order';
          this.notificationService.showError('Fetch Error', errorMsg);
        }
        this._hasMore.set(false);
        this._loading.set(false);
      },
    });
  }

  loadMoreOrders(limit: number = 10): void {
    if (this._loading() || !this._hasMore()) {
      return;
    }
    this.fetchOrders(this.currentFilters, limit, false);
  }

  private fetchOrders(filters?: IOrderFilters, limit: number = 10, isReset: boolean = false): void {
    const requestGeneration = this.requestGeneration;
    this._loading.set(true);
    const params: Record<string, string | number> = { limit };

    if (filters?.orderedBy) {
      params['orderedBy'] = filters.orderedBy;
    }
    if (filters?.customerPhone) {
      params['customerPhone'] = filters.customerPhone;
    }
    if (filters?.fromDate) {
      params['fromDate'] = filters.fromDate;
    }
    if (filters?.toDate) {
      params['toDate'] = filters.toDate;
    }
    if (filters?.orderStatus) {
      params['orderStatus'] = filters.orderStatus;
    }
    if (filters?.sortOrder) {
      params['sortOrder'] = filters.sortOrder;
    }

    if (!isReset && this.nextToken) {
      params['nextToken'] = this.nextToken;
    }

    this.http
      .get<OrderListResponse>(this.apiUrl, { params })
      .subscribe({
        next: (response) => {
          if (requestGeneration !== this.requestGeneration) {
            return;
          }

          const newItems = response.items || [];
          this.nextToken = response.nextToken;
          this._hasMore.set(Boolean(response.hasMore));

          if (isReset) {
            this._orders.set(newItems);
          } else {
            this._orders.update((prev) => [...prev, ...newItems]);
          }
          this._loading.set(false);
        },
        error: (error) => {
          if (requestGeneration !== this.requestGeneration) {
            return;
          }
          console.error('Error loading orders:', error);
          const errorMsg = error?.error?.error || 'Failed to load orders';
          this.notificationService.showError('Fetch Error', errorMsg);
          this._hasMore.set(false);
          this._loading.set(false);
        },
      });
  }

  // Kept for compatibility if needed, but primarily internal or for specific non-state usages
  getOrders(): Observable<Order[]> {
    return this.http
      .get<{ items: Order[] }>(this.apiUrl)
      .pipe(map((response) => response.items));
  }

  getOrderAudit(orderId: string): Observable<OrderAuditRecord[]> {
    return this.http
      .get<OrderHistoryResponse>(`${this.apiUrl}/${orderId}/history`)
      .pipe(map((response) => response.history));
  }

  bulkUpdateOrderStatus(
    orders: BulkOrderVersion[],
    status: OrderStatus,
  ): Observable<BulkUpdateOrdersResponse> {
    return this.http
      .patch<BulkUpdateOrdersResponse>(`${this.apiUrl}/bulk`, {
        orders,
        update: { status },
      })
      .pipe(
        tap((response) => {
          const updatedMap = new Map(
            (response.updated ?? []).map((order) => [order.orderId, order]),
          );
          if (updatedMap.size === 0) {
            return;
          }
          this._orders.update((current) =>
            current.map((order) => {
              const updated = updatedMap.get(order.orderId);
              return updated ? { ...order, ...updated } : order;
            }),
          );
        }),
      );
  }

  updateOrderStatus(orderId: string, status: string): Observable<any> {
    const currentOrder = this._orders().find((o) => o.orderId === orderId);
    const body = {
      status,
      version: currentOrder?.version,
    };
    return this.http.put(`${this.apiUrl}/${orderId}`, body).pipe(
      tap(() => {
        // State update handled by service
        this._orders.update((orders) =>
          orders.map((o) =>
            o.orderId === orderId
              ? { ...o, status: status as Order['status'] }
              : o,
          ),
        );
      }),
    );
  }

  createOrder(order: any): Observable<any> {
    return this.http.post(this.apiUrl, order).pipe(
      tap(() => {
        this.loadOrders(this.currentFilters);
      }),
    );
  }

  private matchesListFilters(order: Order, filters: IOrderFilters): boolean {
    if (filters.orderStatus && order.status !== filters.orderStatus) {
      return false;
    }

    const createdAt = order.createdAt ?? order.timestamp;
    if (filters.fromDate && createdAt < filters.fromDate) {
      return false;
    }
    if (filters.toDate && createdAt > filters.toDate) {
      return false;
    }

    return true;
  }
}
