import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

export const AuthGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.isAuthenticated()) {
        return true;
    }

    // Store return URL in session storage
    sessionStorage.setItem('returnUrl', state.url);

    // Redirect to login page
    router.navigate(['/login']);
    return false;
};
