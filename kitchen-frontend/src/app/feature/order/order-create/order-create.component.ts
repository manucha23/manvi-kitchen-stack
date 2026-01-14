import { Component, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { OrderService } from '../../../shared/services/order.service';

interface OrderItem {
  name: string;
  quantity: number;
  amount: number;
}

interface OrderForm {
  name: string;
  address: string;
  pinCode: number | null;
  instructions: string;
  items: OrderItem[];
}

import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { FluidModule } from 'primeng/fluid';
import { DialogModule } from 'primeng/dialog';

@Component({
  selector: 'app-order-create',
  templateUrl: './order-create.component.html',
  styleUrls: ['./order-create.component.scss'],
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    TextareaModule,
    FluidModule,
    DialogModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderCreateComponent {
  readonly isVisible = input(false);
  readonly orderCreated = output<void>();
  readonly closePopup = output<void>();

  creating = signal(false);

  order = signal<OrderForm>({
    name: '',
    address: '',
    pinCode: null,
    instructions: '',
    items: [{ name: '', quantity: 1, amount: 0 }]
  });

  constructor(private orderService: OrderService) { }

  addItem(): void {
    this.order.update(curr => ({
      ...curr,
      items: [...curr.items, { name: '', quantity: 1, amount: 0 }]
    }));
  }

  removeItem(index: number): void {
    this.order.update(curr => ({
      ...curr,
      items: curr.items.filter((_, i) => i !== index)
    }));
  }

  updateItem(index: number, field: keyof OrderItem, value: any): void {
    this.order.update(curr => {
      const items = [...curr.items];
      items[index] = { ...items[index], [field]: value };
      return { ...curr, items };
    });
  }

  updateOrderField(field: keyof OrderForm, value: any): void {
    this.order.update(curr => ({ ...curr, [field]: value }));
  }

  createOrder(): void {
    this.creating.set(true);
    const orderData = {
      ...this.order(),
      status: 'CREATED'
    };

    this.orderService.createOrder(orderData).subscribe({
      next: () => {
        this.orderCreated.emit();
        this.close();
      },
      error: (error) => {
        console.error('Error creating order:', error);
        this.creating.set(false);
      }
    });
  }

  close(): void {
    this.closePopup.emit();
    this.resetForm();
  }

  resetForm(): void {
    this.order.set({
      name: '',
      address: '',
      pinCode: null,
      instructions: '',
      items: [{ name: '', quantity: 1, amount: 0 }]
    });
    this.creating.set(false);
  }
}