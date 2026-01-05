import { Component, signal } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.sass'],
  standalone: false
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
