import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { BulkOrderVersion, OrderStatus } from '../../../../shared/models/order';
import { OrderStatusOption } from '../order-list.types';
import { OrderService } from '../../../../shared/services/order.service';
import { NotificationService } from '../../../../shared/services/notification.service';

@Component({
  selector: 'app-order-bulk-operations',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule],
  templateUrl: './order-bulk-operations.component.html',
  styleUrl: './order-bulk-operations.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderBulkOperationsComponent {
  private readonly orderService = inject(OrderService);
  private readonly notificationService = inject(NotificationService);

  selectedOrders = input.required<BulkOrderVersion[]>();
  visibleCount = input.required<number>();
  statusOptions = input.required<OrderStatusOption[]>();

  clearSelection = output<void>();
  selectAll = output<void>();
  bulkUpdated = output<void>();

  applying = signal(false);
  targetStatus = signal<OrderStatus | undefined>(undefined);

  readonly selectedCount = computed(() => this.selectedOrders().length);

  readonly allVisibleSelected = computed(
    () => this.visibleCount() > 0 && this.selectedCount() === this.visibleCount(),
  );

  readonly selectionLabel = computed(() => {
    const count = this.selectedCount();
    return count === 1 ? '1 order selected' : `${count} orders selected`;
  });

  onApply(): void {
    const status = this.targetStatus();
    const orders = this.selectedOrders();

    if (!status || this.applying() || orders.length === 0) {
      return;
    }

    this.applying.set(true);
    this.orderService.bulkUpdateOrderStatus(orders, status).subscribe({
      next: (response) => {
        this.applying.set(false);

        if (response.updatedCount > 0 && response.failedCount === 0) {
          this.notificationService.showSuccess(
            'Bulk Update Complete',
            `${response.updatedCount} order${response.updatedCount === 1 ? '' : 's'} updated to ${status}`,
          );
        } else if (response.updatedCount > 0 && response.failedCount > 0) {
          const failedIds = response.failed.map((item) => item.orderId).join(', ');
          this.notificationService.showError(
            'Partial Update',
            `${response.updatedCount} updated, ${response.failedCount} failed (${failedIds}). Refresh and retry failed orders.`,
          );
        } else {
          const failedIds = response.failed.map((item) => item.orderId).join(', ');
          this.notificationService.showError(
            'Bulk Update Failed',
            failedIds ? `Could not update: ${failedIds}` : 'Could not update selected orders',
          );
        }

        this.targetStatus.set(undefined);
        this.clearSelection.emit();
        this.bulkUpdated.emit();
      },
      error: (error) => {
        this.applying.set(false);
        const errorMsg = error?.error?.error || 'Could not bulk update orders';
        this.notificationService.showError('Bulk Update Failed', errorMsg);
      },
    });
  }
}
