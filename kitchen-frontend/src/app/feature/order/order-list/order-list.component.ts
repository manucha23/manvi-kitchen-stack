import { Component, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { OrderService } from '../../../shared/services/order.service';
import { Order, OrderItem, OrderStatus } from '../../../shared/models/order';

import { CommonModule } from '@angular/common'; // For pipes: number, date, uppercase
import { OrderCreateComponent } from '../order-create/order-create.component';
import { NotificationService } from '../../../shared/services/notification.service';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { MultiSelectModule } from 'primeng/multiselect';
import { debounceTime, Subject } from 'rxjs';

@Component({
  selector: 'app-order-list',
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.scss',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    TagModule,
    SelectModule,
    DialogModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    DatePickerModule,
    MultiSelectModule,
    OrderCreateComponent
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
  
  // Filter state
  searchText = '';
  rangeDates: Date[] | undefined;
  selectedStatuses: OrderStatus[] = [];
  private searchSubject = new Subject<void>();

  statusOptions = Object.values(OrderStatus).map(status => ({ label: status, value: status }));

  getStatusSeverity(status: string): "success" | "info" | "warn" | "danger" | "secondary" | "contrast" | undefined {
    switch (status) {
      case OrderStatus.CREATED: return 'info';
      case OrderStatus.ACCEPTED: return 'warn';
      case OrderStatus.COOKING: return 'primary' as any; // PrimeNG Tag severity doesn't have 'primary' but 'info' or custom
      case OrderStatus.READY: return 'success';
      case OrderStatus.DELIVERED: return 'secondary';
      default: return 'info';
    }
  }

  constructor(
    private orderService: OrderService,
    private notificationService: NotificationService
  ) { }

  ngOnInit(): void {
    this.loadOrders();
    
    // Setup debounced search
    this.searchSubject.pipe(debounceTime(400)).subscribe(() => {
      this.executeSearch();
    });
  }

  onSearch(): void {
    this.searchSubject.next();
  }

  executeSearch(): void {
    const filters: any = {};
    if (this.searchText) {
      filters.orderedBy = this.searchText;
    }
    if (this.rangeDates && this.rangeDates[0] && this.rangeDates[1]) {
      filters.fromDate = this.rangeDates[0].toISOString();
      filters.toDate = this.rangeDates[1].toISOString();
    }
    if (this.selectedStatuses && this.selectedStatuses.length > 0) {
      filters.orderStatus = this.selectedStatuses;
    }
    this.orderService.loadOrders(filters);
  }

  loadOrders(): void {
    this.orderService.loadOrders();
  }

  getTotalAmount(items: OrderItem[]): number {
    return items.reduce((total, item) => total + (item.amount * item.quantity), 0);
  }

  updateOrderStatus(orderId: string, newStatus: OrderStatus): void {
    this.orderService.updateOrderStatus(orderId, newStatus).subscribe({
      next: () => {
        this.loadOrders();
        this.notificationService.showSuccess('Order Updated', `Order ${orderId} status changed to ${newStatus}`);
      },
      error: (error) => {
        console.error('Error updating order status:', error);
        this.notificationService.showError('Update Failed', 'Could not update order status');
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
        // this.auditDetails.set(data.sort((a, b) => b.version - a.version));
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