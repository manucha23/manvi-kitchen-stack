import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectButtonModule } from 'primeng/selectbutton';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { debounceTime, Subject } from 'rxjs';
import {
  OrderListFilterChange,
  OrderListFilterChangeType,
  OrderListFilterState,
  OrderSearchMode,
  OrderStatus,
} from '../../../shared/models/order';

interface SearchModeOption {
  value: OrderSearchMode;
  icon: string;
  title: string;
}

@Component({
  selector: 'app-order-list-filters',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SelectButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    DatePickerModule,
    SelectModule,
  ],
  templateUrl: './order-list-filters.component.html',
  styleUrl: './order-list-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderListFiltersComponent implements OnInit, OnDestroy {
  collapsedOnMobile = input(true);

  filtersChange = output<OrderListFilterChange>();

  searchMode = signal<OrderSearchMode>('phone');
  searchText = signal('');
  rangeDates = signal<Date[] | undefined>(undefined);
  selectedStatus = signal<OrderStatus | undefined>(OrderStatus.CONFIRMED);
  mobileExpanded = signal(false);

  readonly searchModeOptions: SearchModeOption[] = [
    { value: 'phone', icon: 'pi pi-phone', title: 'Search by phone' },
    { value: 'orderId', icon: 'pi pi-hashtag', title: 'Search by order ID' },
  ];

  readonly statusOptions = Object.values(OrderStatus).map((status) => ({
    label: status === OrderStatus.CREATED ? 'Order Placed' : status,
    value: status,
  }));

  readonly isOrderIdMode = computed(() => this.searchMode() === 'orderId');

  readonly searchPlaceholder = computed(() =>
    this.isOrderIdMode() ? 'Order ID' : 'Phone number',
  );

  readonly searchInputType = computed(() => (this.isOrderIdMode() ? 'text' : 'tel'));

  readonly searchIcon = computed(() =>
    this.isOrderIdMode() ? 'pi pi-hashtag' : 'pi pi-phone',
  );

  readonly activeFilterCount = computed(() => {
    let count = 0;
    if (this.searchText().trim()) {
      count++;
    }
    if (this.hasCompleteDateRange()) {
      count++;
    }
    if (this.selectedStatus() && this.selectedStatus() !== OrderStatus.CONFIRMED) {
      count++;
    }
    return count;
  });

  private readonly filterSubject = new Subject<OrderListFilterChangeType>();

  ngOnInit(): void {
    this.filterSubject.pipe(debounceTime(400)).subscribe((type) => {
      this.emitFilters(type);
    });
  }

  ngOnDestroy(): void {
    this.filterSubject.complete();
  }

  toggleMobileFilters(): void {
    this.mobileExpanded.update((expanded) => !expanded);
  }

  onSearchModeChange(mode: OrderSearchMode): void {
    if (mode === this.searchMode()) {
      return;
    }
    this.searchMode.set(mode);
    this.searchText.set('');
  }

  onSearchValueChange(value: string): void {
    if (this.isOrderIdMode()) {
      value = this.normalizedOrderId(value);
    }
    this.searchText.set(value);
    this.queueFilterChange(OrderListFilterChangeType.SEARCH);
  }

  onDateRangeChange(dates: Date[] | Date | null | undefined): void {
    if (dates == null) {
      this.rangeDates.set(undefined);
      this.queueFilterChange(OrderListFilterChangeType.DATE);
      return;
    }

    this.rangeDates.set(Array.isArray(dates) ? dates : [dates]);
    this.queueFilterChange(OrderListFilterChangeType.DATE);
  }

  onStatusChange(): void {
    this.queueFilterChange(OrderListFilterChangeType.STATUS);
  }

  getState(): OrderListFilterState {
    return {
      searchMode: this.searchMode(),
      searchText: this.searchText(),
      rangeDates: this.rangeDates(),
      selectedStatus: this.selectedStatus(),
    };
  }

  private queueFilterChange(type: OrderListFilterChangeType): void {
    this.filterSubject.next(type);
  }

  private emitFilters(type: OrderListFilterChangeType): void {
    if (type === OrderListFilterChangeType.DATE && this.hasPartialDateRange()) {
      return;
    }

    if (
      type === OrderListFilterChangeType.SEARCH &&
      this.isOrderIdMode() &&
      this.normalizedOrderId(this.searchText()).length > 0 &&
      this.normalizedOrderId(this.searchText()).length < 6
    ) {
      return;
    }

    this.filtersChange.emit({ type, state: this.getState() });
  }

  private hasCompleteDateRange(): boolean {
    const dates = this.rangeDates();
    return Boolean(dates?.[0] && dates?.[1]);
  }

  private hasPartialDateRange(): boolean {
    const dates = this.rangeDates();
    const hasStart = Boolean(dates?.[0]);
    const hasEnd = Boolean(dates?.[1]);
    return hasStart !== hasEnd;
  }

  private normalizedOrderId(value: string): string {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  }
}
