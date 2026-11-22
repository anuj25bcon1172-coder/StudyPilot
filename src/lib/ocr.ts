import { recognize } from 'tesseract.js';

export async function extractTextFromImage(
  imageDataUrl: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const result = await recognize(imageDataUrl, 'eng', {
    logger: (message) => {
      if (
        message.status === 'recognizing text' &&
        typeof message.progress === 'number' &&
        onProgress
      ) {
        onProgress(Math.min(100, Math.max(0, Math.round(message.progress * 100))));
      }
    },
  });

  const rawText = typeof result?.data?.text === 'string' ? result.data.text : '';
  return rawText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
