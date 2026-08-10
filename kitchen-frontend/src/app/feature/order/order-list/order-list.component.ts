import {
  Component,
  OnInit,
  signal,
  computed,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { OrderService } from '../../../shared/services/order.service';
import {
  IOrderFilters,
  Order,
  OrderStatus,
  ORDER_ID_PATTERN,
  OrderListFilterChange,
  OrderListFilterChangeType,
  OrderListFilterState,
} from '../../../shared/models/order';
import { CommonModule } from '@angular/common';
import { OrderCreateComponent } from '../order-create/order-create.component';
import { NotificationService } from '../../../shared/services/notification.service';
import { ButtonModule } from 'primeng/button';
import { SortEvent } from 'primeng/api';
import { OrderListFiltersComponent } from './order-list-filter/order-list-filters.component';
import { OrderListMobileComponent } from './order-list-mobile/order-list-mobile.component';
import { OrderListDesktopComponent } from './order-list-desktop/order-list-desktop.component';
import { OrderHistoryComponent } from '../order-history/order-history.component';
import { OrderStatusOption } from './order-list.types';

@Component({
  selector: 'app-order-list',
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.scss',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    OrderCreateComponent,
    OrderListFiltersComponent,
    OrderListMobileComponent,
    OrderListDesktopComponent,
    OrderHistoryComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderListComponent implements OnInit {
  @ViewChild(OrderListMobileComponent) mobileView?: OrderListMobileComponent;
  @ViewChild(OrderListDesktopComponent) desktopView?: OrderListDesktopComponent;

  orders = this.orderService.orders;
  loading = this.orderService.loading;
  hasMore = this.orderService.hasMore;
  showHistoryPopup = signal(false);
  selectedOrderId = signal('');
  showCreatePopup = signal(false);
  readonly loadingPlaceholders = Array.from({ length: 4 }, (_, index) => ({
    orderId: `loading-${index}`,
  })) as Order[];
  readonly tableRows = computed(() =>
    this.loading() ? [...this.orders(), ...this.loadingPlaceholders] : this.orders(),
  );

  sortField = 'createdAt';
  sortOrder = -1;
  private lastAppliedSort: { field: string; order: number } | null = null;
  private filterState: OrderListFilterState = {
    searchMode: 'phone',
    searchText: '',
    selectedStatus: OrderStatus.CONFIRMED,
  };

  readonly statusOptions: OrderStatusOption[] = Object.values(OrderStatus).map((status) => ({
    label: status === OrderStatus.CREATED ? 'Order Placed' : status,
    value: status,
  }));

  constructor(
    private orderService: OrderService,
    private notificationService: NotificationService,
    private hostElement: ElementRef<HTMLElement>,
  ) {}

  ngOnInit(): void {
    this.lastAppliedSort = { field: this.sortField, order: this.sortOrder };
    this.loadOrders();
  }

  onFiltersChange(change: OrderListFilterChange): void {
    this.filterState = change.state;

    if (change.type === OrderListFilterChangeType.DATE && this.hasPartialDateRange()) {
      return;
    }

    this.applyFilters();
  }

  loadMore(): void {
    if (this.hasMore() && !this.loading()) {
      this.orderService.loadMoreOrders(10);
    }
  }

  onTableSort(event: SortEvent): void {
    if (event.field !== 'createdAt' || event.order == null || event.order === 0) {
      return;
    }

    if (
      this.lastAppliedSort?.field === event.field &&
      this.lastAppliedSort?.order === event.order
    ) {
      return;
    }

    this.lastAppliedSort = { field: event.field, order: event.order };
    this.sortField = event.field;
    this.sortOrder = event.order;
    this.applyFilters();
  }

  loadOrders(): void {
    this.applyFilters();
  }

  openOrderHistory(orderId: string, event: Event): void {
    event.preventDefault();
    this.selectedOrderId.set(orderId);
    this.showHistoryPopup.set(true);
  }

  closeHistoryPopup(): void {
    this.showHistoryPopup.set(false);
    this.selectedOrderId.set('');
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

  onOrderCreated(): void {
    this.showCreatePopup.set(false);
    this.scrollOrdersToTop();
  }

  private applyFilters(): void {
    this.scrollOrdersToTop();

    if (this.filterState.searchMode === 'orderId') {
      const orderId = this.filterState.searchText.trim().toUpperCase();
      if (!orderId) {
        this.orderService.loadOrders(this.buildListFilters());
        return;
      }
      if (!ORDER_ID_PATTERN.test(orderId)) {
        return;
      }
      this.orderService.loadOrderById(orderId, this.buildListFilters());
      return;
    }

    this.orderService.loadOrders(this.buildListFilters());
  }

  private buildListFilters(): IOrderFilters {
    const filters: IOrderFilters = {};

    const customerPhone = this.normalizeCustomerPhone(this.filterState.searchText);
    if (customerPhone) {
      filters.customerPhone = customerPhone;
    }

    if (this.hasCompleteDateRange()) {
      filters.fromDate = this.toDayBoundaryISOString(this.filterState.rangeDates![0], 'start');
      filters.toDate = this.toDayBoundaryISOString(this.filterState.rangeDates![1], 'end');
    }

    if (this.filterState.selectedStatus) {
      filters.orderStatus = this.filterState.selectedStatus;
    }

    filters.sortOrder = this.sortOrder === 1 ? 'asc' : 'desc';

    return filters;
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

  private hasCompleteDateRange(): boolean {
    return Boolean(this.filterState.rangeDates?.[0] && this.filterState.rangeDates?.[1]);
  }

  private hasPartialDateRange(): boolean {
    const dates = this.filterState.rangeDates;
    const hasStart = Boolean(dates?.[0]);
    const hasEnd = Boolean(dates?.[1]);
    return hasStart !== hasEnd;
  }

  private normalizeCustomerPhone(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    return trimmed.replace(/[^\d+]/g, '');
  }

  private scrollOrdersToTop(): void {
    this.desktopView?.scrollToTop();
    this.mobileView?.scrollToTop();
    const appContent = this.hostElement.nativeElement.closest('.app-content') as HTMLElement | null;
    appContent?.scrollTo({ top: 0 });
  }
}
