import { jsPDF } from 'jspdf';
import { Document, DocumentCompanyInfo, DocumentBankDetails } from '../types';

export const DEFAULT_COMPANY_INFO: DocumentCompanyInfo = {
  name: 'RESCO INGENIERIA SPA',
  rut: '77.497.082-7',
  giro: 'Servicios de Ingeniería Eléctrica y Montajes Industriales',
  address: "Av. Libertador Bernardo O'Higgins, Rancagua",
  phone: '+56 9 8884 2857',
  email: 'contacto@rescoingenieria.cl',
  website: 'www.rescoingenieria.cl'
};

export const DEFAULT_BANK_DETAILS: DocumentBankDetails = {
  bankName: 'Banco Santander',
  accountType: 'Cuenta Corriente',
  accountNumber: '78-99234-1',
  holderName: 'RESCO INGENIERIA SPA',
  holderRut: '77.497.082-7',
  paymentEmail: 'pagos@rescoingenieria.cl',
  notes: 'Favor transferir e indicar el número de folio en el asunto del comprobante.'
};

export function generateDocumentPDF(
  docItem: Document,
  fallbackCompany?: DocumentCompanyInfo,
  fallbackBank?: DocumentBankDetails
): void {
  try {
    const pdf = new jsPDF();
    const comp = docItem.companyInfo || fallbackCompany || DEFAULT_COMPANY_INFO;
    const bank = docItem.bankDetails || fallbackBank || DEFAULT_BANK_DETAILS;

    // Header: Company Dark Top Accent Bar
    pdf.setFillColor(15, 23, 42); // slate-900
    pdf.rect(0, 0, 210, 8, 'F');

    // Company info (Left)
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text(comp.name.toUpperCase(), 15, 22);

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text(comp.giro || 'Servicios Integrales de Ingeniería', 15, 27);
    pdf.text(`RUT: ${comp.rut} • ${comp.address}`, 15, 32);
    pdf.text(`Fono: ${comp.phone} • Email: ${comp.email}`, 15, 36);

    // Red Chilean SII Box (Right)
    const docTypeLabel =
      docItem.type === 'quotation'
        ? 'COTIZACIÓN'
        : docItem.type === 'purchase_order'
        ? 'ORDEN DE COMPRA'
        : docItem.type === 'sales_note'
        ? 'NOTA DE VENTA'
        : docItem.type === 'invoice'
        ? 'FACTURA ELECTRÓNICA'
        : 'ESTADO DE PAGO';

    pdf.setDrawColor(225, 29, 72); // rose-600
    pdf.setLineWidth(0.8);
    pdf.rect(130, 14, 65, 26);

    pdf.setTextColor(225, 29, 72);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`R.U.T.: ${comp.rut}`, 162.5, 20, { align: 'center' });
    pdf.setFontSize(10);
    pdf.text(docTypeLabel, 162.5, 26, { align: 'center' });
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`N° ${docItem.folio || docItem.id?.slice(0, 8)}`, 162.5, 34, { align: 'center' });

    // Client Data Section
    pdf.setFillColor(248, 250, 252); // slate-50
    pdf.rect(15, 46, 180, 26, 'F');
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.3);
    pdf.rect(15, 46, 180, 26);

    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('DATOS DEL CLIENTE / RECEPTOR', 20, 52);

    pdf.setFont('helvetica', 'normal');
    pdf.text('Razón Social:', 20, 58);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${docItem.clientName || 'Cliente'}`, 42, 58);

    pdf.setFont('helvetica', 'normal');
    pdf.text('RUT Cliente:', 20, 64);
    pdf.text(`${docItem.clientRut || docItem.clientId || 'Sin registrar'}`, 42, 64);

    pdf.text('Dirección:', 20, 69);
    pdf.text(`${docItem.clientAddress || 'Sin registrar'}`, 42, 69);

    pdf.text('Fecha Emisión:', 120, 58);
    pdf.text(`${docItem.date || new Date().toLocaleDateString('es-CL')}`, 148, 58);

    pdf.text('Contacto / Fono:', 120, 64);
    pdf.text(`${docItem.clientContact || docItem.clientPhone || 'No informado'}`, 148, 64);

    pdf.text('Validez Oferta:', 120, 69);
    pdf.text(`${docItem.validityDays || 15} días corridos`, 148, 69);

    // Dedicated Project / Scope of Work Section (Prominent, Full Width, dynamic text wrap)
    let currentY = 75;
    if (docItem.projectType) {
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.3);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      const projectLines = pdf.splitTextToSize(docItem.projectType, 170);
      const boxHeight = Math.max(14, projectLines.length * 4.2 + 9);

      pdf.rect(15, currentY, 180, boxHeight, 'F');
      pdf.rect(15, currentY, 180, boxHeight);

      // Accent line on left (primary orange)
      pdf.setFillColor(234, 88, 12);
      pdf.rect(15, currentY, 2, boxHeight, 'F');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(234, 88, 12);
      pdf.text('PROYECTO / OBJETO DE LOS TRABAJOS A REALIZAR:', 20, currentY + 5);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(15, 23, 42);
      pdf.text(projectLines, 20, currentY + 10);

      currentY += boxHeight + 4;
    } else {
      currentY += 2;
    }

    // Items Table Header
    pdf.setFillColor(15, 23, 42);
    pdf.rect(15, currentY, 180, 7, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(255, 255, 255);
    pdf.text('DESCRIPCIÓN DEL ÍTEM O SERVICIO', 18, currentY + 5);
    pdf.text('CANT', 130, currentY + 5);
    pdf.text('P. UNITARIO', 150, currentY + 5);
    pdf.text('TOTAL', 180, currentY + 5);

    currentY += 12;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(30, 41, 59);

    const items = docItem.items && docItem.items.length > 0 ? docItem.items : [];
    if (items.length === 0) {
      pdf.text('Servicios de Ingeniería y Ejecución de Obras', 18, currentY);
      pdf.text('1', 132, currentY);
      pdf.text(`$${(docItem.netAmount || 0).toLocaleString()}`, 150, currentY);
      pdf.text(`$${(docItem.netAmount || 0).toLocaleString()}`, 180, currentY);
      pdf.setDrawColor(241, 245, 249);
      pdf.line(15, currentY + 2, 195, currentY + 2);
      currentY += 7;
    } else {
      items.forEach((item) => {
        if (currentY > 230) {
          pdf.addPage();
          currentY = 25;
        }
        pdf.text(item.description || 'Ítem sin descripción', 18, currentY);
        pdf.text(String(item.quantity || 1), 132, currentY);
        pdf.text(`$${(item.price || 0).toLocaleString()}`, 150, currentY);
        pdf.text(`$${(item.total || 0).toLocaleString()}`, 180, currentY);

        pdf.setDrawColor(241, 245, 249);
        pdf.line(15, currentY + 2, 195, currentY + 2);
        currentY += 7;
      });
    }

    // Totals Box (Right)
    currentY += 4;
    pdf.setFillColor(248, 250, 252);
    pdf.rect(125, currentY, 70, 24, 'F');
    pdf.setDrawColor(226, 232, 240);
    pdf.rect(125, currentY, 70, 24);

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Subtotal Neto:', 130, currentY + 6);
    pdf.text(`$${(docItem.netAmount || 0).toLocaleString()}`, 188, currentY + 6, { align: 'right' });

    pdf.text('I.V.A. (19%):', 130, currentY + 12);
    pdf.text(`$${(docItem.iva || 0).toLocaleString()}`, 188, currentY + 12, { align: 'right' });

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(15, 23, 42);
    pdf.text('TOTAL GENERAL:', 130, currentY + 19);
    pdf.text(`$${(docItem.totalAmount || 0).toLocaleString()} CLP`, 188, currentY + 19, { align: 'right' });

    // Bank Payment Details Box (Left / Bottom)
    pdf.setFillColor(240, 253, 250); // emerald-50/teal
    pdf.rect(15, currentY, 105, 24, 'F');
    pdf.setDrawColor(16, 185, 129); // emerald-500
    pdf.setLineWidth(0.4);
    pdf.rect(15, currentY, 105, 24);

    pdf.setTextColor(6, 95, 70);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('DATOS PARA TRANSFERENCIA BANCARIA / PAGO', 18, currentY + 5);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(`Banco: ${bank.bankName} • ${bank.accountType}`, 18, currentY + 10);
    pdf.text(`N° Cuenta: ${bank.accountNumber} • RUT: ${bank.holderRut}`, 18, currentY + 14);
    pdf.text(`Titular: ${bank.holderName}`, 18, currentY + 18);
    pdf.text(`Aviso Transferencia: ${bank.paymentEmail}`, 18, currentY + 22);

    // Signatures
    currentY += 34;
    if (currentY > 260) {
      pdf.addPage();
      currentY = 30;
    }
    pdf.setDrawColor(203, 213, 225);
    pdf.line(25, currentY + 15, 85, currentY + 15);
    pdf.line(125, currentY + 15, 185, currentY + 15);
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184);
    pdf.text('Firma Emisor / RESCOING', 35, currentY + 20);
    pdf.text('Aceptado y Conforme Cliente', 133, currentY + 20);

    const safeFolio = docItem.folio || docItem.id?.slice(0, 8) || 'DOC';
    pdf.save(`${docItem.type.toUpperCase()}_${safeFolio}.pdf`);
  } catch (err) {
    console.error('PDF generation error:', err);
    alert('No se pudo generar el PDF del documento.');
  }
}
