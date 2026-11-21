import { AssignmentAttachment, AttachmentMimeType } from '../types';

const MAX_IMAGE_DATA_URL_LENGTH = 360_000;
const MAX_PDF_DATA_URL_LENGTH = 415_000;
const SAFE_DATA_URL_REGEX =
  /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/;

export function isSafeAttachmentUrl(url?: string | null): url is string {
  return typeof url === 'string' && SAFE_DATA_URL_REGEX.test(url);
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function estimateBase64Bytes(dataUrl: string): number {
  const idx = dataUrl.indexOf(',');
  if (idx === -1) return dataUrl.length;
  const b64 = dataUrl.slice(idx + 1);
  return Math.max(1, Math.floor((b64.length * 3) / 4));
}

function resolveMimeType(file: File): AttachmentMimeType | null {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') return 'image/jpeg';
  if (type === 'image/png') return 'image/png';
  if (type === 'image/webp') return 'image/webp';
  if (type === 'application/pdf') return 'application/pdf';

  const name = file.name.toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.pdf')) return 'application/pdf';
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read selected file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

function compressImageFile(file: File): Promise<{
  dataUrl: string;
  mimeType: AttachmentMimeType;
}> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const attempts: Array<{ maxDim: number; quality: number }> = [
          { maxDim: 1400, quality: 0.8 },
          { maxDim: 1200, quality: 0.68 },
          { maxDim: 1000, quality: 0.56 },
          { maxDim: 840, quality: 0.45 },
          { maxDim: 700, quality: 0.36 },
        ];

        for (const { maxDim, quality } of attempts) {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas compression is unavailable in this browser.'));
            return;
          }

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          if (dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) {
            resolve({ dataUrl, mimeType: 'image/jpeg' });
            return;
          }
        }

        reject(
          new Error(
            'Image is still too large after compression. Try cropping or uploading a smaller scan.'
          )
        );
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load the selected image file.'));
    };

    img.src = objectUrl;
  });
}

export async function processAssignmentFile(file: File): Promise<AssignmentAttachment> {
  const mimeType = resolveMimeType(file);
  if (!mimeType) {
    throw new Error('Unsupported file format. Please upload a JPG, PNG, WebP, or PDF file.');
  }

  const safeName = (file.name || 'attachment').trim().slice(0, 160) || 'attachment';

  if (mimeType === 'application/pdf') {
    if (file.size > 310 * 1024) {
      throw new Error(
        'PDF exceeds the 300 KB cloud document limit. Please upload a smaller/compressed PDF or a JPG/PNG scan.'
      );
    }
    const dataUrl = await readFileAsDataUrl(file);
    if (dataUrl.length > MAX_PDF_DATA_URL_LENGTH || !isSafeAttachmentUrl(dataUrl)) {
      throw new Error(
        'PDF is too large or invalid for assignment storage. Please compress the PDF under 300 KB or upload JPG/PNG.'
      );
    }
    return {
      name: safeName,
      mimeType: 'application/pdf',
      dataUrl,
      sizeBytes: Math.min(450_000, estimateBase64Bytes(dataUrl)),
    };
  }

  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Image must be smaller than 12 MB before compression.');
  }

  // Keep small PNGs/WebPs as-is if already well below the threshold
  if (file.size <= 180 * 1024) {
    const rawDataUrl = await readFileAsDataUrl(file);
    if (rawDataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH && isSafeAttachmentUrl(rawDataUrl)) {
      return {
        name: safeName,
        mimeType,
        dataUrl: rawDataUrl,
        sizeBytes: Math.min(450_000, estimateBase64Bytes(rawDataUrl)),
      };
    }
  }

  const compressed = await compressImageFile(file);
  if (!isSafeAttachmentUrl(compressed.dataUrl)) {
    throw new Error('Failed to encode compressed image cleanly.');
  }

  const normalizedName =
    compressed.mimeType === 'image/jpeg' && !safeName.toLowerCase().match(/\.jpe?g$/)
      ? `${safeName.replace(/\.[^.]+$/, '')}.jpg`.slice(0, 160)
      : safeName;

  return {
    name: normalizedName,
    mimeType: compressed.mimeType,
    dataUrl: compressed.dataUrl,
    sizeBytes: Math.min(450_000, estimateBase64Bytes(compressed.dataUrl)),
  };
}

export function downloadAttachment(attachment: AssignmentAttachment): void {
  if (!isSafeAttachmentUrl(attachment.dataUrl)) {
    throw new Error('Attachment URL is invalid or unsafe.');
  }
  const link = document.createElement('a');
  link.href = attachment.dataUrl;
  link.download = attachment.name || 'assignment-file';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
