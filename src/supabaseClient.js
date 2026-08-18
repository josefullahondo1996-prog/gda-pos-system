import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('Supabase Config:', {
  url: supabaseUrl ? 'Definida' : 'FALTANTE',
  key: supabaseKey ? 'Definida' : 'FALTANTE'
})

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Falta configuración de Supabase. Revisa el archivo .env')
}

export const supabase = createClient(supabaseUrl, supabaseKey)