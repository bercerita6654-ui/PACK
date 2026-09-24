import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  X,
  FlipHorizontal,
  Zap,
  ZapOff,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Sparkles,
  Layers,
  Smartphone,
  Info,
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, CameraDevice } from 'html5-qrcode';
import { PlatformType, ToastItem, ToastOptions } from '../types';
import { detectPlatform, getPlatformColor } from '../utils/platformDetector';
import { soundFX } from '../utils/audio';

interface CameraBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanResult: (orderNumber: string) => void;
  showToast: (msg: string, type?: ToastItem['type'], options?: ToastOptions) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  recentScans?: {
    id: string;
    orderNumber: string;
    platform: PlatformType;
    timestamp: string;
    isDuplicate?: boolean;
  }[];
  totalScannedCount?: number;
}

export const CameraBarcodeScannerModal: React.FC<CameraBarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanResult,
  showToast,
  soundEnabled,
  onToggleSound,
  recentScans = [],
  totalScannedCount = 0,
}) => {
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [lastScanTime, setLastScanTime] = useState<number>(0);
  const [continuousMode, setContinuousMode] = useState<boolean>(true);

  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const readerElementId = 'camera-barcode-reader-view';
  const lastScannedRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  // Handle barcode scanned from video frame
  const handleBarcodeDecoded = useCallback(
    (decodedText: string) => {
      const cleanCode = decodedText.trim().toUpperCase();
      if (!cleanCode) return;

      const now = Date.now();
      // Debounce the exact same code scanned within 1.8 seconds to prevent spamming
      if (lastScannedRef.current.code === cleanCode && now - lastScannedRef.current.time < 1800) {
        return;
      }

      lastScannedRef.current = { code: cleanCode, time: now };
      setLastScannedCode(cleanCode);
      setLastScanTime(now);

      // Trigger haptic vibration on mobile if supported
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([40, 30, 40]);
        } catch {
          // Ignore vibration failure
        }
      }

      // Pass result to parent scanner handler
      onScanResult(cleanCode);

      if (!continuousMode) {
        onClose();
      }
    },
    [continuousMode, onClose, onScanResult]
  );

  // Initialize and start camera
  const startCamera = useCallback(async () => {
    if (!isOpen) return;

    setIsStarting(true);
    setErrorMessage(null);

    try {
      // Check available cameras
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
      }

      // Cleanup existing instance if any
      if (scannerInstanceRef.current) {
        try {
          if (scannerInstanceRef.current.isScanning) {
            await scannerInstanceRef.current.stop();
          }
          scannerInstanceRef.current.clear();
        } catch (e) {
          console.warn('Error cleaning up existing scanner instance:', e);
        }
      }

      const html5QrCode = new Html5Qrcode(readerElementId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
        verbose: false,
      });

      scannerInstanceRef.current = html5QrCode;

      const cameraConfig = selectedCameraId
        ? { deviceId: { exact: selectedCameraId } }
        : { facingMode: facingMode };

      await html5QrCode.start(
        cameraConfig,
        {
          fps: 20,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const width = Math.min(viewfinderWidth * 0.88, 380);
            const height = Math.min(viewfinderHeight * 0.48, 220);
            return { width, height };
          },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleBarcodeDecoded(decodedText);
        },
        () => {
          // Normal frame parse misses - suppress error logs
        }
      );

      // Check for torch capability
      try {
        const trackCapabilities = html5QrCode.getRunningTrackCapabilities();
        if (trackCapabilities && (trackCapabilities as any).torch) {
          setHasTorch(true);
        } else {
          setHasTorch(false);
        }
      } catch {
        setHasTorch(false);
      }

      setIsStarting(false);
    } catch (err: any) {
      console.error('Failed to start camera scanner:', err);
      setIsStarting(false);
      const msg =
        err?.name === 'NotAllowedError' || err?.message?.includes('Permission')
          ? 'Izin akses kamera ditolak. Mohon aktifkan izin kamera di pengaturan browser/HP Anda.'
          : err?.name === 'NotFoundError' || err?.message?.includes('found')
          ? 'Kamera tidak ditemukan pada perangkat ini.'
          : err?.message || 'Gagal menyalakan kamera. Pastikan browser mendukung kamera & HTTPS.';
      setErrorMessage(msg);
    }
  }, [facingMode, handleBarcodeDecoded, isOpen, selectedCameraId]);

  // Stop camera
  const stopCamera = useCallback(async () => {
    if (scannerInstanceRef.current) {
      try {
        if (scannerInstanceRef.current.isScanning) {
          await scannerInstanceRef.current.stop();
        }
        scannerInstanceRef.current.clear();
      } catch (e) {
        console.warn('Error stopping scanner:', e);
      }
      scannerInstanceRef.current = null;
    }
    setIsTorchOn(false);
    setHasTorch(false);
  }, []);

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    if (!scannerInstanceRef.current || !hasTorch) return;
    try {
      const nextState = !isTorchOn;
      await scannerInstanceRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState } as any],
      });
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn('Could not toggle torch:', err);
      showToast('Gagal mengubah lampu senter pada perangkat ini.', 'warning');
    }
  };

  // Flip Camera (Front vs Back)
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    setSelectedCameraId('');
  };

  // Lifecycle when modal opens/closes or facingMode/selectedCameraId changes
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode, selectedCameraId, startCamera, stopCamera]);

  if (!isOpen) return null;

  const lastPlatform = lastScannedCode ? detectPlatform(lastScannedCode) : null;
  const lastPlatformColor = lastPlatform ? getPlatformColor(lastPlatform) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white my-auto max-h-[96vh]">
        {/* Header Bar */}
        <div className="px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-white">Scanner Barcode Kamera</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  <Smartphone className="w-2.5 h-2.5" />
                  Mobile & Web
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Arahkan barcode resi / QR ke dalam kotak pemindai
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={onToggleSound}
              className={`p-2 rounded-xl transition-colors ${
                soundEnabled
                  ? 'bg-slate-800 text-indigo-400 hover:bg-slate-700'
                  : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
              }`}
              title={soundEnabled ? 'Suara ON' : 'Suara Bisu'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              title="Tutup Kamera"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Camera Viewport & Overlay */}
        <div className="relative bg-black flex-1 min-h-[300px] sm:min-h-[360px] flex items-center justify-center overflow-hidden">
          {/* HTML5 QR Code Mount Element */}
          <div
            id={readerElementId}
            className="w-full h-full object-cover [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
          />

          {/* Viewfinder Target Framing Overlay */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
            <div className="relative w-[85%] max-w-[360px] h-[160px] sm:h-[190px] border-2 border-indigo-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] flex items-center justify-center overflow-hidden">
              {/* Corner Reticles */}
              <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-amber-400 rounded-tl-sm" />
              <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-amber-400 rounded-tr-sm" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-amber-400 rounded-bl-sm" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-amber-400 rounded-br-sm" />

              {/* Laser Scanning Beam Animation */}
              <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse top-1/2 -translate-y-1/2" />

              <div className="text-[11px] font-bold text-white/80 bg-black/60 px-2 py-0.5 rounded backdrop-blur-xs">
                Posisikan Barcode Disini
              </div>
            </div>
          </div>

          {/* Loading Indicator */}
          {isStarting && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3 z-20">
              <RotateCw className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-sm font-medium text-slate-300">Menyiapkan kamera...</p>
            </div>
          )}

          {/* Error / Permission Denied Screen */}
          {errorMessage && (
            <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center z-20 gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="max-w-md space-y-1.5">
                <h4 className="font-bold text-white text-base">Tidak Dapat Mengakses Kamera</h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{errorMessage}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Coba Lagi
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}

          {/* Floating Controls Overlay (Top Right of Viewfinder) */}
          <div className="absolute top-3 right-3 flex flex-col gap-2 z-10">
            {/* Flip Camera Button */}
            <button
              type="button"
              onClick={toggleFacingMode}
              className="p-2.5 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white border border-white/10 rounded-2xl shadow-lg transition-all active:scale-95 cursor-pointer"
              title="Balik Kamera (Depan/Belakang)"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>

            {/* Torch Toggle Button */}
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2.5 backdrop-blur-md border rounded-2xl shadow-lg transition-all active:scale-95 cursor-pointer ${
                  isTorchOn
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-amber-500/30'
                    : 'bg-black/60 hover:bg-black/80 text-white border-white/10'
                }`}
                title={isTorchOn ? 'Matikan Senter' : 'Nyalakan Senter'}
              >
                {isTorchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Live Last Scanned Feedback Banner (Floating on Bottom of Viewport) */}
          {lastScannedCode && (
            <div className="absolute bottom-3 left-3 right-3 z-10">
              <div className="bg-slate-900/95 border border-emerald-500/50 p-2.5 rounded-2xl shadow-xl backdrop-blur-md flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400 font-medium">Terakhir Terbaca:</div>
                    <div className="font-mono font-bold text-xs sm:text-sm text-white truncate flex items-center gap-1.5">
                      <span>{lastScannedCode}</span>
                      {lastPlatform && lastPlatformColor && (
                        <span
                          className={`text-[10px] font-sans font-bold px-1.5 py-0.2 rounded border ${lastPlatformColor.bg} ${lastPlatformColor.text} ${lastPlatformColor.border}`}
                        >
                          {lastPlatform}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-1 rounded-lg shrink-0">
                  ✓ Berhasil Ter-Scan
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Control & Status Panel */}
        <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 space-y-3 shrink-0">
          {/* Controls row */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Continuous Mode Toggle */}
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={(e) => setContinuousMode(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
              />
              <span>Scan Berkelanjutan (Kamera Tetap Terbuka)</span>
            </label>

            {/* Camera Select Dropdown if multiple exist */}
            {cameras.length > 1 && (
              <select
                value={selectedCameraId}
                onChange={(e) => setSelectedCameraId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 max-w-[180px] truncate"
              >
                <option value="">Kamera Otomatis ({facingMode === 'environment' ? 'Belakang' : 'Depan'})</option>
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label || `Kamera ${c.id.substring(0, 5)}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Quick instructions / tips */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-900/60 px-3 py-2 rounded-xl border border-slate-800/80">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-indigo-400" />
              <span>Dukungan: Resi Shopee, Tokopedia, TikTok Shop, QR Code</span>
            </span>
            <span className="text-slate-500">Total Paket: <strong className="text-white font-mono font-bold">{totalScannedCount}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
