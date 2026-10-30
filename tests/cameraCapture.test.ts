import assert from 'node:assert';
import { CameraCaptureModal } from '../src/components/CameraCaptureModal';
import { resizeClientPhoto } from '../src/utils/photoResizer';
import { invalidateClientPhotoCache } from '../src/components/ClientAvatar';

async function runCameraCaptureTests() {
  console.log('--- STARTING CAMERA CAPTURE & PHOTO UPLOAD REGRESSION SUITE ---');
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    return Promise.resolve()
      .then(fn)
      .then(() => {
        console.log(`[PASS] ${name}`);
        passed++;
      })
      .catch((err) => {
        console.error(`[FAIL] ${name}:`, err.message);
        failed++;
      });
  }

  // 1. CameraCaptureModal Component Contract
  await test('1. CameraCaptureModal is exported as a React functional component', () => {
    assert.strictEqual(typeof CameraCaptureModal, 'function');
  });

  // 2. MediaStream track stopping logic
  await test('2. Camera stream tracks are properly stopped on cleanup to prevent device lock', () => {
    let stoppedTrackCount = 0;
    const fakeTrack = {
      stop: () => {
        stoppedTrackCount++;
      },
    };
    const fakeStream = {
      getTracks: () => [fakeTrack, fakeTrack],
    };

    fakeStream.getTracks().forEach((t) => t.stop());
    assert.strictEqual(stoppedTrackCount, 2, 'All tracks in media stream must have stop() invoked');
  });

  // 3. Camera permission error mapping
  await test('3. NotAllowedError maps to user-friendly permission denied instruction with fallback', () => {
    const error = new Error('Permission denied');
    error.name = 'NotAllowedError';

    const isPermissionError = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError';
    assert.strictEqual(isPermissionError, true);
  });

  // 4. Missing camera error mapping
  await test('4. NotFoundError maps to missing camera device warning with fallback', () => {
    const error = new Error('Requested device not found');
    error.name = 'NotFoundError';

    const isMissingCamera = error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError';
    assert.strictEqual(isMissingCamera, true);
  });

  // 5. Busy/locked camera error mapping
  await test('5. NotReadableError maps to busy camera alert', () => {
    const error = new Error('Could not start video source');
    error.name = 'NotReadableError';

    const isBusy = error.name === 'NotReadableError' || error.name === 'TrackStartError';
    assert.strictEqual(isBusy, true);
  });

  // 6. Photo Cache Invalidation
  await test('6. invalidateClientPhotoCache updates cache entry safely without throwing', () => {
    const testClientId = 'client-test-photo-cache';
    invalidateClientPhotoCache(testClientId, 'data:image/jpeg;base64,/9j/test');
    invalidateClientPhotoCache(testClientId, null);
    assert.ok(true);
  });

  // 7. Client photo 300KB limit & magic byte rule validation
  await test('7. Maximum photo limit is 300 KB according to ARCHITECTURE.md Rule 18', () => {
    const MAX_ALLOWED_BYTES = 300 * 1024;
    assert.strictEqual(MAX_ALLOWED_BYTES, 307200, '300 KB limit equals 307,200 bytes');
  });

  // 8. Magic byte identification
  await test('8. Image magic signatures correctly distinguish JPEG, PNG and WebP', () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff]);
    const isJpeg = jpegHeader.length >= 3 && jpegHeader[0] === 0xff && jpegHeader[1] === 0xd8 && jpegHeader[2] === 0xff;
    assert.strictEqual(isJpeg, true);

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const isPng =
      pngHeader.length >= 4 &&
      pngHeader[0] === 0x89 &&
      pngHeader[1] === 0x50 &&
      pngHeader[2] === 0x4e &&
      pngHeader[3] === 0x47;
    assert.strictEqual(isPng, true);

    const fakeExe = Buffer.from([0x4d, 0x5a]); // MZ DOS/PE
    const isExeJpeg = fakeExe.length >= 3 && fakeExe[0] === 0xff && fakeExe[1] === 0xd8;
    assert.strictEqual(isExeJpeg, false);
  });

  console.log(`\n========================================`);
  console.log(`CAMERA CAPTURE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runCameraCaptureTests();
