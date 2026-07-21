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

interface LogoutResponse {
  logoutUrl?: string;
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
    const absoluteReturnUrl = new URL(returnUrl, window.location.origin).toString();
    try {
      const session = await firstValueFrom(this.http.get<SessionResponse>(this.sessionUrl, {
        withCredentials: true,
        params: { returnTo: absoluteReturnUrl },
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
    let logoutUrl: string | undefined;
    try {
      const response = await firstValueFrom(this.http.post<LogoutResponse>(this.logoutUrl, {}, { withCredentials: true }));
      logoutUrl = response.logoutUrl;
    } catch (error) {
      console.warn('Logout request failed:', error);
    }
    this._isAuthenticated.set(false);
    window.location.assign(logoutUrl || this.buildLoggedOutUrl());
  }

  markLoggedOut(): void {
    this._isAuthenticated.set(false);
  }

  private buildLoginUrl(returnUrl: string): string {
    const url = new URL(this.loginUrl);
    const absoluteReturnUrl = new URL(returnUrl, window.location.origin).toString();
    url.searchParams.set('returnTo', absoluteReturnUrl);
    return url.toString();
  }

  private buildLoggedOutUrl(): string {
    const loggedOutUrl = new URL('/login', window.location.origin);
    loggedOutUrl.searchParams.set('loggedOut', 'true');
    return loggedOutUrl.toString();
  }
}
