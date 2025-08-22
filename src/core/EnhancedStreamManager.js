import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class EnhancedStreamManager {
  constructor(options = {}) {
    this.clients = new Set();
    this.currentStream = null;
    this.ffmpegProcess = null;
    this.currentTrack = null;
    this.icyMetadataInterval = 8192; // Standard ICY metadata interval
    
    // Stream configuration
    this.streamConfig = {
      format: options.format || 'mp3', // or 'hls'
      bitrate: options.bitrate || '128k',
      sampleRate: options.sampleRate || '44100',
      channels: options.channels || '2'
    };

    // HLS specific
    this.hlsEnabled = options.enableHLS || false;
    this.hlsPath = path.join(__dirname, '../../public/hls');
    this.hlsPlaylistFile = path.join(this.hlsPath, 'stream.m3u8');

    // Concat file for gapless playback
    this.concatPath = path.join(__dirname, '../../temp');
    this.currentConcatFile = null;
  }

  async initialize() {
    // Create necessary directories
    await fs.mkdir(this.concatPath, { recursive: true });
    
    if (this.hlsEnabled) {
      await fs.mkdir(this.hlsPath, { recursive: true });
    }
  }

  addClient(response) {
    // Set ICY headers for metadata support
    response.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'icy-name': 'Custom Radio Station',
      'icy-genre': 'Various',
      'icy-br': this.streamConfig.bitrate.replace('k', ''),
      'icy-metaint': this.icyMetadataInterval.toString()
    });

    this.clients.add(response);
    console.log(`📻 Client connected. Total: ${this.clients.size}`);
    
    // Send current ICY metadata to new client
    if (this.currentTrack) {
      this.sendICYMetadata(response);
    }
    
    // If we have a current stream, pipe it to the new client
    if (this.currentStream) {
      this.currentStream.pipe(response, { end: false });
    }
  }

  removeClient(response) {
    this.clients.delete(response);
    console.log(`📻 Client disconnected. Total: ${this.clients.size}`);
  }

  async playTrack(track) {
    console.log(`🎵 Playing: ${track.title} ${track.artist ? `by ${track.artist}` : ''}`);
    this.currentTrack = track;

    if (!track.path) {
      await this.playFallbackAudio(track);
      return;
    }

    this.stopCurrentStream();
    
    try {
      await this.createAudioStream(track);
      this.broadcastICYMetadata();
    } catch (error) {
      console.error('Failed to play track:', error);
      await this.playFallbackAudio(track);
    }
  }

  async playGaplessSequence(tracks) {
    if (tracks.length === 0) return;
    
    console.log(`🔄 Playing gapless sequence of ${tracks.length} tracks`);
    this.currentTrack = tracks[0]; // Use first track for metadata
    
    this.stopCurrentStream();

    try {
      // Create concat file for gapless playback
      const concatFile = await this.createConcatFile(tracks);
      await this.createConcatStream(concatFile);
      this.broadcastICYMetadata();
    } catch (error) {
      console.error('Failed to play gapless sequence:', error);
      // Fallback to individual track playback
      await this.playTrack(tracks[0]);
    }
  }

  async createAudioStream(track) {
    const ffmpegArgs = [
      '-i', track.path,
      '-f', 'mp3',
      '-acodec', 'libmp3lame',
      '-b:a', this.streamConfig.bitrate,
      '-ar', this.streamConfig.sampleRate,
      '-ac', this.streamConfig.channels,
      '-map_metadata', '-1', // Remove metadata to avoid issues
    ];

    // Add gapless options for better transitions
    if (track.streamingInfo?.needsReencoding) {
      ffmpegArgs.push(
        '-avoid_negative_ts', 'make_zero',
        '-fflags', '+genpts'
      );
    }

    ffmpegArgs.push('-');

    this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
    this.currentStream = this.ffmpegProcess.stdout;
    
    this.setupStreamPiping();
    this.setupFFmpegErrorHandling();
  }

  async createConcatStream(concatFile) {
    const ffmpegArgs = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-f', 'mp3',
      '-acodec', 'libmp3lame',
      '-b:a', this.streamConfig.bitrate,
      '-ar', this.streamConfig.sampleRate,
      '-ac', this.streamConfig.channels,
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts',
      '-'
    ];

    this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
    this.currentStream = this.ffmpegProcess.stdout;
    this.currentConcatFile = concatFile;
    
    this.setupStreamPiping();
    this.setupFFmpegErrorHandling();
  }

  async createConcatFile(tracks) {
    const concatFile = path.join(this.concatPath, `concat_${Date.now()}.txt`);
    const concatContent = tracks
      .filter(track => track.path) // Only include tracks with valid paths
      .map(track => `file '${track.path.replace(/'/g, "'\\''")}'\n`)
      .join('');
    
    await fs.writeFile(concatFile, concatContent, 'utf8');
    return concatFile;
  }

  setupStreamPiping() {
    // Pipe to all connected clients with ICY metadata injection
    this.clients.forEach(client => {
      if (!client.destroyed) {
        this.currentStream.pipe(client, { end: false });
      }
    });
  }

  setupFFmpegErrorHandling() {
    this.ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      // Log only important errors, not normal ffmpeg output
      if (output.includes('Error') || output.includes('Failed')) {
        console.error('FFmpeg error:', output.trim());
      }
    });

    this.ffmpegProcess.on('close', async (code) => {
      if (code !== 0 && code !== null) {
        console.log(`FFmpeg process exited with code ${code}`);
      }
      
      // Clean up concat file
      if (this.currentConcatFile) {
        try {
          await fs.unlink(this.currentConcatFile);
        } catch (error) {
          // Ignore cleanup errors
        }
        this.currentConcatFile = null;
      }
      
      this.currentStream = null;
    });

    this.ffmpegProcess.on('error', (error) => {
      console.error('FFmpeg spawn error:', error.message);
      this.playFallbackAudio(this.currentTrack);
    });
  }

  broadcastICYMetadata() {
    if (!this.currentTrack) return;
    
    this.clients.forEach(client => {
      if (!client.destroyed) {
        this.sendICYMetadata(client);
      }
    });
  }

  sendICYMetadata(client) {
    if (!this.currentTrack) return;
    
    const title = this.currentTrack.title || 'Unknown';
    const artist = this.currentTrack.artist || '';
    const metadataString = `StreamTitle='${artist ? `${artist} - ` : ''}${title}';`;
    
    // ICY metadata format: length byte + padded metadata
    const metadataBuffer = Buffer.from(metadataString, 'utf8');
    const metadataLength = Math.ceil(metadataBuffer.length / 16);
    const paddedMetadata = Buffer.alloc(metadataLength * 16);
    metadataBuffer.copy(paddedMetadata);
    
    const icyPacket = Buffer.concat([
      Buffer.from([metadataLength]),
      paddedMetadata
    ]);
    
    try {
      client.write(icyPacket);
    } catch (error) {
      // Client disconnected, ignore
    }
  }

  async playFallbackAudio(track) {
    console.log('🔄 Playing fallback audio');
    this.stopCurrentStream();
  }
}