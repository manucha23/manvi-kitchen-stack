import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBStreamEvent } from 'aws-lambda';

type OrderRecord = Record<string, any>;

interface OrderEvent {
  type: 'ORDER_CREATED' | 'ORDER_STATUS_CHANGED' | 'ORDER_UPDATED';
  orderId: string;
  createdVia?: string;
  status?: string;
  oldStatus?: string;
  newStatus?: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount?: number;
  createdAt?: string;
  updatedAt?: string;
  oldImage?: OrderRecord;
  newImage?: OrderRecord;
}

const snsClient = new SNSClient({});

const getTopicArn = (): string => {
  const topicArn = process.env.ORDER_EVENTS_TOPIC_ARN;
  if (!topicArn) {
    throw new Error('ORDER_EVENTS_TOPIC_ARN is required');
  }
  return topicArn;
};

const unmarshallImage = (image?: Record<string, any>): OrderRecord | undefined =>
  image ? unmarshall(image) : undefined;

const buildOrderEvent = (eventName?: string, oldImage?: OrderRecord, newImage?: OrderRecord): OrderEvent | undefined => {
  const orderId = newImage?.orderId || oldImage?.orderId;
  if (!orderId) {
    return undefined;
  }

  if (eventName === 'INSERT' && newImage) {
    return {
      type: 'ORDER_CREATED',
      orderId,
      createdVia: newImage.createdVia,
      status: newImage.status,
      customerName: newImage.customerName,
      customerPhone: newImage.customerPhone,
      totalAmount: newImage.totalAmount,
      createdAt: newImage.createdAt,
      newImage,
    };
  }

  if (eventName === 'MODIFY' && oldImage && newImage) {
    const oldStatus = oldImage.status;
    const newStatus = newImage.status;
    if (oldStatus !== newStatus) {
      return {
        type: 'ORDER_STATUS_CHANGED',
        orderId,
        createdVia: newImage.createdVia,
        oldStatus,
        newStatus,
        updatedAt: newImage.updatedAt,
        oldImage,
        newImage,
      };
    }

    return {
      type: 'ORDER_UPDATED',
      orderId,
      createdVia: newImage.createdVia,
      status: newStatus,
      updatedAt: newImage.updatedAt,
      oldImage,
      newImage,
    };
  }

  return undefined;
};

const publishOrderEvent = async (event: OrderEvent): Promise<void> => {
  await snsClient.send(new PublishCommand({
    TopicArn: getTopicArn(),
    Subject: event.type,
    Message: JSON.stringify(event),
    MessageAttributes: {
      eventType: {
        DataType: 'String',
        StringValue: event.type,
      },
    },
  }));
};

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  console.log('Routing order stream records', JSON.stringify({ count: event.Records.length }));

  for (const record of event.Records) {
    const oldImage = unmarshallImage(record.dynamodb?.OldImage as Record<string, any> | undefined);
    const newImage = unmarshallImage(record.dynamodb?.NewImage as Record<string, any> | undefined);
    const orderEvent = buildOrderEvent(record.eventName, oldImage, newImage);

    if (!orderEvent) {
      continue;
    }

    await publishOrderEvent(orderEvent);
    console.log('Published order event', JSON.stringify({
      type: orderEvent.type,
      orderId: orderEvent.orderId,
    }));
  }
};
