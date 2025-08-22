import axios from 'axios';

export class WeatherService {
  constructor() {
    this.city = 'Paris';
    this.country = 'FR';
    this.apiKey = process.env.OPENWEATHER_API_KEY || 'demo_key';
    this.cache = null;
    this.cacheTime = 0;
    this.cacheExpiry = 10 * 60 * 1000; // 10 minutes
  }

  setLocation(city, country) {
    this.city = city;
    this.country = country;
    this.cache = null; // Clear cache when location changes
    console.log(`🌍 Weather location set to: ${city}, ${country}`);
  }

  async getCurrentWeather() {
    // Return cached data if still valid
    if (this.cache && Date.now() - this.cacheTime < this.cacheExpiry) {
      return this.cache;
    }

    try {
      const weather = await this.fetchWeatherData();
      this.cache = weather;
      this.cacheTime = Date.now();
      return weather;
    } catch (error) {
      console.error('Failed to fetch weather data:', error.message);
      return this.getFallbackWeather();
    }
  }

  async fetchWeatherData() {
    if (this.apiKey === 'demo_key') {
      // Return demo data if no API key is provided
      return this.getDemoWeather();
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${this.city},${this.country}&appid=${this.apiKey}&units=metric`;
    
    const response = await axios.get(url, { timeout: 5000 });
    const data = response.data;

    return {
      city: data.name,
      country: data.sys.country,
      condition: data.weather[0].main,
      description: data.weather[0].description,
      temperature: Math.round(data.main.temp),
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind?.speed || 0),
      timestamp: Date.now()
    };
  }

  getDemoWeather() {
    const conditions = ['Clear', 'Clouds', 'Rain', 'Wind', 'Fog'];
    const descriptions = {
      'Clear': 'sunny skies',
      'Clouds': 'partly cloudy',
      'Rain': 'light rain',
      'Wind': 'windy conditions',
      'Fog': 'foggy weather'
    };

    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    
    return {
      city: this.city,
      country: this.country,
      condition: condition,
      description: descriptions[condition],
      temperature: Math.floor(Math.random() * 25) + 5, // 5-30°C
      humidity: Math.floor(Math.random() * 40) + 40, // 40-80%
      windSpeed: Math.floor(Math.random() * 20) + 5, // 5-25 km/h
      timestamp: Date.now(),
      demo: true
    };
  }

  getFallbackWeather() {
    return {
      city: this.city,
      country: this.country,
      condition: 'Clear',
      description: 'pleasant weather',
      temperature: 20,
      humidity: 60,
      windSpeed: 10,
      timestamp: Date.now(),
      fallback: true
    };
  }

  getWeatherConditionCode(condition) {
    const conditionMap = {
      'Clear': 'SUN',
      'Clouds': 'CLOUDY',
      'Rain': 'RAIN',
      'Drizzle': 'RAIN',
      'Thunderstorm': 'RAIN',
      'Snow': 'CLOUDY',
      'Mist': 'FOG',
      'Fog': 'FOG',
      'Haze': 'FOG',
      'Wind': 'WIND'
    };

    return conditionMap[condition] || 'CLOUDY';
  }
}