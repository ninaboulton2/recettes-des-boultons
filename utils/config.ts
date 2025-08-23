// Configuration des variables d'environnement
export const config = {
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_API_KEY || ''
  }
}

// Vérification de la configuration
export function validateConfig() {
  if (!config.supabase.url || !config.supabase.anonKey) {
    console.warn('⚠️  Variables Supabase manquantes. Vérifiez votre fichier .env')
    console.warn('   SUPABASE_URL et SUPABASE_API_KEY sont requis')
  }
}
