import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { AuthService } from './shared/services/auth.service';
import { Router, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.sass'],
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit {
  title = "Manvi's Kitchen";
  isAuthenticated = this.authService.isAuthenticated;

  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit() { }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
