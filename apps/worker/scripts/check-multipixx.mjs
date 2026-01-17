const checks = [
  {
    name: 'inubis',
    target: 'https://inubis.multipixx.net/cam/17',
    markers: ['app.init(17)', '/currentPixx/17']
  },
  {
    name: 'balmberg',
    target: 'https://seilpark-balmberg.multipixx.net/',
    markers: ['app.init(19)', '/currentPixx/19']
  }
];

for (const check of checks) {
  const res = await fetch(check.target, {
    headers: {
      'User-Agent': 'WebcamSun/1.0'
    }
  });

  if (!res.ok) {
    throw new Error(`${check.name} check failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const missing = check.markers.filter(marker => !html.includes(marker));

  if (missing.length) {
    throw new Error(`${check.name} check failed: missing ${missing.join(', ')}`);
  }
}

console.log('multipixx checks ok');
