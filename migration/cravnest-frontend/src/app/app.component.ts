import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { AuthService } from './shared/services/auth.service';
import { Observable } from 'rxjs';

import { LoginComponent } from './core/login/login.component';
import { OrderListComponent } from './feature/order/order-list/order-list.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.sass'],
  standalone: true,
  imports: [LoginComponent, OrderListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit {
  title = "Manvi's Kitchen";
  isAuthenticated = this.authService.isAuthenticated;

  constructor(private authService: AuthService) { }

  ngOnInit() { }

  logout() {
    this.authService.logout();
  }
}
