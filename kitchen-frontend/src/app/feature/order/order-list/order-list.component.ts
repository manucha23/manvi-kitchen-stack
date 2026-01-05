import { Component, OnInit } from '@angular/core';
import { OrderService } from '../../../shared/services/order.service';
import { Order, OrderItem } from '../../../shared/models/order';

@Component({
  selector: 'app-order-list',
  templateUrl: './order-list.component.html',
  styleUrls: ['./order-list.component.sass'],
  standalone: false
})
export class OrderListComponent implements OnInit {
  orders: Order[] = [];
  loading = true;
  showAuditPopup = false;
  auditLoading = false;
  auditDetails: Order[] = [];
  selectedOrderId = '';
  showCreatePopup = false;

  constructor(private orderService: OrderService) { }

  ngOnInit(): void {
    this.loadOrders();
  }

  loadOrders(): void {
    this.orderService.getOrders().subscribe({
      next: (data: Order[]) => {
        this.orders = data;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error fetching orders:', error);
        this.loading = false;
      }
    });
  }

  getTotalAmount(items: OrderItem[]): number {
    return items.reduce((total, item) => total + (item.amount * item.quantity), 0);
  }

  updateOrderStatus(orderId: string, event: any): void {
    const newStatus = event.target.value;
    this.orderService.updateOrderStatus(orderId, newStatus).subscribe({
      next: () => {
        const order = this.orders.find(o => o.orderId === orderId);
        if (order) {
          order.status = newStatus;
        }
      },
      error: (error) => {
        console.error('Error updating order status:', error);
      }
    });
  }

  showAuditDetails(orderId: string, event: Event): void {
    event.preventDefault();
    this.selectedOrderId = orderId;
    this.showAuditPopup = true;
    this.auditLoading = true;

    this.orderService.getOrderAudit(orderId).subscribe({
      next: (data: Order[]) => {
        this.auditDetails = data.sort((a, b) => b.version - a.version);
        this.auditLoading = false;
      },
      error: (error) => {
        console.error('Error fetching audit details:', error);
        this.auditLoading = false;
      }
    });
  }

  closeAuditPopup(): void {
    this.showAuditPopup = false;
    this.auditDetails = [];
    this.selectedOrderId = '';
  }

  onOrderCreated(): void {
    this.loadOrders();
    this.showCreatePopup = false;
  }
}