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
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { Order, OrderStatus } from '../../../../shared/models/order';
import { OrderStatusOption } from '../order-list.types';

@Component({
  selector: 'app-order-list-mobile',
  standalone: true,
  imports: [CommonModule, FormsModule, TagModule, SelectModule, SkeletonModule],
  templateUrl: './order-list-mobile.component.html',
  styleUrl: './order-list-mobile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderListMobileComponent implements OnDestroy {
  orders = input.required<Order[]>();
  loading = input.required<boolean>();
  hasMore = input.required<boolean>();
  statusOptions = input.required<OrderStatusOption[]>();
  loadingPlaceholders = input.required<Order[]>();

  auditClick = output<{ orderId: string; event: Event }>();
  statusChange = output<{ orderId: string; status: OrderStatus }>();
  loadMoreRequest = output<void>();

  @ViewChild('listContainer') listContainer?: ElementRef<HTMLElement>;

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
      {
        root: element.nativeElement.closest('.mobile-order-list'),
        rootMargin: '0px 0px 240px',
      },
    );
    this.loadObserver.observe(element.nativeElement);
  }

  private loadObserver?: IntersectionObserver;

  ngOnDestroy(): void {
    this.loadObserver?.disconnect();
  }

  scrollToTop(): void {
    this.listContainer?.nativeElement.scrollTo({ top: 0 });
  }

  onAuditClick(orderId: string, event: Event): void {
    event.preventDefault();
    this.auditClick.emit({ orderId, event });
  }

  onStatusChange(orderId: string, status: OrderStatus): void {
    this.statusChange.emit({ orderId, status });
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
