import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    {
        path: 'login',
        loadComponent: () => import('./core/components/login/login.component').then(m => m.LoginComponent)
    },
    {
        path: 'orders',
        loadComponent: () => import('./feature/order/order-list/order-list.component').then(m => m.OrderListComponent),
        canActivate: [AuthGuard]
    },
    {
        path: '',
        redirectTo: '/orders',
        pathMatch: 'full'
    },
    {
        path: '**',
        redirectTo: '/login'
    }
];
