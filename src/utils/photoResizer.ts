/**
 * Client photo resize and preparation utility.
 * Resizes images on an HTML canvas to at most 400px on the longest side,
 * re-encodes as JPEG or WebP (which strips EXIF and camera metadata),
 * and enforces the 300 KB size limit.
 */

export interface ResizedPhotoResult {
  dataUrl: string;
  mime: 'image/jpeg' | 'image/webp';
  bytes: string; // raw base64 string without data: prefix
  size: number; // byte size
  width: number;
  height: number;
}

export async function resizeClientPhoto(
  file: File | Blob,
  maxDimension: number = 400,
  preferMime: 'image/jpeg' | 'image/webp' = 'image/jpeg'
): Promise<ResizedPhotoResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read photo file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image data'));
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width <= 0 || height <= 0) {
          reject(new Error('Invalid image dimensions'));
          return;
        }

        // Calculate proportional scale
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get 2D canvas context'));
          return;
        }

        // Optional smooth drawing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw onto canvas - this inherently discards all EXIF / GPS metadata
        ctx.drawImage(img, 0, 0, width, height);

        // Encode to preferMime
        let quality = 0.85;
        let dataUrl = canvas.toDataURL(preferMime, quality);

        // Calculate byte length from base64
        let base64Data = dataUrl.split(',')[1] || '';
        let byteLength = Math.round((base64Data.length * 3) / 4);

        // If above 300 KB limit, try lower quality compressions
        const MAX_BYTES = 300 * 1024;
        if (byteLength > MAX_BYTES && quality > 0.5) {
          quality = 0.65;
          dataUrl = canvas.toDataURL(preferMime, quality);
          base64Data = dataUrl.split(',')[1] || '';
          byteLength = Math.round((base64Data.length * 3) / 4);
        }

        if (byteLength > MAX_BYTES) {
          reject(new Error(`Photo exceeds 300 KB limit after compression (${Math.round(byteLength / 1024)} KB).`));
          return;
        }

        resolve({
          dataUrl,
          mime: preferMime,
          bytes: base64Data,
          size: byteLength,
          width,
          height,
        });
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}
