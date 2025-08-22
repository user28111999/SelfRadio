export class PlaylistGenerator {
  constructor(audioLibrary) {
    this.audioLibrary = audioLibrary;
    this.lastPlayedMusic = [];
    this.maxHistorySize = 20;
}

createTimeSegment(timeOfDay) {
    const timeAnnouncement = this.audioLibrary.getRandomDJTime(timeOfDay);
    if (!timeAnnouncement) return this.createFallbackItem();
    
    timeAnnouncement.startTime = Date.now();
    timeAnnouncement.timeOfDay = timeOfDay;
    return timeAnnouncement;
  }

  generatePlaylist(count = 10) {
    const playlist = [];
    
    for (let i = 0; i < count; i++) {
      // Vary content type based on position and randomization
      const contentType = this.determineContentType(i);
      
      switch (contentType) {
        case 'music-with-intro':
          const introSequence = this.createMusicWithIntro();
          playlist.push(...introSequence);
          break;
        case 'music-with-outro':
          const outroSequence = this.createMusicWithOutro();
          playlist.push(...outroSequence);
          break;
        case 'music-solo':
          playlist.push(this.createMusic());
          break;
        case 'dj-solo':
          playlist.push(this.createDJSolo());
          break;
        case 'jingle':
          playlist.push(this.createJingle());
          break;
        case 'station-id':
          playlist.push(this.createStationID());
          break;
        default:
          playlist.push(this.createMusic());
      }
    }
    
    return playlist;
  }

  // Create gapless sequences for tight transitions
  createGaplessSequence(items) {
    if (items.length <= 1) return items;
    
    // Mark sequence for gapless playback
    items[0].isGaplessStart = true;
    items[items.length - 1].isGaplessEnd = true;
    
    // Set consecutive timing
    let currentTime = Date.now();
    items.forEach(item => {
      item.startTime = currentTime;
      item.isGapless = true;
      currentTime += item.duration;
    });
    
    return items;
  }

  determineContentType(position) {
    const rand = Math.random();
    
    // Station ID every 5-7 tracks
    if (position > 0 && position % (5 + Math.floor(Math.random() * 3)) === 0) {
      return 'station-id';
    }
    
    // Jingle occasionally
    if (rand < 0.1) return 'jingle';
    
    // DJ solo occasionally
    if (rand < 0.15) return 'dj-solo';
    
    // Music with intro/outro commentary
    if (rand < 0.3) return 'music-with-intro';
    if (rand < 0.4) return 'music-with-outro';
    
    // Default to solo music
    return 'music-solo';
  }

  createMusic() {
    const music = this.audioLibrary.getRandomMusic();
    if (!music) return this.createFallbackItem();
    
    // Avoid recently played tracks
    if (this.wasRecentlyPlayed(music.title)) {
      return this.createMusic(); // Try again
    }
    
    this.addToHistory(music.title);
    music.startTime = Date.now();
    return music;
  }

  createMusicWithIntro() {
    const intro = this.audioLibrary.getRandomDJIntro();
    const music = this.createMusic();
    
    if (!intro) return [music];
    
    // Create gapless sequence for tight transition
    const sequence = this.createGaplessSequence([intro, music]);
    return sequence;
  }

  createMusicWithOutro() {
    const music = this.createMusic();
    const outro = this.audioLibrary.getRandomDJOutro();
    
    if (!outro) return [music];
    
    // Create gapless sequence for tight transition
    const sequence = this.createGaplessSequence([music, outro]);
    return sequence;
  }

  createDJSolo() {
    const solo = this.audioLibrary.getRandomDJSolo();
    if (!solo) return this.createFallbackItem();
    
    solo.startTime = Date.now();
    return solo;
  }

  createJingle() {
    const jingle = this.audioLibrary.getRandomJingle();
    if (!jingle) return this.createFallbackItem();
    
    jingle.startTime = Date.now();
    return jingle;
  }

  createStationID() {
    const id = this.audioLibrary.getRandomDJID();
    if (!id) return this.createFallbackItem();
    
    id.startTime = Date.now();
    return id;
  }

  createWeatherSegment(weatherData) {
    const segment = [];
    
    // Transition to weather
    const transition = this.audioLibrary.getRandomDJTransition('TO_WEATHER');
    if (transition) {
      segment.push(transition);
    }
    
    // Weather announcement based on conditions
    const weatherType = this.mapWeatherToType(weatherData.condition);
    const weatherAnnouncement = this.audioLibrary.getRandomDJWeather(weatherType);
    
    if (weatherAnnouncement) {
      weatherAnnouncement.weatherInfo = weatherData;
      segment.push(weatherAnnouncement);
    }
    
    // Create gapless sequence if we have multiple items
    if (segment.length > 1) {
      return this.createGaplessSequence(segment);
    }
    
    return segment.length > 0 ? segment : [this.createFallbackItem()];
  }

  createAdSegment() {
    const segment = [];
    
    // Transition to ad
    const transition = this.audioLibrary.getRandomDJTransition('TO_AD');
    if (transition) {
      segment.push(transition);
    }
    
    // Ad content (could be multiple ads)
    const adCount = Math.floor(Math.random() * 2) + 1; // 1-2 ads
    
    for (let i = 0; i < adCount; i++) {
      const ad = this.audioLibrary.getRandomAd();
      if (ad) {
        segment.push(ad);
      }
    }
    
    // Create gapless sequence for ad block
    if (segment.length > 1) {
      return this.createGaplessSequence(segment);
    }
    
    return segment.length > 0 ? segment : [this.createFallbackItem()];
  }

  mapWeatherToType(condition) {
    const conditionLower = condition.toLowerCase();
    
    if (conditionLower.includes('sun') || conditionLower.includes('clear')) return 'SUN';
    if (conditionLower.includes('wind')) return 'WIND';
    if (conditionLower.includes('rain') || conditionLower.includes('shower')) return 'RAIN';
    if (conditionLower.includes('fog') || conditionLower.includes('mist')) return 'FOG';
    if (conditionLower.includes('cloud') || conditionLower.includes('overcast')) return 'CLOUDY';
    
    return 'CLOUDY'; // Default fallback
  }

  wasRecentlyPlayed(title) {
    return this.lastPlayedMusic.includes(title);
  }

  addToHistory(title) {
    this.lastPlayedMusic.push(title);
    if (this.lastPlayedMusic.length > this.maxHistorySize) {
      this.lastPlayedMusic.shift();
    }
  }

  createFallbackItem() {
    return {
      path: null,
      title: 'Radio Station',
      artist: 'On Air',
      type: 'station-id',
      duration: 5000,
      startTime: Date.now()
    };
  }
}