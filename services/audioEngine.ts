
import { AudioMetadata, LoopBoundaries, ProcessingOptions, DetectionMode, ExportFormat } from '../types';

export class AudioEngine {
  static async decodeFile(file: File, mode: DetectionMode = 'fast', onStatusUpdate?: (status: string) => void): Promise<AudioMetadata> {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    const name = file.name;
    const format = file.type.split('/')[1]?.toUpperCase() || 'AUDIO';
    
    const metadata: AudioMetadata = {
      name,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      buffer: audioBuffer,
      format
    };

    if (audioBuffer.duration < 600) { 
      metadata.bpmInfo = await this.analyzeBpm(audioBuffer, mode, onStatusUpdate);
    }

    metadata.frequency = this.extractFrequency(name) || await this.detectDominantFrequency(audioBuffer);
    if (metadata.frequency) {
      metadata.pulseRate = metadata.frequency * 60;
      metadata.divisorBpms = [6, 8, 10, 12].map(n => Math.round((metadata.pulseRate! / n) * 10) / 10);
    }

    return metadata;
  }

  private static extractFrequency(name: string): number | null {
    const match = name.match(/(\d+[._]?\d*)\s*hz/i);
    if (match) {
      return parseFloat(match[1].replace('_', '.'));
    }
    return null;
  }

  private static async detectDominantFrequency(buffer: AudioBuffer): Promise<number | null> {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const fftSize = 2048;
    const offlineCtx = new OfflineAudioContext(1, fftSize, sampleRate);
    
    const b = offlineCtx.createBuffer(1, fftSize, sampleRate);
    const start = Math.floor(data.length / 2);
    b.copyToChannel(data.slice(start, start + fftSize), 0);

    const source = offlineCtx.createBufferSource();
    source.buffer = b;

    const analyser = offlineCtx.createAnalyser();
    analyser.fftSize = fftSize;
    source.connect(analyser);
    analyser.connect(offlineCtx.destination);
    
    source.start(0);
    await offlineCtx.startRendering();

    const freqData = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(freqData);

    let maxVal = -Infinity;
    let maxIdx = 0;
    const upperLimit = Math.floor((1000 * fftSize) / sampleRate);
    for (let i = 1; i < upperLimit; i++) {
      if (freqData[i] > maxVal) {
        maxVal = freqData[i];
        maxIdx = i;
      }
    }

    const freq = maxIdx * (sampleRate / fftSize);
    return freq > 5 ? Math.round(freq * 10) / 10 : null;
  }

  static async analyzeBpm(
    buffer: AudioBuffer, 
    mode: DetectionMode, 
    onStatusUpdate?: (status: string) => void
  ): Promise<any> {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const rawResults: number[] = [];
    let algorithmsUsed: string[] = [];

    if (mode === 'accurate') {
      onStatusUpdate?.("Accessing Deep Analysis Weights...");
      await new Promise(r => setTimeout(r, 800));
      onStatusUpdate?.("Analyzing Temporal Energy Grids...");
      
      const bpm = await this.detectBpmByAutocorrelation(buffer);
      if (bpm > 40 && bpm < 250) rawResults.push(bpm);
      algorithmsUsed = ["Full-Track Autocorrelation"];
    } else {
      onStatusUpdate?.("Running Fast Multi-Pass Peaks...");
      const hopSizes = [0.03, 0.05, 0.08, 0.1, 0.12, 0.15]; 
      for (const hop of hopSizes) {
        const tempo = this.detectBpmByPeakClustering(data, sampleRate, hop);
        if (tempo > 40 && tempo < 300) rawResults.push(Math.round(tempo * 10) / 10);
      }
      algorithmsUsed = ["Peak Clustering"];
    }

    if (rawResults.length === 0) {
      return { 
        raw: 120, corrected: 120, candidates: [], stdDev: 0, confidence: 'low', 
        algorithmsUsed: ["Fallback"], allPasses: [], filteredPasses: [], modeUsed: mode 
      };
    }

    rawResults.sort((a, b) => a - b);
    const q1 = rawResults[Math.floor(rawResults.length * 0.25)];
    const q3 = rawResults[Math.floor(rawResults.length * 0.75)];
    const iqr = q3 - q1;
    const filteredPasses = iqr === 0 ? rawResults : rawResults.filter(t => t >= q1 - 1.5 * iqr && t <= q3 + 1.5 * iqr);
    
    const medianBpm = filteredPasses[Math.floor(filteredPasses.length / 2)];
    const mean = filteredPasses.reduce((a, b) => a + b, 0) / (filteredPasses.length || 1);
    const variance = filteredPasses.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (filteredPasses.length || 1);
    const stdDev = Math.sqrt(variance);

    let confidence: 'high' | 'medium' | 'low' = mode === 'accurate' ? 'high' : 'medium';
    if (stdDev >= 10 || (mode === 'fast' && filteredPasses.length < 3)) confidence = 'low';

    let corrected = medianBpm;
    while (corrected > 200) corrected /= 2;
    while (corrected < 60) corrected *= 2;
    
    const finalRaw = Math.round(medianBpm * 10) / 10;
    const finalCorrected = Math.round(corrected * 10) / 10;

    const candidates = [
      Math.round((finalCorrected / 2) * 10) / 10,
      Math.round((finalCorrected * 1.5) * 10) / 10,
      Math.round((finalCorrected * 2) * 10) / 10
    ].filter(c => c >= 40 && c <= 220 && Math.abs(c - finalCorrected) > 2);

    return { 
      raw: finalRaw, 
      corrected: finalCorrected, 
      candidates: Array.from(new Set(candidates)),
      stdDev: Math.round(stdDev * 100) / 100,
      confidence,
      algorithmsUsed,
      allPasses: rawResults,
      filteredPasses,
      modeUsed: mode
    };
  }

  private static async detectBpmByAutocorrelation(buffer: AudioBuffer): Promise<number> {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const targetFs = 100;
    const ratio = Math.floor(sampleRate / targetFs);
    const envLength = Math.floor(data.length / ratio);
    const env = new Float32Array(envLength);
    
    for (let i = 0; i < envLength - 1; i++) {
      let energy = 0;
      for (let j = 0; j < ratio; j++) {
        const val = data[i * ratio + j];
        energy += val * val;
      }
      env[i] = energy;
    }

    for (let i = env.length - 1; i > 0; i--) {
      env[i] = Math.max(0, env[i] - env[i - 1]);
    }

    let maxAuto = 0;
    let bestLag = 60;
    for (let lag = 30; lag <= 100; lag++) {
      let sum = 0;
      for (let i = 0; i < env.length - lag; i++) {
        sum += env[i] * env[i + lag];
      }
      if (sum > maxAuto) {
        maxAuto = sum;
        bestLag = lag;
      }
    }
    return (60 * targetFs) / bestLag;
  }

  private static detectBpmByPeakClustering(data: Float32Array, sampleRate: number, hopSec: number): number {
    const hopSize = Math.floor(sampleRate * hopSec);
    const peaks: number[] = [];
    const step = Math.max(1, Math.floor(data.length / 3000));
    for (let i = 0; i < data.length; i += hopSize) {
      let max = 0;
      for (let j = 0; j < hopSize && i + j < data.length; j += step) {
        const val = Math.abs(data[i + j]);
        if (val > max) max = val;
      }
      if (max > 0.15) peaks.push(i / sampleRate);
    }
    if (peaks.length < 5) return 0;
    const diffs = [];
    for (let i = 1; i < peaks.length; i++) {
      const d = peaks[i] - peaks[i - 1];
      if (d > 0.2 && d < 2.0) diffs.push(d);
    }
    if (diffs.length === 0) return 0;
    const avgDiff = diffs.sort()[Math.floor(diffs.length / 2)];
    return 60 / avgDiff;
  }

  static detectBoundaries(buffer: AudioBuffer): LoopBoundaries {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const chunkSize = Math.floor(sampleRate * 0.1); 
    const rmsValues: number[] = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      let sum = 0;
      const end = Math.min(i + chunkSize, data.length);
      for (let j = i; j < end; j++) sum += data[j] * data[j];
      rmsValues.push(Math.sqrt(sum / (end - i)));
    }
    const sortedRms = [...rmsValues].sort((a, b) => a - b);
    const threshold = sortedRms[Math.floor(sortedRms.length * 0.6)];
    let iEnd = -1, oStart = -1;
    for (let i = 0; i < rmsValues.length; i++) { if (rmsValues[i] > threshold) { iEnd = i; break; } }
    for (let i = rmsValues.length - 1; i >= 0; i--) { if (rmsValues[i] > threshold) { oStart = i; break; } }
    const introEnd = Math.min(buffer.duration, (iEnd * 0.1) + 10);
    const outroStart = Math.max(0, (oStart * 0.1) - 10);
    const detected = introEnd < outroStart && introEnd > 0 && outroStart < buffer.duration;
    return { introEnd: detected ? introEnd : 0, outroStart: detected ? outroStart : buffer.duration, detected };
  }

  /**
   * Performs granular time-stretching on an AudioBuffer to preserve pitch while changing tempo.
   * This implementation uses a classic Overlap-Add (OLA) approach.
   */
  private static timeStretch(buffer: AudioBuffer, rate: number): AudioBuffer {
    if (Math.abs(rate - 1.0) < 0.01) return buffer;

    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const inputLength = buffer.length;
    const outputLength = Math.floor(inputLength / rate);
    
    const offlineCtx = new OfflineAudioContext(numChannels, outputLength, sampleRate);
    const stretchedBuffer = offlineCtx.createBuffer(numChannels, outputLength, sampleRate);

    // Grain settings: 60ms grains with 50% overlap for musical stability
    const grainSize = Math.floor(sampleRate * 0.06); 
    const overlap = 0.5;
    const outputStride = Math.floor(grainSize * (1 - overlap));
    
    for (let channel = 0; channel < numChannels; channel++) {
      const inputData = buffer.getChannelData(channel);
      const outputData = stretchedBuffer.getChannelData(channel);
      
      let outPos = 0;
      while (outPos < outputLength) {
        // Find corresponding point in input
        const inPos = Math.floor(outPos * rate);
        if (inPos + grainSize > inputLength) break;
        
        for (let i = 0; i < grainSize; i++) {
          const outIdx = outPos + i;
          if (outIdx >= outputLength) break;
          
          // Apply a Cosine window (Hanning-like) for smooth transitions
          const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (grainSize - 1)));
          outputData[outIdx] += inputData[inPos + i] * window;
        }
        outPos += outputStride;
      }
    }
    return stretchedBuffer;
  }

  static async process(f: AudioMetadata, m: AudioMetadata, o: ProcessingOptions, p: (v: number) => void): Promise<Blob> {
    const tDur = o.targetDurationMinutes * 60;
    const outputSampleRate = Math.max(f.sampleRate, m.sampleRate);
    
    p(5);
    
    // Determine the tempo adjustment rate
    const sBpm = o.sourceBpmOverride || m.bpmInfo?.corrected || 120;
    const rate = o.targetBpm ? o.targetBpm / sBpm : 1.0;
    
    // If tempo shift is requested, we must stretch the music buffer once
    let musicBuffer = m.buffer;
    if (Math.abs(rate - 1.0) > 0.01) {
      musicBuffer = this.timeStretch(m.buffer, rate);
      p(25);
    }
    
    const ctx = new OfflineAudioContext(2, Math.floor(tDur * outputSampleRate), outputSampleRate);
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.89, 0); 
    masterGain.connect(ctx.destination);

    const focusGainLinear = Math.pow(10, o.focusVolumeDb / 20);
    this.renderLoopingTrack(ctx, f.buffer, tDur, focusGainLinear, o.crossfadeDuration, masterGain); 
    p(45);
    
    // Boundaries need to be adjusted for the new stretched duration
    const origBounds = o.manualBoundaries ? { ...o.manualBoundaries, detected: true } : this.detectBoundaries(m.buffer);
    const stretchedBounds: LoopBoundaries = {
        introEnd: origBounds.introEnd / rate,
        outroStart: origBounds.outroStart / rate,
        detected: origBounds.detected
    };

    const musicGainLinear = Math.pow(10, o.musicVolumeDb / 20);
    // Render at playbackRate 1.0 because timeStretch already handled the tempo
    this.renderMusicTrack(ctx, musicBuffer, tDur, musicGainLinear, stretchedBounds, o.crossfadeDuration, 1.0, masterGain); 
    p(75);
    
    const rendered = await ctx.startRendering(); 
    p(95);
    
    const blob = this.audioBufferToLossless(rendered, o.exportFormat); 
    p(100);
    return blob;
  }

  private static renderLoopingTrack(ctx: OfflineAudioContext, b: AudioBuffer, totalDur: number, targetVolume: number, cf: number, destination: AudioNode) {
    let cur = 0;
    const dur = b.duration;
    
    while (cur < totalDur) {
      const src = ctx.createBufferSource(); 
      src.buffer = b;
      const g = ctx.createGain(); 
      src.connect(g); 
      g.connect(destination);
      
      if (cur === 0) {
        g.gain.setValueAtTime(targetVolume, 0);
      } else {
        g.gain.setValueAtTime(0, cur);
        g.gain.linearRampToValueAtTime(targetVolume, cur + cf);
      }
      
      const segmentEnd = cur + dur;
      const fadeOutStart = segmentEnd - cf;
      
      if (segmentEnd < totalDur) {
         g.gain.setValueAtTime(targetVolume, fadeOutStart);
         g.gain.linearRampToValueAtTime(0, segmentEnd);
      } else {
         g.gain.setValueAtTime(targetVolume, Math.min(fadeOutStart, totalDur));
         if (totalDur > fadeOutStart) {
            g.gain.linearRampToValueAtTime(0, totalDur + cf);
         }
      }

      src.start(cur);
      if (segmentEnd > totalDur) src.stop(totalDur);
      
      cur = cur + dur - cf;
      if (cur >= totalDur) break;
    }
  }

  private static renderMusicTrack(ctx: OfflineAudioContext, b: AudioBuffer, totalDur: number, targetVolume: number, bnd: LoopBoundaries, cf: number, rate: number, destination: AudioNode) {
    const { introEnd, outroStart } = bnd;
    const loopStart = introEnd;
    const loopEnd = outroStart;
    
    const eIntroDur = introEnd / rate;
    const eLoopDur = (loopEnd - loopStart) / rate;
    const eOutroDur = (b.duration - loopEnd) / rate;
    
    let cur = 0;
    
    const iSrc = ctx.createBufferSource(); 
    iSrc.buffer = b; 
    iSrc.playbackRate.setValueAtTime(rate, 0);
    const iG = ctx.createGain(); 
    iG.gain.setValueAtTime(targetVolume, 0);
    iG.gain.setValueAtTime(targetVolume, eIntroDur - cf);
    iG.gain.linearRampToValueAtTime(0, eIntroDur);
    iSrc.connect(iG); 
    iG.connect(destination);
    iSrc.start(0, 0, introEnd);
    cur = eIntroDur;

    const lET = totalDur - eOutroDur;
    while (cur < lET) {
      const src = ctx.createBufferSource(); 
      src.buffer = b; 
      src.playbackRate.setValueAtTime(rate, 0);
      const g = ctx.createGain(); 
      g.connect(destination);
      src.connect(g);
      
      const startTime = cur - cf;
      g.gain.setValueAtTime(0, startTime);
      g.gain.linearRampToValueAtTime(targetVolume, cur);
      
      const segmentEnd = cur + eLoopDur;
      g.gain.setValueAtTime(targetVolume, segmentEnd - cf);
      g.gain.linearRampToValueAtTime(0, segmentEnd);

      src.start(startTime, Math.max(0, loopStart - (cf * rate)), (loopEnd - loopStart) + (cf * rate));
      
      const next = cur + eLoopDur - cf;
      if (next >= lET) {
        src.stop(lET);
        cur = lET;
      } else {
        cur = next;
      }
    }

    const oSrc = ctx.createBufferSource(); 
    oSrc.buffer = b; 
    oSrc.playbackRate.setValueAtTime(rate, 0);
    const oG = ctx.createGain(); 
    oG.connect(destination);
    oSrc.connect(oG);
    
    const outroStartTime = cur - cf;
    oG.gain.setValueAtTime(0, outroStartTime);
    oG.gain.linearRampToValueAtTime(targetVolume, cur);
    
    oSrc.start(outroStartTime, Math.max(0, loopEnd - (cf * rate)));
  }

  private static audioBufferToLossless(buffer: AudioBuffer, format: ExportFormat): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArray = new ArrayBuffer(length);
    const view = new DataView(bufferArray);
    let offset = 0, pos = 0;
    
    const set16 = (d: number) => { view.setUint16(offset, d, true); offset += 2; };
    const set32 = (d: number) => { view.setUint32(offset, d, true); offset += 4; };
    
    set32(0x46464952); // "RIFF"
    set32(length - 8); 
    set32(0x45564157); // "WAVE"
    set32(0x20746d66); // "fmt "
    set32(16); set16(1); set16(numOfChan); set32(buffer.sampleRate);
    set32(buffer.sampleRate * 2 * numOfChan); set16(numOfChan * 2); set16(16);
    set32(0x61746164); // "data"
    set32(length - offset - 4);
    
    const channels = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
    
    while (pos < buffer.length) {
      for (let i = 0; i < numOfChan; i++) {
        let s = Math.max(-1, Math.min(1, channels[i][pos]));
        s = (s < 0 ? s * 0x8000 : s * 0x7FFF);
        view.setInt16(offset, s, true); offset += 2;
      }
      pos++;
    }

    const type = format === 'flac_lossless' ? "audio/flac" : "audio/wav";
    return new Blob([bufferArray], { type });
  }
}
