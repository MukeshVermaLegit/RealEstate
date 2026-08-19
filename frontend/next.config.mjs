/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    // MetaMask SDK references React Native async storage in its browser bundle — stub it.
    // WalletConnect references pino-pretty — stub it too.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
      'encoding': false,
    };
    return config;
  },
};

export default nextConfig;
