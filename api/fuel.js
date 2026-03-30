async function fetchFrance(lat, lng) {
  try {
    let url;
    if (lat && lng) {
      url = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=100&geofilter.distance=${lat},${lng},15000`;
    } else {
      url = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=1000`;
    }

    const response = await fetch(url, {
      headers: { 'User-Agent': 'PrixCarburant/1.0' },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const page = await response.json();
    const stations = page.results || [];

    if (!stations.length) throw new Error('Aucune station française retournée');
    return { name: 'France (Gov)', ok: true, data: { stations }, country: 'FR' };
  } catch (error) {
    return { name: 'France (Gov)', ok: false, error: error.message, country: 'FR' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const lat = parseFloat(req.query.lat) || null;
  const lng = parseFloat(req.query.lng) || null;

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
