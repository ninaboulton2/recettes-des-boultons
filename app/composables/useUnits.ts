import type { Database } from '#shared/types/database'

export type Unit = Database['public']['Tables']['units']['Row']

/**
 * Référentiel des unités (table `units`, lecture publique), chargé une fois
 * côté serveur puis partagé (`useAsyncData` avec clé fixe).
 * `unitLabel(code, fallback, long?, lang?)` renvoie le libellé canonique dans la
 * langue demandée (celle de l'interface par défaut) : abréviation française
 * (`abbr`) ou anglaise (`abbr_en`), ou nom complet (`long`), avec repli sur le
 * code ou le texte libre.
 */
export const useUnits = () => {
  const supabase = useSupabaseClient<Database>()
  const { locale } = useI18n()

  const { data, pending, error, refresh } = useAsyncData<Unit[]>(
    'units',
    async () => {
      const { data, error } = await supabase
        .from('units')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    { default: () => [] }
  )

  const byCode = computed(() => new Map((data.value ?? []).map(u => [u.code, u])))

  const unitLabel = (
    code: string | null | undefined,
    fallback?: string | null,
    long = false,
    lang: 'fr' | 'en' = locale.value === 'en' ? 'en' : 'fr'
  ): string => {
    if (!code) return fallback ?? ''
    const unit = byCode.value.get(code)
    if (!unit) return fallback ?? code
    if (!long) return lang === 'en' ? unit.abbr_en : unit.abbr
    return lang === 'en' ? unit.label_en : unit.label_fr
  }

  return { units: data, byCode, pending, error, refresh, unitLabel }
}
