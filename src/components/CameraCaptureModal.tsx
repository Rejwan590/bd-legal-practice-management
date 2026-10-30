import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ResponsiveModal } from './responsive/ResponsiveModal';
import {
  Camera,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  Upload,
  SwitchCamera,
  Image as ImageIcon,
} from 'lucide-react';

export interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (fileOrBlob: File | Blob) => Promise<void>;
  clientName?: string;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  clientName,
}) => {
  const { t } = useTranslation();

  const [mode, setMode] = useState<'live' | 'preview' | 'error'>('live');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileFallbackRef = useRef<HTMLInputElement | null>(null);

  // Stop all active camera tracks
  const stopCameraTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Check available video devices
  const checkMultipleCameras = useCallback(async () => {
    try {
      if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoDevices.length > 1);
      }
    } catch {
      // Ignore
    }
  }, []);

  // Start live video stream
  const startCamera = useCallback(async (desiredFacingMode: 'user' | 'environment' = 'user') => {
    stopCameraTracks();
    setErrorMessage(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setMode('error');
      setErrorMessage(t('clients.cameraUnsupported', 'Camera capture is not supported by your browser. Please select an image file instead.'));
      return;
    }

    try {
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: desiredFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        // Fallback to basic video constraint if ideal constraints fail
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {});
      }
      setMode('live');
      await checkMultipleCameras();
    } catch (err: unknown) {
      setMode('error');
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setErrorMessage(
          t(
            'clients.cameraPermissionDenied',
            'Camera permission was denied. Please allow camera access in your browser address bar or select an image file instead.'
          )
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setErrorMessage(
          t('clients.noCameraFound', 'No camera found on this device. You can select an image file instead.')
        );
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setErrorMessage(
          t('clients.cameraBusy', 'Camera is currently in use by another application or unavailable.')
        );
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : t('clients.cameraAccessError', 'Failed to access camera. Please use file upload instead.')
        );
      }
    }
  }, [stopCameraTracks, checkMultipleCameras, t]);

  // Manage start/stop on modal open/close
  useEffect(() => {
    if (isOpen) {
      setMode('live');
      setCapturedBlob(null);
      setPreviewUrl(null);
      setIsConfirming(false);
      startCamera(facingMode);
    } else {
      stopCameraTracks();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    }

    return () => {
      stopCameraTracks();
    };
  }, [isOpen, startCamera]);

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      stopCameraTracks();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl, stopCameraTracks]);

  // Capture still image from current video frame
  const handleTakePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          stopCameraTracks();
          const url = URL.createObjectURL(blob);
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(url);
          setCapturedBlob(blob);
          setMode('preview');
        }
      },
      'image/jpeg',
      0.92
    );
  };

  // Retake photo: restart video stream
  const handleRetake = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setCapturedBlob(null);
    setMode('live');
    startCamera(facingMode);
  };

  // Switch camera between front/back
  const handleToggleFacingMode = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Confirm photo and upload
  const handleConfirmPhoto = async () => {
    if (!capturedBlob || isConfirming) return;
    try {
      setIsConfirming(true);
      await onCapture(capturedBlob);
      stopCameraTracks();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save photo');
      setIsConfirming(false);
    }
  };

  // Fallback file input change
  const handleFallbackFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsConfirming(true);
      await onCapture(file);
      stopCameraTracks();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to upload photo');
      setIsConfirming(false);
    } finally {
      e.target.value = '';
    }
  };

  // Clean close
  const handleModalClose = () => {
    stopCameraTracks();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    onClose();
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={handleModalClose}
      title={
        <span className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-indigo-600" />
          {t('clients.takePhotoModalTitle', 'Take Client Photo')}
        </span>
      }
      subtitle={
        clientName
          ? `${t('clients.clientProfile', 'Client Dossier')}: ${clientName}`
          : t('clients.cameraLivePreview', 'Live Camera Preview')
      }
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between gap-3 w-full flex-wrap">
          <button
            type="button"
            onClick={() => fileFallbackRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition min-h-[44px]"
            title={t('clients.chooseFileInstead', 'Select Image File Instead')}
          >
            <Upload className="w-4 h-4 text-slate-500" />
            <span>{t('clients.chooseFileInstead', 'Upload File Instead')}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleModalClose}
              disabled={isConfirming}
              className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition"
            >
              <X className="w-4 h-4 mr-1" />
              {t('common.cancel', 'Cancel')}
            </button>

            {mode === 'preview' && (
              <button
                type="button"
                onClick={handleConfirmPhoto}
                disabled={isConfirming || !capturedBlob}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2 min-h-[44px] text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 rounded-xl shadow-xs transition"
              >
                {isConfirming ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('clients.savingPhoto', 'Saving Photo...')}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{t('clients.confirmPhoto', 'Confirm & Save Photo')}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Hidden Fallback Input */}
        <input
          ref={fileFallbackRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={handleFallbackFileSelect}
        />

        {/* Hidden Canvas for Drawing Still Frame */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Error Banner */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">{t('clients.cameraAccessError', 'Camera Access Error')}</p>
              <p className="mt-0.5 text-slate-700">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Live Video Mode */}
        {mode === 'live' && (
          <div className="space-y-4">
            <div className="relative bg-slate-950 rounded-2xl overflow-hidden aspect-4/3 max-h-[380px] flex items-center justify-center border border-slate-800 shadow-inner">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Viewfinder Target Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-56 border-2 border-dashed border-white/60 rounded-3xl" />
              </div>

              {/* Camera Switcher (If multiple cameras present) */}
              {hasMultipleCameras && (
                <button
                  type="button"
                  onClick={handleToggleFacingMode}
                  className="absolute top-3 right-3 p-2 rounded-xl bg-slate-900/80 hover:bg-slate-900 text-white backdrop-blur-xs text-xs font-medium inline-flex items-center gap-1 shadow-md transition"
                  title={t('clients.switchCamera', 'Switch Camera')}
                >
                  <SwitchCamera className="w-4 h-4" />
                  <span className="text-[11px] hidden sm:inline">{t('clients.switchCamera', 'Switch Camera')}</span>
                </button>
              )}
            </div>

            {/* Action Bar: Big Capture Button */}
            <div className="flex items-center justify-center pt-1">
              <button
                type="button"
                onClick={handleTakePhoto}
                className="group relative inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[48px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-2xl shadow-md transition transform active:scale-95"
              >
                <div className="w-3.5 h-3.5 rounded-full bg-white group-hover:scale-125 transition" />
                <Camera className="w-5 h-5" />
                <span>{t('clients.takePhoto', 'Take Photo')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Preview Mode */}
        {mode === 'preview' && previewUrl && (
          <div className="space-y-4">
            <div className="relative bg-slate-950 rounded-2xl overflow-hidden aspect-4/3 max-h-[380px] flex items-center justify-center border border-slate-800 shadow-inner">
              <img
                src={previewUrl}
                alt={t('clients.cameraPreviewTitle', 'Photo Preview')}
                className="w-full h-full object-contain"
              />
              <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-slate-900/80 text-white text-[11px] font-semibold backdrop-blur-xs flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                {t('clients.cameraPreviewTitle', 'Photo Preview')}
              </span>
            </div>

            <p className="text-xs text-slate-500 text-center">
              {t(
                'clients.cameraConfirmHelp',
                "Review the photo above. Click 'Confirm & Save Photo' to set as client profile picture or 'Retake' to try again."
              )}
            </p>

            {/* Retake Action Button */}
            <div className="flex items-center justify-center pt-1">
              <button
                type="button"
                onClick={handleRetake}
                disabled={isConfirming}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                <RefreshCw className="w-4 h-4 text-slate-600" />
                <span>{t('clients.retake', 'Retake Photo')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Error Fallback Mode */}
        {mode === 'error' && (
          <div className="p-8 text-center space-y-4 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <Camera className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-900">
                {t('clients.chooseFileInstead', 'Upload Image File Instead')}
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {t(
                  'clients.cameraConfirmHelp',
                  'You can select an existing photo file from your device to set as the client profile picture.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileFallbackRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition"
            >
              <Upload className="w-4 h-4 text-amber-400" />
              <span>{t('clients.chooseFileInstead', 'Upload File Instead')}</span>
            </button>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
};
