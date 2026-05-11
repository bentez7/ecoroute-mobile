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
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.bentez7.ecoroutemobile',
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'EcoRoute uses your location to plan eco-friendly routes and track your trips.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'EcoRoute uses your location to plan eco-friendly routes and track your trips.',
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
      ],
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-dev-client',
      'expo-secure-store',
      'expo-web-browser',
      [
        '@rnmapbox/maps',
        { RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN },
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
      backendUrl:        process.env.BACKEND_URL ?? 'http://localhost:3000/api',
      supabaseUrl:       process.env.SUPABASE_URL,
      supabaseAnonKey:   process.env.SUPABASE_ANON_KEY,
    },
  },
};
