import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { AudioAnalyzer } from './AudioAnalyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AudioLibrary {
  constructor() {
    this.audioPath = path.join(__dirname, '../../audio');
    this.supportedFormats = ['.mp3', '.wav', '.ogg', '.flac', '.mp2', '.wax', '.wma'];
    this.analyzer = new AudioAnalyzer();
    
    // Audio categories
    this.library = {
      music: [],
      dj: {
        timeOfDay: { MORNING: [], AFTERNOON: [], EVENING: [], NIGHT: [] },
        weather: { SUN: [], WIND: [], RAIN: [], FOG: [], CLOUDY: [] },
        transitions: { TO_AD: [], TO_WEATHER: [], TO_MUSIC: [] },
        intros: [],
        outros: [],
        solos: [],
        ids: []
      },
      jingles: [],
      ads: []
    };
  }

  async scanLibrary() {
    console.log('📁 Scanning audio library...');
    
    try {
      await this.ensureDirectoryExists(this.audioPath);
      await this.scanDirectory(this.audioPath);
      console.log(`✅ Scanned ${this.getTotalFiles()} audio files`);
    } catch (error) {
      console.error('Failed to scan audio library:', error);
    }
  }

  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
      console.log(`📁 Created audio directory: ${dirPath}`);
    }
  }

  async scanDirectory(dirPath) {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      
      if (item.isDirectory()) {
        await this.scanDirectory(fullPath);
      } else if (this.isSupportedFormat(item.name)) {
        await this.categorizeAudioFile(fullPath, item.name);
      }
    }
  }

  isSupportedFormat(filename) {
    const ext = path.extname(filename).toLowerCase();
    return this.supportedFormats.includes(ext);
  }

  async categorizeAudioFile(filePath, filename) {
    const baseName = path.basename(filename, path.extname(filename));
    const upperName = baseName.toUpperCase();
    
    // Validate file can be processed
    const isValid = await this.analyzer.validateAudioFile(filePath);
    if (!isValid) {
      console.warn(`⚠️  Skipping invalid audio file: ${filename}`);
      return;
    }
    
    // Categorize based on filename patterns
    if (this.isDJTimeAnnouncement(upperName)) {
      await this.categorizeDJTime(filePath, upperName, baseName);
    } else if (this.isDJWeather(upperName)) {
      await this.categorizeDJWeather(filePath, upperName, baseName);
    } else if (this.isDJTransition(upperName)) {
      await this.categorizeDJTransition(filePath, upperName, baseName);
    } else if (upperName.startsWith('INTRO_')) {
      this.library.dj.intros.push(await this.createAudioItem(filePath, baseName, 'dj-intro'));
    } else if (upperName.startsWith('OUTRO_')) {
      this.library.dj.outros.push(await this.createAudioItem(filePath, baseName, 'dj-outro'));
    } else if (upperName.startsWith('SOLO_')) {
      this.library.dj.solos.push(await this.createAudioItem(filePath, baseName, 'dj-solo'));
    } else if (upperName.startsWith('ID_')) {
      this.library.dj.ids.push(await this.createAudioItem(filePath, baseName, 'dj-id'));
    } else if (upperName.includes('JINGLE') || upperName.startsWith('JING_')) {
      this.library.jingles.push(await this.createAudioItem(filePath, baseName, 'jingle'));
    } else if (upperName.includes('AD_') || upperName.includes('COMMERCIAL')) {
      this.library.ads.push(await this.createAudioItem(filePath, baseName, 'ad'));
    } else {
      // Assume it's music
      this.library.music.push(await this.createMusicItem(filePath, baseName));
    }
  }

  isDJTimeAnnouncement(upperName) {
    return ['MORNING_', 'AFTERNOON_', 'EVENING_', 'NIGHT_'].some(prefix => upperName.startsWith(prefix));
  }

  isDJWeather(upperName) {
    return ['SUN_', 'WIND_', 'RAIN_', 'FOG_', 'CLOUDY_'].some(prefix => upperName.startsWith(prefix));
  }

  isDJTransition(upperName) {
    return ['TO_AD_', 'TO_WEATHER_', 'TO_MUSIC_'].some(prefix => upperName.startsWith(prefix));
  }

  async categorizeDJTime(filePath, upperName, baseName) {
    const timeOfDay = upperName.split('_')[0];
    if (this.library.dj.timeOfDay[timeOfDay]) {
      this.library.dj.timeOfDay[timeOfDay].push(
        await this.createAudioItem(filePath, baseName, `dj-time-${timeOfDay.toLowerCase()}`)
      );
    }
  }

  async categorizeDJWeather(filePath, upperName, baseName) {
    const weatherType = upperName.split('_')[0];
    if (this.library.dj.weather[weatherType]) {
      this.library.dj.weather[weatherType].push(
        await this.createAudioItem(filePath, baseName, `dj-weather-${weatherType.toLowerCase()}`)
      );
    }
  }

  async categorizeDJTransition(filePath, upperName, baseName) {
    const transitionType = upperName.replace('TO_', '').split('_')[0];
    const key = `TO_${transitionType}`;
    if (this.library.dj.transitions[key]) {
      this.library.dj.transitions[key].push(
        await this.createAudioItem(filePath, baseName, `dj-transition-${transitionType.toLowerCase()}`)
      );
    }
  }

  async createAudioItem(filePath, baseName, type) {
    const duration = await this.analyzer.analyzeDuration(filePath);
    const streamingInfo = await this.analyzer.getStreamingInfo(filePath);
    
    return {
      path: filePath,
      title: baseName,
      type,
      duration,
      startTime: null,
      streamingInfo
    };
  }

  async createMusicItem(filePath, baseName) {
    const duration = await this.analyzer.analyzeDuration(filePath);
    const metadata = await this.analyzer.analyzeMetadata(filePath);
    const streamingInfo = await this.analyzer.getStreamingInfo(filePath);
    
    return {
      path: filePath,
      title: metadata.title || (baseName.includes(' - ') ? baseName.split(' - ')[1] : baseName),
      artist: metadata.artist || (baseName.includes(' - ') ? baseName.split(' - ')[0] : 'Unknown Artist'),
      album: metadata.album || null,
      type: 'music',
      duration,
      startTime: null,
      metadata,
      streamingInfo
    };
  }

  // Remove the old estimation method - we now use ffprobe
  // estimateDuration() method removed - replaced with AudioAnalyzer

  getTotalFiles() {
    let total = this.library.music.length + this.library.jingles.length + this.library.ads.length;
    
    // Count DJ files
    Object.values(this.library.dj.timeOfDay).forEach(arr => total += arr.length);
    Object.values(this.library.dj.weather).forEach(arr => total += arr.length);
    Object.values(this.library.dj.transitions).forEach(arr => total += arr.length);
    total += this.library.dj.intros.length;
    total += this.library.dj.outros.length;
    total += this.library.dj.solos.length;
    total += this.library.dj.ids.length;
    
    return total;
  }

  // Getter methods for playlist generation
  getRandomMusic() {
    return this.getRandomFrom(this.library.music);
  }

  getRandomJingle() {
    return this.getRandomFrom(this.library.jingles);
  }

  getRandomDJTime(timeOfDay) {
    return this.getRandomFrom(this.library.dj.timeOfDay[timeOfDay] || []);
  }

  getRandomDJWeather(weatherType) {
    return this.getRandomFrom(this.library.dj.weather[weatherType] || []);
  }

  getRandomDJTransition(transitionType) {
    return this.getRandomFrom(this.library.dj.transitions[transitionType] || []);
  }

  getRandomDJIntro() {
    return this.getRandomFrom(this.library.dj.intros);
  }

  getRandomDJOutro() {
    return this.getRandomFrom(this.library.dj.outros);
  }

  getRandomDJSolo() {
    return this.getRandomFrom(this.library.dj.solos);
  }

  getRandomDJID() {
    return this.getRandomFrom(this.library.dj.ids);
  }

  getRandomAd() {
    return this.getRandomFrom(this.library.ads);
  }

  getRandomFrom(array) {
    if (array.length === 0) return null;
    return { ...array[Math.floor(Math.random() * array.length)] };
  }
}