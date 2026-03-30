import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const userLat = parseFloat(req.query.lat) || null;
  const userLng = parseFloat(req.query.lng) || null;

  try {
    const stations = await fetchRawGovData(userLat, userLng);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({
      ok: true,
      updatedAt: new Date().toISOString(),
      successCount: 1,
      totalSources: 1,
      results: [{ name: 'France (Gov)', ok: true, data: { stations }, country: 'FR' }],
    });
  } catch (err) {
    console.error('[API] Fatal error:', err.message);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(502).json({
      ok: false,
      updatedAt: new Date().toISOString(),
      successCount: 0,
      totalSources: 1,
      results: [{ name: 'France (Gov)', ok: false, error: err.message, country: 'FR' }],
    });
  }
}

async function fetchRawGovData(userLat, userLng) {
  // Official raw source — this is what the ODS dataset mirrors from
  const url = 'https://donnees.roulez-eco.fr/opendata/instantane';

  const response = await fetch(url, {
    headers: { 'Accept-Encoding': 'gzip, deflate' },
  });

  if (!response.ok) throw new Error('HTTP ' + response.status);

  const buffer = Buffer.from(await response.arrayBuffer());

  // The file is a ZIP containing a single XML file — extract it
  const xml = await extractZipXml(buffer);

  // Parse XML into station objects
  const stations = parseXml(xml);

  // If user location provided, filter to 15km radius
  if (userLat !== null && userLng !== null) {
    return stations.filter(s => {
      if (!s.lat || !s.lng) return false;
      return haversine(userLat, userLng, s.lat, s.lng) <= 15;
    });
  }

  // No location — return first 500
  return stations.slice(0, 500);
}

async function extractZipXml(buffer) {
  // ZIP local file header starts at offset 0
  // Local file header: signature(4) + version(2) + flags(2) + compression(2) +
  //   modtime(2) + moddate(2) + crc(4) + compsize(4) + uncompsize(4) +
  //   filenamelen(2) + extralen(2) = 30 bytes fixed
  const filenameLen = buffer.readUInt16LE(26);
  const extraLen = buffer.readUInt16LE(28);
  const dataOffset = 30 + filenameLen + extraLen;
  const compression = buffer.readUInt16LE(8);
  const compressedSize = buffer.readUInt32LE(18);

  const compressedData = buffer.slice(dataOffset, dataOffset + compressedSize);

  let xmlBuffer;
  if (compression === 8) {
    // DEFLATE — use inflateRaw
    xmlBuffer = await promisify(zlib.inflateRaw)(compressedData);
  } else if (compression === 0) {
    // No compression
    xmlBuffer = compressedData;
  } else {
    throw new Error('Unsupported ZIP compression method: ' + compression);
  }

  return xmlBuffer.toString('latin1'); // Government XML uses ISO-8859-1
}

function parseXml(xml) {
  const stations = [];

  // Split by <pdv (point de vente = station)
  const blocks = xml.split('<pdv ');
  blocks.shift(); // remove content before first <pdv

  for (const block of blocks) {
    try {
      const lat = parseAttr(block, 'latitude');
      const lng = parseAttr(block, 'longitude');
      const id = parseAttr(block, 'id');
      const cp = parseAttr(block, 'cp');
      const pop = parseAttr(block, 'pop'); // R=road, A=highway

      // Coords are stored as integers × 100000
      const latF = lat ? parseFloat(lat) / 100000 : null;
      const lngF = lng ? parseFloat(lng) / 100000 : null;

      if (!latF || !lngF) continue;

      // Address
      const adresse = extractTag(block, 'adresse');
      const ville = extractTag(block, 'ville');

      // Brand/name from <services> or use default
      const ensigne = extractAttr(block, 'ensigne') || extractAttr(block, 'ensigne_id') || '';

      // Prices — each looks like: <prix nom="Gazole" id="1" maj="..." valeur="1.799"/>
      const prices = {};
      const priceRegex = /<prix[^>]+nom="([^"]+)"[^>]+valeur="([^"]+)"/g;
      let pm;
      while ((pm = priceRegex.exec(block)) !== null) {
        const fuelName = pm[1];
        const val = parseFloat(pm[2]);
        if (val > 0) {
          const key = fuelNameToKey(fuelName);
          if (key) prices[key] = val;
        }
      }

      if (!Object.keys(prices).length) continue;

      stations.push({
        id: 'fr_' + id,
        name: normalizeName(ensigne) || ('Station ' + cp),
        addr: [adresse, cp, ville].filter(Boolean).join(', '),
        cp: cp || '',
        ville: (ville || '').toLowerCase(),
        lat: latF,
        lng: lngF,
        prices,
        d: 99999,
      });
    } catch (e) {
      // skip malformed block
    }
  }

  return stations;
}

function parseAttr(str, name) {
  const m = str.match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1] : null;
}

function extractAttr(str, name) {
  return parseAttr(str, name);
}

function extractTag(str, tag) {
  const m = str.match(new RegExp('<' + tag + '[^>]*>([^<]*)</' + tag + '>'));
  return m ? m[1].trim() : '';
}

function fuelNameToKey(name) {
  const map = { 'Gazole': 'B7', 'SP95': 'SP95', 'SP98': 'SP98', 'E10': 'E10', 'E85': 'E85', 'GPLc': 'GPL' };
  return map[name] || null;
}

function normalizeName(str) {
  if (!str || /^\d+$/.test(str.trim())) return '';
  return str.trim().replace(/\b\w/g, c => c.toUpperCase());
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// promisify needed for zlib inside async context
function promisify(fn) {
  return (...args) => new Promise((resolve, reject) => {
    fn(...args, (err, result) => err ? reject(err) : resolve(result));
  });
}
