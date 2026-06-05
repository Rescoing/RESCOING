import { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  FileCode, 
  AlertCircle, 
  RotateCw, 
  ZoomIn, 
  ZoomOut,
  File,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Maximize2,
  Minimize2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { decompressFileGzip } from '../lib/compression';

interface PreviewItem {
  id: string;
  name?: string;
  fileName: string;
  fileType: string;
  fileData: string; // Base64 loaded string
  isCompressed?: boolean;
}

// Memory-safe hook to convert Base64 strings to Blob URLs for lightning-fast rendering
export function useBlobUrl(base64Data: string, fileType: string) {
  const [blobUrl, setBlobUrl] = useState<string>('');

  useEffect(() => {
    if (!base64Data) return;
    
    let active = true;
    let url = '';
    
    try {
      const base64Clean = base64Data.split(';base64,')[1] || base64Data;
      const mimeMatch = base64Data.match(/^data:([^;]+);base64,/);
      const mime = mimeMatch ? mimeMatch[1] : fileType;
      
      const binaryString = atob(base64Clean);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: mime });
      url = URL.createObjectURL(blob);
      if (active) {
        setBlobUrl(url);
      }
    } catch (e) {
      console.error("Error creating blob url:", e);
      // Fallback
      if (active) {
        setBlobUrl(base64Data);
      }
    }

    return () => {
      active = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [base64Data, fileType]);

  return blobUrl;
}

export function DocumentPreviewViewer({ item: rootItem }: { item: PreviewItem | null }) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [activeItem, setActiveItem] = useState<PreviewItem | null>(null);
  const [decompressing, setDecompressing] = useState(false);

  useEffect(() => {
    if (!rootItem) {
      setActiveItem(null);
      return;
    }

    if (rootItem.isCompressed) {
      setDecompressing(true);
      decompressFileGzip(rootItem.fileData, rootItem.fileType)
        .then(data => {
          setActiveItem({
            ...rootItem,
            fileData: data,
            isCompressed: false
          });
        })
        .catch(err => {
          console.error("Decompression failed", err);
          setActiveItem(rootItem);
        })
        .finally(() => {
          setDecompressing(false);
        });
    } else {
      setActiveItem(rootItem);
    }
  }, [rootItem]);

  const blobUrl = useBlobUrl(activeItem?.fileData || '', activeItem?.fileType || '');

  if (!rootItem) return null;

  if (decompressing) {
    return (
      <div className="flex flex-col items-center justify-center p-12 h-64 text-slate-500 gap-3">
        <RotateCw className="animate-spin text-primary" size={24} />
        <span className="text-xs font-bold">Descomprimiendo archivo para visualización...</span>
      </div>
    );
  }

  if (!activeItem) return null;
  const item = activeItem;

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
            <span>Visualizador PDF de Alta Compatibilidad (Canvas)</span>
          </div>
          <span className="text-[10px] text-rose-650 font-bold bg-rose-100/80 border border-rose-200 rounded px-2 py-0.5">Soporte Universal</span>
        </div>

        <PdfCanvasViewer fileData={item.fileData} fileName={item.fileName} />
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

function PdfCanvasViewer({ fileData, fileName }: { fileData: string; fileName: string }) {
  const [pdfjs, setPdfjs] = useState<any>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.25);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorOriginal, setErrorOriginal] = useState<string | null>(null);
  const [scriptFailed, setScriptFailed] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);

  // Esc listener to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // 1. Load PDFJS from CDN
  useEffect(() => {
    let active = true;
    
    if ((window as any).pdfjsLib) {
      if (active) {
        setPdfjs((window as any).pdfjsLib);
      }
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    script.async = true;
    
    script.onload = () => {
      if (!active) return;
      try {
        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        setPdfjs(pdfjsLib);
      } catch (err) {
        console.error("Error setting up PDFWorker:", err);
        setScriptFailed(true);
      }
    };

    script.onerror = () => {
      if (active) {
        setScriptFailed(true);
      }
    };

    document.head.appendChild(script);

    return () => {
      active = false;
    };
  }, []);

  // 2. Load the base64 content
  useEffect(() => {
    if (!pdfjs || !fileData) return;
    
    let active = true;
    setLoading(true);
    setErrorOriginal(null);

    const loadPdf = async () => {
      try {
        const base64Clean = fileData.split(';base64,')[1] || fileData;
        const binaryString = atob(base64Clean);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const loadingTask = pdfjs.getDocument({ data: bytes });
        const pdf = await loadingTask.promise;
        
        if (active) {
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
          setPageNum(1);
          setLoading(false);
        }
      } catch (err: any) {
        console.error("PDF loading error:", err);
        if (active) {
          setErrorOriginal(err?.message || "No se pudo interpretar el archivo PDF.");
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      active = false;
    };
  }, [pdfjs, fileData]);

  // 3. Render page
  useEffect(() => {
    if (!pdfDoc) return;
    
    let active = true;
    
    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (!active) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const context = canvas.getContext('2d');
        if (!context) return;
        
        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }
        
        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        
        await renderTask.promise;
        if (active) {
          renderTaskRef.current = null;
        }
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error("Page render error:", err);
        }
      }
    };

    renderPage();

    return () => {
      active = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, pageNum, scale]);

  const handlePrevPage = () => {
    setPageNum(prev => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setPageNum(prev => Math.min(numPages, prev + 1));
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(3.0, prev + 0.25));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(0.5, prev - 0.25));
  };

  if (scriptFailed) {
    const backupUrl = fileData.startsWith('data:') ? fileData : `data:application/pdf;base64,${fileData}`;
    return (
      <div className="w-full flex flex-col gap-3 h-full">
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs space-y-2">
          <p className="font-bold">Aviso del Sistema:</p>
          <p>No se pudo inicializar el renderizador dinámico. Puedes abrir el recurso en una pestaña nueva o descargarlo:</p>
          <div className="flex gap-2 pt-1">
            <a 
              href={backupUrl} 
              target="_blank" 
              rel="noreferrer"
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 font-bold rounded-xl text-white text-[11px] text-center"
            >
              Abrir PDF en otra pestaña
            </a>
          </div>
        </div>
        <div className="w-full h-[400px] border border-slate-200 rounded-2xl overflow-hidden">
          <iframe src={backupUrl} className="w-full h-full" title={fileName} />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[400px] gap-3 text-slate-400">
        <RefreshCw className="animate-spin text-rose-500" size={28} />
        <p className="text-xs font-bold text-center">Cargando visor interactivo de alta precisión...</p>
        <p className="text-[10px] text-slate-400 italic">Procesando páginas del PDF...</p>
      </div>
    );
  }

  if (errorOriginal) {
    return (
      <div className="p-6 text-center text-rose-600 flex flex-col items-center justify-center gap-3">
        <AlertCircle size={32} />
        <p className="text-xs font-bold font-mono">Error al procesar el archivo PDF.</p>
        <p className="text-[10px] text-slate-500 max-w-sm mt-1">{errorOriginal}</p>
      </div>
    );
  }

  return (
    <div className={
      isFullscreen 
        ? "fixed inset-0 z-[120] flex flex-col bg-slate-950 overflow-hidden leading-none select-none transition-all duration-300" 
        : "w-full flex flex-col bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-all duration-300"
    }>
      {/* Precision Navigation Control Bar */}
      <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b z-25 shrink-0 ${
        isFullscreen ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-150 text-slate-700'
      }`}>
        {/* Navigation Controls Group */}
        <div className={`flex items-center gap-1.5 p-1 rounded-xl ${
          isFullscreen ? 'bg-slate-800' : 'bg-slate-100'
        }`}>
          <button
            onClick={handlePrevPage}
            disabled={pageNum <= 1}
            className={`p-1.5 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer ${
              isFullscreen ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-white text-slate-700'
            }`}
            title="Página Anterior"
          >
            <ChevronLeft size={16} />
          </button>
          
          <span className={`text-[11px] font-bold px-2 min-w-[75px] text-center select-none ${
            isFullscreen ? 'text-slate-300' : 'text-slate-700'
          }`}>
            {pageNum} / {numPages}
          </span>

          <button
            onClick={handleNextPage}
            disabled={pageNum >= numPages}
            className={`p-1.5 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer ${
              isFullscreen ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-white text-slate-700'
            }`}
            title="Página Siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Zoom Controls Group */}
        <div className={`flex items-center gap-1.5 p-1 rounded-xl font-mono text-[11px] ${
          isFullscreen ? 'bg-slate-800' : 'bg-slate-100'
        }`}>
          <button
            onClick={handleZoomOut}
            disabled={scale <= 0.6}
            className={`p-1.5 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer ${
              isFullscreen ? 'hover:bg-slate-700 text-slate-250' : 'hover:bg-white text-slate-700'
            }`}
            title="Alejar Zoom"
          >
            <ZoomOut size={14} />
          </button>
          
          <span className={`font-bold px-1 text-center min-w-[45px] select-none ${
            isFullscreen ? 'text-slate-300' : 'text-slate-650'
          }`}>
            {Math.round(scale * 100)}%
          </span>

          <button
            onClick={handleZoomIn}
            disabled={scale >= 3.0}
            className={`p-1.5 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer ${
              isFullscreen ? 'hover:bg-slate-700 text-slate-250' : 'hover:bg-white text-slate-700'
            }`}
            title="Acercar Zoom"
          >
            <ZoomIn size={14} />
          </button>
        </div>

        {/* Filename & Fullscreen Actions Group */}
        <div className="flex items-center gap-3">
          {isFullscreen && (
            <div className="hidden lg:flex items-center gap-1.5 max-w-[200px] xl:max-w-[400px] min-w-0 mr-2 border-r border-slate-800 pr-4">
              <span className="text-[10px] uppercase font-black tracking-wider text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">PLANO / SPEC</span>
              <span className="text-xs font-bold truncate text-slate-300" title={fileName}>
                {fileName}
              </span>
            </div>
          )}

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-sm ${
              isFullscreen 
                ? 'bg-rose-600/90 text-white hover:bg-rose-600 border border-rose-750 hover:shadow-lg' 
                : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-md'
            }`}
            title={isFullscreen ? "Salir de Pantalla Completa (Esc)" : "Pantalla Completa"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 size={14} />
                <span className="hidden sm:inline">Normal (Esc)</span>
                <span className="sm:hidden">Normal</span>
              </>
            ) : (
              <>
                <Maximize2 size={14} />
                <span>Pantalla Completa</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Canvas View Area */}
      <div className={`w-full overflow-auto flex items-start justify-center custom-scrollbar shadow-inner select-none animate-fadeIn ${
        isFullscreen 
          ? 'flex-1 bg-slate-950 p-6 md:p-12' 
          : 'max-h-[500px] bg-slate-100 p-4'
      }`}>
        <div className={`p-1 rounded-xl shadow-lg border transition-all duration-200 ${
          isFullscreen ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <canvas ref={canvasRef} className="max-w-full rounded-lg" />
        </div>
      </div>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [rowLimit, setRowLimit] = useState(50);

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

  const downloadCSV = () => {
    if (!sheetData) return;
    const csvContent = sheetData.map(e => e.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${name}_${sheetNames[activeSheet] || 'sheet'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error) {
    return <div className="p-4 text-xs font-bold text-rose-500 bg-rose-50 rounded-xl leading-relaxed">{error}</div>;
  }

  if (!sheetData) {
    return <div className="p-8 text-center text-slate-400 text-xs font-bold animate-pulse">Analizando formato binario e interpretando celdas...</div>;
  }

  // Filter rows by query, keeping header row unchanged
  const headerRow = sheetData[0] || [];
  const bodyRows = sheetData.slice(1);
  const filteredBodyRows = bodyRows.filter(row => {
    if (!searchQuery) return true;
    return row.some(cell => 
      cell !== null && cell !== undefined && 
      String(cell).toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const visibleRows = filteredBodyRows.slice(0, rowLimit);

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-100 p-2 rounded-xl border border-slate-200">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Buscar dentro de la planilla de cálculo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center gap-1.5 justify-end shrink-0">
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all shadow-sm cursor-pointer"
            title="Exportar esta pestaña a CSV limpio"
          >
            <Download size={12} />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {sheetNames.length > 1 && (
        <div className="flex gap-1 overflow-x-auto pb-1 border-b border-slate-200">
          {sheetNames.map((name, idx) => (
            <button
              key={name}
              onClick={() => { setActiveSheet(idx); setRowLimit(50); }}
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
              {headerRow.map((colName, colIdx) => {
                let label = "";
                let tempIdx = colIdx;
                while (tempIdx >= 0) {
                  label = String.fromCharCode((tempIdx % 26) + 65) + label;
                  tempIdx = Math.floor(tempIdx / 26) - 1;
                }
                return (
                  <th key={colIdx} className="p-1.5 px-3 border-r border-slate-200 bg-slate-50 text-slate-700 text-xs text-left font-extrabold sticky top-0 border-b shadow-sm z-30">
                    <div className="flex flex-col">
                      <span className="font-mono text-[9px] text-slate-400 font-normal">{label}</span>
                      <span className="truncate max-w-[150px]" title={String(colName || '')}>{colName !== undefined ? String(colName) : ''}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="p-1 px-2 border-r border-slate-200 font-mono text-[10px] text-slate-400 bg-slate-50/50 text-center font-black sticky left-0 shadow-sm">
                  {rowIdx + 1}
                </td>
                {row.map((cell: any, cellIdx: number) => {
                  const cellStr = cell !== null && cell !== undefined ? String(cell) : "";
                  const isMatch = searchQuery && cellStr.toLowerCase().includes(searchQuery.toLowerCase());
                  return (
                    <td 
                      key={cellIdx} 
                      className={`p-1.5 px-3 border-r border-slate-100 text-xs font-medium ${isMatch ? 'bg-amber-100 text-amber-950 font-bold' : 'text-slate-600'}`}
                    >
                      {cellStr}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredBodyRows.length > rowLimit && (
        <div className="flex justify-center p-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setRowLimit(prev => prev + 50)}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-1.5 rounded-lg transition-colors font-bold cursor-pointer"
          >
            Mostrar más filas ({filteredBodyRows.length - rowLimit} restantes)
          </button>
        </div>
      )}
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
