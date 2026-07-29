import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { EmailContent, Order } from '../types';
import { escapeHtml, formatCurrency, formatDateTime, sanitizeHeader, wrapBase64 } from '../utils/formatting';

export class SesEmailService {
  private sesClient: SESv2Client;

  constructor(sesClient?: SESv2Client) {
    this.sesClient = sesClient || new SESv2Client({});
  }

  public buildEmailContent(order: Order): EmailContent {
    const subject = `Your Cravnest Tax Invoice for Order #${order.orderId}`;
    const itemsHtml = order.items
      .map(
        (item) => `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${escapeHtml(item.name)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: center;">${item.quantity}</td>
            <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(item.price)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(item.amount)}</td>
          </tr>
        `,
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body style="font-family: Arial, sans-serif; color: #111827; background-color: #F9FAFB; padding: 20px;">
          <div style="max-width: 640px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E5E7EB; padding: 32px;">
            <h2 style="margin-top: 0; color: #111827;">Thank you for ordering with Cravnest!</h2>
            <p>Hi ${escapeHtml(order.customerName)},</p>
            <p>Your order <strong>#${escapeHtml(order.orderId)}</strong> has been delivered. Please find your official tax invoice attached as a PDF.</p>
            
            <div style="background: #F3F4F6; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0 0 8px 0;"><strong>Delivered At:</strong> ${escapeHtml(formatDateTime(order.updatedAt))}</p>
              <p style="margin: 0 0 8px 0;"><strong>Payment Method:</strong> ${escapeHtml(order.paymentMethod || 'COD')}</p>
              <p style="margin: 0;"><strong>Payment Status:</strong> ${escapeHtml(order.paymentStatus || 'COMPLETED')}</p>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              <thead>
                <tr style="background: #F3F4F6; text-align: left;">
                  <th style="padding: 10px;">Item</th>
                  <th style="padding: 10px; text-align: center;">Qty</th>
                  <th style="padding: 10px; text-align: right;">Price</th>
                  <th style="padding: 10px; text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div style="text-align: right; margin-top: 20px; font-size: 18px; font-weight: bold;">
              Total Paid: ${formatCurrency(order.totalAmount)}
            </div>

            <hr style="border: 0; border-top: 1px solid #E5E7EB; margin: 30px 0;">
            <p style="font-size: 12px; color: #6B7280; text-align: center;">
              Cravnest by Manvi Kitchen &bull; Bhavdhan, Pune &bull; Support: support@cravnest.in
            </p>
          </div>
        </body>
      </html>
    `;

    const itemsText = order.items
      .map((item) => `- ${item.quantity} x ${item.name} = ${formatCurrency(item.amount)}`)
      .join('\n');

    const text = `
Thank you for ordering with Cravnest!

Hi ${order.customerName},

Your order #${order.orderId} has been delivered. Please find your official tax invoice attached as a PDF.

Order Summary:
Order ID: ${order.orderId}
Delivered At: ${formatDateTime(order.updatedAt)}
Payment Method: ${order.paymentMethod || 'COD'}
Payment Status: ${order.paymentStatus || 'COMPLETED'}

Items:
${itemsText}

Total Paid: ${formatCurrency(order.totalAmount)}

Support: support@cravnest.in
    `.trim();

    return { subject, html, text };
  }

  public buildRawEmailMessage(
    senderEmail: string,
    recipientEmail: string,
    order: Order,
    pdfBuffer: Buffer,
    pdfFilename: string
  ): string {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const emailContent = this.buildEmailContent(order);

    const headers = [
      `From: ${sanitizeHeader(senderEmail)}`,
      `To: ${sanitizeHeader(recipientEmail)}`,
      `Subject: ${sanitizeHeader(emailContent.subject)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ];

    const bodyParts = [
      `--${boundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      emailContent.text,
      '',
      `--${altBoundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      emailContent.html,
      '',
      `--${altBoundary}--`,
      '',
      `--${boundary}`,
      'Content-Type: application/pdf',
      `Content-Disposition: attachment; filename="${sanitizeHeader(pdfFilename)}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(pdfBuffer.toString('base64')),
      '',
      `--${boundary}--`,
    ];

    return `${headers.join('\r\n')}\r\n\r\n${bodyParts.join('\r\n')}`;
  }

  public async sendInvoiceEmail(
    senderEmail: string,
    recipientEmail: string,
    order: Order,
    pdfBuffer: Buffer,
    pdfFilename: string
  ): Promise<void> {
    const rawMessage = this.buildRawEmailMessage(senderEmail, recipientEmail, order, pdfBuffer, pdfFilename);

    await this.sesClient.send(
      new SendEmailCommand({
        Content: {
          Raw: {
            Data: Buffer.from(rawMessage, 'utf8'),
          },
        },
      })
    );
  }
}
