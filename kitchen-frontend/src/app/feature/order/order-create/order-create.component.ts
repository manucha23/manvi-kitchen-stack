import { Component, input, output } from '@angular/core';
import { OrderService } from '../../../shared/services/order.service';

@Component({
  selector: 'app-order-create',
  templateUrl: './order-create.component.html',
  styleUrls: ['./order-create.component.sass'],
  standalone: false
})
export class OrderCreateComponent {
  readonly isVisible = input(false);
  readonly orderCreated = output<void>();
  readonly closePopup = output<void>();

  creating = false;
  order = {
    name: '',
    address: '',
    pinCode: null,
    instructions: '',
    items: [{ name: '', quantity: 1, amount: 0 }]
  };

  constructor(private orderService: OrderService) { }

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
        // TODO: The 'emit' function requires a mandatory void argument
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
    // TODO: The 'emit' function requires a mandatory void argument
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