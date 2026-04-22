import 'dotenv/config';

export default {
  expo: {
    name: 'ecoroute-mobile',
    slug: 'ecoroute-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'ecoroutemobile',
    userInterfaceStyle: 'automatic',
    newArchEnabled: false,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.bentez7.ecoroutemobile',
    },
    android: {
      package: 'com.bentez7.ecoroutemobile',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-dev-client',
      'expo-secure-store',
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Allow EcoRoute to use your location for turn-by-turn navigation.',
        },
      ],
      [
        '@rnmapbox/maps',
        {
          RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN,
          RNMapboxMapsVersion: '11.11.0',
        },
      ],
      [
        '@badatgil/expo-mapbox-navigation',
        {
          accessToken: process.env.MAPBOX_PUBLIC_TOKEN,
          mapboxMapsVersion: '11.11.0',
        },
      ],
      [
        'expo-build-properties',
        { ios: { useFrameworks: 'static' } },
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: { backgroundColor: '#000000' },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      mapboxPublicToken: process.env.MAPBOX_PUBLIC_TOKEN,
      backendUrl: process.env.BACKEND_URL ?? 'http://localhost:3000/api',
    },
  },
};
