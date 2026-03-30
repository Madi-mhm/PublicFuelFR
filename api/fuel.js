async function fetchFrance(lat, lng) {
  try {
    let url;
    const base = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=500`;

    if (lat && lng) {
      // ✅ v2.1 syntax: where=distance(field, geom'POINT(lng lat)', radius)
      // Note: POINT takes LONGITUDE first, then LATITUDE
      const whereClause = `distance(geom, geom'POINT(${lng} ${lat})', 15000m)`;
      url = `${base}&where=${encodeURIComponent(whereClause)}`;
    } else {
      url = base;
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
