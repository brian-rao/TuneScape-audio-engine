
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { AudioMetadata, LoopBoundaries, ProcessingOptions, DetectionMode, ExportFormat } from './types';
import { AudioEngine } from './services/audioEngine';

// Visualizer Component using Web Audio API
const AudioVisualizer: React.FC<{ audioRef: React.RefObject<HTMLAudioElement | null> }> = ({ audioRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    if (!audioRef.current || !canvasRef.current) return;

    const audio = audioRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setupAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 512;
        sourceRef.current = audioContextRef.current.createMediaElementSource(audio);
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);
      }
    };

    const draw = () => {
      if (!analyserRef.current) return;
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const renderFrame = () => {
        animationRef.current = requestAnimationFrame(renderFrame);
        analyserRef.current!.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * canvas.height;

          const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
          gradient.addColorStop(0, '#6366f1'); // Indigo-500
          gradient.addColorStop(1, '#F925EF'); // Vibrant Pink

          ctx.fillStyle = gradient;
          
          const r = 2;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x, canvas.height - barHeight, barWidth - 1, barHeight, [r, r, 0, 0]);
          } else {
            ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
          }
          ctx.fill();

          x += barWidth;
        }
      };
      renderFrame();
    };

    const handlePlay = () => {
      setupAudio();
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      draw();
    };

    const handlePause = () => {
      cancelAnimationFrame(animationRef.current);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      cancelAnimationFrame(animationRef.current);
    };
  }, [audioRef]);

  // Handle Resize for canvas
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && canvasRef.current.parentElement) {
        canvasRef.current.width = canvasRef.current.parentElement.clientWidth;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-32 bg-slate-950/40 rounded-xl border border-slate-700/30"
      height={128}
    />
  );
};

// Inline Pixel Art Icon Component for TuneScape
const TuneScapeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg 
    width="26" 
    height="25" 
    viewBox="0 0 26 25" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    style={{ imageRendering: 'pixelated' }}
  >
    <rect x="4" y="4" width="18" height="17" fill="#52525b"/>
    <rect x="6" y="2" width="14" height="21" fill="#52525b"/>
    <rect x="2" y="6" width="22" height="13" fill="#52525b"/>
    <rect x="12" y="0" width="2" height="3" fill="#c084fc"/>
    <rect x="13" y="3" width="2" height="3" fill="#c084fc"/>
    <rect x="11" y="6" width="2" height="3" fill="#c084fc"/>
    <rect x="12" y="9" width="2" height="4" fill="#c084fc"/>
    <rect x="14" y="13" width="2" height="3" fill="#c084fc"/>
    <rect x="12" y="16" width="2" height="4" fill="#c084fc"/>
    <rect x="13" y="20" width="2" height="5" fill="#c084fc"/>
    <rect x="5" y="5" width="1" height="1" fill="#71717a"/>
    <rect x="20" y="19" width="1" height="1" fill="#3f3f46"/>
  </svg>
);

// Sub-components
const Header: React.FC = () => (
  <header className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center shadow-lg border border-slate-700/50 overflow-hidden">
        <TuneScapeIcon className="w-8 h-8" />
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">TuneScape</h1>
        <p className="text-sm text-slate-400 font-medium tracking-widest uppercase">FOCUS TUNECRAFTING ENGINE</p>
      </div>
    </div>
    <div className="flex items-center gap-4 text-sm font-medium">
      <span className="text-slate-500 hidden sm:inline px-4 py-1.5 bg-slate-800 rounded-full text-xs font-bold">V2.7.4 PRECISION</span>
      <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-base text-indigo-400 hover:text-indigo-300 transition-colors">Billing Docs</a>
    </div>
  </header>
);

const TrackAnalysisCard: React.FC<{ 
  meta: AudioMetadata; 
  type: 'focus' | 'music';
  boundaries?: LoopBoundaries | null;
  onBoundaryUpdate?: (b: LoopBoundaries) => void;
  manualBpm?: number;
  onManualBpmUpdate?: (bpm: number | undefined) => void;
  isAnalyzing?: boolean;
  analysisStatus?: string;
}> = ({ meta, type, boundaries, onBoundaryUpdate, manualBpm, onManualBpmUpdate, isAnalyzing, analysisStatus }) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const bpmInfo = meta.bpmInfo;
  const confidenceColor = {
    high: 'text-emerald-400',
    medium: 'text-amber-400',
    low: 'text-rose-400'
  }[bpmInfo?.confidence || 'low'];

  return (
    <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-5 space-y-4 relative overflow-hidden">
      {isAnalyzing && (
        <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-6 text-center">
           <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
           <p className="text-xs font-black text-indigo-400 uppercase tracking-widest">{analysisStatus || 'Analyzing...'}</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <i className={`fas ${type === 'focus' ? 'fa-brain' : 'fa-music'} text-indigo-400 text-sm`}></i>
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">{type} ANALYSIS</h4>
        </div>
        <span className="text-xs mono text-indigo-400/70">{meta.format} • {meta.sampleRate}Hz</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/30">
          <p className="text-xs font-bold text-slate-500 uppercase mb-1">Duration</p>
          <p className="text-xl font-bold mono text-slate-200">{formatTime(meta.duration)}</p>
        </div>
        <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/30">
          <p className="text-xs font-bold text-slate-500 uppercase mb-1">{type === 'focus' ? 'Frequency' : 'Corrected BPM'}</p>
          <p className="text-xl font-bold mono text-slate-200">
            {type === 'focus' ? `${meta.frequency || '?'} Hz` : (manualBpm || bpmInfo?.corrected || '?')}
          </p>
        </div>
      </div>
      {type === 'music' && bpmInfo && (
        <div className="space-y-3">
          <div className="p-3 bg-slate-800/30 rounded-xl border border-slate-700/30 flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">Confidence</p>
              <p className={`text-sm font-black uppercase ${confidenceColor}`}>{bpmInfo.confidence}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">Detected</p>
              <p className="text-xs mono text-slate-400">{bpmInfo.raw} BPM</p>
            </div>
          </div>
          <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/30">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">BPM Override</p>
            <input 
              type="number" 
              placeholder="Override Source BPM" 
              value={manualBpm || ''} 
              onChange={(e) => onManualBpmUpdate?.(parseFloat(e.target.value) || undefined)} 
              className="w-full bg-slate-900 border border-slate-700 rounded p-2.5 text-sm mono text-white focus:outline-none focus:border-indigo-500" 
            />
          </div>
        </div>
      )}
      {type === 'focus' && meta.divisorBpms && (
        <div className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
          <p className="text-xs font-bold text-indigo-400 uppercase mb-2">Pulse Alignment Options</p>
          <div className="flex flex-wrap gap-2">
            {meta.divisorBpms.map(bpm => <span key={bpm} className="px-2.5 py-1 bg-slate-800 text-slate-400 rounded text-xs mono">{bpm}</span>)}
          </div>
        </div>
      )}
    </div>
  );
};

const FileInput: React.FC<{
  label: string;
  description: string;
  onFileSelect: (file: File) => void;
  accept: string;
  metadata?: AudioMetadata | null;
  icon: string;
}> = ({ label, description, onFileSelect, accept, metadata, icon }) => (
  <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 group transition-all hover:border-indigo-500/30">
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-slate-700/50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors">
          <i className={`fas ${icon} text-xl`}></i>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-200">{label}</h3>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {metadata && <span className="px-2.5 py-1.5 bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase rounded-md border border-emerald-500/20">Ready</span>}
    </div>
    <label className="relative flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:bg-slate-700/20 transition-all">
      {metadata ? (
        <p className="text-base font-medium text-slate-300 truncate w-full px-4 text-center">{metadata.name}</p>
      ) : (
        <div className="flex flex-col items-center">
          <i className="fas fa-plus text-slate-500 mb-1.5 text-sm"></i>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Select File</span>
        </div>
      )}
      <input type="file" className="hidden" accept={accept} onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])} />
    </label>
  </div>
);

const TipsSection: React.FC = () => (
  <section className="mt-12 mb-16 space-y-6">
    <div className="flex items-center gap-3">
      <div className="w-2 h-6 bg-indigo-500 rounded-full"></div>
      <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest">General BPM & Frequency Guide</h2>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
          <i className="fas fa-wave-square"></i> Brainwave Ranges
        </h3>
        <ul className="space-y-3">
          <li className="flex justify-between items-start gap-4">
            <span className="font-bold text-slate-300 min-w-[80px] text-base">Theta <span className="text-xs text-slate-500 block font-normal">(4-8 Hz)</span></span>
            <span className="text-sm text-slate-400">Deep relaxation, creativity, and flow state. Ideal for imaginative work.</span>
          </li>
          <li className="flex justify-between items-start gap-4">
            <span className="font-bold text-slate-300 min-w-[80px] text-base">Alpha <span className="text-xs text-slate-500 block font-normal">(8-13 Hz)</span></span>
            <span className="text-sm text-slate-400">Calm focus and light meditation. Best for visualization and stress reduction.</span>
          </li>
          <li className="flex justify-between items-start gap-4 p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
            <span className="font-bold text-indigo-400 min-w-[80px] text-base">Beta <span className="text-xs text-indigo-400/60 block font-normal">(14-30 Hz)</span></span>
            <span className="text-sm text-slate-400">Alertness and logical thinking. The "workhorse" range for problem-solving and focus.</span>
          </li>
          <li className="flex justify-between items-start gap-4">
            <span className="font-bold text-slate-300 min-w-[80px] text-base">Gamma <span className="text-xs text-slate-500 block font-normal">(30+ Hz)</span></span>
            <span className="text-sm text-slate-400">Peak performance and high-level information processing. Maximum mental acuity.</span>
          </li>
        </ul>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
          <i className="fas fa-music"></i> BPM Correlation
        </h3>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-20 text-sm mono font-black text-slate-500">60-80</div>
            <div className="text-sm text-slate-400 leading-snug">
              <span className="text-slate-200 font-bold block text-base">Deep Immersion</span>
              Reading, technical writing, or meditative study. Lower energy, maximum sustain.
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-20 text-sm mono font-black text-indigo-400">90-110</div>
            <div className="text-sm text-slate-400 leading-snug">
              <span className="text-indigo-400 font-bold block text-base">Balanced Workflow</span>
              Standard creative work or general office tasks. Optimal for 90-minute focus blocks.
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-20 text-sm mono font-black text-slate-500">120-140</div>
            <div className="text-sm text-slate-400 leading-snug">
              <span className="text-slate-200 font-bold block text-base">High Energy Sprint</span>
              Deadlines, administrative sorting, or high-intensity bursts. Effective for short durations.
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const App: React.FC = () => {
  const [focusTrack, setFocusTrack] = useState<AudioMetadata | null>(null);
  const [musicTrack, setMusicTrack] = useState<AudioMetadata | null>(null);
  const [targetDuration, setTargetDuration] = useState(60);
  const [musicVolume, setMusicVolume] = useState(0); 
  const [focusVolume, setFocusVolume] = useState(0); 
  const [targetBpm, setTargetBpm] = useState<number | undefined>(undefined);
  const [manualMusicBpm, setManualMusicBpm] = useState<number | undefined>(undefined);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('wav_lossless');
  const [boundaries, setBoundaries] = useState<LoopBoundaries | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [detectionMode, setDetectionMode] = useState<DetectionMode>('accurate');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (musicTrack && musicTrack.buffer) {
      const reAnalyze = async () => {
        setIsAnalyzing(true);
        const bpmInfo = await AudioEngine.analyzeBpm(musicTrack.buffer, detectionMode, setAnalysisStatus);
        setMusicTrack(prev => prev ? { ...prev, bpmInfo } : null);
        setIsAnalyzing(false);
      };
      reAnalyze();
    }
  }, [detectionMode]);

  const handleFocusUpload = async (file: File) => {
    setIsAnalyzing(true);
    setAnalysisStatus('Decoding Foundation...');
    try {
      const meta = await AudioEngine.decodeFile(file, detectionMode, setAnalysisStatus);
      setFocusTrack(meta);
    } catch (err) { console.error(err); }
    setIsAnalyzing(false);
  };

  const handleMusicUpload = async (file: File) => {
    setIsAnalyzing(true);
    setAnalysisStatus('Decoding Overlay...');
    try {
      const meta = await AudioEngine.decodeFile(file, detectionMode, setAnalysisStatus);
      setMusicTrack(meta);
      setBoundaries(AudioEngine.detectBoundaries(meta.buffer));
    } catch (err) { console.error(err); }
    setIsAnalyzing(false);
  };

  const handleProcess = async () => {
    if (!focusTrack || !musicTrack) return;
    setIsProcessing(true);
    setProgress(0);
    try {
      const blob = await AudioEngine.process(focusTrack, musicTrack, {
        targetDurationMinutes: targetDuration,
        musicVolumeDb: musicVolume,
        focusVolumeDb: focusVolume,
        exportFormat,
        crossfadeDuration: 3,
        targetBpm,
        sourceBpmOverride: manualMusicBpm,
        manualBoundaries: boundaries || undefined
      }, (p) => setProgress(p));
      
      setResultBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      alert("Synthesis encountered an error. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const audioAccept = "audio/*,.ogg,audio/ogg";

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 flex flex-col">
      <Header />
      
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full overflow-y-auto pb-48">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <div className="space-y-6">
            <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest">1. Track Inputs</h2>
            <div className="grid grid-cols-1 gap-6">
                <FileInput 
                  label="Foundation" 
                  description="Focus Track" 
                  onFileSelect={handleFocusUpload} 
                  accept={audioAccept} 
                  metadata={focusTrack} 
                  icon="fa-wind" 
                />
                {focusTrack && <TrackAnalysisCard meta={focusTrack} type="focus" />}
                
                <div className="pt-4 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">BPM Analyzer Engine</h3>
                        <div className="bg-slate-800 rounded-lg p-1.5 flex shadow-inner border border-slate-700/50">
                            <button 
                                onClick={() => setDetectionMode('fast')}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${detectionMode === 'fast' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                FAST
                            </button>
                            <button 
                                onClick={() => setDetectionMode('accurate')}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${detectionMode === 'accurate' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                ACCURATE
                            </button>
                        </div>
                    </div>
                    <FileInput 
                      label="Overlay" 
                      description="Music Track" 
                      onFileSelect={handleMusicUpload} 
                      accept={audioAccept} 
                      metadata={musicTrack} 
                      icon="fa-music" 
                    />
                </div>
                
                {musicTrack && <TrackAnalysisCard 
                meta={musicTrack} 
                type="music" 
                boundaries={boundaries} 
                onBoundaryUpdate={setBoundaries} 
                manualBpm={manualMusicBpm} 
                onManualBpmUpdate={setManualMusicBpm} 
                isAnalyzing={isAnalyzing} 
                analysisStatus={analysisStatus} 
                />}
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest">2. Precision Mixing</h2>
            <section className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-8 space-y-10 shadow-xl">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Session Length (min)</label>
                  <span className="text-3xl font-black text-indigo-400 mono">{targetDuration}</span>
                </div>
                <input type="range" min="20" max="91" value={targetDuration} onChange={(e) => setTargetDuration(parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
              </div>

              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Relative Volume Balancer</label>
                  <span className="text-xs text-slate-500 font-bold uppercase">Logarithmic dB Scale</span>
                </div>
                <div className="space-y-6 p-6 bg-slate-900/60 rounded-xl border border-slate-700/30">
                  <div>
                    <div className="flex justify-between mb-3">
                      <span className="text-sm font-bold text-slate-300 uppercase tracking-wide">FOUNDATION</span>
                      <span className="text-sm text-indigo-400 mono font-bold">{focusVolume > 0 ? `+${focusVolume}` : focusVolume} dB</span>
                    </div>
                    <input type="range" min="-60" max="30" step="1" value={focusVolume} onChange={(e) => setFocusVolume(parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                  </div>
                  <div className="pt-6 border-t border-slate-800/50">
                    <div className="flex justify-between mb-3">
                      <span className="text-sm font-bold text-slate-300 uppercase tracking-wide">OVERLAY</span>
                      <span className="text-sm text-indigo-400 mono font-bold">{musicVolume > 0 ? `+${musicVolume}` : musicVolume} dB</span>
                    </div>
                    <input type="range" min="-60" max="30" step="1" value={musicVolume} onChange={(e) => setMusicVolume(parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Pulse Alignment / Target BPM</label>
                  <button onClick={() => setTargetBpm(undefined)} className="text-xs font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider">Reset</button>
                </div>
                <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-700/30 space-y-4">
                  <div className="grid grid-cols-4 gap-3">
                    {focusTrack?.divisorBpms?.map(bpm => (
                      <button 
                        key={bpm} 
                        onClick={() => setTargetBpm(bpm)} 
                        className={`py-2.5 rounded-lg mono text-xs border transition-colors font-bold ${targetBpm === bpm ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                      >
                        {bpm}
                      </button>
                    ))}
                  </div>
                  <input 
                    type="number" 
                    placeholder="Custom Target BPM" 
                    value={targetBpm || ''} 
                    onChange={(e) => setTargetBpm(parseFloat(e.target.value) || undefined)} 
                    className="w-full bg-slate-950 border border-slate-800 rounded p-3 pl-4 text-base mono text-indigo-400 focus:outline-none focus:border-indigo-500" 
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">Mastering Quality</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['wav_lossless', 'flac_lossless', 'mp3_high', 'mp3_standard'] as ExportFormat[]).map((format) => (
                    <button
                      key={format}
                      onClick={() => setExportFormat(format)}
                      className={`py-3 px-1 rounded-lg text-xs font-bold border transition-all ${
                        exportFormat === format 
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' 
                          : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                      }`}
                    >
                      {format === 'wav_lossless' ? 'WAV' : format === 'flac_lossless' ? 'FLAC' : format === 'mp3_high' ? 'MP3 320K' : 'MP3 192K'}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                disabled={!focusTrack || !musicTrack || isProcessing} 
                onClick={handleProcess} 
                className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-lg font-black rounded-xl shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3"
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>SYNTHESIZING {progress}%</span>
                  </>
                ) : resultBlob ? 'RE-CRAFT TUNE' : 'CRAFT TUNE'}
              </button>
            </section>
          </div>
        </div>

        <TipsSection />
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-slate-900/80 backdrop-blur-xl border-t border-slate-800 p-6 z-[60] shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-8">
          <div className="flex-1 w-full flex flex-col gap-4">
            {resultBlob ? (
                <>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">Mastering Complete</span>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{exportFormat.replace('_', ' ').toUpperCase()}</span>
                    </div>
                    <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="flex-1 w-full relative">
                            <AudioVisualizer audioRef={audioRef} />
                            <div className="absolute inset-x-0 bottom-4 px-4">
                                <audio ref={audioRef} controls src={previewUrl || ''} className="w-full h-8 filter invert hue-rotate-180 brightness-150 saturate-0 opacity-90" />
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 min-w-[220px] w-full md:w-auto">
                            <button 
                                onClick={() => {
                                    const a = document.createElement('a'); 
                                    a.href = previewUrl!; 
                                    let ext = 'wav';
                                    if (exportFormat === 'flac_lossless') ext = 'flac';
                                    else if (exportFormat.startsWith('mp3')) ext = 'mp3';
                                    a.download = `TuneScape_${focusTrack?.name.split('.')[0]}.${ext}`; 
                                    a.click();
                                }} 
                                className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white text-base font-black rounded-xl shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-1 flex items-center justify-center gap-3"
                            >
                                <i className="fas fa-download"></i>
                                <span>DOWNLOAD TUNE</span>
                            </button>
                        </div>
                    </div>
                </>
            ) : isProcessing ? (
                <div className="w-full flex flex-col items-center justify-center py-4 space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm text-indigo-400 font-bold uppercase tracking-widest">Synthesis in Progress: {progress}%</p>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
            ) : (
                <div className="w-full flex items-center justify-center py-12 opacity-40 border-2 border-dashed border-slate-800 rounded-xl">
                    <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                            <i className="fas fa-wave-square text-slate-600 text-lg"></i>
                        </div>
                        <div className="text-left">
                            <h3 className="text-base font-bold text-slate-400 uppercase tracking-widest leading-none">Output Idle</h3>
                            <p className="text-xs text-slate-500 mt-2">Configure your tracks and mix to generate master output.</p>
                        </div>
                    </div>
                </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
