import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { SidebarService } from '../../services/sidebar.service';
import { AuthService } from '../../../shared/services/auth.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone: true,
  imports: [CommonModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent implements OnInit {
  public sidebarService = inject(SidebarService);
  private authService = inject(AuthService);

  title = "Manvi's Kitchen";
  isDarkMode = signal<boolean>(false);

  ngOnInit() {
    this.initDarkMode();
  }

  initDarkMode() {
    const theme = localStorage.getItem('app-theme');
    const isDark =
      theme === 'dark' ||
      (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
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

  toggleSidebar() {
    this.sidebarService.toggle();
  }

  async logout() {
    await this.authService.logout();
  }
}
