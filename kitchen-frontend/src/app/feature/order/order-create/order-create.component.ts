import {
  Component,
  OnInit,
  inject,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { OrderService } from '../../../shared/services/order.service';
import { MenuItemsService } from '../../../shared/services/menu-items.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { FluidModule } from 'primeng/fluid';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { CommonModule } from '@angular/common';
import { MenuItem } from 'src/app/shared/models/items';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';

interface DeliveryPromise {
  label: string;
}

@Component({
  selector: 'app-order-create',
  templateUrl: './order-create.component.html',
  styleUrls: ['./order-create.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    FluidModule,
    DialogModule,
    SelectModule,
    IconField,
    InputIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderCreateComponent implements OnInit {
  readonly isVisible = input(false);
  readonly orderCreated = output<void>();
  readonly closePopup = output<void>();

  creating = signal(false);
  menuItems = signal<MenuItem[]>([]);
  deliveryPromise = signal<DeliveryPromise>(this.calculateDeliveryPromise());

  private fb = inject(FormBuilder);
  private orderService = inject(OrderService);
  private menuItemsService = inject(MenuItemsService);
  private notificationService = inject(NotificationService);

  orderForm: FormGroup = this.fb.group({
    customerName: ['', Validators.required],
    deliveryAddress: ['', Validators.required],
    customerPhone: [
      '',
      [Validators.required, Validators.pattern(/^\+?[\d\s-]{10,}$/)],
    ],
    instructions: [''],
    items: this.fb.array([]),
  });

  get items(): FormArray {
    return this.orderForm.get('items') as FormArray;
  }

  ngOnInit(): void {
    this.fetchMenuItems();
    this.addItem();
  }

  private calculateDeliveryPromise(now = new Date()): DeliveryPromise {
    return {
      label: new Date(now.getTime() + 60 * 60 * 1000).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    };
  }

  fetchMenuItems(): void {
    this.menuItemsService.getItems().subscribe({
      next: (response) => this.menuItems.set(response.items),
      error: (err) => console.error('Error fetching menu items', err),
    });
  }

  addItem(): void {
    const itemGroup = this.fb.group({
      selectedItem: [null, Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
    });
    this.items.push(itemGroup);
  }

  calculateRowAmount(index: number): number {
    const group = this.items.at(index);
    const selectedItem = group.get('selectedItem')?.value as MenuItem;
    const quantity = group.get('quantity')?.value || 0;
    return selectedItem ? selectedItem.price * quantity : 0;
  }

  getAvailableItems(index: number): MenuItem[] {
    const allItems = this.menuItems();
    const selectedIds = this.items.controls
      .map((ctrl, i) =>
        i !== index
          ? (ctrl.get('selectedItem')?.value as MenuItem)?.itemId
          : null,
      )
      .filter((id) => !!id);

    return allItems.filter((item) => !selectedIds.includes(item.itemId));
  }

  removeItem(index: number): void {
    this.items.removeAt(index);
  }

  onItemSelected(index: number, event: any): void {
    // No longer need to manually patch name/amount as they are derived from selectedItem
  }

  createOrder(): void {
    if (this.orderForm.invalid) {
      this.notificationService.showError(
        'Invalid Form',
        'Please fill in all required fields correctly',
      );
      return;
    }

    this.creating.set(true);
    const formValue = this.orderForm.getRawValue();
    this.deliveryPromise.set(this.calculateDeliveryPromise());

    // Transform data to match API request body
    const orderData = {
      customerName: formValue.customerName,
      deliveryAddress: formValue.deliveryAddress,
      customerPhone: formValue.customerPhone,
      paymentMethod: 'COD',
      createdVia: 'ADMIN',
      instructions: formValue.instructions,
      items: formValue.items.map((item: any) => ({
        id: item.selectedItem.itemId,
        quantity: item.quantity,
      })),
    };

    this.orderService.createOrder(orderData).subscribe({
      next: () => {
        this.notificationService.showSuccess(
          'Success',
          'Order created successfully',
        );
        this.orderCreated.emit();
        this.close();
      },
      error: (error) => {
        const errorMsg =
          error?.error?.error ||
          error?.error?.message ||
          'Failed to create order';
        this.notificationService.showError('Error', errorMsg);
        this.creating.set(false);
      },
    });
  }

  close(): void {
    this.closePopup.emit();
    this.resetForm();
  }

  resetForm(): void {
    this.orderForm.reset({
      customerName: '',
      deliveryAddress: '',
      customerPhone: '',
      instructions: '',
      items: [],
    });
    this.deliveryPromise.set(this.calculateDeliveryPromise());
    this.items.clear();
    this.addItem();
    this.creating.set(false);
  }
}
