import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
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
export class LoginComponent {
  username = signal('');
  password = signal('');
  loading = signal(false);
  error = signal('');

  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  async onLogin() {
    console.log('Username:', this.username(), 'Password:', this.password()); // Debug log
    this.loading.set(true);
    this.error.set('');

    try {
      await this.authService.login(this.username(), this.password());
      this.router.navigate(['/']);
    } catch (error: any) {
      this.error.set(error.message || 'Login failed');
    } finally {
      this.loading.set(false);
    }
  }
}
