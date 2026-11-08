import * as THREE from 'three';

export type WeatherType = 'clear' | 'rain' | 'snow' | 'blossom';

export interface AtmosphereState {
  hourFloat: number;
  hour: number;
  minute: number;
  formattedTime: string;
  formattedDate: string;
  dayOfWeek: string;
  period: 'morning' | 'afternoon' | 'evening';
  isNight: boolean;
  weather: WeatherType;
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  sunColor: THREE.Color;
  sunIntensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  sunPosition: THREE.Vector3;
}

/**
 * Reverse-Engineered Animal Crossing Real-Time Clock (RTC) & 24h Sky/Lighting LUT.
 * Synchronizes with device wall-clock time while supporting Time-Travel offset
 * and 05:00 AM daily rollover detection.
 */
export class RealTimeClock {
  private timeOffsetMinutes = 0;
  private weather: WeatherType = 'clear';

  private static readonly DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  private static readonly MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  public setTimeOffsetHours(hoursOffset: number): void {
    this.timeOffsetMinutes = Math.round(hoursOffset * 60);
  }

  public getTimeOffsetHours(): number {
    return this.timeOffsetMinutes / 60;
  }

  public setWeather(weather: WeatherType): void {
    this.weather = weather;
  }

  public getWeather(): WeatherType {
    return this.weather;
  }

  public getCurrentGameDate(): Date {
    return new Date(Date.now() + this.timeOffsetMinutes * 60 * 1000);
  }

  /**
   * Returns the canonical Animal Crossing "Island Day Key" where the day rolls over at 05:00 AM.
   */
  public getIslandDayKey(date = this.getCurrentGameDate()): string {
    const shifted = new Date(date.getTime() - 5 * 3600 * 1000);
    return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`;
  }

  public getAtmosphere(): AtmosphereState {
    const now = this.getCurrentGameDate();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const hourFloat = hour + minute / 60;

    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    const formattedTime = `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
    const dayOfWeek = RealTimeClock.DAYS[now.getDay()];
    const formattedDate = `${RealTimeClock.MONTHS[now.getMonth()]} ${now.getDate()} (${dayOfWeek})`;

    const period: 'morning' | 'afternoon' | 'evening' =
      hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : 'evening';
    const isNight = hour >= 19 || hour < 6;

    // Keyframe LUT interpolation across 24 hours
    const skyTop = new THREE.Color();
    const skyHorizon = new THREE.Color();
    const sunColor = new THREE.Color();
    const ambientColor = new THREE.Color();
    let sunIntensity = 1.1;
    let ambientIntensity = 0.75;

    if (hourFloat >= 5 && hourFloat < 8) {
      // Dawn / Sunrise
      const t = (hourFloat - 5) / 3;
      skyTop.lerpColors(new THREE.Color('#1d294d'), new THREE.Color('#56a8e8'), t);
      skyHorizon.lerpColors(new THREE.Color('#f28c6b'), new THREE.Color('#bce3fa'), t);
      sunColor.lerpColors(new THREE.Color('#ff9d66'), new THREE.Color('#fff5e0'), t);
      ambientColor.lerpColors(new THREE.Color('#7c6c94'), new THREE.Color('#d9ecff'), t);
      sunIntensity = 0.55 + 0.65 * t;
      ambientIntensity = 0.55 + 0.25 * t;
    } else if (hourFloat >= 8 && hourFloat < 16.5) {
      // Bright Day
      skyTop.set('#449be4');
      skyHorizon.set('#b8e6ff');
      sunColor.set('#fff9eb');
      ambientColor.set('#e6f4ff');
      sunIntensity = 1.25;
      ambientIntensity = 0.82;
    } else if (hourFloat >= 16.5 && hourFloat < 19.5) {
      // Golden Hour / Sunset
      const t = (hourFloat - 16.5) / 3;
      skyTop.lerpColors(new THREE.Color('#449be4'), new THREE.Color('#1a2242'), t);
      skyHorizon.lerpColors(new THREE.Color('#ffb067'), new THREE.Color('#47355e'), t);
      sunColor.lerpColors(new THREE.Color('#ff944d'), new THREE.Color('#7a8cff'), t);
      ambientColor.lerpColors(new THREE.Color('#ffd1b3'), new THREE.Color('#4e598c'), t);
      sunIntensity = 1.15 - 0.7 * t;
      ambientIntensity = 0.78 - 0.3 * t;
    } else {
      // Starry Night / Moonlight
      skyTop.set('#0f172e');
      skyHorizon.set('#223259');
      sunColor.set('#8ab4ff');
      ambientColor.set('#455885');
      sunIntensity = 0.45;
      ambientIntensity = 0.48;
    }

    if (this.weather === 'rain') {
      skyTop.lerp(new THREE.Color('#4a5d70'), 0.65);
      skyHorizon.lerp(new THREE.Color('#7f93a6'), 0.65);
      sunIntensity *= 0.65;
    }

    // Sun/Moon arc across the sky
    const sunAngle = ((hourFloat - 6) / 24) * Math.PI * 2;
    const sunPosition = new THREE.Vector3(
      Math.cos(sunAngle) * 28,
      Math.max(10, Math.sin(sunAngle) * 32 + 16),
      18
    );

    return {
      hourFloat,
      hour,
      minute,
      formattedTime,
      formattedDate,
      dayOfWeek,
      period,
      isNight,
      weather: this.weather,
      skyTop,
      skyHorizon,
      sunColor,
      sunIntensity,
      ambientColor,
      ambientIntensity,
      sunPosition,
    };
  }
}
