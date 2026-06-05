/**
 * Browser-native compression and decompression utilities
 * for images (via Canvas) and general documents (via CompressionStream)
 */

/**
 * Compresses an image file using an HTML5 Canvas to resize and reduce JPEG quality if needed.
 */
export async function compressImageUsingCanvas(file: File, maxSizeBytes = 700000): Promise<{ base64: string; compressedSize: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Scale down huge images to a reasonable maximum dimension
        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1080;
        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          if (width > height) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          } else {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("No se pudo obtener el contexto 2D de canvas para compresión"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.85;
        let base64 = canvas.toDataURL('image/jpeg', quality);
        let size = Math.round((base64.length * 3) / 4);

        // Progressively lower quality until size is within safe bounds
        while (size > maxSizeBytes && quality > 0.1) {
          quality -= 0.15;
          base64 = canvas.toDataURL('image/jpeg', quality);
          size = Math.round((base64.length * 3) / 4);
        }

        resolve({
          base64,
          compressedSize: size
        });
      };
      img.onerror = () => reject(new Error("No se pudo cargar la imagen para compresión"));
    };
    reader.onerror = () => reject(new Error("Error al leer el archivo de imagen"));
  });
}

/**
 * Compresses a general file using the native browser CompressionStream (gzip).
 */
export async function compressFileGzip(file: File): Promise<{ base64: string; compressedSize: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const compressedBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    compressedBytes.set(chunk, offset);
    offset += chunk.length;
  }

  const blob = new Blob([compressedBytes], { type: 'application/x-gzip' });
  const base64Url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  return {
    base64: base64Url,
    compressedSize: totalLength
  };
}

/**
 * Decompresses a gzip base64 string back into a standard base64 data URL.
 */
export async function decompressFileGzip(base64DataUrl: string, expectedType: string): Promise<string> {
  // If not a data URL, we cannot process it
  if (!base64DataUrl.startsWith('data:')) {
    return base64DataUrl;
  }

  const res = await fetch(base64DataUrl);
  const compressedBuffer = await res.arrayBuffer();
  const compressedBytes = new Uint8Array(compressedBuffer);

  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(compressedBytes);
  writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const decompressedBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    decompressedBytes.set(chunk, offset);
    offset += chunk.length;
  }

  const blob = new Blob([decompressedBytes], { type: expectedType });
  const base64Url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  return base64Url;
}
