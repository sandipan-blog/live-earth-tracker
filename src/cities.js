// City list and lookups. Pure logic only.

import { haversineKm } from './geo.js';

export const CITIES = [
  { name: 'Delhi', country: 'India', lat: 28.61, lon: 77.21 },
  { name: 'New Delhi', country: 'India', lat: 28.61, lon: 77.21 },
  { name: 'Mumbai', country: 'India', lat: 19.08, lon: 72.88 },
  { name: 'Kolkata', country: 'India', lat: 22.57, lon: 88.36 },
  { name: 'Chennai', country: 'India', lat: 13.08, lon: 80.27 },
  { name: 'Bengaluru', country: 'India', lat: 12.97, lon: 77.59 },
  { name: 'Hyderabad', country: 'India', lat: 17.39, lon: 78.49 },
  { name: 'Pune', country: 'India', lat: 18.52, lon: 73.86 },
  { name: 'Ahmedabad', country: 'India', lat: 23.02, lon: 72.57 },
  { name: 'Jaipur', country: 'India', lat: 26.91, lon: 75.79 },
  { name: 'Lucknow', country: 'India', lat: 26.85, lon: 80.95 },
  { name: 'Guwahati', country: 'India', lat: 26.14, lon: 91.74 },
  { name: 'Bhubaneswar', country: 'India', lat: 20.30, lon: 85.82 },
  { name: 'Patna', country: 'India', lat: 25.59, lon: 85.14 },
  { name: 'Indore', country: 'India', lat: 22.72, lon: 75.86 },
  { name: 'Kochi', country: 'India', lat: 9.93, lon: 76.27 },
  { name: 'Goa', country: 'India', lat: 15.50, lon: 73.83 },
  { name: 'Varanasi', country: 'India', lat: 25.32, lon: 82.99 },
  { name: 'Nagpur', country: 'India', lat: 21.15, lon: 79.09 },
  { name: 'Surat', country: 'India', lat: 21.17, lon: 72.83 },
  { name: 'Kanpur', country: 'India', lat: 26.45, lon: 80.33 },
  { name: 'Chandigarh', country: 'India', lat: 30.73, lon: 76.78 },
  { name: 'Srinagar', country: 'India', lat: 34.08, lon: 74.80 },
  { name: 'London', country: 'United Kingdom', lat: 51.51, lon: -0.13 },
  { name: 'New York', country: 'United States', lat: 40.71, lon: -74.01 },
  { name: 'Tokyo', country: 'Japan', lat: 35.68, lon: 139.69 },
  { name: 'Paris', country: 'France', lat: 48.86, lon: 2.35 },
  { name: 'Dubai', country: 'UAE', lat: 25.20, lon: 55.27 },
  { name: 'Singapore', country: 'Singapore', lat: 1.35, lon: 103.82 },
  { name: 'Sydney', country: 'Australia', lat: -33.87, lon: 151.21 },
  { name: 'Beijing', country: 'China', lat: 39.90, lon: 116.41 },
  { name: 'Moscow', country: 'Russia', lat: 55.76, lon: 37.62 },
  { name: 'Cairo', country: 'Egypt', lat: 30.04, lon: 31.24 },
  { name: 'São Paulo', country: 'Brazil', lat: -23.55, lon: -46.63 },
  { name: 'Los Angeles', country: 'United States', lat: 34.05, lon: -118.24 },
  { name: 'Berlin', country: 'Germany', lat: 52.52, lon: 13.40 },
  { name: 'Rome', country: 'Italy', lat: 41.90, lon: 12.50 },
  { name: 'Madrid', country: 'Spain', lat: 40.42, lon: -3.70 },
  { name: 'Bangkok', country: 'Thailand', lat: 13.76, lon: 100.50 },
  { name: 'Jakarta', country: 'Indonesia', lat: -6.21, lon: 106.85 },
  { name: 'Seoul', country: 'South Korea', lat: 37.57, lon: 126.98 },
  { name: 'Mexico City', country: 'Mexico', lat: 19.43, lon: -99.13 },
  { name: 'Buenos Aires', country: 'Argentina', lat: -34.60, lon: -58.38 },
  { name: 'Toronto', country: 'Canada', lat: 43.65, lon: -79.38 },
  { name: 'Nairobi', country: 'Kenya', lat: -1.29, lon: 36.82 },
  { name: 'Lagos', country: 'Nigeria', lat: 6.52, lon: 3.38 },
  { name: 'Istanbul', country: 'Turkey', lat: 41.01, lon: 28.98 },
  { name: 'Karachi', country: 'Pakistan', lat: 24.86, lon: 67.01 },
  { name: 'Dhaka', country: 'Bangladesh', lat: 23.81, lon: 90.41 },
  { name: 'Colombo', country: 'Sri Lanka', lat: 6.93, lon: 79.86 },
  { name: 'Kathmandu', country: 'Nepal', lat: 27.72, lon: 85.32 }
];

export function findCity(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  let best = null;
  for (const c of CITIES) {
    if (lower.includes(c.name.toLowerCase())) {
      if (!best || c.name.length > best.name.length) best = c;
    }
  }
  return best;
}

export function nearestCity(lat, lon) {
  let best = null;
  let bestKm = Infinity;
  for (const c of CITIES) {
    const km = haversineKm(lat, lon, c.lat, c.lon);
    if (km < bestKm) {
      bestKm = km;
      best = c;
    }
  }
  return { city: best, km: bestKm };
}
