import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  OnDestroy,
  output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { CheckboxModule } from 'primeng/checkbox';
import { SortEvent } from 'primeng/api';
import { Order, OrderStatus } from '../../../../shared/models/order';
import { OrderStatusOption } from '../order-list.types';

@Component({
  selector: 'app-order-list-desktop',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, TagModule, SelectModule, SkeletonModule, CheckboxModule],
  templateUrl: './order-list-desktop.component.html',
  styleUrl: './order-list-desktop.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderListDesktopComponent implements OnDestroy {
  orders = input.required<Order[]>();
  tableRows = input.required<Order[]>();
  loading = input.required<boolean>();
  hasMore = input.required<boolean>();
  statusOptions = input.required<OrderStatusOption[]>();
  sortField = input.required<string>();
  sortOrder = input.required<number>();
  selectionMode = input(false);
  selectedOrderIds = input<Set<string>>(new Set());

  auditClick = output<{ orderId: string; event: Event }>();
  statusChange = output<{ orderId: string; status: OrderStatus }>();
  selectionToggle = output<Order>();
  selectAllToggle = output<void>();
  clearSelection = output<void>();
  sortChange = output<SortEvent>();
  loadMoreRequest = output<void>();

  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLElement>;

  @ViewChild('loadTrigger')
  set loadTrigger(element: ElementRef<HTMLElement> | undefined) {
    this.loadObserver?.disconnect();

    if (!element || typeof IntersectionObserver === 'undefined') {
      return;
    }

    this.loadObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          this.loadMoreRequest.emit();
        }
      },
      { root: element.nativeElement.parentElement, rootMargin: '0px 0px 256px' },
    );
    this.loadObserver.observe(element.nativeElement);
  }

  private loadObserver?: IntersectionObserver;

  ngOnDestroy(): void {
    this.loadObserver?.disconnect();
  }

  scrollToTop(): void {
    this.scrollContainer?.nativeElement.scrollTo({ top: 0 });
  }

  onScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const remainingScroll = element.scrollHeight - element.scrollTop - element.clientHeight;

    if (remainingScroll <= 256) {
      this.loadMoreRequest.emit();
    }
  }

  onAuditClick(orderId: string, event: Event): void {
    event.preventDefault();
    this.auditClick.emit({ orderId, event });
  }

  onStatusChange(orderId: string, status: OrderStatus): void {
    this.statusChange.emit({ orderId, status });
  }

  isSelected(orderId: string): boolean {
    return this.selectedOrderIds().has(orderId);
  }

  allVisibleSelected(): boolean {
    const selectable = this.orders().filter((order) => !this.isLoadingPlaceholder(order));
    return selectable.length > 0 && selectable.every((order) => this.isSelected(order.orderId));
  }

  onHeaderCheckboxChange(checked: boolean): void {
    if (checked) {
      this.selectAllToggle.emit();
      return;
    }
    this.clearSelection.emit();
  }

  onRowCheckboxChange(order: Order, checked: boolean): void {
    const currentlySelected = this.isSelected(order.orderId);
    if (checked !== currentlySelected) {
      this.selectionToggle.emit(order);
    }
  }

  isLoadingPlaceholder(order: Order | undefined): boolean {
    return !order || order.orderId.startsWith('loading-');
  }

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
}
