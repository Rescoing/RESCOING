import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import nodemailer from "nodemailer";

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

      const contents: any[] = [];

      // Safely build the conversation history matching @google/genai schema
      if (history && Array.isArray(history)) {
        history.forEach((h: any) => {
          // Skip the initial system greetings or empty messages to avoid bloating the sequence
          if (h.id === 'welcome' || !h.text) return;
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
          });
        });
      }

      // Add context with the current query as the final user message
      const promptWithContext = `CONTEXTO REAL SINCRO DE LA EMPRESA (Tus ojos de Auditoría):
${JSON.stringify(systemContext, null, 2)}

NUEVA CONSULTA / SOLICITUD DE AUDITORÍA:
${prompt}`;

      contents.push({
        role: 'user',
        parts: [{ text: promptWithContext }]
      });

      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents,
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

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini server audit route error:", error);
      res.status(500).json({ error: error.message || "Error al procesar la auditoría con Inteligencia Artificial." });
    }
  });

  // Helper to build dynamic SMTP transporter
  function getSmtpTransporter() {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  // Helper to generate a professional styled HTML body representing the corporate brand
  function generateHtmlEmail(subject: string, message: string) {
    const formattedMessage = message
      .split("\n\n")
      .map(p => `<p style="margin-bottom: 16px; line-height: 1.6; color: #334155;">${p.replace(/\n/g, "<br/>")}</p>`)
      .join("");

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
            <!-- Header -->
            <tr>
              <td style="background-color: #1e293b; padding: 32px 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.025em;">RESCO INGENIERÍA</h1>
                <p style="color: #94a3b8; margin: 6px 0 0 0; font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;">Portal de Finanzas SpA</p>
              </td>
            </tr>
            
            <!-- Body Content -->
            <tr>
              <td style="padding: 40px 32px;">
                <div style="font-size: 15px; color: #334155;">
                  ${formattedMessage}
                </div>
                
                <!-- Help Box -->
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; margin-top: 32px; border: 1px solid #e2e8f0;">
                  <tr>
                    <td style="padding: 20px;">
                      <h3 style="margin: 0 0 8px 0; color: #1e293b; font-size: 14px; font-weight: 600;">¿Tiene alguna consulta sobre esta cobranza?</h3>
                      <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">Le recordamos que puede responder a este correo electrónico o escribirnos directamente a <strong>contacto@rescoingenieria.cl</strong> para solicitar soporte contable.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            
            <!-- Footer -->
            <tr>
              <td style="background-color: #f1f5f9; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.5;">
                  Este es un mensaje automatizado enviado desde el departamento de Administración de <strong>Resco Ingeniería SpA</strong>.<br>
                  RUT: 76.845.120-K &bull; Web: <a href="https://www.rescoingenieria.cl" target="_blank" style="color: #4f46e5; text-decoration: none; font-weight: 600;">www.rescoingenieria.cl</a>
                </p>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  // API Route for Sending Professional Custom Corporate Emails using SMTP / Nodemailer
  app.post("/api/email/send", async (req: express.Request, res: express.Response) => {
    try {
      const { to, subject, message } = req.body;

      if (!to || !subject || !message) {
        return res.status(400).json({ error: "Faltan parámetros requeridos: to, subject, y/o message." });
      }

      const transporter = getSmtpTransporter();
      const fromEmail = process.env.SMTP_FROM || "contacto@rescoingenieria.cl";
      const fromName = process.env.SMTP_FROM_NAME || "Cobranzas Resco Ingeniería";

      const htmlContent = generateHtmlEmail(subject, message);

      if (!transporter) {
        console.warn("SMTP credentials not fully configured. Returning simulated response for testability.");
        return res.json({
          success: true,
          simulated: true,
          message: "Modo de Demostración: Servicio SMTP no configurado en variables de entorno. Para operar en producción con dominio rescoingenieria.cl, configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM en Secrets.",
          to,
          from: `"${fromName}" <${fromEmail}>`,
          subject,
          html: htmlContent
        });
      }

      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        text: message,
        html: htmlContent
      });

      console.log("Professional corporate email sent successfully via nodemailer SMTP: ", info.messageId);
      return res.json({
        success: true,
        messageId: info.messageId,
        message: `Correo corporativo enviado exitosamente directamente a ${to}`
      });
    } catch (error: any) {
      console.error("Error in backend SMTP email controller:", error);
      return res.status(500).json({
        error: "Error del servidor al procesar el envío SMTP: " + (error.message || "Error desconocido")
      });
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
