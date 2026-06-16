import { Component, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { AuthService } from '../../../shared/services/auth.service';
import { ActivatedRoute } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: true,
  imports: [ButtonModule, CardModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent implements OnInit {
  loading = signal(false);
  error = signal('');
  private returnUrl: string = '/orders';

  constructor(
    private authService: AuthService,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/orders';
    const error = this.route.snapshot.queryParamMap.get('error');
    if (error) {
      this.error.set('Login could not be completed');
    }
  }

  onLogin() {
    this.loading.set(true);
    this.error.set('');
    this.authService.login(this.returnUrl);
  }
}
