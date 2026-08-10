import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { TimelineModule } from 'primeng/timeline';
import { TagModule } from 'primeng/tag';
import { OrderService } from '../../../shared/services/order.service';
import {
  AuditChangeType,
  OrderAuditRecord,
  OrderStatus,
} from '../../../shared/models/order';

@Component({
  selector: 'app-order-history',
  templateUrl: './order-history.component.html',
  styleUrl: './order-history.component.scss',
  standalone: true,
  imports: [CommonModule, DialogModule, TimelineModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderHistoryComponent {
  private readonly orderService = inject(OrderService);

  orderId = input.required<string>();
  visible = input.required<boolean>();
  closed = output<void>();

  history = signal<OrderAuditRecord[]>([]);
  loading = signal(false);
  expandedTimestamps = signal<Set<string>>(new Set());

  readonly loadingPlaceholders = Array.from({ length: 3 }, (_, index) => index);

  constructor() {
    effect(() => {
      const isVisible = this.visible();
      const orderId = this.orderId();

      if (isVisible && orderId) {
        this.fetchHistory(orderId);
        return;
      }

      if (!isVisible) {
        this.history.set([]);
        this.expandedTimestamps.set(new Set());
      }
    });
  }

  onHide(): void {
    this.closed.emit();
  }

  toggleExpanded(timestamp: string): void {
    this.expandedTimestamps.update((current) => {
      const next = new Set(current);
      if (next.has(timestamp)) {
        next.delete(timestamp);
      } else {
        next.add(timestamp);
      }
      return next;
    });
  }

  isExpanded(timestamp: string): boolean {
    return this.expandedTimestamps().has(timestamp);
  }

  getChangeTitle(record: OrderAuditRecord): string {
    switch (record.changeType) {
      case 'CREATED':
        return 'Order created';
      case 'STATUS_CHANGE':
        return `Status changed: ${this.formatStatus(record.oldStatus)} → ${this.formatStatus(record.newStatus)}`;
      case 'UPDATED':
        return `Order updated (${record.changedFields?.length ?? 0} field${(record.changedFields?.length ?? 0) === 1 ? '' : 's'})`;
      case 'DELETED':
        return 'Order deleted';
      default:
        return 'Order event';
    }
  }

  getMarkerIcon(changeType: AuditChangeType): string {
    switch (changeType) {
      case 'CREATED':
        return 'pi pi-plus';
      case 'STATUS_CHANGE':
        return 'pi pi-sync';
      case 'UPDATED':
        return 'pi pi-pencil';
      case 'DELETED':
        return 'pi pi-trash';
      default:
        return 'pi pi-circle';
    }
  }

  getMarkerClass(changeType: AuditChangeType): string {
    switch (changeType) {
      case 'CREATED':
        return 'bg-green-500 text-white';
      case 'STATUS_CHANGE':
        return 'bg-primary text-primary-contrast';
      case 'UPDATED':
        return 'bg-amber-500 text-white';
      case 'DELETED':
        return 'bg-red-500 text-white';
      default:
        return 'bg-surface-400 text-white';
    }
  }

  getStatusSeverity(
    status: string | undefined,
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

  formatFieldLabel(field: string): string {
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (char) => char.toUpperCase())
      .trim();
  }

  formatFieldValue(value: unknown): string {
    if (value == null) {
      return '—';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }
  private fetchHistory(orderId: string): void {
    this.loading.set(true);
    this.history.set([]);

    this.orderService.getOrderAudit(orderId).subscribe({
      next: (records) => {
        this.history.set(records);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error fetching order history:', error);
        this.history.set([]);
        this.loading.set(false);
      },
    });
  }

  private formatStatus(status: string | undefined): string {
    return status ?? 'Unknown';
  }
}
