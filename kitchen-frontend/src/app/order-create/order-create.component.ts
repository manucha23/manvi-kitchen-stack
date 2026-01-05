import { Component, EventEmitter, Input, Output } from '@angular/core';
import { OrderService } from '../services/order.service';

@Component({
    selector: 'app-order-create',
    templateUrl: './order-create.component.html',
    styleUrls: ['./order-create.component.sass'],
    standalone: false
})
export class OrderCreateComponent {
  @Input() isVisible = false;
  @Output() orderCreated = new EventEmitter<void>();
  @Output() closePopup = new EventEmitter<void>();

  creating = false;
  order = {
    name: '',
    address: '',
    pinCode: null,
    instructions: '',
    items: [{ name: '', quantity: 1, amount: 0 }]
  };

  constructor(private orderService: OrderService) {}

  addItem(): void {
    this.order.items.push({ name: '', quantity: 1, amount: 0 });
  }

  removeItem(index: number): void {
    this.order.items.splice(index, 1);
  }

  createOrder(): void {
    this.creating = true;
    const orderData = {
      ...this.order,
      status: 'CREATED'
    };
    
    this.orderService.createOrder(orderData).subscribe({
      next: () => {
        this.orderCreated.emit();
        this.close();
      },
      error: (error) => {
        console.error('Error creating order:', error);
        this.creating = false;
      }
    });
  }

  close(): void {
    this.closePopup.emit();
    this.resetForm();
  }

  resetForm(): void {
    this.order = {
      name: '',
      address: '',
      pinCode: null,
      instructions: '',
      items: [{ name: '', quantity: 1, amount: 0 }]
    };
    this.creating = false;
  }
}