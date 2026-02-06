
import React, { useState, useEffect, useRef } from 'react';
import { 
  Nfc, 
  Camera, 
  RefreshCcw, 
  Cpu, 
  ZoomIn, 
  ZoomOut, 
  CheckCircle2, 
  Zap, 
  ZapOff,
  ShieldAlert,
  ExternalLink,
  Target,
  History,
  Info
} from 'lucide-react';
import { analyzeTagVisually } from './services/geminiService';
import { Button } from './components/Button';
import { AppState } from './types';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [lastResult, setLastResult] = useState<any>(null);
  const [zoom, setZoom] = useState(1);
  const [torch, setTorch] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isIframe, setIsIframe] = useState(false);
  const [scanHistory, setScanHistory] = useState<any[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoScanInterval = useRef<number | null>(null);

  useEffect(() => {
    setIsIframe(window.self !== window.top);
    return () => stopCamera();
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (autoScanInterval.current) {
      window.clearInterval(autoScanInterval.current);
      autoScanInterval.current = null;
    }
    setTorch(false);
  };

  const startVisionScan = async () => {
    setAppState(AppState.SCANNING_VISION);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', 
          width: { ideal: 3840 }, // Tentativa de 4K para melhor leitura à distância
          height: { ideal: 2160 } 
        }
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      
      // Auto-scan a cada 4 segundos para agilizar
      autoScanInterval.current = window.setInterval(captureAndAnalyze, 4000);
    } catch (err) {
      console.error(err);
      setAppState(AppState.ERROR);
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    const capabilities = track.getCapabilities() as any;
    
    if (capabilities.torch) {
      const newTorchState = !torch;
      await track.applyConstraints({
        advanced: [{ torch: newTorchState }] as any
      });
      setTorch(newTorchState);
    }
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current || isCapturing) return;
    
    setIsCapturing(true);
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    // Captura em alta resolução para a IA ver detalhes
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
      
      try {
        const result = await analyzeTagVisually(base64);
        if (result && result.id && result.id !== "N/A") {
          setLastResult(result);
          setScanHistory(prev => [result, ...prev].slice(0, 5));
          setAppState(AppState.RESULT);
          if ('vibrate' in navigator) navigator.vibrate(200);
          stopCamera();
        }
      } catch (err) {
        console.debug("IA: Nenhuma etiqueta legível no quadro.");
      } finally {
        setIsCapturing(false);
      }
    }
  };

  const tryNfcScan = async () => {
    if (!('NDEFReader' in window)) {
      setAppState(AppState.UNSUPPORTED);
      return;
    }

    if (isIframe) {
      setAppState(AppState.SECURITY_BLOCKED);
      return;
    }

    try {
      setAppState(AppState.SCANNING_NFC);
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      ndef.onreading = (event: any) => {
        const result = {
          id: event.serialNumber.toUpperCase(),
          tagType: "RFID HF / NFC",
          condition: "excelente",
          visualData: "Leitura direta via hardware de rádio."
        };
        setLastResult(result);
        setScanHistory(prev => [result, ...prev].slice(0, 5));
        setAppState(AppState.RESULT);
        if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
      };
    } catch (err) {
      setAppState(AppState.SECURITY_BLOCKED);
    }
  };

  const handleZoom = (val: number) => {
    const newZoom = Math.max(1, Math.min(10, zoom + val));
    setZoom(newZoom);
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      const caps = track.getCapabilities() as any;
      if (caps.zoom) {
        track.applyConstraints({ advanced: [{ zoom: newZoom }] as any });
      }
    }
  };

  // Renderização de Telas de Erro/Segurança
  if (appState === AppState.SECURITY_BLOCKED) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-8 text-center gap-6">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/30">
          <ShieldAlert className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-xl font-bold uppercase">Acesso RFID Restrito</h2>
        <p className="text-slate-400 text-sm">O navegador bloqueia o hardware de rádio em modo de visualização. Abra o app em aba cheia.</p>
        <Button onClick={() => window.open(window.location.href, '_blank')} className="w-full bg-blue-600">
          <ExternalLink className="w-5 h-5" /> Abrir App Completo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-yellow-500/30">
      {/* Header Industrial */}
      <header className="px-6 py-4 flex justify-between items-center bg-slate-900/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center shadow-lg shadow-yellow-500/20">
            <Cpu className="text-slate-950 w-5 h-5" />
          </div>
          <div>
            <h1 className="font-black text-xs tracking-widest uppercase">REIS <span className="text-yellow-500">PRO</span></h1>
            <p className="text-[8px] text-slate-500 font-bold uppercase tracking-tighter">Scanner Híbrido v5.2</p>
          </div>
        </div>
        <div className="flex gap-2">
          {appState !== AppState.IDLE && (
            <button onClick={() => { stopCamera(); setAppState(AppState.IDLE); }} className="p-2 hover:bg-white/5 rounded-full transition-colors">
              <RefreshCcw className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 relative flex flex-col items-center justify-center">
        
        {/* Menu Principal */}
        {appState === AppState.IDLE && (
          <div className="w-full max-w-md p-8 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black tracking-tighter uppercase">Selecione o <br/><span className="text-yellow-500">Modo de Captura</span></h2>
              <p className="text-slate-500 text-xs uppercase tracking-widest font-bold">Hardware & Inteligência Artificial</p>
            </div>

            <div className="grid gap-4">
              <button 
                onClick={startVisionScan}
                className="group relative overflow-hidden bg-slate-900 border border-white/10 p-6 rounded-3xl flex flex-col items-start gap-4 hover:border-yellow-500/50 transition-all active:scale-95"
              >
                <div className="w-12 h-12 bg-yellow-500/10 rounded-2xl flex items-center justify-center group-hover:bg-yellow-500 group-hover:text-slate-950 transition-colors">
                  <Camera className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-lg">Visão Computacional</h3>
                  <p className="text-slate-500 text-xs">Leitura de etiquetas à distância e análise de integridade via IA.</p>
                </div>
                <div className="absolute top-4 right-4 text-[10px] font-black text-yellow-500/20 group-hover:text-yellow-500/40 uppercase tracking-widest">Long Range</div>
              </button>

              <button 
                onClick={tryNfcScan}
                className="group relative overflow-hidden bg-slate-900 border border-white/10 p-6 rounded-3xl flex flex-col items-start gap-4 hover:border-blue-500/50 transition-all active:scale-95"
              >
                <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center group-hover:bg-blue-500 transition-colors">
                  <Nfc className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-lg">Leitura RFID/NFC</h3>
                  <p className="text-slate-500 text-xs">Captura via rádio por aproximação direta (HF/NFC).</p>
                </div>
                <div className="absolute top-4 right-4 text-[10px] font-black text-blue-500/20 group-hover:text-blue-500/40 uppercase tracking-widest">Radio Frequency</div>
              </button>
            </div>

            {scanHistory.length > 0 && (
              <div className="pt-6 border-t border-white/5">
                <div className="flex items-center gap-2 mb-4 text-slate-500">
                  <History className="w-3 h-3" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Últimas Leituras</span>
                </div>
                <div className="space-y-2">
                  {scanHistory.map((item, i) => (
                    <div key={i} className="bg-white/5 p-3 rounded-xl flex justify-between items-center border border-white/5">
                      <span className="font-mono text-xs font-bold text-yellow-500">{item.id}</span>
                      <span className="text-[9px] text-slate-600 uppercase font-black">{item.tagType.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Câmera de Longa Distância */}
        {appState === AppState.SCANNING_VISION && (
          <div className="absolute inset-0 bg-black flex flex-col overflow-hidden">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="flex-1 object-cover transition-transform duration-300 ease-out" 
              style={{ transform: `scale(${zoom})` }} 
            />
            
            {/* Overlay de Scan */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-72 h-72">
                <div className="absolute inset-0 border-2 border-yellow-500/20 rounded-3xl animate-pulse" />
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-yellow-500 rounded-tl-3xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-yellow-500 rounded-tr-3xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-yellow-500 rounded-bl-3xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-yellow-500 rounded-br-3xl" />
                
                {/* Linha de Scanner */}
                <div className="absolute left-4 right-4 top-1/2 h-0.5 bg-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.8)] animate-[scan_2s_infinite_ease-in-out]" />
                
                <div className="absolute inset-0 flex items-center justify-center opacity-10">
                  <Target className="w-20 h-20 text-yellow-500" />
                </div>
              </div>

              {isCapturing && (
                <div className="absolute bottom-40 bg-yellow-500 text-slate-950 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter animate-bounce">
                  Analisando com IA...
                </div>
              )}
            </div>

            {/* Controles de Câmera */}
            <div className="p-8 bg-slate-950/90 backdrop-blur-2xl border-t border-white/5 flex flex-col gap-6 safe-bottom">
              <div className="flex items-center justify-between gap-4">
                <button 
                  onClick={() => handleZoom(-0.5)} 
                  className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center active:bg-yellow-500 transition-colors"
                >
                  <ZoomOut className="w-6 h-6" />
                </button>
                
                <div className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ampliação</span>
                  <span className="text-3xl font-mono font-black text-yellow-500">{zoom.toFixed(1)}x</span>
                </div>

                <button 
                  onClick={() => handleZoom(0.5)} 
                  className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center active:bg-yellow-500 transition-colors"
                >
                  <ZoomIn className="w-6 h-6" />
                </button>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={toggleTorch}
                  className={`flex-1 h-14 rounded-2xl flex items-center justify-center gap-2 font-bold uppercase text-xs transition-all ${torch ? 'bg-yellow-500 text-slate-950' : 'bg-white/5 border border-white/10'}`}
                >
                  {torch ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />} 
                  {torch ? 'Desligar Lanterna' : 'Ativar Lanterna'}
                </button>
                <button 
                  onClick={() => { stopCamera(); setAppState(AppState.IDLE); }}
                  className="w-14 h-14 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center border border-red-500/20"
                >
                  <RefreshCcw className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Resultado Final */}
        {appState === AppState.RESULT && lastResult && (
          <div className="w-full max-w-sm p-6 space-y-4 animate-in zoom-in duration-300">
            <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 relative overflow-hidden shadow-2xl">
              <div className="absolute -top-12 -right-12 w-40 h-40 bg-yellow-500/5 rounded-full blur-3xl" />
              
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">ID do Ativo</h4>
                  <p className="text-4xl font-mono font-black text-yellow-500 tracking-tighter break-all">{lastResult.id}</p>
                </div>
                <div className="bg-green-500/20 p-3 rounded-2xl text-green-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Integridade</p>
                    <p className="text-xs font-black uppercase text-white capitalize">{lastResult.condition}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Tipo Tag</p>
                    <p className="text-xs font-black uppercase text-white">{lastResult.tagType.split(' ')[0]}</p>
                  </div>
                </div>

                <div className="bg-yellow-500/5 p-4 rounded-2xl border border-yellow-500/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-3 h-3 text-yellow-500" />
                    <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest">Análise Técnica</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed font-medium italic">
                    "{lastResult.visualData}"
                  </p>
                </div>
              </div>
            </div>

            <Button onClick={() => setAppState(AppState.IDLE)} className="w-full py-6 text-lg rounded-3xl shadow-2xl shadow-yellow-500/10">
              Nova Leitura
            </Button>
          </div>
        )}

        {/* Tela NFC */}
        {appState === AppState.SCANNING_NFC && (
          <div className="flex flex-col items-center gap-10 animate-in zoom-in duration-300">
            <div className="relative">
              <div className="w-48 h-48 bg-blue-500/5 rounded-full flex items-center justify-center border-4 border-blue-500/10">
                <Nfc className="w-20 h-20 text-blue-500 animate-pulse" />
              </div>
              <div className="absolute inset-0 border-t-4 border-blue-500 rounded-full animate-spin" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black uppercase italic">Aproxime a Tag</h2>
              <p className="text-slate-500 text-xs max-w-[200px]">Mantenha o chip próximo à câmera traseira por 2 segundos.</p>
            </div>
            <Button variant="ghost" onClick={() => setAppState(AppState.IDLE)}>Cancelar</Button>
          </div>
        )}

      </main>

      <canvas ref={canvasRef} className="hidden" />
      
      <footer className="p-6 bg-slate-900/30 border-t border-white/5 text-center">
        <p className="text-[9px] text-slate-600 font-bold uppercase tracking-[0.5em]">Operação Industrial Crítica &bull; REIS HUB</p>
      </footer>

      <style>{`
        @keyframes scan {
          0%, 100% { transform: translateY(-120px); opacity: 0; }
          50% { transform: translateY(120px); opacity: 1; }
        }
        .safe-bottom {
          padding-bottom: max(2rem, env(safe-area-inset-bottom));
        }
      `}</style>
    </div>
  );
};

export default App;
