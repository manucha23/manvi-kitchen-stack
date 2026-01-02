import { Injectable } from '@angular/core';
import { CognitoIdentityProviderClient, InitiateAuthCommand, AuthFlowType } from '@aws-sdk/client-cognito-identity-provider';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private client: CognitoIdentityProviderClient;
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  private idToken: string | null = null;

  private readonly clientId = '3maiip2ul9cl0v0h6huq8ngpqq';

  constructor() {
    this.client = new CognitoIdentityProviderClient({ region: 'ap-south-1' });
    this.checkAuthState();
  }

  async login(username: string, password: string): Promise<void> {
    try {
      const command = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: this.clientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password
        }
      });

      const response = await this.client.send(command);
      
      if (response.AuthenticationResult?.IdToken) {
        this.idToken = response.AuthenticationResult.IdToken;
        localStorage.setItem('idToken', this.idToken);
        this.isAuthenticatedSubject.next(true);
      }
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    this.idToken = null;
    localStorage.removeItem('idToken');
    this.isAuthenticatedSubject.next(false);
  }

  async getIdToken(): Promise<string | null> {
    return this.idToken;
  }

  private checkAuthState(): void {
    const token = localStorage.getItem('idToken');
    if (token) {
      this.idToken = token;
      this.isAuthenticatedSubject.next(true);
    }
  }
}
