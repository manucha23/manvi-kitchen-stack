import { Component, inject, OnInit, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DrawerModule } from 'primeng/drawer';
import { RippleModule } from 'primeng/ripple';
import { TooltipModule } from 'primeng/tooltip';
import { SidebarService } from '../../services/sidebar.service';

@Component({
  selector: 'app-side-menu',
  templateUrl: './side-menu.component.html',
  styleUrls: ['./side-menu.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, DrawerModule, RippleModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SideMenuComponent implements OnInit {
  public sidebarService = inject(SidebarService);
  isMobile = false;

  menuItems = [
    {
      label: 'Orders',
      icon: 'pi pi-shopping-cart',
      route: '/orders'
    }
  ];

  ngOnInit() {
    this.checkScreenSize();
  }

  @HostListener('window:resize', [])
  onResize() {
    this.checkScreenSize();
  }

  private checkScreenSize() {
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth < 768;
    
    // Automatically close sidebar when transitioning to mobile
    if (this.isMobile && !wasMobile) {
      this.sidebarService.close();
    } else if (!this.isMobile && wasMobile) {
      // Keep open by default on desktop
      this.sidebarService.open();
    }
  }

  onVisibleChange(visible: boolean) {
    if (visible) {
      this.sidebarService.open();
    } else {
      this.sidebarService.close();
    }
  }

  onMenuItemClick() {
    if (this.isMobile) {
      this.sidebarService.close();
    }
  }
}
