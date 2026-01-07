import { Component, OnInit, signal } from '@angular/core';
import { OrderService } from '../../../shared/services/order.service';
import { Order, OrderItem } from '../../../shared/models/order';

import { CommonModule } from '@angular/common'; // For pipes: number, date, uppercase
import { OrderCreateComponent } from '../order-create/order-create.component';

@Component({
  selector: 'app-order-list',
  templateUrl: './order-list.component.html',
  styleUrls: ['./order-list.component.sass'],
  standalone: true,
  imports: [CommonModule, OrderCreateComponent]
})
export class OrderListComponent implements OnInit {
  orders = this.orderService.orders;
  loading = this.orderService.loading;
  showAuditPopup = signal(false);
  auditLoading = signal(false);
  auditDetails = signal<Order[]>([]);
  selectedOrderId = signal('');
  showCreatePopup = signal(false);

  constructor(private orderService: OrderService) { }

  ngOnInit(): void {
    this.orderService.loadOrders();
  }

  loadOrders(): void {
    this.orderService.loadOrders();
  }

  getTotalAmount(items: OrderItem[]): number {
    return items.reduce((total, item) => total + (item.amount * item.quantity), 0);
  }

  updateOrderStatus(orderId: string, event: any): void {
    const newStatus = event.target.value;
    this.orderService.updateOrderStatus(orderId, newStatus).subscribe({
      next: () => {
        // State update handled by service
      },
      error: (error) => {
        console.error('Error updating order status:', error);
      }
    });
  }

  showAuditDetails(orderId: string, event: Event): void {
    event.preventDefault();
    this.selectedOrderId.set(orderId);
    this.showAuditPopup.set(true);
    this.auditLoading.set(true);

    this.orderService.getOrderAudit(orderId).subscribe({
      next: (data: Order[]) => {
        this.auditDetails.set(data.sort((a, b) => b.version - a.version));
        this.auditLoading.set(false);
      },
      error: (error) => {
        console.error('Error fetching audit details:', error);
        this.auditLoading.set(false);
      }
    });
  }

  closeAuditPopup(): void {
    this.showAuditPopup.set(false);
    this.auditDetails.set([]);
    this.selectedOrderId.set('');
  }

  onOrderCreated(): void {
    // List is refreshed by service
    this.showCreatePopup.set(false);
  }
}