async function reverseGeocodeCity(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=fr`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'PrixCarburant/1.0',
      'Accept-Language': 'fr',
    },
  });

  if (!response.ok) {
    throw new Error(`Reverse geocoding failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const a = data.address || {};

  const city =
    a.city ||
    a.town ||
    a.village ||
    a.municipality ||
    a.suburb ||
    null;

  if (!city) {
    throw new Error('Impossible de déterminer la ville depuis la position');
  }

  return city;
}

async function fetchFrance(lat, lng) {
  try {
    const baseUrl =
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';

    let city = null;

    if (lat != null && lng != null) {
      city = await reverseGeocodeCity(lat, lng);
    }

    const allStations = [];
    const pageSize = 100;
    let offset = 0;
    let totalCount = 0;

    while (true) {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      });

      if (city) {
        params.set('where', `ville="${city.replace(/"/g, '\\"')}"`);
      }

      const url = `${baseUrl}?${params.toString()}`;

      const response = await fetch(url, {
        headers: { 'User-Agent': 'PrixCarburant/1.0' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const page = await response.json();
      const pageStations = page.results || [];

      totalCount = page.total_count ?? pageStations.length;
      allStations.push(...pageStations);

      if (allStations.length >= totalCount || pageStations.length < pageSize) {
        break;
      }

      offset += pageSize;
      if (offset + pageSize > 10000) break;
    }

    if (!allStations.length) {
      throw new Error(city
        ? `Aucune station française retournée pour ${city}`
        : 'Aucune station française retournée');
    }

    return {
      name: 'France (Gov)',
      ok: true,
      data: {
        stations: allStations,
        city,
        totalCount,
      },
      country: 'FR',
    };
  } catch (error) {
    return {
      name: 'France (Gov)',
      ok: false,
      error: error.message,
      country: 'FR',
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const lat = req.query.lat ? parseFloat(req.query.lat) : null;
  const lng = req.query.lng ? parseFloat(req.query.lng) : null;

  const frResult = await fetchFrance(lat, lng);
  const results = [frResult];
  const successCount = results.filter(r => r.ok).length;

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  res.setHeader('Access-Control-Allow-Origin', '*');

  return res.status(successCount > 0 ? 200 : 502).json({
    ok: successCount > 0,
    updatedAt: new Date().toISOString(),
    successCount,
    totalSources: results.length,
    results,
  });
}
