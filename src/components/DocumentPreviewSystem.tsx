import { useState, useEffect } from 'react';
import { 
  FileText, 
  FileCode, 
  AlertCircle, 
  RotateCw, 
  ZoomIn, 
  ZoomOut,
  File
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface PreviewItem {
  id: string;
  name?: string;
  fileName: string;
  fileType: string;
  fileData: string; // Base64 loaded string
}

export function DocumentPreviewViewer({ item }: { item: PreviewItem | null }) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  if (!item) return null;

  const handleZoomIn = () => setZoom(prev => Math.min(300, prev + 25));
  const handleZoomOut = () => setZoom(prev => Math.max(50, prev - 25));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const fileType = item.fileType.toLowerCase();
  const ext = item.fileName.split('.').pop()?.toLowerCase() || '';

  // Word Documents (DOC / DOCX)
  if (fileType.includes('word') || fileType.includes('officedocument.wordprocessingml') || fileType.includes('msword') || ['docx', 'doc'].includes(ext)) {
    return (
      <div className="w-full bg-slate-50 rounded-xl p-2 h-full flex flex-col justify-start">
        <DocxPreview fileData={item.fileData} />
      </div>
    );
  }

  // Excel / CSV Spreadsheets
  if (fileType.includes('sheet') || fileType.includes('excel') || item.fileName.endsWith('.xlsx') || item.fileName.endsWith('.xls') || item.fileName.endsWith('.csv')) {
    return (
      <div className="w-full bg-slate-50 rounded-xl p-2 h-full flex flex-col justify-start">
        <div className="flex items-center gap-2 p-1.5 px-3 bg-emerald-50 rounded-lg text-emerald-800 text-xs font-bold mb-3 border border-emerald-100 shrink-0">
          <FileCode size={16} className="text-emerald-600 shrink-0" />
          <span>Vista Online Slicing: Planilla procesada de forma interactiva</span>
        </div>
        <ExcelPreview fileData={item.fileData} name={item.name || item.fileName} />
      </div>
    );
  }

  // Raw Texts, Codes, TXT
  if (fileType.includes('text') || fileType.includes('json') || fileType.includes('plain') || item.fileName.endsWith('.txt') || item.fileName.endsWith('.json') || item.fileName.endsWith('.xml')) {
    return (
      <div className="w-full h-full flex flex-col gap-2">
        <div className="flex items-center gap-2 p-2 px-3 bg-slate-800 text-slate-200 rounded-lg text-xs font-mono font-bold">
          <FileCode size={14} />
          <span>Visor de Texto Plano Sin Formato</span>
        </div>
        <TextPreview fileData={item.fileData} />
      </div>
    );
  }

  // PDFs
  if (fileType.includes('pdf') || ext === 'pdf') {
    return (
      <div className="w-full flex flex-col gap-3 h-full">
        <div className="flex items-center justify-between p-2 px-3 bg-rose-50 text-rose-800 rounded-lg text-xs font-bold border border-rose-100 shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-rose-600" />
            <span>Visualizador de PDF integrado de forma digital</span>
          </div>
          <span className="text-[10px] text-rose-600 font-mono">Compatible con navegador moderno</span>
        </div>

        <div className="w-full h-[500px] rounded-xl overflow-hidden bg-slate-200 shadow-inner relative border border-slate-200">
          <embed 
            src={item.fileData} 
            type="application/pdf" 
            className="w-full h-full"
          />
        </div>
        <p className="text-[10px] text-slate-400 text-center leading-normal">Si tu navegador posee bloqueos de visor, por favor haz uso del botón "Descargar" en la barra superior.</p>
      </div>
    );
  }

  // Images
  if (fileType.includes('image') || ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) {
    return (
      <div className="w-full flex flex-col items-center justify-center p-2">
        <div className="absolute top-4 right-4 z-40 bg-white/95 rounded-xl shadow-lg border border-slate-200 p-1.5 flex items-center gap-1">
          <button 
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors"
            title="Aumentar Zoom"
          >
            <ZoomIn size={16} />
          </button>
          <button 
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors"
            title="Reducir Zoom"
          >
            <ZoomOut size={16} />
          </button>
          <button 
            onClick={handleRotate}
            className="p-1.5 hover:bg-slate-100 text-indigo-600 rounded-lg transition-colors"
            title="Rotar 90 grados"
          >
            <RotateCw size={16} />
          </button>
          <div className="w-[1px] h-4 bg-slate-200 mx-1" />
          <span className="text-[10px] font-mono font-bold text-slate-400 px-1">{zoom}%</span>
        </div>

        <div className="max-w-full max-h-[60vh] overflow-auto flex items-center justify-center p-4">
          <img 
            src={item.fileData} 
            alt={item.name || item.fileName} 
            className="max-w-none transition-transform duration-200 select-contain shadow-md rounded-lg"
            style={{ 
              transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              maxWidth: zoom === 100 ? '100%' : 'none'
            }}
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    );
  }

  // Fallback visual viewer
  return (
    <div className="text-center p-12 w-full block">
      <AlertCircle size={48} className="mx-auto text-slate-400 mb-4" />
      <h4 className="text-sm font-bold text-slate-800">Vista previa con detalles técnicos</h4>
      <p className="text-slate-500 text-xs mt-1 max-w-xs mx-auto">Este tipo de documento regulado ({fileType || 'Desconocido'}) no es compatible con el renderizado adaptativo binario.</p>
      
      <div className="my-4 w-40 h-[1px] bg-slate-200 mx-auto" />
      
      <div className="bg-white rounded-xl p-4 border border-slate-200 max-w-sm mx-auto text-left flex flex-col gap-2">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Metadatos del Documento:</span>
        <div className="flex justify-between text-xs font-medium text-slate-700">
          <span>Nombre de Archivo:</span>
          <span className="font-bold truncate max-w-[200px]">{item.fileName}</span>
        </div>
        <div className="flex justify-between text-xs font-medium text-slate-700">
          <span>Identificador Binario:</span>
          <span className="font-mono text-[10px] font-bold">{item.id.substring(0, 12)}...</span>
        </div>
        <div className="flex justify-between text-xs font-medium text-slate-700">
          <span>Tipo MIME:</span>
          <span className="font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px]">{item.fileType}</span>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 mt-4 leading-normal">Por favor, presione el botón de descarga para operar sobre el archivo localmente.</p>
    </div>
  );
}

function DocxPreview({ fileData }: { fileData: string }) {
  const [html, setHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    async function convert() {
      try {
        setLoading(true);
        const base64Clean = fileData.split(';base64,')[1] || fileData;
        const binaryString = atob(base64Clean);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const arrayBuffer = bytes.buffer;
        
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml({ arrayBuffer });
        
        if (active) {
          setHtml(result.value);
          setLoading(false);
        }
      } catch (err) {
        console.error("Mammoth conversion error:", err);
        if (active) {
          setError("No se pudo extraer el contenido del documento Word. Asegúrate de que el archivo no esté dañado o bloqueado.");
          setLoading(false);
        }
      }
    }
    
    convert();
    return () => {
      active = false;
    };
  }, [fileData]);

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-xs font-bold animate-pulse flex flex-col items-center justify-center gap-3">
        <RotateCw className="animate-spin text-indigo-600" size={24} />
        <span>Interpretando formato binario de Microsoft Word...</span>
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-xs font-bold text-rose-500 bg-rose-50 rounded-xl leading-relaxed">{error}</div>;
  }

  return (
    <div className="w-full h-full flex flex-col gap-2">
      <div className="flex items-center gap-2 p-2 px-3 bg-blue-50 text-blue-800 rounded-lg text-xs font-bold border border-blue-100 shrink-0">
        <FileText size={15} className="text-blue-600" />
        <span>Visor de Documento Word Integrado</span>
      </div>
      
      <div className="w-full overflow-auto max-h-[500px] bg-slate-100 p-4 rounded-xl border border-slate-200 flex justify-center custom-scrollbar">
        <div 
          className="bg-white p-8 md:p-12 shadow-md rounded-lg max-w-4xl w-full text-left font-sans text-sm text-slate-800 leading-relaxed docx-parsed-content"
          dangerouslySetInnerHTML={{ __html: html || '<p class="text-slate-400 italic">El archivo no tiene contenido legible.</p>' }}
        />
      </div>
      
      <style>{`
        .docx-parsed-content h1 {
          font-size: 1.5rem;
          font-weight: 800;
          color: #0f172a;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 0.25rem;
        }
        .docx-parsed-content h2 {
          font-size: 1.25rem;
          font-weight: 700;
          color: #1e293b;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .docx-parsed-content h3 {
          font-size: 1.1rem;
          font-weight: 600;
          color: #334155;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .docx-parsed-content p {
          margin-bottom: 0.75rem;
          text-align: justify;
        }
        .docx-parsed-content table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
          margin-bottom: 1rem;
          font-size: 0.85rem;
        }
        .docx-parsed-content table th, 
        .docx-parsed-content table td {
          border: 1px solid #cbd5e1;
          padding: 0.5rem;
          text-align: left;
        }
        .docx-parsed-content table th {
          background-color: #f8fafc;
          font-weight: 700;
        }
        .docx-parsed-content ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .docx-parsed-content ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .docx-parsed-content li {
          margin-bottom: 0.25rem;
        }
        .docx-parsed-content a {
          color: #2563eb;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}

function ExcelPreview({ fileData, name }: { fileData: string, name: string }) {
  const [sheetData, setSheetData] = useState<any[][] | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const base64Clean = fileData.split(';base64,')[1] || fileData;
      const binaryString = atob(base64Clean);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const workbook = XLSX.read(bytes, { type: 'array' });
      setSheetNames(workbook.SheetNames);
      
      const activeName = workbook.SheetNames[activeSheet] || workbook.SheetNames[0];
      if (activeName) {
        const worksheet = workbook.Sheets[activeName];
        const jsonData = XLSX.utils.sheet_to_json<any[][]>(worksheet, { header: 1 });
        setSheetData(jsonData as any);
      }
    } catch (err) {
      console.error(err);
      setError("No se pudo extraer la planilla de cálculo. Es posible que el archivo esté corrupto o posea fórmulas no admitidas.");
    }
  }, [fileData, activeSheet]);

  if (error) {
    return <div className="p-4 text-xs font-bold text-rose-500 bg-rose-50 rounded-xl leading-relaxed">{error}</div>;
  }

  if (!sheetData) {
    return <div className="p-8 text-center text-slate-400 text-xs font-bold animate-pulse">Analizando formato binario e interpretando celdas...</div>;
  }

  return (
    <div className="w-full flex flex-col gap-3">
      {sheetNames.length > 1 && (
        <div className="flex gap-1 overflow-x-auto pb-1 border-b border-slate-200">
          {sheetNames.map((name, idx) => (
            <button
              key={name}
              onClick={() => setActiveSheet(idx)}
              className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${activeSheet === idx ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-auto max-h-[420px] border border-slate-200 rounded-xl bg-white shadow-inner">
        <table className="w-full min-w-max border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-1 px-2 border-r border-slate-200 font-mono text-[10px] text-slate-400 bg-slate-50 text-center sticky top-0">#</th>
              {sheetData[0]?.map((_, colIdx) => {
                let label = "";
                let tempIdx = colIdx;
                while (tempIdx >= 0) {
                  label = String.fromCharCode((tempIdx % 26) + 65) + label;
                  tempIdx = Math.floor(tempIdx / 26) - 1;
                }
                return (
                  <th key={colIdx} className="p-1.5 px-3 border-r border-slate-200 font-mono text-[10px] text-slate-500 bg-slate-50 text-center font-bold sticky top-0">
                    {label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sheetData.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="p-1 px-2 border-r border-slate-200 font-mono text-[10px] text-slate-400 bg-slate-50/50 text-center font-black sticky left-0 shadow-sm">
                  {rowIdx + 1}
                </td>
                {row.map((cell: any, cellIdx: number) => (
                  <td key={cellIdx} className="p-1.5 px-3 border-r border-slate-100 text-xs text-slate-605 font-medium">
                    {cell !== null && cell !== undefined ? String(cell) : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TextPreview({ fileData }: { fileData: string }) {
  const [text, setText] = useState<string>('');

  useEffect(() => {
    try {
      const base64Clean = fileData.split(';base64,')[1] || fileData;
      setText(atob(base64Clean));
    } catch (e) {
      setText("Error al descifrar el archivo de texto.");
    }
  }, [fileData]);

  return (
    <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl overflow-auto text-[11px] font-mono leading-relaxed max-h-[400px] w-full text-left whitespace-pre-wrap shadow-inner border border-slate-800">
      {text}
    </pre>
  );
}
