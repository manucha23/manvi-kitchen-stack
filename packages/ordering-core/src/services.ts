import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import {
  Address,
  Cart,
  CartEvent,
  CartEventType,
  CartItem,
  CartStatus,
  Channel,
  CreateOrderPayload,
  CustomerProfile,
  MenuItem,
} from './types';
import {
  ACTIVE_ABANDON_MINUTES,
  CHECKOUT_ABANDON_MINUTES,
  buildCustomerId,
  getRetentionExpiresAt,
  isTownshipAddress,
  normalizePhoneNumber,
  stableEventId,
} from './utils';

export interface OrderingCoreConfig {
  customerTableName: string;
  cartTableName: string;
  cartEventTableName: string;
  itemTableName: string;
  orderLimitsConfigTableName: string;
}

export interface OrderingCoreDeps {
  docClient?: DynamoDBDocumentClient;
  now?: () => Date;
  idGenerator?: () => string;
}

export class OrderingCore {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  constructor(
    private readonly config: OrderingCoreConfig,
    deps: OrderingCoreDeps = {},
  ) {
    this.docClient = deps.docClient || DynamoDBDocumentClient.from(new DynamoDBClient({}));
    this.now = deps.now || (() => new Date());
    this.idGenerator = deps.idGenerator || uuidv4;
  }

  async getOrCreateCustomer(phoneNumber: string, firstName?: string): Promise<CustomerProfile> {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const result = await this.docClient.send(new GetCommand({
      TableName: this.config.customerTableName,
      Key: { phoneNumber: normalizedPhone },
    }));

    const now = this.now().toISOString();
    if (result.Item) {
      const existing = result.Item as CustomerProfile;
      const updated: CustomerProfile = {
        ...existing,
        firstName: existing.firstName || firstName,
        updatedAt: now,
      };
      if (!existing.firstName && firstName) {
        await this.docClient.send(new PutCommand({
          TableName: this.config.customerTableName,
          Item: updated,
        }));
      }
      return updated;
    }

    const customer: CustomerProfile = {
      phoneNumber: normalizedPhone,
      customerId: buildCustomerId(normalizedPhone),
      firstName,
      createdAt: now,
      updatedAt: now,
    };

    await this.docClient.send(new PutCommand({
      TableName: this.config.customerTableName,
      Item: customer,
    }));

    return customer;
  }

  async saveCustomerAddress(phoneNumber: string, addressText: string): Promise<CustomerProfile> {
    const customer = await this.getOrCreateCustomer(phoneNumber);
    const now = this.now().toISOString();
    const address: Address = {
      addressId: customer.savedAddress?.addressId || this.idGenerator(),
      text: addressText,
      deliveryArea: isTownshipAddress(addressText) ? 'TOWNSHIP' : 'OUTSIDE',
      createdAt: customer.savedAddress?.createdAt || now,
      updatedAt: now,
    };

    const updated: CustomerProfile = {
      ...customer,
      savedAddress: address,
      updatedAt: now,
    };

    await this.docClient.send(new PutCommand({
      TableName: this.config.customerTableName,
      Item: updated,
    }));

    return updated;
  }

  async getAvailableMenu(): Promise<MenuItem[]> {
    const [itemsResult, configsResult] = await Promise.all([
      this.docClient.send(new ScanCommand({ TableName: this.config.itemTableName })),
      this.docClient.send(new ScanCommand({ TableName: this.config.orderLimitsConfigTableName })),
    ]);

    const configByItemId = new Map((configsResult.Items || []).map((config) => [String(config.itemId), config]));
    const globalConfig = configByItemId.get('GLOBAL');
    const kitchenOpen = globalConfig?.globalKillswitch !== true && globalConfig?.isAcceptingOrders !== false;

    return ((itemsResult.Items || []) as Record<string, unknown>[])
      .map((item) => {
        const itemConfig = configByItemId.get(String(item.itemId)) || {};
        const price = typeof item.price === 'number' ? item.price : Number(item.price);
        return {
          itemId: String(item.itemId),
          name: String(item.name || 'Unnamed item'),
          description: typeof item.description === 'string' ? item.description : undefined,
          category: typeof item.category === 'string' ? item.category : 'Menu',
          price: Number.isFinite(price) ? price : 0,
          available: kitchenOpen && item.available !== false && itemConfig.isAcceptingOrders !== false,
        };
      })
      .filter((item) => item.available && item.price > 0)
      .sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
  }

  async isKitchenOpen(): Promise<boolean> {
    const configsResult = await this.docClient.send(new ScanCommand({
      TableName: this.config.orderLimitsConfigTableName,
    }));
    const globalConfig = (configsResult.Items || []).find((item) => item.itemId === 'GLOBAL');
    return globalConfig?.globalKillswitch !== true && globalConfig?.isAcceptingOrders !== false;
  }

  async getActiveCart(phoneNumber: string, channel: Channel): Promise<Cart | undefined> {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const result = await this.docClient.send(new QueryCommand({
      TableName: this.config.cartTableName,
      IndexName: 'phoneNumber-status-updatedAt-index',
      KeyConditionExpression: 'phoneNumber = :phoneNumber',
      FilterExpression: '#channel = :channel AND #status IN (:active, :checkout)',
      ExpressionAttributeNames: {
        '#channel': 'channel',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':phoneNumber': normalizedPhone,
        ':channel': channel,
        ':active': 'ACTIVE',
        ':checkout': 'CHECKOUT_STARTED',
      },
      ScanIndexForward: false,
      Limit: 10,
    }));

    return result.Items?.[0] as Cart | undefined;
  }

  async getOrCreateCart(phoneNumber: string, channel: Channel, firstName?: string): Promise<Cart> {
    const customer = await this.getOrCreateCustomer(phoneNumber, firstName);
    const activeCart = await this.getActiveCart(phoneNumber, channel);
    if (activeCart) {
      return activeCart;
    }

    const now = this.now();
    const nowIso = now.toISOString();
    const cart: Cart = {
      cartId: this.idGenerator(),
      customerId: customer.customerId,
      phoneNumber: customer.phoneNumber,
      channel,
      status: 'ACTIVE',
      items: [],
      totalAmount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastInteractionAt: nowIso,
      expiresAt: getRetentionExpiresAt(now),
    };

    await this.docClient.send(new PutCommand({
      TableName: this.config.cartTableName,
      Item: cart,
    }));
    await this.recordCartEvent(cart, 'CART_CREATED');

    return cart;
  }

  async addItemToCart(cart: Cart, menuItem: MenuItem, quantity: number): Promise<Cart> {
    const safeQuantity = Math.max(1, Math.min(10, Math.trunc(quantity)));
    const existing = cart.items.find((item) => item.itemId === menuItem.itemId);
    const items = existing
      ? cart.items.map((item) => item.itemId === menuItem.itemId
        ? this.toCartItem(menuItem, item.quantity + safeQuantity)
        : item)
      : [...cart.items, this.toCartItem(menuItem, safeQuantity)];

    const updated = await this.saveCart({
      ...cart,
      status: 'ACTIVE',
      items,
      totalAmount: this.calculateTotal(items),
      lastInteractionAt: this.now().toISOString(),
    });

    await this.recordCartEvent(updated, 'ITEM_ADDED', {
      itemId: menuItem.itemId,
      quantity: safeQuantity,
    });

    return updated;
  }

  async saveSpecialRequest(cart: Cart, specialRequest?: string): Promise<Cart> {
    const updated = await this.saveCart({
      ...cart,
      specialRequest: specialRequest?.trim() || undefined,
      lastInteractionAt: this.now().toISOString(),
    });

    if (updated.specialRequest) {
      await this.recordCartEvent(updated, 'SPECIAL_REQUEST_ADDED');
    }

    return updated;
  }

  async startCheckout(cart: Cart): Promise<Cart> {
    const now = this.now().toISOString();
    const updated = await this.saveCart({
      ...cart,
      status: 'CHECKOUT_STARTED',
      checkoutStartedAt: cart.checkoutStartedAt || now,
      lastInteractionAt: now,
    });
    await this.recordCartEvent(updated, 'CHECKOUT_STARTED');
    return updated;
  }

  async saveDeliveryAddress(cart: Cart, addressText: string): Promise<Cart> {
    const customer = await this.saveCustomerAddress(cart.phoneNumber, addressText);
    const updated = await this.saveCart({
      ...cart,
      deliveryAddress: customer.savedAddress,
      lastInteractionAt: this.now().toISOString(),
    });
    await this.recordCartEvent(updated, 'ADDRESS_ADDED');
    return updated;
  }

  async convertCart(cart: Cart, orderId: string): Promise<Cart> {
    const now = this.now().toISOString();
    const updated = await this.saveCart({
      ...cart,
      status: 'CONVERTED',
      orderId,
      convertedAt: now,
      lastInteractionAt: now,
    });
    await this.recordCartEvent(updated, 'ORDER_CREATED', { orderId });
    return updated;
  }

  async cancelCart(cart: Cart): Promise<Cart> {
    return this.saveCart({
      ...cart,
      status: 'CANCELLED',
      lastInteractionAt: this.now().toISOString(),
    });
  }

  buildCodOrderPayload(cart: Cart, customerName: string): CreateOrderPayload {
    if (!cart.deliveryAddress?.text) {
      throw new Error('Delivery address is required before order creation');
    }
    if (!cart.items.length) {
      throw new Error('Cart must contain at least one item before order creation');
    }
    if (cart.deliveryAddress.deliveryArea !== 'TOWNSHIP') {
      throw new Error('Only township delivery is supported in v1');
    }

    return {
      customerName,
      customerPhone: cart.phoneNumber,
      deliveryAddress: cart.deliveryAddress.text,
      paymentMethod: 'COD',
      items: cart.items.map((item) => ({ id: item.itemId, quantity: item.quantity })),
      instructions: cart.specialRequest,
      sourceCartId: cart.cartId,
    };
  }

  async markAbandonedCarts(): Promise<{ abandonedCount: number }> {
    const now = this.now();
    const activeCutoff = new Date(now.getTime() - ACTIVE_ABANDON_MINUTES * 60 * 1000).toISOString();
    const checkoutCutoff = new Date(now.getTime() - CHECKOUT_ABANDON_MINUTES * 60 * 1000).toISOString();
    let abandonedCount = 0;

    for (const status of ['ACTIVE', 'CHECKOUT_STARTED'] as CartStatus[]) {
      const cutoff = status === 'ACTIVE' ? activeCutoff : checkoutCutoff;
      const result = await this.docClient.send(new QueryCommand({
        TableName: this.config.cartTableName,
        IndexName: 'status-updatedAt-index',
        KeyConditionExpression: '#status = :status AND updatedAt < :cutoff',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': status,
          ':cutoff': cutoff,
        },
      }));

      for (const cart of (result.Items || []) as Cart[]) {
        const updated = await this.saveCart({
          ...cart,
          status: 'ABANDONED',
          abandonedAt: now.toISOString(),
        });
        await this.recordCartEvent(updated, 'CART_ABANDONED');
        abandonedCount += 1;
      }
    }

    return { abandonedCount };
  }

  async recordCartEvent(
    cart: Cart,
    eventType: CartEventType,
    metadata?: Record<string, unknown>,
  ): Promise<CartEvent> {
    const now = this.now();
    const createdAt = now.toISOString();
    const event: CartEvent = {
      cartId: cart.cartId,
      eventId: stableEventId(cart.cartId, eventType, createdAt),
      eventType,
      customerId: cart.customerId,
      phoneNumber: cart.phoneNumber,
      channel: cart.channel,
      createdAt,
      expiresAt: getRetentionExpiresAt(now),
      metadata,
    };

    await this.docClient.send(new PutCommand({
      TableName: this.config.cartEventTableName,
      Item: event,
    }));

    return event;
  }

  private async saveCart(cart: Cart): Promise<Cart> {
    const now = this.now();
    const updated: Cart = {
      ...cart,
      totalAmount: this.calculateTotal(cart.items),
      updatedAt: now.toISOString(),
      expiresAt: getRetentionExpiresAt(now),
    };
    await this.docClient.send(new PutCommand({
      TableName: this.config.cartTableName,
      Item: updated,
    }));
    return updated;
  }

  private toCartItem(menuItem: MenuItem, quantity: number): CartItem {
    return {
      itemId: menuItem.itemId,
      name: menuItem.name,
      price: menuItem.price,
      quantity,
      amount: menuItem.price * quantity,
    };
  }

  private calculateTotal(items: CartItem[]): number {
    return items.reduce((total, item) => total + item.price * item.quantity, 0);
  }
}
