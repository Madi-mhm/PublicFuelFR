async function fetchFrance(lat, lng) {
  try {
    const base = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=500`;
    
    let url;
    if (lat && lng) {
      // ✅ v2.1 uses within_distance() not distance()
      // ✅ Radius format is "15km" not "15000m"
      // ✅ POINT(longitude latitude) — lng first!
      const where = `within_distance(geom, geom'POINT(${lng} ${lat})', 15km)`;
      url = `${base}&where=${encodeURIComponent(where)}`;
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
