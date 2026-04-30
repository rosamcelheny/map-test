import { readFileSync, writeFileSync } from 'fs';
import * as turf from '@turf/turf';

const config = JSON.parse(readFileSync('regions-config.json', 'utf8'));
const sfNeighborhoods = JSON.parse(readFileSync('map-data/Analysis_Neighborhoods_20260429.geojson', 'utf8'));
const caCounties = JSON.parse(readFileSync('map-data/counties.geojson', 'utf8'));
const caPlaces = JSON.parse(readFileSync('map-data/places.geojson', 'utf8'));

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
    unioned.properties = { name: region.name, minzoom: region.minzoom ?? 0 };
    outputFeatures.push(unioned);
    console.log(`  ✓ ${region.name} (${matched.length} component${matched.length > 1 ? 's' : ''})`);
  }
}

writeFileSync('regions.geojson', JSON.stringify({
  type: 'FeatureCollection',
  features: outputFeatures,
}, null, 2));

console.log(`\nWrote regions.geojson with ${outputFeatures.length} regions.`);
