import { Printer, Download, Briefcase, FileText } from 'lucide-react';
import Modal from './ui/Modal';
import { Document, DocumentCompanyInfo, DocumentBankDetails } from '../types';
import { generateDocumentPDF, DEFAULT_COMPANY_INFO, DEFAULT_BANK_DETAILS } from '../utils/documentPdf';

interface DocumentOfficialModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Document | null;
  fallbackCompany?: DocumentCompanyInfo;
  fallbackBank?: DocumentBankDetails;
}

export default function DocumentOfficialModal({
  isOpen,
  onClose,
  document,
  fallbackCompany,
  fallbackBank
}: DocumentOfficialModalProps) {
  if (!document) return null;

  const comp = document.companyInfo || fallbackCompany || DEFAULT_COMPANY_INFO;
  const bank = document.bankDetails || fallbackBank || DEFAULT_BANK_DETAILS;

  const docTypeLabel =
    document.type === 'quotation' ? 'COTIZACIÓN' :
    document.type === 'purchase_order' ? 'ORDEN DE COMPRA' :
    document.type === 'sales_note' ? 'NOTA DE VENTA' :
    document.type === 'invoice' ? 'FACTURA ELECTRÓNICA' : 'ESTADO DE PAGO';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Visualización Oficial: ${document.folio || document.id.slice(0, 8)}`}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-6 font-sans text-left">
        {/* Actions Header Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-2xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Documento Oficial Emitido • {comp.name}
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold transition-all shadow-2xs cursor-pointer"
            >
              <Printer size={14} />
              <span>Imprimir</span>
            </button>
            <button
              type="button"
              onClick={() => generateDocumentPDF(document, fallbackCompany, fallbackBank)}
              className="flex items-center gap-1.5 bg-primary hover:opacity-90 text-white rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Download size={14} />
              <span>Descargar PDF</span>
            </button>
          </div>
        </div>

        {/* Fiscal Document Sheet */}
        <div className="bg-white border border-slate-300 rounded-2xl shadow-xl p-6 md:p-8 max-w-full overflow-x-auto print:border-none print:shadow-none font-sans custom-scrollbar">
          <div className="min-w-[640px] space-y-6">
            {/* Header: Company identity & Chilean SII Box */}
            <div className="flex justify-between items-start gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {comp.name}
                </h3>
                <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-wider">
                  {comp.giro || 'Servicios Integrales de Ingeniería • Obras Civiles • Electricidad'}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {comp.address} • {comp.email}
                </p>
                {comp.phone && (
                  <p className="text-[10px] text-slate-400">
                    Teléfono: {comp.phone} {comp.website && `• ${comp.website}`}
                  </p>
                )}
              </div>

              {/* Standard Red Border Box (SII Chile style) */}
              <div className="border-[3px] border-rose-600 px-6 py-4 text-center rounded-lg bg-rose-50/20 max-w-[240px] shrink-0">
                <p className="text-xs font-black text-rose-600 tracking-wider">
                  R.U.T.: {comp.rut || '77.497.082-7'}
                </p>
                <h4 className="text-xs font-black text-rose-700 uppercase my-1 leading-snug">
                  {docTypeLabel}
                </h4>
                <p className="text-sm font-black text-rose-600 font-mono tracking-widest">
                  {document.folio || document.id.slice(0, 8)}
                </p>
                {document.siiFolio && (
                  <p className="text-[9px] text-rose-500 font-bold mt-1 uppercase">
                    SII Ref: #{document.siiFolio}
                  </p>
                )}
              </div>
            </div>

            {/* Client Metadata block */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <div className="space-y-1.5">
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[9px] tracking-wider leading-none">Cliente / Receptor:</span>
                  <span className="text-slate-900 font-bold text-sm leading-relaxed">{document.clientName}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[9px] tracking-wider leading-none">R.U.T. Cliente:</span>
                  <span className="text-slate-700 font-mono font-bold">{document.clientRut || document.clientId || 'Sin registrar'}</span>
                </div>
                {document.clientAddress && (
                  <div>
                    <span className="text-slate-400 font-semibold block uppercase text-[9px] tracking-wider leading-none">Dirección:</span>
                    <span className="text-slate-600">{document.clientAddress}</span>
                  </div>
                )}
              </div>
              
              <div className="space-y-1.5 pl-6 border-l border-slate-200">
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[9px] tracking-wider leading-none">Fecha de Emisión:</span>
                  <span className="text-slate-700 font-bold">{document.date}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[9px] tracking-wider leading-none">Contacto / Fono:</span>
                  <span className="text-slate-700 font-medium">{document.clientContact || document.clientPhone || 'No informado'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[9px] tracking-wider leading-none">Validez de la Oferta:</span>
                  <span className="text-slate-700 font-medium">{document.validityDays || 15} días corridos</span>
                </div>
              </div>
            </div>

            {/* PROYECTO / OBJETO DE LOS TRABAJOS A REALIZAR (UBICACIÓN PRINCIPAL DESTACADA) */}
            {document.projectType && (
              <div className="p-4 bg-gradient-to-r from-amber-50/60 via-slate-50 to-primary/5 border-l-4 border-primary border-y border-r border-slate-200 rounded-xl shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                    <Briefcase size={16} />
                    <span>Proyecto / Objeto de los Trabajos y Obras a Realizar</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-0.5 rounded-full">
                    Alcance del Servicio
                  </span>
                </div>
                <p className="text-slate-900 font-bold text-sm md:text-base leading-relaxed whitespace-pre-wrap pt-0.5">
                  {document.projectType}
                </p>
              </div>
            )}

            {/* Items list Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    <th className="p-2.5 px-4 text-left">Descripción del Ítem o Servicio</th>
                    <th className="p-2.5 text-center w-20">Cantidad</th>
                    <th className="p-2.5 text-right w-36">Precio Unitario</th>
                    <th className="p-2.5 px-4 text-right w-36">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {document.items && document.items.length > 0 ? (
                    document.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-3 px-4 text-left font-bold text-slate-900 leading-tight">
                          {item.description}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-500">
                          {item.quantity}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-600">
                          ${(item.price || 0).toLocaleString()}
                        </td>
                        <td className="p-3 px-4 text-right font-mono font-bold text-slate-900">
                          ${(item.total || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="p-3 px-4 text-left font-bold text-slate-900" colSpan={4}>
                        Servicios Generales de Ingeniería y Ejecución de Obras: ${(document.totalAmount || 0).toLocaleString()} CLP
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary & Bank Account Box */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start pt-2">
              {/* Bank Details Box */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 text-xs space-y-1.5">
                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest block mb-1">
                  Datos para Transferencia Electrónica de Fondos
                </span>
                <p className="text-emerald-950 font-bold">
                  Banco: <span className="font-normal">{bank.bankName}</span>
                </p>
                <p className="text-emerald-950 font-bold">
                  Tipo de Cuenta: <span className="font-normal">{bank.accountType}</span>
                </p>
                <p className="text-emerald-950 font-bold">
                  N° de Cuenta: <span className="font-mono font-bold text-emerald-900">{bank.accountNumber}</span>
                </p>
                <p className="text-emerald-950 font-bold">
                  Titular: <span className="font-normal">{bank.holderName}</span>
                </p>
                <p className="text-emerald-950 font-bold">
                  RUT Titular: <span className="font-mono font-bold text-emerald-900">{bank.holderRut}</span>
                </p>
                <p className="text-emerald-950 font-bold">
                  Correo Comprobantes: <span className="font-medium text-emerald-800">{bank.paymentEmail}</span>
                </p>
                {bank.notes && (
                  <p className="text-[11px] text-emerald-700 italic pt-1 border-t border-emerald-200/60 mt-1">
                    Condiciones: {bank.notes}
                  </p>
                )}
              </div>

              {/* Totals */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-semibold text-slate-700 space-y-2">
                <div className="flex justify-between">
                  <span>Neto Afecto:</span>
                  <span className="font-mono font-bold text-slate-900">${(document.netAmount || 0).toLocaleString()} CLP</span>
                </div>
                <div className="flex justify-between">
                  <span>I.V.A. (19%):</span>
                  <span className="font-mono font-bold text-slate-900">${(document.iva || 0).toLocaleString()} CLP</span>
                </div>
                <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-2">
                  <span>TOTAL GENERAL:</span>
                  <span className="font-mono text-primary">${(document.totalAmount || 0).toLocaleString()} CLP</span>
                </div>
              </div>
            </div>

            {/* Signatures */}
            <div className="pt-8 grid grid-cols-2 gap-12 text-center text-[10px] text-slate-400 font-medium">
              <div className="space-y-1">
                <div className="border-t border-slate-200 mx-auto w-40 mt-8" />
                <p className="font-bold text-slate-700">Firma Emisor / RESCOING</p>
                <p className="text-[8px] uppercase">Emitente Autorizado</p>
              </div>
              <div className="space-y-1">
                <div className="border-t border-slate-200 mx-auto w-40 mt-8" />
                <p className="font-bold text-slate-700">Aceptado y Conforme</p>
                <p className="text-[8px] uppercase">Firma del Cliente Receptor</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
