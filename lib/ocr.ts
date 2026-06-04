import { createWorker } from "tesseract.js";

const MAX_CONCURRENT = 2;
const OCR_TIMEOUT_MS = 30_000;

// Simple semaphore to limit simultaneous Tesseract workers
let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    if (active < MAX_CONCURRENT) {
      active++;
      resolve();
    } else {
      queue.push(() => { active++; resolve(); });
    }
  });
}

function release(): void {
  const next = queue.shift();
  if (next) {
    next();
  } else {
    active--;
  }
}

/**
 * Run OCR on a base64-encoded image (PNG or JPEG).
 * Limited to MAX_CONCURRENT workers; times out after 30 s.
 */
export async function recognizeText(imageBase64: string): Promise<string> {
  const lang = process.env.TESSERACT_LANG ?? "eng+nep";

  await acquire();
  const worker = await createWorker(lang);
  try {
    const result = await Promise.race([
      worker.recognize(Buffer.from(imageBase64, "base64")),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("OCR timed out after 30 s.")), OCR_TIMEOUT_MS)
      ),
    ]);
    return result.data.text.trim();
  } finally {
    await worker.terminate();
    release();
  }
}
