import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MenuItem } from '../models/items';

@Injectable({
  providedIn: 'root',
})
export class MenuItemsService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/items`;

  getItems(): Observable<{ items: MenuItem[] }> {
    return this.http.get<{ items: MenuItem[] }>(this.apiUrl);
  }
}
