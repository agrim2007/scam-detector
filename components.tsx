import React, { useRef, useCallback, useState } from 'react';
import Webcam from 'react-webcam';
import { 
  ScanLine, 
  Zap, 
  History, 
  Image as ImageIcon, 
  ShoppingCart,
  Loader2,
  X,
  ExternalLink,
  Tag,
  Search,
  TrendingUp
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface ProductResult {
  id?: string;
  name: string;
  description?: string;
  priceMin: number;
  priceMax: number;
  confidence: number;
  imageUrl?: string;
  shopUrl: string;
  currency?: string;
  sourceName?: string;
  inStock?: boolean;
  priceAvailable?: boolean;
  score?: number;
  sources?: Array<{
    web?: { uri: string; title: string; price?: string };
  }>;
}

export interface CameraViewProps {
  onCapture: (imageSrc: string) => void;
}

export interface ResultCardProps {
  result: ProductResult | null;
  loading: boolean;
  capturedImage: string;
  onReset: () => void;
}

// ============================================================================
// CAMERA VIEW COMPONENT
// ============================================================================

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
      
      {/* Loading Skeleton */}
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
        <div className="flex items-center gap-2 bg-gray-900/60 backdrop-blur-md px-4 py-2 rounded-full border border-gray-700">
          <ScanLine className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold tracking-wider text-white">SCAN & PRICE</span>
        </div>

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
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-cyan-400 rounded-tl-2xl shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyan-400 rounded-tr-2xl shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyan-400 rounded-bl-2xl shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-cyan-400 rounded-br-2xl shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
          
          <div className="absolute inset-0 flex items-center justify-center opacity-30">
            <div className="w-4 h-4 border border-white rounded-full flex items-center justify-center">
                <div className="w-[1px] h-6 bg-white absolute" />
                <div className="w-6 h-[1px] bg-white absolute" />
            </div>
          </div>
          
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
            
            <button className="p-3 text-gray-400 hover:text-white transition-colors">
              <ImageIcon className="w-6 h-6" />
            </button>

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

            <button className="p-3 text-gray-400 hover:text-white transition-colors relative">
              <ShoppingCart className="w-6 h-6" />
              <div className="absolute top-2 right-2 w-2 h-2 bg-cyan-400 rounded-full" />
            </button>
        </div>
      </div>
      
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

// ============================================================================
// RESULT CARD COMPONENT
// ============================================================================

export const ResultCard: React.FC<ResultCardProps> = ({ result, loading, onReset, capturedImage }) => {
  
  if (loading) {
    return (
      <div className="w-full max-w-sm bg-gray-900/80 backdrop-blur-xl p-8 rounded-3xl text-white text-center border border-white/10 shadow-2xl animate-pulse flex flex-col items-center">
        <div className="relative w-16 h-16 mb-6">
          <div className="absolute inset-0 border-4 border-gray-600 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <h2 className="text-xl font-bold tracking-wide">Scanning Indian Stores...</h2>
        <p className="text-gray-400 text-sm mt-3 font-medium">Comparing prices on Amazon, Flipkart & more</p>
      </div>
    );
  }

  if (!result) return null;

  const currencySymbol = result.currency || '₹';
  const displayPrice = result.priceMin === result.priceMax 
    ? `${currencySymbol} ${result.priceMin.toLocaleString('en-IN')}`
    : `${currencySymbol} ${result.priceMin.toLocaleString('en-IN')} - ${currencySymbol} ${result.priceMax.toLocaleString('en-IN')}`;

  return (
    <div className="w-full sm:max-w-md bg-gray-900/90 backdrop-blur-xl rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 shadow-2xl animate-fade-in-up transition-all duration-300 flex flex-col max-h-[90vh] mx-auto">
      
      {/* Header Image Preview */}
      <div className="relative h-40 sm:h-48 w-full bg-black/50 flex-shrink-0">
        <img 
          src={capturedImage || result.imageUrl} 
          alt="Product" 
          className="w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent" />
        
        <button 
          onClick={onReset} 
          className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-colors border border-white/10 z-10"
        >
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Confidence Badge */}
        <div className="absolute bottom-3 left-4 sm:bottom-4 sm:left-6 px-2 sm:px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-bold tracking-wider border backdrop-blur-md bg-black/30 text-white border-white/20 shadow-sm flex items-center gap-1">
           <div className={`w-2 h-2 rounded-full ${result.confidence > 80 ? 'bg-green-400' : 'bg-yellow-400'}`} />
           {result.confidence}% MATCH
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 scrollbar-hide">
        <h2 className="text-lg sm:text-2xl font-bold text-white leading-tight break-words">
          {result.name}
        </h2>

        {result.description && (
          <p className="text-gray-400 text-xs sm:text-sm leading-relaxed border-l-2 border-cyan-500/50 pl-2 sm:pl-3">
            {result.description}
          </p>
        )}

        {/* Price Box with Stock Status */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-800/50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-white/5 shadow-lg">
          <div className="flex-1">
            <p className="text-gray-400 text-[10px] sm:text-xs uppercase tracking-wider mb-1 flex items-center gap-1">
              <Tag className="w-3 h-3 text-cyan-400 flex-shrink-0" /> Best Price Found
            </p>
            <div className="text-2xl sm:text-3xl font-mono text-white font-bold tracking-tight mb-2 break-words">
              {result.priceAvailable && result.priceMin > 0 ? displayPrice : 'Price N/A'}
            </div>
            {/* Stock Status Badge */}
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide ${
              result.inStock ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              <div className={`w-2 h-2 rounded-full ${result.inStock ? 'bg-green-400' : 'bg-red-400'}`} />
              {result.inStock ? '✅ IN STOCK' : '❌ OUT OF STOCK'}
            </div>
          </div>
          <div className="bg-cyan-500/10 p-2.5 rounded-full">
            <TrendingUp className="w-6 h-6 text-cyan-400" />
          </div>
        </div>

        {/* Found Stores List */}
        {result.sourceName && (
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-[10px] sm:text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">🏪 Available at:</p>
            <a 
              href={result.shopUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ShoppingCart className="w-4 h-4 text-gray-400 group-hover:text-cyan-400 transition-colors flex-shrink-0" />
                <span className="text-xs sm:text-sm text-gray-300 font-medium truncate">{result.sourceName}</span>
              </div>
              <ExternalLink className="w-4 h-4 text-cyan-400 opacity-50 group-hover:opacity-100 flex-shrink-0 ml-2" />
            </a>
          </div>
        )}
        
        {result.sources && result.sources.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] sm:text-xs text-gray-500 font-semibold uppercase tracking-wider">Other sellers:</p>
            {result.sources.map((source, idx) => (
              <a 
                key={idx}
                href={source.web?.uri}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ShoppingCart className="w-4 h-4 text-gray-400 group-hover:text-cyan-400 transition-colors flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-300 truncate">{source.web?.title}</span>
                </div>
                <span className="text-xs sm:text-sm font-mono font-bold text-cyan-400 flex-shrink-0 ml-2">{source.web?.price || 'View'}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Fixed Action Buttons at Bottom */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 p-3 sm:p-6 border-t border-white/5 flex-shrink-0 bg-gray-900/95 backdrop-blur">
        <button 
          onClick={onReset} 
          className="py-2.5 sm:py-3.5 px-3 sm:px-4 rounded-lg sm:rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium sm:font-medium text-sm transition-colors flex items-center justify-center gap-1 sm:gap-2 border border-white/5"
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">Scan Again</span>
          <span className="sm:hidden">Scan</span>
        </button>
        
        <a 
          href={result.shopUrl} 
          target="_blank" 
          rel="noreferrer"
          className="py-2.5 sm:py-3.5 px-3 sm:px-4 rounded-lg sm:rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm sm:text-base text-center transition-colors flex items-center justify-center gap-1 sm:gap-2 shadow-lg shadow-cyan-500/20"
        >
          <span>Buy Now</span>
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
};
