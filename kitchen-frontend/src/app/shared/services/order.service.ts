import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { map } from 'rxjs/operators';
import { Order } from '../models/order';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class OrderService {
  private apiUrl = `${environment.apiUrl}/orders`;

  // State signals
  private _orders = signal<Order[]>([]);
  public readonly orders = this._orders.asReadonly();

  private _loading = signal(false);
  public readonly loading = this._loading.asReadonly();

  constructor(private http: HttpClient) {}

  loadOrders(filters?: {
    orderedBy?: string;
    fromDate?: string;
    toDate?: string;
    orderStatus?: string[];
  }): void {
    this._loading.set(true);
    let params: any = {};
    if (filters) {
      if (filters.orderedBy) params.orderedBy = filters.orderedBy;
      if (filters.fromDate) params.fromDate = filters.fromDate;
      if (filters.toDate) params.toDate = filters.toDate;
      if (filters.orderStatus && filters.orderStatus.length > 0) {
        params.orderStatus = filters.orderStatus.join(',');
      }
    }

    this.http
      .get<{ items: Order[] }>(this.apiUrl, { params })
      .pipe(map((response) => response.items))
      .subscribe({
        next: (orders) => {
          this._orders.set(orders);
          this._loading.set(false);
        },
        error: (error) => {
          console.error('Error loading orders:', error);
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

  getOrderAudit(orderId: string): Observable<Order[]> {
    return this.http
      .get<{ items: Order[] }>(`${this.apiUrl}/${orderId}?trace=true`)
      .pipe(map((response) => response.items));
  }

  updateOrderStatus(orderId: string, status: string): Observable<any> {
    const currentOrder = this._orders().find((o) => o.orderId === orderId);
    const body = {
      orderStatus: status,
      feedbackProvided: currentOrder?.feedbackProvided ?? false,
      incrementFeedbackRequest: true,
      instructions: currentOrder?.instructions,
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
