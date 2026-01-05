import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { OrderListComponent } from './feature/order/order-list/order-list.component';
import { LoginComponent } from './core/login/login.component';
import { AuthInterceptor } from './core/interceptors/auth.interceptor';
import { OrderCreateComponent } from './feature/order/order-create/order-create.component';

@NgModule({
    declarations: [
        AppComponent,
        OrderListComponent,
        LoginComponent,
        OrderCreateComponent
    ],
    bootstrap: [AppComponent], imports: [BrowserModule,
        AppRoutingModule,
        FormsModule], providers: [
            {
                provide: HTTP_INTERCEPTORS,
                useClass: AuthInterceptor,
                multi: true
            },
            provideHttpClient(withInterceptorsFromDi())
        ]
})
export class AppModule { }
