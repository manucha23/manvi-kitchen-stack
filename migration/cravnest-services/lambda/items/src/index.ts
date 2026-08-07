import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createErrorResponse } from './utils';
import { listItems } from './list-items';
import { getItem } from './get-item';
import { createItem } from './create-item';
import { updateItem } from './update-item';
import { deleteItem } from './delete-item';
import { generateUploadUrl } from './generate-upload-url';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { httpMethod, pathParameters, path } = event;
    const itemId = pathParameters?.itemId;

    // Handle image upload URL generation
    if (path === '/admin/items/upload-url' && httpMethod === 'POST') {
      return generateUploadUrl(event);
    }

    switch (httpMethod) {
      case 'GET':
        return itemId ? getItem(itemId) : listItems(event);
      case 'POST':
        return createItem(event);
      case 'PUT':
        return updateItem(itemId!, event);
      case 'DELETE':
        return deleteItem(itemId!, event);
      default:
        return createErrorResponse(405, 'Method Not Allowed');
    }
  } catch (error) {
    console.error('Error:', error);
    return createErrorResponse(500, 'Internal Server Error');
  }
};
