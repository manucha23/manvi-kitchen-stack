import { randomUUID } from 'crypto';
import { Order } from '../types';
import { escapePdfText, formatCurrency, formatDateTime, wrapText } from '../utils/formatting';

export class PdfGeneratorService {
  public buildInvoiceS3Key(_order?: Order): string {
    return `invoices/${randomUUID()}.pdf`;
  }

  public buildInvoicePdf(order: Order, generatedAt = new Date()): Buffer {
    const lines: string[] = [
      'Cravnest by Manvi Kitchen',
      'Tax Invoice',
      `Invoice Date: ${formatDateTime(generatedAt.toISOString())}`,
      `Order ID: ${order.orderId}`,
      `Customer: ${order.customerName}`,
      `Phone: ${order.customerPhone}`,
      `Delivered At: ${formatDateTime(order.updatedAt)}`,
      `Promised Delivery: ${formatDateTime(order.promisedDeliveryAt)}`,
      `Payment Method: ${order.paymentMethod || 'Not available'}`,
      `Payment Status: ${order.paymentStatus || 'Not available'}`,
      '',
      'Delivery Address:',
      ...wrapText(order.deliveryAddress, 76),
      '',
      'Items:',
      ...order.items.flatMap((item) => wrapText(
        `${item.quantity} x ${item.name} @ ${formatCurrency(item.price)} = ${formatCurrency(item.amount)}`,
        88,
      )),
      '',
      `Total Amount: ${formatCurrency(order.totalAmount)}`,
      '',
      'Thank you for ordering from Cravnest. We hope your meal was delivered warm, fresh, and right on time.',
      'For support, reply to support@cravnest.in.',
    ];

    const content = [
      'BT',
      '/F1 20 Tf',
      '50 790 Td',
      `(${escapePdfText(lines[0])}) Tj`,
      '/F1 12 Tf',
      '0 -28 Td',
      `(${escapePdfText(lines[1])}) Tj`,
      '0 -24 Td',
      `(${escapePdfText(lines[2])}) Tj`,
      '0 -18 Td',
      `(${escapePdfText(lines[3])}) Tj`,
      '0 -18 Td',
      `(${escapePdfText(lines[4])}) Tj`,
      '0 -18 Td',
      `(${escapePdfText(lines[5])}) Tj`,
      '0 -18 Td',
      `(${escapePdfText(lines[6])}) Tj`,
      '0 -18 Td',
      `(${escapePdfText(lines[7])}) Tj`,
      '0 -18 Td',
      `(${escapePdfText(lines[8])}) Tj`,
      '0 -18 Td',
      `(${escapePdfText(lines[9])}) Tj`,
      '0 -24 Td',
    ];

    let currentY = 574;
    for (let index = 11; index < lines.length; index += 1) {
      const lineText = lines[index];
      if (lineText === '') {
        currentY -= 12;
        content.push('0 -12 Td');
      } else {
        currentY -= 16;
        content.push(`0 -16 Td (${escapePdfText(lineText)}) Tj`);
      }
    }
    content.push('ET');

    const stream = content.join('\n');
    const objects: string[] = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj',
      '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
      `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj`,
    ];

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];

    for (const object of objects) {
      offsets.push(pdf.length);
      pdf += `${object}\n`;
    }

    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';

    for (let index = 1; index <= objects.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, 'utf8');
  }
}
