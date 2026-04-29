import { readFileSync, writeFileSync } from 'fs';
import * as turf from '@turf/turf';

const config = JSON.parse(readFileSync('regions-config.json', 'utf8'));

console.log('Fetching boundary data...');

const [sfNeighborhoods, caCounties, caPlaces] = await Promise.all([
  fetch('https://data.sfgov.org/resource/p5b7-5n3h.geojson').then(r => r.json()),
  fetch('https://www2.census.gov/geo/tiger/GENZ2022/json/cb_2022_06_county_500k.json').then(r => r.json()),
  fetch('https://www2.census.gov/geo/tiger/GENZ2021/json/cb_2021_06_place_500k.json').then(r => r.json()),
]);

console.log(`  SF neighborhoods: ${sfNeighborhoods.features.length}`);
console.log(`  CA counties: ${caCounties.features.length}`);
console.log(`  CA places: ${caPlaces.features.length}`);

function unionFeatures(features, regionName) {
  if (features.length === 0) return null;
  if (features.length === 1) return features[0];
  let result = features[0];
  for (let i = 1; i < features.length; i++) {
    result = turf.union(turf.featureCollection([result, features[i]]));
  }
  return result;
}

const outputFeatures = [];

for (const region of config.regions) {
  let matched = [];

  if (region.type === 'sf-neighborhoods') {
    matched = sfNeighborhoods.features.filter(f =>
      region.components.includes(f.properties.nhood)
    );
    const missing = region.components.filter(c =>
      !sfNeighborhoods.features.some(f => f.properties.nhood === c)
    );
    if (missing.length) console.warn(`  ⚠ "${region.name}" — not found: ${missing.join(', ')}`);

  } else if (region.type === 'counties') {
    matched = caCounties.features.filter(f =>
      region.fips.includes(f.properties.GEOID)
    );
    const missing = region.fips.filter(fips =>
      !caCounties.features.some(f => f.properties.GEOID === fips)
    );
    if (missing.length) console.warn(`  ⚠ "${region.name}" — FIPS not found: ${missing.join(', ')}`);

  } else if (region.type === 'cities') {
    matched = caPlaces.features.filter(f =>
      region.components.includes(f.properties.NAME)
    );
    const missing = region.components.filter(c =>
      !caPlaces.features.some(f => f.properties.NAME === c)
    );
    if (missing.length) console.warn(`  ⚠ "${region.name}" — not found: ${missing.join(', ')}`);
  }

  if (matched.length === 0) {
    console.warn(`  ✗ "${region.name}" — no features matched, skipping`);
    continue;
  }

  const unioned = unionFeatures(matched, region.name);
  if (unioned) {
    unioned.properties = { name: region.name };
    outputFeatures.push(unioned);
    console.log(`  ✓ ${region.name} (${matched.length} component${matched.length > 1 ? 's' : ''})`);
  }
}

writeFileSync('regions.geojson', JSON.stringify({
  type: 'FeatureCollection',
  features: outputFeatures,
}, null, 2));

console.log(`\nWrote regions.geojson with ${outputFeatures.length} regions.`);
