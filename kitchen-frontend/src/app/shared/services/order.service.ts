import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { map } from 'rxjs/operators';
import { Order } from '../models/order';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private apiUrl = `${environment.apiUrl}/orders`;

  // State signals
  private _orders = signal<Order[]>([]);
  public readonly orders = this._orders.asReadonly();

  private _loading = signal(false);
  public readonly loading = this._loading.asReadonly();

  constructor(private http: HttpClient) { }

  loadOrders(): void {
    this._loading.set(true);
    this.http.get<{ items: Order[] }>(this.apiUrl).pipe(
      map(response => response.items)
    ).subscribe({
      next: (orders) => {
        this._orders.set(orders);
        this._loading.set(false);
      },
      error: (error) => {
        console.error('Error loading orders:', error);
        this._loading.set(false);
      }
    });
  }

  // Kept for compatibility if needed, but primarily internal or for specific non-state usages
  getOrders(): Observable<Order[]> {
    return this.http.get<{ items: Order[] }>(this.apiUrl).pipe(
      map(response => response.items)
    );
  }

  getOrderAudit(orderId: string): Observable<Order[]> {
    return this.http.get<{ items: Order[] }>(`${this.apiUrl}/${orderId}?trace=true`).pipe(
      map(response => response.items)
    );
  }

  updateOrderStatus(orderId: string, status: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${orderId}`, { status: status.toUpperCase() }).pipe(
      tap(() => {
        // Optimistic update or refresh
        this._orders.update(orders =>
          orders.map(o =>
            o.orderId === orderId ? { ...o, status: status as Order['status'] } : o
          )
        );
      })
    );
  }

  createOrder(order: any): Observable<any> {
    return this.http.post(this.apiUrl, order).pipe(
      tap(() => {
        this.loadOrders(); // Refresh list after creation
      })
    );
  }
}