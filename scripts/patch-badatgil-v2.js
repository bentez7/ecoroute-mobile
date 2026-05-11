#!/usr/bin/env node
/* eslint-disable no-console */
// Replaces the npm-published @badatgil/expo-mapbox-navigation 1.6.2 (Mapbox
// Nav SDK v3, ships v3 binaries inside the tarball) with our patched v2
// version. Runs as part of `postinstall`, before patch-package.
//
// 1. Removes the bundled v3 xcframeworks (~238 MB) so cocoapods is free to
//    pull MapboxNavigation 2.x via the rewritten podspec.
// 2. Overwrites the podspec, native Swift, and built JS shim to use v2 APIs.
// 3. Removes the leftover v3-only DirectionsInterceptor file if present.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PKG_DIR   = path.join(REPO_ROOT, 'node_modules', '@badatgil', 'expo-mapbox-navigation');
const SRC_DIR   = path.join(REPO_ROOT, 'patches', 'badatgil-v2');

if (!fs.existsSync(PKG_DIR)) {
  console.log('[patch-badatgil-v2] @badatgil/expo-mapbox-navigation not installed; skipping');
  process.exit(0);
}

function rmrf(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

function copy(srcRel, destRel) {
  const src = path.join(SRC_DIR, srcRel);
  const dest = path.join(PKG_DIR, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`[patch-badatgil-v2] wrote ${destRel}`);
}

rmrf(path.join(PKG_DIR, 'ios', 'Frameworks'));
console.log('[patch-badatgil-v2] removed ios/Frameworks (v3 binaries)');

rmrf(path.join(PKG_DIR, 'ios', 'ExpoMapboxNavigationDirectionsInterceptor.swift'));

copy('ios/ExpoMapboxNavigation.podspec',       'ios/ExpoMapboxNavigation.podspec');
copy('ios/ExpoMapboxNavigationModule.swift',   'ios/ExpoMapboxNavigationModule.swift');
copy('ios/ExpoMapboxNavigationView.swift',     'ios/ExpoMapboxNavigationView.swift');
copy('build/index.js',                         'build/index.js');
copy('build/index.d.ts',                       'build/index.d.ts');
copy('src/index.ts',                           'src/index.ts');

console.log('[patch-badatgil-v2] done — Mapbox Nav SDK pinned to v2 line');
