import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

interface SessionResponse {
  authenticated: boolean;
  loginUrl?: string;
  user?: {
    userSub: string;
    username?: string;
    email?: string;
    groups: string[];
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly _isAuthenticated = signal(false);
  public readonly isAuthenticated = this._isAuthenticated.asReadonly();
  private readonly sessionUrl = `${environment.adminApiUrl}/auth/session`;
  private readonly loginUrl = `${environment.adminApiUrl}/auth/login`;
  private readonly logoutUrl = `${environment.adminApiUrl}/auth/logout`;

  constructor(private http: HttpClient) {}

  async ensureAuthenticated(returnUrl: string): Promise<boolean> {
    try {
      const session = await firstValueFrom(this.http.get<SessionResponse>(this.sessionUrl, {
        withCredentials: true,
        params: { returnTo: returnUrl },
      }));
      this._isAuthenticated.set(Boolean(session.authenticated));
      return Boolean(session.authenticated);
    } catch (error) {
      this._isAuthenticated.set(false);
      const loginUrl = (error as any)?.error?.loginUrl || this.buildLoginUrl(returnUrl);
      window.location.assign(loginUrl);
      return false;
    }
  }

  login(returnUrl = '/orders'): void {
    window.location.assign(this.buildLoginUrl(returnUrl));
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>(this.logoutUrl, {}, { withCredentials: true }));
    } catch (error) {
      console.warn('Logout request failed:', error);
    }
    this._isAuthenticated.set(false);
  }

  markLoggedOut(): void {
    this._isAuthenticated.set(false);
  }

  private buildLoginUrl(returnUrl: string): string {
    const url = new URL(this.loginUrl);
    url.searchParams.set('returnTo', returnUrl);
    return url.toString();
  }
}
