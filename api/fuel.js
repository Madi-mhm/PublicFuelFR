async function fetchFrance(lat, lng) {
  // Try multiple approaches in order
  const attempts = buildAttempts(lat, lng);
  
  for (const attempt of attempts) {
    try {
      console.log(`[FR] Trying: ${attempt.url}`);
      const response = await fetch(attempt.url, attempt.options);
      
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error(`[FR] HTTP ${response.status} — ${body.slice(0, 200)}`);
        continue; // try next approach
      }

      const page = await response.json();
      const stations = page.results || [];
      if (!stations.length) {
        console.warn('[FR] Response OK but 0 stations returned');
        continue;
      }

      console.log(`[FR] Success: ${stations.length} stations via ${attempt.label}`);
      return { name: 'France (Gov)', ok: true, data: { stations }, country: 'FR' };

    } catch (error) {
      console.error(`[FR] Fetch error (${attempt.label}):`, error.message);
    }
  }

  return { name: 'France (Gov)', ok: false, error: 'All attempts failed', country: 'FR' };
}

function buildAttempts(lat, lng) {
  const BASE = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';
  
  // Build geo filter if coordinates provided
  // ODS v2.1 syntax: within_distance(field, geom'POINT(lng lat)', radius)
  const geoParam = (lat && lng)
    ? `&where=${encodeURIComponent(`within_distance(geom, geom'POINT(${lng} ${lat})', 15km)`)}`
    : '';

  const attempts = [
    // Attempt 1: No User-Agent (most permissive)
    {
      label: 'no-user-agent',
      url: `${BASE}?limit=500${geoParam}`,
      options: {},
    },
    // Attempt 2: Browser-like User-Agent
    {
      label: 'browser-ua',
      url: `${BASE}?limit=500${geoParam}`,
      options: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; bot/1.0)',
          'Accept': 'application/json',
        },
      },
    },
    // Attempt 3: No geo filter at all (fallback if geo filter syntax is wrong)
    ...(lat && lng ? [{
      label: 'no-geo-filter',
      url: `${BASE}?limit=500`,
      options: {},
    }] : []),
  ];

  return attempts;
}
