import { Component, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from './shared/services/auth.service';
import { Router, RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [RouterOutlet, ButtonModule, CommonModule, ToastModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit {
  title = "Manvi's Kitchen";
  isAuthenticated = this.authService.isAuthenticated;
  isDarkMode = signal<boolean>(false);

  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit() {
    this.initDarkMode();
  }

  initDarkMode() {
    const theme = localStorage.getItem('app-theme');
    const isDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    this.isDarkMode.set(isDark);
    this.updateDarkModeClass(isDark);
  }

  toggleDarkMode() {
    const newMode = !this.isDarkMode();
    this.isDarkMode.set(newMode);
    localStorage.setItem('app-theme', newMode ? 'dark' : 'light');
    this.updateDarkModeClass(newMode);
  }

  private updateDarkModeClass(isDark: boolean) {
    if (isDark) {
      document.documentElement.classList.add('p-dark');
    } else {
      document.documentElement.classList.remove('p-dark');
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
