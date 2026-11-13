// Airports featured in the guides (coords = aerodrome reference point, approx.)
export const AIRPORTS = [
  { iata: "DEL", icao: "VIDP", city: "Delhi", state: "Delhi", name: "Indira Gandhi International Airport", lat: 28.5562, lon: 77.1, notes: "India's busiest airport. Domestic and international flights run from Terminals 1, 2 and 3. The Airport Express metro line links Terminal 3 to central Delhi." },
  { iata: "BOM", icao: "VABB", city: "Mumbai", state: "Maharashtra", name: "Chhatrapati Shivaji Maharaj International Airport", lat: 19.0896, lon: 72.8656, notes: "One of the world's busiest single-runway-operation airports, with two crossing runways and Terminals 1 and 2. Mumbai is also served by Navi Mumbai International Airport (NMI)." },
  { iata: "BLR", icao: "VOBL", city: "Bengaluru", state: "Karnataka", name: "Kempegowda International Airport", lat: 13.1986, lon: 77.7066, notes: "About 35 km north of the city centre, so allow time for road traffic. Has two terminals; Terminal 2 is known for its garden-inspired design." },
  { iata: "HYD", icao: "VOHS", city: "Hyderabad", state: "Telangana", name: "Rajiv Gandhi International Airport", lat: 17.2403, lon: 78.4294, notes: "At Shamshabad, south of the city. Uses one integrated passenger terminal for domestic and international flights." },
  { iata: "MAA", icao: "VOMM", city: "Chennai", state: "Tamil Nadu", name: "Chennai International Airport", lat: 12.9941, lon: 80.1709, notes: "At Meenambakkam/Tirusulam, with a Chennai Metro station and a suburban rail station next to the terminals." },
  { iata: "CCU", icao: "VECC", city: "Kolkata", state: "West Bengal", name: "Netaji Subhas Chandra Bose International Airport", lat: 22.6547, lon: 88.4467, notes: "The main gateway to eastern and north-eastern India, with one integrated terminal for domestic and international flights." },
  { iata: "COK", icao: "VOCI", city: "Kochi", state: "Kerala", name: "Cochin International Airport", lat: 10.152, lon: 76.4019, notes: "Known as the world's first airport to run fully on solar power. It handles heavy Gulf traffic, with separate domestic and international terminals." },
  { iata: "AMD", icao: "VAAH", city: "Ahmedabad", state: "Gujarat", name: "Sardar Vallabhbhai Patel International Airport", lat: 23.0772, lon: 72.6347, notes: "Gujarat's busiest airport, about 9 km from the city centre, with separate domestic and international terminals." },
  { iata: "GOX", icao: "VOGA", city: "Goa (Mopa)", state: "Goa", name: "Manohar International Airport", lat: 15.7444, lon: 73.8606, notes: "Goa's newer greenfield airport at Mopa in North Goa, convenient for the northern beaches. Check which Goa airport your ticket uses." },
  { iata: "GOI", icao: "VOGO", city: "Goa (Dabolim)", state: "Goa", name: "Dabolim Airport", lat: 15.3808, lon: 73.8314, notes: "Goa's original airport near Vasco da Gama, inside a naval air station. Closer to South Goa and Panaji than Mopa." },
  { iata: "PNQ", icao: "VAPO", city: "Pune", state: "Maharashtra", name: "Pune International Airport", lat: 18.5822, lon: 73.9197, notes: "A civil enclave at Air Force Station Lohegaon. Military operations can affect the schedule." },
  { iata: "JAI", icao: "VIJP", city: "Jaipur", state: "Rajasthan", name: "Jaipur International Airport", lat: 26.8242, lon: 75.8122, notes: "At Sanganer, about 10 km south of the city centre." },
  { iata: "LKO", icao: "VILK", city: "Lucknow", state: "Uttar Pradesh", name: "Chaudhary Charan Singh International Airport", lat: 26.7606, lon: 80.8893, notes: "Uttar Pradesh's busiest airport, about 15 km from the city centre, with good connections to the Gulf." },
  { iata: "GAU", icao: "VEGT", city: "Guwahati", state: "Assam", name: "Lokpriya Gopinath Bordoloi International Airport", lat: 26.1061, lon: 91.5859, notes: "The main hub for North-East India and the entry point for many onward regional flights." },
  { iata: "TRV", icao: "VOTV", city: "Thiruvananthapuram", state: "Kerala", name: "Thiruvananthapuram International Airport", lat: 8.4821, lon: 76.9201, notes: "India's southernmost major airport, close to the coast, with domestic and international terminals on opposite sides of the runway." },
  { iata: "IXC", icao: "VICG", city: "Chandigarh", state: "Chandigarh / Punjab", name: "Shaheed Bhagat Singh International Airport", lat: 30.6735, lon: 76.7885, notes: "Shares its runway with Air Force Station Chandigarh. The civil terminal is on the Mohali side." },
];

export const airportByIata = (code) =>
  AIRPORTS.find((a) => a.iata.toLowerCase() === String(code).toLowerCase());

// Common ICAO type designators → friendly names
export const TYPES = {
  A19N: "Airbus A319neo", A20N: "Airbus A320neo", A21N: "Airbus A321neo", A319: "Airbus A319",
  A320: "Airbus A320", A321: "Airbus A321", A332: "Airbus A330-200", A333: "Airbus A330-300",
  A339: "Airbus A330-900neo", A343: "Airbus A340-300", A346: "Airbus A340-600", A359: "Airbus A350-900",
  A35K: "Airbus A350-1000", A388: "Airbus A380", B737: "Boeing 737-700", B738: "Boeing 737-800",
  B739: "Boeing 737-900", B38M: "Boeing 737 MAX 8", B39M: "Boeing 737 MAX 9", B744: "Boeing 747-400",
  B748: "Boeing 747-8", B752: "Boeing 757-200", B763: "Boeing 767-300", B772: "Boeing 777-200",
  B77L: "Boeing 777-200LR", B77W: "Boeing 777-300ER", B788: "Boeing 787-8", B789: "Boeing 787-9",
  B78X: "Boeing 787-10", AT72: "ATR 72", AT76: "ATR 72-600", AT75: "ATR 72-500", DH8D: "De Havilland Dash 8-400",
  E190: "Embraer E190", E195: "Embraer E195", E75L: "Embraer E175", CRJ9: "Bombardier CRJ900",
  C130: "Lockheed C-130 Hercules", C17: "Boeing C-17 Globemaster III", IL76: "Ilyushin Il-76",
  B350: "Beechcraft King Air 350", C208: "Cessna 208 Caravan", PC12: "Pilatus PC-12", GLF6: "Gulfstream G650",
  GLEX: "Bombardier Global Express", CL60: "Bombardier Challenger 600", DO28: "Dornier 228", D228: "Dornier 228",
};

export const typeName = (t) => (t ? TYPES[t] || t : "Unknown type");

// Geometry / formatting helpers
const R_KM = 6371;
const rad = (d) => (d * Math.PI) / 180;
export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(a));
}

// Move a point along a bearing (used to extrapolate positions between polls)
export function project(lat, lon, bearingDeg, km) {
  const d = km / R_KM, b = rad(bearingDeg), p1 = rad(lat), l1 = rad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [(p2 * 180) / Math.PI, (((l2 * 180) / Math.PI + 540) % 360) - 180];
}

export const fmtAlt = (ft, gnd) => (gnd ? "On ground" : ft == null ? "—" : `${Math.round(ft).toLocaleString("en-IN")} ft`);
export const fmtSpeed = (kt) => (kt == null ? "—" : `${Math.round(kt)} kt · ${Math.round(kt * 1.852)} km/h`);
export function fmtDuration(min) {
  if (!isFinite(min) || min < 0) return "—";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m} min`;
}
export const fmtClock = (date) =>
  date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) + " IST";

// Altitude → colour (ground → low → cruise)
export function altColor(ft, gnd) {
  if (gnd || ft == null || ft < 100) return "#8b95a7";
  const stops = [
    [0, [255, 176, 59]], [8000, [255, 214, 92]], [18000, [120, 230, 160]],
    [28000, [64, 214, 255]], [38000, [146, 140, 255]], [45000, [214, 120, 255]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (ft <= stops[i][0]) {
      const [a0, c0] = stops[i - 1], [a1, c1] = stops[i], t = (ft - a0) / (a1 - a0);
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
      return `rgb(${c.join(",")})`;
    }
  }
  return "rgb(214,120,255)";
}

export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
