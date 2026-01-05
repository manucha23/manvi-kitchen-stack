/// <reference types="jasmine" />
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { OrderCreateComponent } from './order-create.component';
import { OrderService } from '../../../shared/services/order.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('OrderCreateComponent', () => {
  let component: OrderCreateComponent;
  let fixture: ComponentFixture<OrderCreateComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [OrderCreateComponent],
      imports: [FormsModule],
      providers: [OrderService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
    });
    fixture = TestBed.createComponent(OrderCreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});