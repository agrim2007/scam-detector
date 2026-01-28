import React, { useRef, useCallback, useState } from 'react';
import Webcam from 'react-webcam';
import { 
  ScanLine, 
  Zap, 
  History, 
  Image as ImageIcon, 
  ShoppingCart,
  Loader2
} from 'lucide-react';

interface CameraViewProps {
  onCapture: (imageSrc: string) => void;
}

// Optimized constraints: 
// 1280x720 is sufficient for screen display and reduces texture memory usage.
const videoConstraints = {
  facingMode: "environment",
  width: { ideal: 1280 },
  height: { ideal: 720 }
};

export const CameraView: React.FC<CameraViewProps> = ({ onCapture }) => {
  const webcamRef = useRef<Webcam>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      onCapture(imageSrc);
    }
  }, [webcamRef, onCapture]);

  const toggleFlash = () => setFlashOn(!flashOn);

  return (
    <div className="relative w-full h-full bg-black text-white overflow-hidden">
      
      {/* Loading Skeleton / State */}
      {!isCameraReady && !cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-0">
          <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
          <p className="text-gray-400 text-sm tracking-wider">INITIALIZING SENSORS...</p>
        </div>
      )}

      {/* Camera Feed */}
      {!cameraError ? (
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={videoConstraints}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${isCameraReady ? 'opacity-100' : 'opacity-0'}`}
          mirrored={false}
          onUserMedia={() => setIsCameraReady(true)}
          onUserMediaError={(err) => {
            console.error("Camera Error:", err);
            setCameraError("Could not access camera. Please ensure permissions are granted.");
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
           <p className="text-red-400 p-4 text-center">{cameraError}</p>
        </div>
      )}

      {/* Grid Overlay */}
      <div className="absolute inset-0 grid-overlay opacity-30 pointer-events-none" />

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-20">
        {/* Badge */}
        <div className="flex items-center gap-2 bg-gray-900/60 backdrop-blur-md px-4 py-2 rounded-full border border-gray-700">
          <ScanLine className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold tracking-wider text-white">SCAN & PRICE</span>
        </div>

        {/* Top Right Controls */}
        <div className="flex gap-4">
          <button 
            onClick={toggleFlash}
            className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-colors ${flashOn ? 'bg-yellow-500/80 text-black' : 'bg-gray-900/60 text-white'}`}
          >
            <Zap className={`w-5 h-5 ${flashOn ? 'fill-current' : ''}`} />
          </button>
          <button className="w-10 h-10 rounded-full bg-gray-900/60 backdrop-blur-md flex items-center justify-center text-white hover:bg-gray-800/60 transition-colors">
            <History className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Center Focus Area */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
        
        {/* Status Pill */}
        <div className={`mb-6 flex items-center gap-2 bg-gray-800/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-gray-600 transition-opacity duration-500 ${isCameraReady ? 'opacity-100' : 'opacity-0'}`}>
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[10px] font-semibold text-gray-200 uppercase tracking-widest">AI Price Prediction Active</span>
        </div>

        {/* Scanner Bracket Box */}
        <div className="relative w-64 h-64 md:w-80 md:h-80">
          {/* Corners */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-cyan-400 rounded-tl-2xl shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyan-400 rounded-tr-2xl shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyan-400 rounded-bl-2xl shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-cyan-400 rounded-br-2xl shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
          
          {/* Center Crosshair */}
          <div className="absolute inset-0 flex items-center justify-center opacity-30">
            <div className="w-4 h-4 border border-white rounded-full flex items-center justify-center">
                <div className="w-[1px] h-6 bg-white absolute" />
                <div className="w-6 h-[1px] bg-white absolute" />
            </div>
          </div>
          
          {/* Scanning Animation Line */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-50 animate-scan" />
        </div>

        {/* Instruction Text */}
        <div className={`mt-8 bg-black/40 px-4 py-2 rounded-lg backdrop-blur-sm transition-opacity duration-1000 ${isCameraReady ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-sm text-gray-300 font-medium">Align product within frame to scan</p>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 pb-10 pt-20 px-6 flex justify-center items-end bg-gradient-to-t from-black/80 to-transparent z-20">
        <div className="flex items-center gap-8 bg-gray-800/40 backdrop-blur-xl px-8 py-3 rounded-full border border-white/10 shadow-lg">
            
            {/* Gallery Button */}
            <button className="p-3 text-gray-400 hover:text-white transition-colors">
              <ImageIcon className="w-6 h-6" />
            </button>

            {/* Shutter Button */}
            <button 
              onClick={capture}
              disabled={!isCameraReady}
              className={`relative group pointer-events-auto transition-all duration-300 ${!isCameraReady ? 'opacity-50 grayscale' : ''}`}
            >
              <div className="absolute inset-0 bg-white rounded-full opacity-20 group-hover:opacity-30 transition-opacity blur-md" />
              <div className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center bg-white/10 backdrop-blur-sm transition-transform group-active:scale-95">
                 <div className="w-12 h-12 rounded-full bg-white" />
              </div>
            </button>

            {/* Cart Button */}
            <button className="p-3 text-gray-400 hover:text-white transition-colors relative">
              <ShoppingCart className="w-6 h-6" />
              <div className="absolute top-2 right-2 w-2 h-2 bg-cyan-400 rounded-full" />
            </button>
        </div>
      </div>
      
      {/* Inline styles for custom animations */}
      <style>{`
        @keyframes scan {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .animate-scan {
          animation: scan 2s linear infinite;
        }
      `}</style>
    </div>
  );
};