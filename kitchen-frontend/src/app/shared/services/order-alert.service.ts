import { Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { OrderService } from './order.service';
import { Order, OrderCreatedVia, OrderStatus } from '../models/order';
import { environment } from '../../../environments/environment';

type OrderAlertMessage =
  | {
      type: 'NEW_ORDER_ALERT';
      orderId: string;
      createdVia?: OrderCreatedVia;
      customerName?: string;
      customerPhone?: string;
      totalAmount?: number;
      createdAt?: string;
    }
  | {
      type: 'ORDER_ALERT_RESOLVED';
      orderId: string;
      oldStatus?: string;
      newStatus?: string;
      updatedAt?: string;
    };

interface ActiveOrderAlert {
  orderId: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount?: number;
  createdAt?: string;
}

@Injectable({
  providedIn: 'root',
})
export class OrderAlertService {
  private socket?: WebSocket;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private buzzerTimer?: ReturnType<typeof setInterval>;
  private audioContext?: AudioContext;
  private shouldReconnect = false;

  private _activeAlerts = signal<ActiveOrderAlert[]>([]);
  public readonly activeAlerts = this._activeAlerts.asReadonly();

  constructor(
    private authService: AuthService,
    private notificationService: NotificationService,
    private orderService: OrderService,
  ) {}

  async connect(): Promise<void> {
    if (!environment.websocketUrl || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const token = await this.authService.getIdToken();
    if (!token) {
      return;
    }

    this.shouldReconnect = true;
    this.recoverCreatedAlerts();
    const separator = environment.websocketUrl.includes('?') ? '&' : '?';
    this.socket = new WebSocket(`${environment.websocketUrl}${separator}token=${encodeURIComponent(token)}`);

    this.socket.onopen = () => {
      this.startHeartbeat();
      this.recoverCreatedAlerts();
    };
    this.socket.onmessage = (event) => this.handleMessage(event);
    this.socket.onclose = () => {
      this.stopHeartbeat();
      this.scheduleReconnect();
    };
    this.socket.onerror = () => this.socket?.close();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = undefined;
    this._activeAlerts.set([]);
    this.stopBuzzer();
  }

  private scheduleReconnect(): void {
    this.socket = undefined;
    if (!this.shouldReconnect || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, 3000);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({
          action: 'heartbeat',
          sentAt: new Date().toISOString(),
        }));
      }
    }, 5 * 60 * 1000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as OrderAlertMessage;
      if (message.type === 'NEW_ORDER_ALERT') {
        this.addAlert(message);
      } else if (message.type === 'ORDER_ALERT_RESOLVED') {
        this.resolveAlert(message.orderId);
      }
    } catch (error) {
      console.error('Unable to parse order alert message', error);
    }
  }

  private recoverCreatedAlerts(): void {
    this.orderService.fetchOrders({ orderStatus: [OrderStatus.CREATED] }).subscribe({
      next: (orders) => {
        const alerts = orders
          .filter((order) => order.createdVia !== OrderCreatedVia.ADMIN)
          .map((order) => this.toActiveAlert(order));
        this._activeAlerts.set(alerts);
        this.syncBuzzer();
      },
      error: (error) => console.error('Unable to recover created order alerts', error),
    });
  }

  private addAlert(message: Extract<OrderAlertMessage, { type: 'NEW_ORDER_ALERT' }>): void {
    this._activeAlerts.update((alerts) => {
      if (alerts.some((alert) => alert.orderId === message.orderId)) {
        return alerts;
      }

      return [
        {
          orderId: message.orderId,
          customerName: message.customerName,
          customerPhone: message.customerPhone,
          totalAmount: message.totalAmount,
          createdAt: message.createdAt,
        },
        ...alerts,
      ];
    });

    this.notificationService.showWarn(
      'New Order',
      `Order ${message.orderId} needs confirmation`,
    );
    this.orderService.loadOrders({ orderStatus: [OrderStatus.CREATED] });
    this.syncBuzzer();
  }

  private resolveAlert(orderId: string): void {
    this._activeAlerts.update((alerts) => alerts.filter((alert) => alert.orderId !== orderId));
    this.syncBuzzer();
  }

  private toActiveAlert(order: Order): ActiveOrderAlert {
    return {
      orderId: order.orderId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      totalAmount: order.totalAmount,
      createdAt: order.timestamp || order.updatedAt,
    };
  }

  private syncBuzzer(): void {
    if (this._activeAlerts().length > 0) {
      this.startBuzzer();
    } else {
      this.stopBuzzer();
    }
  }

  private startBuzzer(): void {
    if (this.buzzerTimer) {
      return;
    }

    this.playBeep();
    this.buzzerTimer = setInterval(() => this.playBeep(), 2500);
  }

  private stopBuzzer(): void {
    if (this.buzzerTimer) {
      clearInterval(this.buzzerTimer);
      this.buzzerTimer = undefined;
    }
  }

  private playBeep(): void {
    try {
      const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextConstructor) {
        return;
      }

      this.audioContext = this.audioContext || new AudioContextConstructor();
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(this.audioContext.destination);
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.35);
    } catch (error) {
      console.warn('Order alert audio could not play', error);
    }
  }
}
