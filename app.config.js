module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_RITM_SIDELOAD !== '1') return config;

  return {
    ...config,
    name: 'Ritm',
    ios: {
      ...config.ios,
      infoPlist: { ...config.ios.infoPlist, CFBundleDisplayName: 'Ритм' },
    },
    plugins: config.plugins.filter(([plugin]) => plugin !== 'expo-widgets'),
  };
};