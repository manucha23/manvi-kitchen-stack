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
import { SortEvent } from 'primeng/api';

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

  FILTER_TYPE = FilterType;

  // Filter state
  searchText = '';
  rangeDates: Date[] | undefined;
  selectedStatus: OrderStatus | undefined = OrderStatus.CONFIRMED;
  /** Only createdAt is sortable — matches API sortOrder on createdAt index. */
  sortField = 'createdAt';
  sortOrder = -1;
  private lastAppliedSort: { field: string; order: number } | null = null;
  private searchSubject = new Subject<FilterType>();
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

    // Setup debounced search
    this.searchSubject.pipe(debounceTime(400)).subscribe((type) => {
      this.executeSearch(type);
    });
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

  ngOnDestroy(): void {
    this.mobileLoadObserver?.disconnect();
    this.desktopLoadObserver?.disconnect();
    this.searchSubject.complete();
  }

  onFilterSearchChanges(filterType: FilterType): void {
    this.searchSubject.next(filterType);
  }

  onDateRangeChange(dates: Date[] | Date | null | undefined): void {
    if (dates == null) {
      this.rangeDates = undefined;
      this.onFilterSearchChanges(FilterType.DATE);
      return;
    }

    this.rangeDates = Array.isArray(dates) ? dates : [dates];
    this.onFilterSearchChanges(FilterType.DATE);
  }

  executeSearch(filterType: FilterType): void {
    if (filterType === FilterType.DATE && this.hasPartialDateRange()) {
      return;
    }

    this.scrollOrdersToTop();
    this.orderService.loadOrders(this.buildFilters());
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
    this.scrollOrdersToTop();
    this.orderService.loadOrders(this.buildFilters());
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
    this.scrollOrdersToTop();
    this.orderService.loadOrders(this.buildFilters());
  }

  private buildFilters(): IOrderFilters {
    const filters: IOrderFilters = {};

    const customerPhone = this.normalizeCustomerPhone(this.searchText);
    if (customerPhone) {
      filters.customerPhone = customerPhone;
    }

    if (this.hasCompleteDateRange()) {
      filters.fromDate = this.toDayBoundaryISOString(this.rangeDates![0], 'start');
      filters.toDate = this.toDayBoundaryISOString(this.rangeDates![1], 'end');
    }

    if (this.selectedStatus) {
      filters.orderStatus = this.selectedStatus;
    }

    filters.sortOrder = this.sortOrder === 1 ? 'asc' : 'desc';

    return filters;
  }

  private hasCompleteDateRange(): boolean {
    return Boolean(this.rangeDates?.[0] && this.rangeDates?.[1]);
  }

  private hasPartialDateRange(): boolean {
    const hasStart = Boolean(this.rangeDates?.[0]);
    const hasEnd = Boolean(this.rangeDates?.[1]);
    return hasStart !== hasEnd;
  }

  /** API matches customerPhone exactly on GSI — normalize to stored +digits format. */
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
    this.scrollOrdersToTop();
  }
}
