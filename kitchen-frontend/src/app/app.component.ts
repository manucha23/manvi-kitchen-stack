import { Component, OnInit } from '@angular/core';
import { AuthService } from './shared/services/auth.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.sass'],
  standalone: false
})
export class AppComponent implements OnInit {
  title = "Manvi's Kitchen";
  isAuthenticated$: Observable<boolean>;

  constructor(private authService: AuthService) {
    this.isAuthenticated$ = this.authService.isAuthenticated$;
  }

  ngOnInit() { }

  logout() {
    this.authService.logout();
  }
}
