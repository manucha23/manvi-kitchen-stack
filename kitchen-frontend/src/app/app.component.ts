import { Component, ChangeDetectionStrategy, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from './shared/services/auth.service';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { HeaderComponent } from './core/components/header/header.component';
import { SideMenuComponent } from './core/components/side-menu/side-menu.component';
import { SidebarService } from './core/services/sidebar.service';
import { OrderAlertService } from './shared/services/order-alert.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [RouterOutlet, CommonModule, ToastModule, HeaderComponent, SideMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  private authService = inject(AuthService);
  private orderAlertService = inject(OrderAlertService);
  public sidebarService = inject(SidebarService);

  isAuthenticated = this.authService.isAuthenticated;

  constructor() {
    effect(() => {
      if (this.isAuthenticated()) {
        this.orderAlertService.connect();
      } else {
        this.orderAlertService.disconnect();
      }
    });
  }
}
