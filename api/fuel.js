export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const lat = parseFloat(req.query.lat) || null;
  const lng = parseFloat(req.query.lng) || null;

  const result = await fetchFrance(lat, lng);

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  res.setHeader('Access-Control-Allow-Origin', '*');

  return res.status(result.ok ? 200 : 502).json({
    ok: result.ok,
    updatedAt: new Date().toISOString(),
    successCount: result.ok ? 1 : 0,
    totalSources: 1,
    results: [result],
  });
}

async function fetchFrance(lat, lng) {
  const BASE =
    'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';

  let url = BASE + '?limit=500';

  if (lat !== null && lng !== null) {
    const geo = "within_distance(geom, geom'POINT(" + lng + ' ' + lat + ")', 15km)";
    url += '&where=' + encodeURIComponent(geo);
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();
      console.error('[FR] HTTP ' + response.status + ' — ' + body.slice(0, 300));
      return { name: 'France (Gov)', ok: false, error: 'HTTP ' + response.status, country: 'FR' };
    }

    const page = await response.json();
    const stations = page.results || [];

    if (stations.length === 0) {
      return { name: 'France (Gov)', ok: false, error: 'Aucune station retournée', country: 'FR' };
    }

    return { name: 'France (Gov)', ok: true, data: { stations }, country: 'FR' };

  } catch (err) {
    console.error('[FR] Fetch exception:', err.message);
    return { name: 'France (Gov)', ok: false, error: err.message, country: 'FR' };
  }
}
