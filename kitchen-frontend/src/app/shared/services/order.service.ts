import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Order } from '../models/order';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private apiUrl = `${environment.apiUrl}/orders`;

  constructor(private http: HttpClient) { }

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
    return this.http.put(`${this.apiUrl}/${orderId}`, { status: status.toUpperCase() });
  }

  createOrder(order: any): Observable<any> {
    return this.http.post(this.apiUrl, order);
  }
}