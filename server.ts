import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

let aiClient: any = null;

function getGeminiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("La variable de entorno GEMINI_API_KEY requerida está vacía. Por favor configúrala para habilitar el Auditor Virtual IA.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parser for incoming API payloads
  app.use(express.json({ limit: '10mb' }));

  // API Route for Cross-System Audit AI Consultant
  app.post("/api/gemini/audit", async (req: express.Request, res: express.Response) => {
    try {
      const client = getGeminiClient();
      const { systemContext, prompt, history } = req.body;

      const chat = client.chats.create({
        model: "gemini-3.5-flash",
        config: {
          systemInstruction: `Eres "Auditoría-AI Match", un consultor inteligente de auditoría y cumplimiento contable, tributario y operacional para empresas en Chile. Tu rol es auditar los datos transaccionales, financieros, tributarios (F29, F22 Renta) e inventarios provistos, buscando descuadres, riesgos tributarios de acuerdo al Servicio de Impuestos Internos (SII) de Chile y brindando soluciones accionables para corregirlos.
          
          Al auditar:
          1. Sé extremadamente honesto sobre los descuadres contables encontrados en el balance o libro diario (como cuando los Débitos y Créditos no cuadran en el Libro Diario).
          2. Compara el total facturado neto en compras/ventas contra las cuentas patrimoniales del mayor o f29.
          3. Analiza el cumplimiento del PPM en el Formulario 29 y del impuesto de primera categoría (IDPC) según los regímenes 14 D3, 14 D8 o 14 A en el Formulario 22.
          4. Usa un tono constructivo, elegante, experto e impecable.
          Utiliza términos chilenos (RUT, SII, PPM, IDPC, RLI, Gastos Rechazados, F29, F22).
          Utiliza Markdown bien formateado, con viñetas, negritas, indicadores de alerta, y tablas si es necesario.`,
        }
      });

      const promptWithContext = `CONTEXTO REAL SINCRO DE LA EMPRESA (Tus ojos de Auditoría):
${JSON.stringify(systemContext, null, 2)}

NUEVA CONSULTA / SOLICITUD DE AUDITORÍA:
${prompt}`;

      const gRes = await chat.sendMessage({ message: promptWithContext });
      res.json({ text: gRes.text });
    } catch (error: any) {
      console.error("Gemini server audit route error:", error);
      res.status(500).json({ error: error.message || "Error al procesar la auditoría con Inteligencia Artificial." });
    }
  });

  // Healthcheck endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
