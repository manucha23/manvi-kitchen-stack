import { Component, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { OrderService } from '../../../shared/services/order.service';
import { Order, OrderItem } from '../../../shared/models/order';

import { CommonModule } from '@angular/common'; // For pipes: number, date, uppercase
import { FormsModule } from '@angular/forms';
import { OrderCreateComponent } from '../order-create/order-create.component';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';

@Component({
  selector: 'app-order-list',
  templateUrl: './order-list.component.html',
  styleUrls: ['./order-list.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    OrderCreateComponent,
    TableModule,
    ButtonModule,
    TagModule,
    SelectModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    DialogModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderListComponent implements OnInit {
  orders = this.orderService.orders;
  loading = this.orderService.loading;
  showAuditPopup = signal(false);
  auditLoading = signal(false);
  auditDetails = signal<Order[]>([]);
  selectedOrderId = signal('');
  showCreatePopup = signal(false);

  statusOptions = [
    { label: 'CREATED', value: 'Created' },
    { label: 'ACCEPTED', value: 'Accepted' },
    { label: 'COOKING', value: 'Cooking' },
    { label: 'READY', value: 'Ready' },
    { label: 'DELIVERED', value: 'Delivered' }
  ];

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
        this.auditDetails.set(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
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

  getStatusSeverity(status: string): "success" | "secondary" | "info" | "warn" | "danger" | "contrast" | undefined {
    switch (status?.toLowerCase()) {
      case 'created':
        return 'info';
      case 'accepted':
        return 'warn';
      case 'cooking':
        return 'contrast';
      case 'ready':
        return 'success';
      case 'delivered':
        return 'secondary';
      default:
        return 'info';
    }
  }
}