import { Component } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.sass']
})
export class LoginComponent {
  username = '';
  password = '';
  loading = false;
  error = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  async onLogin() {
    console.log('Username:', this.username, 'Password:', this.password); // Debug log
    this.loading = true;
    this.error = '';
    
    try {
      await this.authService.login(this.username, this.password);
      this.router.navigate(['/']);
    } catch (error: any) {
      this.error = error.message || 'Login failed';
    } finally {
      this.loading = false;
    }
  }
}
