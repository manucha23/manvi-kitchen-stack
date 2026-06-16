import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpErrorResponse,
} from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler) {
    const isApiRequest = req.url.startsWith(environment.apiUrl) || req.url.startsWith(environment.adminApiUrl);
    const authReq = isApiRequest ? req.clone({ withCredentials: true }) : req;

    return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 && !req.url.includes('/auth/session')) {
          this.authService.markLoggedOut();
          this.router.navigate(['/login']);
        }
        return throwError(() => error);
      }),
    );
  }
}
