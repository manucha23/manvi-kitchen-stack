import {
  Component,
  OnInit,
  OnDestroy,
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
  OrderItem,
  OrderStatus,
  ORDER_ID_PATTERN,
  OrderListFilterChange,
  OrderListFilterChangeType,
  OrderListFilterState,
} from '../../../shared/models/order';
import { CommonModule } from '@angular/common';
import { OrderCreateComponent } from '../order-create/order-create.component';
import { NotificationService } from '../../../shared/services/notification.service';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { SkeletonModule } from 'primeng/skeleton';
import { SortEvent } from 'primeng/api';
import { OrderListFiltersComponent } from './order-list-filters.component';

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
    SkeletonModule,
    OrderCreateComponent,
    OrderListFiltersComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderListComponent implements OnInit, OnDestroy {
  @ViewChild('desktopScrollContainer') desktopScrollContainer?: ElementRef<HTMLElement>;
  @ViewChild('mobileLoadTrigger')
  set mobileLoadTrigger(element: ElementRef<HTMLElement> | undefined) {
    this.mobileLoadObserver?.disconnect();

    if (!element || typeof IntersectionObserver === 'undefined') {
      return;
    }

    this.mobileLoadObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          this.loadMore();
        }
      },
      {
        root: element.nativeElement.closest('.mobile-order-list'),
        rootMargin: '0px 0px 240px',
      },
    );
    this.mobileLoadObserver.observe(element.nativeElement);
  }

  @ViewChild('desktopLoadTrigger')
  set desktopLoadTrigger(element: ElementRef<HTMLElement> | undefined) {
    this.desktopLoadObserver?.disconnect();

    if (!element || typeof IntersectionObserver === 'undefined') {
      return;
    }

    this.desktopLoadObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          this.loadMore();
        }
      },
      { root: element.nativeElement.parentElement, rootMargin: '0px 0px 256px' },
    );
    this.desktopLoadObserver.observe(element.nativeElement);
  }

  orders = this.orderService.orders;
  loading = this.orderService.loading;
  hasMore = this.orderService.hasMore;
  showAuditPopup = signal(false);
  auditLoading = signal(false);
  auditDetails = signal<Order[]>([]);
  selectedOrderId = signal('');
  showCreatePopup = signal(false);
  readonly loadingPlaceholders = Array.from({ length: 4 }, (_, index) => ({
    orderId: `loading-${index}`,
  })) as Order[];
  readonly tableRows = computed(() =>
    this.loading() ? [...this.orders(), ...this.loadingPlaceholders] : this.orders(),
  );

  /** Only createdAt is sortable — matches API sortOrder on createdAt index. */
  sortField = 'createdAt';
  sortOrder = -1;
  private lastAppliedSort: { field: string; order: number } | null = null;
  private filterState: OrderListFilterState = {
    searchMode: 'phone',
    searchText: '',
    selectedStatus: OrderStatus.CONFIRMED,
  };
  private mobileLoadObserver?: IntersectionObserver;
  private desktopLoadObserver?: IntersectionObserver;

  statusOptions = Object.values(OrderStatus).map((status) => ({
    label: this.getStatusLabel(status),
    value: status,
  }));

  getStatusLabel(status: string): string {
    return status === OrderStatus.CREATED ? 'Order Placed' : status;
  }

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
    private hostElement: ElementRef<HTMLElement>,
  ) {}

  ngOnInit(): void {
    this.lastAppliedSort = { field: this.sortField, order: this.sortOrder };
    this.loadOrders();
  }

  ngOnDestroy(): void {
    this.mobileLoadObserver?.disconnect();
    this.desktopLoadObserver?.disconnect();
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

  onDesktopScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const remainingScroll = element.scrollHeight - element.scrollTop - element.clientHeight;

    if (remainingScroll <= 256) {
      this.loadMore();
    }
  }

  isLoadingPlaceholder(order: Order | undefined): boolean {
    return !order || order.orderId.startsWith('loading-');
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
    this.desktopScrollContainer?.nativeElement.scrollTo({ top: 0 });
    const appContent = this.hostElement.nativeElement.closest('.app-content') as HTMLElement | null;
    appContent?.scrollTo({ top: 0 });
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
      next: () => {
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
    this.showCreatePopup.set(false);
    this.scrollOrdersToTop();
  }
}
