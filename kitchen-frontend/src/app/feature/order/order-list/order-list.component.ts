import {
  Component,
  OnInit,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { OrderService } from '../../../shared/services/order.service';
import {
  IOrderFilters,
  Order,
  OrderItem,
  OrderStatus,
} from '../../../shared/models/order';

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
import { SkeletonModule } from 'primeng/skeleton';
import { debounceTime, Subject } from 'rxjs';

enum FilterType {
  SEARCH = 'search',
  DATE = 'date',
  STATUS = 'status',
}
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
    SkeletonModule,
    OrderCreateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderListComponent implements OnInit {
  orders = this.orderService.orders;
  loading = this.orderService.loading;
  showAuditPopup = signal(false);
  auditLoading = signal(false);
  auditDetails = signal<Order[]>([]);
  selectedOrderId = signal('');
  showCreatePopup = signal(false);
  placeholderOrders = Array(5).fill({}) as Order[];

  FILTER_TYPE = FilterType;

  // Filter state
  searchText = '';
  rangeDates: Date[] | undefined;
  selectedStatus: OrderStatus | undefined = OrderStatus.CONFIRMED;
  private searchSubject = new Subject<FilterType>();

  statusOptions = Object.values(OrderStatus).map((status) => ({
    label: status,
    value: status,
  }));

  getStatusSeverity(
    status: string,
  ):
    | 'success'
    | 'info'
    | 'warn'
    | 'danger'
    | 'secondary'
    | 'contrast'
    | undefined {
    switch (status) {
      case OrderStatus.CREATED:
        return 'info';
      case OrderStatus.PENDING_PAYMENT:
        return 'warn';
      case OrderStatus.CONFIRMED:
        return 'success';
      case OrderStatus.INKITCHEN:
        return 'warn';
      case OrderStatus.READY:
        return 'success';
      case OrderStatus.DISPATCHED:
        return 'info';
      case OrderStatus.COMPLETED:
        return 'secondary';
      case OrderStatus.CANCELLED:
        return 'danger';
      default:
        return 'info';
    }
  }

  constructor(
    private orderService: OrderService,
    private notificationService: NotificationService,
  ) {}

  ngOnInit(): void {
    this.loadOrders();

    // Setup debounced search
    this.searchSubject.pipe(debounceTime(400)).subscribe((type) => {
      this.executeSearch(type);
    });
  }

  onFilterSearchChanges(filterType: FilterType): void {
    this.searchSubject.next(filterType);
  }

  executeSearch(filterType: FilterType): void {
    const filters: IOrderFilters = {};
    if (this.searchText) {
      filters.customerPhone = this.searchText;
    }

    if (this.rangeDates && this.rangeDates[0] && this.rangeDates[1]) {
      filters.fromDate = this.toDayBoundaryISOString(this.rangeDates[0], 'start');
      filters.toDate = this.toDayBoundaryISOString(this.rangeDates[1], 'end');
    } else if (filterType === FilterType.DATE) {
      return;
    }
    if (this.selectedStatus) {
      filters.orderStatus = [this.selectedStatus];
    }
    this.orderService.loadOrders(filters);
  }

  private toDayBoundaryISOString(date: Date, boundary: 'start' | 'end'): string {
    const boundaryDate = new Date(date);
    if (boundary === 'start') {
      boundaryDate.setHours(0, 0, 0, 0);
    } else {
      boundaryDate.setHours(23, 59, 59, 999);
    }

    return boundaryDate.toISOString();
  }

  loadOrders(): void {
    const filters: IOrderFilters = {};
    if (this.searchText) {
      filters.customerPhone = this.searchText;
    }
    if (this.rangeDates && this.rangeDates[0] && this.rangeDates[1]) {
      filters.fromDate = this.toDayBoundaryISOString(this.rangeDates[0], 'start');
      filters.toDate = this.toDayBoundaryISOString(this.rangeDates[1], 'end');
    }
    if (this.selectedStatus) {
      filters.orderStatus = [this.selectedStatus];
    }
    this.orderService.loadOrders(filters);
  }

  getTotalAmount(items: OrderItem[]): number {
    return items.reduce(
      (total, item) => total + item.amount * item.quantity,
      0,
    );
  }

  updateOrderStatus(orderId: string, newStatus: OrderStatus): void {
    this.orderService.updateOrderStatus(orderId, newStatus).subscribe({
      next: () => {
        this.loadOrders();
        this.notificationService.showSuccess(
          'Order Updated',
          `Order ${orderId} status changed to ${newStatus}`,
        );
      },
      error: (error) => {
        const errorMsg = error?.error?.error || 'Could not update order status';
        this.notificationService.showError('Update Failed', errorMsg);
      },
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
      },
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
