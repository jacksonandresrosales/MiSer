import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.miser.finanzas',
  appName: 'MiSer',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { webContentsDebuggingEnabled: false },
  plugins: {
    FirebaseAuthentication: { skipNativeAuth: true, providers: ['google.com'] },
  },
}

export default config
