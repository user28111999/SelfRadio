import express from 'express';
import { RadioScheduler } from './core/RadioScheduler.js';
import { EnhancedStreamManager } from './core/EnhancedStreamManager.js';
import { WeatherService } from './services/WeatherService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RadioServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.weatherService = new WeatherService();
    
    // Enhanced stream manager with HLS support
    this.streamManager = new EnhancedStreamManager({
      format: 'mp3',
      bitrate: '128k',
      enableHLS: true
    });
    
    this.scheduler = new RadioScheduler(this.weatherService, this.streamManager);
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../public')));
    
    // CORS for streaming
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });
  }

  setupRoutes() {
    // Main radio stream endpoint
    this.app.get('/stream', (req, res) => {
      const icyMetadata = req.query.icy === '1';
      
      const headers = {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      };
      
      // Add ICY headers if requested
      if (icyMetadata) {
        headers['icy-name'] = 'Custom Radio Station';
        headers['icy-genre'] = 'Various';
        headers['icy-br'] = '128';
        headers['icy-metaint'] = '8192';
      }
      
      res.writeHead(200, headers);
      this.streamManager.addClient(res);
      
      req.on('close', () => {
        this.streamManager.removeClient(res);
      });
    });

    // HLS stream endpoint
    this.app.get('/hls/:file', (req, res) => {
      const fileName = req.params.file;
      const filePath = path.join(__dirname, '../public/hls', fileName);
      
      if (fileName.endsWith('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      } else if (fileName.endsWith('.ts')) {
        res.setHeader('Content-Type', 'video/mp2t');
      }
      
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.sendFile(filePath);
    });

    // API endpoints
    this.app.get('/api/now-playing', (req, res) => {
      res.json(this.scheduler.getCurrentTrack());
    });

    this.app.get('/api/schedule', (req, res) => {
      res.json(this.scheduler.getUpcoming());
    });

    this.app.get('/api/stream/stats', (req, res) => {
      res.json(this.streamManager.getStreamStats());
    });

    this.app.post('/api/weather/set', (req, res) => {
      const { city, country } = req.body;
      if (!city || !country) {
        return res.status(400).json({ error: 'City and country are required' });
      }
      
      this.weatherService.setLocation(city, country);
      res.json({ message: 'Location updated successfully' });
    });

    this.app.get('/api/weather/current', async (req, res) => {
      try {
        const weather = await this.weatherService.getCurrentWeather();
        res.json(weather);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get weather data' });
      }
    });

    // Stream configuration endpoint
    this.app.post('/api/stream/config', (req, res) => {
      const { bitrate, format } = req.body;
      
      if (bitrate || format) {
        this.streamManager.updateStreamConfig({ bitrate, format });
        res.json({ message: 'Stream configuration updated' });
      } else {
        res.status(400).json({ error: 'No valid configuration provided' });
      }
    });

    // Serve web player
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });
  }

  async start() {
    try {
      await this.streamManager.initialize();
      await this.scheduler.initialize();
      this.scheduler.start();
      
      this.app.listen(this.port, () => {
        console.log(`Radio Station streaming on http://localhost:${this.port}`);
        console.log(`MP3 Stream: http://localhost:${this.port}/stream`);
        console.log(`HLS Stream: http://localhost:${this.port}/hls/stream.m3u8`);
        console.log(`ICY Stream: http://localhost:${this.port}/stream?icy=1`);
        console.log(`Web Player: http://localhost:${this.port}`);
      });
    } catch (error) {
      console.error('Failed to start radio server:', error);
      process.exit(1);
    }
  }
}

const server = new RadioServer();
server.start();