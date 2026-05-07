import polyline from '@mapbox/polyline';

interface SynthArgs {
  polyline: string;     // precision-5 polyline of the full route (route.polyline from /routes/search)
  distanceM: number;    // meters
  durationSec: number;  // seconds
  destLat: number;
  destLng: number;
}

// The native SDK decodes JSON geometry as polyline6 (matches Mapbox
// Map-Matching JSON the backend returns). Synth output must use the same
// precision so both code paths can share a single decoder setting.
const GEOMETRY_PRECISION = 6;

/**
 * Build a Mapbox-Directions-API-shape JSON from a polyline so we can hand it
 * to the iOS Nav SDK via route injection. Used when the backend's Map
 * Matching pipeline returns null (split matchings) so there is no real
 * directions JSON to inject.
 *
 * The route geometry is preserved verbatim — that's the whole point. Turn
 * instructions degrade to a single "depart" + "arrive" pair, so per-step
 * voice/banner guidance won't fire, but the SDK will still drive along the
 * supplied polyline and announce arrival when the user reaches the dest.
 */
export function synthesizeDirectionsResponse(args: SynthArgs): Record<string, unknown> {
  const { polyline: geo, distanceM, durationSec, destLat, destLng } = args;
  // Input is precision-5 (the @mapbox/polyline default). Decode at default
  // precision so we get real-world coords for the maneuver location.
  const coords = polyline.decode(geo) as [number, number][];
  if (coords.length < 2) {
    throw new Error('synthesizeDirectionsResponse: polyline must have at least 2 coordinates');
  }
  const [firstLat, firstLng] = coords[0];
  // Re-encode the route geometry at precision 6 so the native SDK (which
  // decodes as polyline6) reads it correctly.
  const geo6 = polyline.encode(coords, GEOMETRY_PRECISION);
  // End-of-route maneuver location: prefer the user-selected dest so the
  // arrival pin sits where the user picked, not at RouteE's snapped coord.
  const arriveLocation = [destLng, destLat];

  const followText = 'Follow the eco-route to your destination';
  const arriveText = 'You have arrived at your destination';

  // Synth banner + voice. Without these, the iOS Nav SDK paints just a
  // distance number with no icon or text in the top banner, and the
  // expand-banner gesture has nothing to expand to. The synth path can't
  // produce real turn-by-turn cues (no Mapbox-derived steps), but at
  // least surface the eco-route follow + arrival announcements so the
  // user has *something* to read while driving.
  const departBanner = {
    distanceAlongGeometry:   distanceM,
    distance_along_geometry: distanceM,
    primary: {
      text: followText,
      type: 'continue',
      modifier: 'straight',
      components: [{ text: followText, type: 'text' }],
    },
  };
  const arrivalBanner = {
    distanceAlongGeometry:   200,
    distance_along_geometry: 200,
    primary: {
      text: arriveText,
      type: 'arrive',
      components: [{ text: arriveText, type: 'text' }],
    },
  };

  const departVoiceFollow = {
    distanceAlongGeometry:   distanceM,
    distance_along_geometry: distanceM,
    announcement:     followText,
    ssmlAnnouncement: `<speak>${followText}</speak>`,
  };
  const departVoiceArrival = {
    distanceAlongGeometry:   200,
    distance_along_geometry: 200,
    announcement:     arriveText,
    ssmlAnnouncement: `<speak>${arriveText}</speak>`,
  };

  const departStep = {
    geometry:     geo6,
    distance:     distanceM,
    duration:     durationSec,
    name:         '',
    mode:         'driving',
    driving_side: 'right',
    weight:       distanceM,
    maneuver: {
      instruction:    followText,
      location:       [firstLng, firstLat],
      type:           'depart',
      bearing_before: 0,
      bearing_after:  0,
    },
    intersections: [],
    voiceInstructions:  [departVoiceFollow, departVoiceArrival],
    bannerInstructions: [departBanner, arrivalBanner],
  };

  const arriveStep = {
    geometry:     polyline.encode([[destLat, destLng], [destLat, destLng]], GEOMETRY_PRECISION),
    distance:     0,
    duration:     0,
    name:         '',
    mode:         'driving',
    driving_side: 'right',
    weight:       0,
    maneuver: {
      instruction:    'You have arrived at your destination',
      location:       arriveLocation,
      type:           'arrive',
      bearing_before: 0,
      bearing_after:  0,
    },
    intersections: [],
    voiceInstructions:  [],
    bannerInstructions: [],
  };

  const leg = {
    summary:  'Eco route',
    weight:   distanceM,
    distance: distanceM,
    duration: durationSec,
    steps:    [departStep, arriveStep],
  };

  const route = {
    geometry:     geo6,
    distance:     distanceM,
    duration:     durationSec,
    weight_name:  'auto',
    weight:       distanceM,
    legs:         [leg],
    voiceLocale:  'en-US',
  };

  return {
    code: 'Ok',
    uuid: `ecoroute-synth-${Date.now()}`,
    routes:    [route],
    waypoints: [
      { distance: 0, name: 'Origin',      location: [firstLng, firstLat] },
      { distance: 0, name: 'Destination', location: arriveLocation },
    ],
  };
}
