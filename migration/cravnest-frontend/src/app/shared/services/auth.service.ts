import { Injectable, signal } from '@angular/core';
import { CognitoIdentityProviderClient, InitiateAuthCommand, AuthFlowType } from '@aws-sdk/client-cognito-identity-provider';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private client: CognitoIdentityProviderClient;
  private readonly _isAuthenticated = signal(false);
  public readonly isAuthenticated = this._isAuthenticated.asReadonly();
  private idToken: string | null = null;

  constructor() {
    this.client = new CognitoIdentityProviderClient({ region: environment.aws.region });
    this.checkAuthState();
  }

  async login(username: string, password: string): Promise<void> {
    try {
      const command = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: environment.aws.userPoolClientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password
        }
      });

      const response = await this.client.send(command);

      if (response.AuthenticationResult?.IdToken) {
        this.idToken = response.AuthenticationResult.IdToken;
        localStorage.setItem('idToken', this.idToken);
        this._isAuthenticated.set(true);
      }
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    this.idToken = null;
    localStorage.removeItem('idToken');
    this._isAuthenticated.set(false);
  }

  async getIdToken(): Promise<string | null> {
    return this.idToken;
  }

  private checkAuthState(): void {
    const token = localStorage.getItem('idToken');
    if (token) {
      this.idToken = token;
      this._isAuthenticated.set(true);
    }
  }
}
