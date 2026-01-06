
export type DetectionMode = 'fast' | 'accurate';
export type ExportFormat = 'mp3_high' | 'mp3_standard' | 'wav_lossless' | 'flac_lossless';

export interface AudioMetadata {
  name: string;
  duration: number;
  sampleRate: number;
  buffer: AudioBuffer;
  format: string;
  bpmInfo?: {
    raw: number;
    corrected: number;
    candidates: number[];
    stdDev: number;
    confidence: 'high' | 'medium' | 'low';
    algorithmsUsed: string[];
    allPasses: number[];
    filteredPasses: number[];
    modeUsed: DetectionMode;
  };
  frequency?: number;
  pulseRate?: number;
  divisorBpms?: number[];
}

export interface LoopBoundaries {
  introEnd: number;
  outroStart: number;
  detected: boolean;
}

export interface ProcessingOptions {
  targetDurationMinutes: number;
  musicVolumeDb: number;
  focusVolumeDb: number;
  crossfadeDuration: number;
  exportFormat: ExportFormat;
  targetBpm?: number;
  sourceBpmOverride?: number;
  manualBoundaries?: {
    introEnd: number;
    outroStart: number;
  };
}
