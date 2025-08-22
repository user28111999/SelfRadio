import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

export class AudioAnalyzer {
  constructor() {
    this.durationCache = new Map();
    this.metadataCache = new Map();
  }

  async analyzeDuration(filePath) {
    // Check cache first
    const cacheKey = `${filePath}_${await this.getFileModTime(filePath)}`;
    if (this.durationCache.has(cacheKey)) {
      return this.durationCache.get(cacheKey);
    }

    try {
      const duration = await this.probeDuration(filePath);
      this.durationCache.set(cacheKey, duration);
      return duration;
    } catch (error) {
      console.warn(`Failed to probe duration for ${filePath}:`, error.message);
      return this.estimateDurationFromFileSize(filePath);
    }
  }

  async analyzeMetadata(filePath) {
    const cacheKey = `${filePath}_${await this.getFileModTime(filePath)}`;
    if (this.metadataCache.has(cacheKey)) {
      return this.metadataCache.get(cacheKey);
    }

    try {
      const metadata = await this.probeMetadata(filePath);
      this.metadataCache.set(cacheKey, metadata);
      return metadata;
    } catch (error) {
      console.warn(`Failed to probe metadata for ${filePath}:`, error.message);
      return this.extractMetadataFromFilename(filePath);
    }
  }

  probeDuration(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const duration = metadata.format.duration;
        if (duration && !isNaN(duration)) {
          resolve(Math.floor(duration * 1000)); // Convert to milliseconds
        } else {
          reject(new Error('No duration found in metadata'));
        }
      });
    });
  }

  probeMetadata(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const tags = metadata.format.tags || {};
        const result = {
          title: tags.title || tags.TITLE || null,
          artist: tags.artist || tags.ARTIST || null,
          album: tags.album || tags.ALBUM || null,
          duration: metadata.format.duration ? Math.floor(metadata.format.duration * 1000) : null,
          bitrate: metadata.format.bit_rate ? Math.floor(metadata.format.bit_rate / 1000) : null,
          sampleRate: null,
          channels: null
        };

        // Extract audio stream info
        const audioStream = metadata.streams?.find(s => s.codec_type === 'audio');
        if (audioStream) {
          result.sampleRate = audioStream.sample_rate;
          result.channels = audioStream.channels;
        }

        resolve(result);
      });
    });
  }

  async getFileModTime(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.mtime.getTime();
    } catch {
      return Date.now();
    }
  }

  async estimateDurationFromFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const fileSizeKB = stats.size / 1024;
      const ext = path.extname(filePath).toLowerCase();
      
      // Rough estimates based on typical bitrates
      const bitrateEstimates = {
        '.mp3': 128,
        '.wav': 1411,
        '.flac': 800,
        '.ogg': 128,
        '.mp2': 128,
        '.wma': 128,
        '.wax': 128
      };
      
      const estimatedBitrate = bitrateEstimates[ext] || 128;
      const durationSeconds = (fileSizeKB * 8) / estimatedBitrate;
      
      return Math.floor(durationSeconds * 1000);
    } catch {
      // Final fallback
      return Math.floor(Math.random() * 240000) + 60000; // 1-4 minutes
    }
  }

  extractMetadataFromFilename(filePath) {
    const basename = path.basename(filePath, path.extname(filePath));
    const parts = basename.split(' - ');
    
    return {
      title: parts.length > 1 ? parts[1].trim() : basename,
      artist: parts.length > 1 ? parts[0].trim() : null,
      album: null,
      duration: null,
      bitrate: null,
      sampleRate: null,
      channels: null
    };
  }

  // Generate concat file for gapless playback
  async generateConcatFile(audioItems, outputPath) {
    const concatContent = audioItems
      .map(item => `file '${item.path.replace(/'/g, "'\\''")}'\n`) // Escape single quotes
      .join('');
    
    await fs.writeFile(outputPath, concatContent, 'utf8');
    return outputPath;
  }

  // Validate audio file can be processed by ffmpeg
  async validateAudioFile(filePath) {
    try {
      await this.probeDuration(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // Get audio file technical info for streaming optimization
  async getStreamingInfo(filePath) {
    try {
      const metadata = await this.analyzeMetadata(filePath);
      return {
        needsReencoding: this.needsReencoding(filePath, metadata),
        recommendedBitrate: this.getRecommendedBitrate(metadata),
        hasCompatibleFormat: this.hasCompatibleFormat(filePath)
      };
    } catch {
      return {
        needsReencoding: true,
        recommendedBitrate: 128,
        hasCompatibleFormat: false
      };
    }
  }

  needsReencoding(filePath, metadata) {
    const ext = path.extname(filePath).toLowerCase();
    
    // MP3 files might not need reencoding if they're already at good bitrate
    if (ext === '.mp3' && metadata.bitrate && metadata.bitrate >= 96 && metadata.bitrate <= 320) {
      return false;
    }
    
    // Other formats typically need conversion for streaming
    return true;
  }

  getRecommendedBitrate(metadata) {
    if (!metadata.bitrate) return 128;
    
    // Don't exceed original bitrate, but ensure minimum quality
    const originalBitrate = metadata.bitrate;
    if (originalBitrate <= 96) return 96;
    if (originalBitrate <= 128) return 128;
    if (originalBitrate <= 192) return 192;
    return 256; // Cap at 256kbps for streaming
  }

  hasCompatibleFormat(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ['.mp3', '.ogg'].includes(ext);
  }
}