import cron from 'node-cron';
import { AudioLibrary } from './AudioLibrary.js';
import { PlaylistGenerator } from './PlaylistGenerator.js';

export class RadioScheduler {
  constructor(weatherService, streamManager) {
    this.weatherService = weatherService;
    this.streamManager = streamManager;
    this.audioLibrary = new AudioLibrary();
    this.playlistGenerator = new PlaylistGenerator(this.audioLibrary);
    
    this.currentTrack = null;
    this.isPlaying = false;
    this.queue = [];
    this.schedule = [];
  }

  async initialize() {
    console.log('🎵 Initializing Radio Scheduler...');
    await this.audioLibrary.scanLibrary();
    this.generateInitialPlaylist();
    this.setupCronJobs();
    console.log('✅ Radio Scheduler initialized');
  }

  setupCronJobs() {
    // Weather updates every hour
    cron.schedule('0 * * * *', async () => {
      await this.scheduleWeatherSegment();
    });

    // Time announcements
    cron.schedule('0 6,12,18,22 * * *', () => {
      this.scheduleTimeAnnouncement();
    });

    // Ad breaks every 30 minutes
    cron.schedule('*/30 * * * *', () => {
      this.scheduleAdBreak();
    });
  }

  generateInitialPlaylist() {
    this.queue = this.playlistGenerator.generatePlaylist(50);
    this.scheduleNext();
  }

  scheduleNext() {
    if (this.queue.length === 0) {
      this.queue = this.playlistGenerator.generatePlaylist(20);
    }

    const nextItem = this.queue.shift();
    
    if (Array.isArray(nextItem)) {
      // Handle gapless sequences
      this.currentTrack = nextItem[0];
      
      // Check if we can play this sequence gaplessly
      if (this.streamManager.canPlayGapless && this.streamManager.canPlayGapless(nextItem)) {
        this.streamManager.playGaplessSequence(nextItem);
        
        // Schedule next item after the entire sequence
        const totalDuration = this.streamManager.getSequenceDuration(nextItem);
        setTimeout(() => {
          this.scheduleNext();
        }, totalDuration);
      } else {
        // Fallback to individual playback
        this.playSequenceIndividually(nextItem);
      }
    } else {
      // Single item
      this.currentTrack = nextItem;
      
      if (nextItem) {
        this.streamManager.playTrack(nextItem);
        
        // Schedule the next track
        setTimeout(() => {
          this.scheduleNext();
        }, nextItem.duration);
      }
    }
  }

  playSequenceIndividually(sequence) {
    if (sequence.length === 0) {
      this.scheduleNext();
      return;
    }
    
    const currentItem = sequence.shift();
    this.streamManager.playTrack(currentItem);
    
    setTimeout(() => {
      if (sequence.length > 0) {
        this.playSequenceIndividually(sequence);
      } else {
        this.scheduleNext();
      }
    }, currentItem.duration);
  }

  async scheduleWeatherSegment() {
    try {
      const weather = await this.weatherService.getCurrentWeather();
      const weatherSegment = this.playlistGenerator.createWeatherSegment(weather);
      
      // Insert weather segment after current track
      this.queue.unshift(weatherSegment);
      console.log('📊 Weather segment scheduled');
    } catch (error) {
      console.error('Failed to schedule weather segment:', error);
    }
  }

  scheduleTimeAnnouncement() {
    const hour = new Date().getHours();
    let timeOfDay = 'MORNING';
    
    if (hour >= 12 && hour < 18) timeOfDay = 'AFTERNOON';
    else if (hour >= 18 && hour < 22) timeOfDay = 'EVENING';
    else if (hour >= 22 || hour < 6) timeOfDay = 'NIGHT';

    const timeSegment = this.playlistGenerator.createTimeSegment(timeOfDay);
    this.queue.unshift(timeSegment);
    console.log(`⏰ ${timeOfDay} announcement scheduled`);
  }

  scheduleAdBreak() {
    const adSegment = this.playlistGenerator.createAdSegment();
    this.queue.unshift(adSegment);
    console.log('📻 Ad break scheduled');
  }

  start() {
    this.isPlaying = true;
    console.log('▶️ Radio station started');
  }

  stop() {
    this.isPlaying = false;
    this.streamManager.stop();
    console.log('⏹️ Radio station stopped');
  }

  getCurrentTrack() {
    return {
      title: this.currentTrack?.title || 'Unknown',
      artist: this.currentTrack?.artist || 'Unknown',
      type: this.currentTrack?.type || 'music',
      startTime: this.currentTrack?.startTime || Date.now(),
      duration: this.currentTrack?.duration || 0
    };
  }

  getUpcoming() {
    return this.queue.slice(0, 5).map(track => ({
      title: track.title,
      artist: track.artist,
      type: track.type,
      duration: track.duration
    }));
  }
}