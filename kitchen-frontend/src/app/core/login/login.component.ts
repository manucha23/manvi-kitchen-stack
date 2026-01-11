import { Component, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { AuthService } from '../../shared/services/auth.service';
import { Router } from '@angular/router';

import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.sass'],
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, PasswordModule, CardModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent implements OnInit {
  username = signal('');
  password = signal('');
  loading = signal(false);
  error = signal('');
  private returnUrl: string = '/orders';

  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit() {
    // Get return url from session storage or default to '/orders'
    this.returnUrl = sessionStorage.getItem('returnUrl') || '/orders';
  }

  async onLogin() {
    console.log('Username:', this.username(), 'Password:', this.password()); // Debug log
    this.loading.set(true);
    this.error.set('');

    try {
      await this.authService.login(this.username(), this.password());

      // Navigate and then clear session storage
      this.router.navigate([this.returnUrl]);
      sessionStorage.removeItem('returnUrl');
    } catch (error: any) {
      this.error.set(error.message || 'Login failed');
    } finally {
      this.loading.set(false);
    }
  }
}
