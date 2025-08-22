import { spawn } from 'child_process';
import { Readable } from 'stream';

export class StreamManager {
  constructor() {
    this.clients = new Set();
    this.currentStream = null;
    this.ffmpegProcess = null;
  }

  addClient(response) {
    this.clients.add(response);
    console.log(`📻 Client connected. Total: ${this.clients.size}`);
    
    // If we have a current stream, pipe it to the new client
    if (this.currentStream) {
      this.currentStream.pipe(response, { end: false });
    }
  }

  removeClient(response) {
    this.clients.delete(response);
    console.log(`📻 Client disconnected. Total: ${this.clients.size}`);
  }

  playTrack(track) {
    console.log(`🎵 Playing: ${track.title} ${track.artist ? `by ${track.artist}` : ''}`);
    
    if (!track.path) {
      // Play silence or generate tone for fallback items
      this.playFallbackAudio(track);
      return;
    }

    this.stopCurrentStream();
    
    try {
      // Use FFmpeg to convert audio to MP3 stream
      this.ffmpegProcess = spawn('ffmpeg', [
        '-i', track.path,
        '-f', 'mp3',
        '-acodec', 'libmp3lame',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        '-'
      ]);

      this.currentStream = this.ffmpegProcess.stdout;
      
      // Pipe to all connected clients
      this.clients.forEach(client => {
        if (!client.destroyed) {
          this.currentStream.pipe(client, { end: false });
        }
      });

      this.ffmpegProcess.stderr.on('data', (data) => {
        // Log FFmpeg errors (optional, can be commented out for production)
        // console.log(`FFmpeg: ${data}`);
      });

      this.ffmpegProcess.on('close', (code) => {
        if (code !== 0 && code !== null) {
          console.log(`FFmpeg process exited with code ${code}`);
        }
        this.currentStream = null;
      });

      this.ffmpegProcess.on('error', (error) => {
        console.error('FFmpeg error:', error.message);
        this.playFallbackAudio(track);
      });

    } catch (error) {
      console.error('Failed to play track:', error);
      this.playFallbackAudio(track);
    }
  }

  playFallbackAudio(track) {
    // Generate a simple tone or silence for fallback
    this.stopCurrentStream();
    
    const duration = track.duration || 30000; // Default 30 seconds
    const sampleRate = 44100;
    const samples = Math.floor(duration * sampleRate / 1000);
    
    // Create a simple sine wave tone at 440Hz (A4)
    const frequency = 440;
    const amplitude = 0.1;
    
    const audioBuffer = Buffer.alloc(samples * 4); // 16-bit stereo
    
    for (let i = 0; i < samples; i++) {
      const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * amplitude;
      const value = Math.floor(sample * 32767);
      
      // Write stereo samples (left and right channels)
      audioBuffer.writeInt16LE(value, i * 4);
      audioBuffer.writeInt16LE(value, i * 4 + 2);
    }
    
    // Convert raw audio to MP3 using FFmpeg
    this.ffmpegProcess = spawn('ffmpeg', [
      '-f', 's16le',
      '-ar', '44100',
      '-ac', '2',
      '-i', '-',
      '-f', 'mp3',
      '-acodec', 'libmp3lame',
      '-b:a', '128k',
      '-'
    ]);
    
    this.currentStream = this.ffmpegProcess.stdout;
    
    // Pipe to all connected clients
    this.clients.forEach(client => {
      if (!client.destroyed) {
        this.currentStream.pipe(client, { end: false });
      }
    });
    
    // Send the audio data to FFmpeg
    this.ffmpegProcess.stdin.write(audioBuffer);
    this.ffmpegProcess.stdin.end();
    
    this.ffmpegProcess.on('close', () => {
      this.currentStream = null;
    });
  }

  stopCurrentStream() {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGTERM');
      this.ffmpegProcess = null;
    }
    this.currentStream = null;
  }

  stop() {
    this.stopCurrentStream();
    this.clients.clear();
  }
}