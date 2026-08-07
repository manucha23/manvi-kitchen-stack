import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { map } from 'rxjs/operators';
import { IOrderFilters, Order } from '../models/order';
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

  loadMoreOrders(limit: number = 10): void {
    if (this._loading() || !this._hasMore()) {
      return;
    }
    this.fetchOrders(this.currentFilters, limit, false);
  }

  private fetchOrders(filters?: IOrderFilters, limit: number = 10, isReset: boolean = false): void {
    const requestGeneration = this.requestGeneration;
    this._loading.set(true);
    let params: any = { limit };
    if (filters) {
      if (filters.orderedBy) params.orderedBy = filters.orderedBy;
      if (filters.customerPhone) params.customerPhone = filters.customerPhone;
      if (filters.fromDate) params.fromDate = filters.fromDate;
      if (filters.toDate) params.toDate = filters.toDate;
      if (filters.orderStatus && filters.orderStatus.length > 0) {
        params.orderStatus = filters.orderStatus.join(',');
      }
    }

    if (!isReset && this.nextToken) {
      params.nextToken = this.nextToken;
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

  getOrderAudit(orderId: string): Observable<any[]> {
    return this.http
      .get<{ history: any[] }>(`${this.apiUrl}/${orderId}/history`)
      .pipe(map((response) => response.history));
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
        this.loadOrders(); // Refresh list after creation
      }),
    );
  }
}
