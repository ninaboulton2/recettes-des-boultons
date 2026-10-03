# Comparatif des modèles pour le traducteur de recettes

Prix relevés le **2026-10-03** sur les pages officielles (liens en bas de page). Tarif
« standard » à l'appel (pas de batch, pas de cache), en USD par million de tokens. Les prix
changent souvent : revérifier avant de modifier `server/utils/ai/pricing.ts` (grille datée).

## Le besoin

Une « traduction » = un texte brut de recette (≈ 1 500 tokens en entrée, prompt système compris)
→ une recette JSON structurée (≈ 800 tokens en sortie), avec contraintes fortes : unité parmi
37 codes, catégorie parmi 9, sections conservées, français naturel. Il faut donc :

1. une **sortie structurée native** (le fournisseur garantit le respect du schéma JSON) ;
2. un **bon français** (traduction de recettes anglaises, vocabulaire culinaire) ;
3. un **coût marginal** : 200 traductions/mois est déjà un scénario généreux pour une famille ;
4. une latence de quelques secondes (le front attend, délai serveur 25 s).

## Tableau

| Modèle | Fournisseur | Entrée $/M | Sortie $/M | Fenêtre | Sortie structurée native | Français attendu | Hébergement UE | Latence | 1 traduction (1 500 + 800) | 200 / mois |
|---|---|---|---|---|---|---|---|---|---|---|
| **gpt-4.1-mini** | OpenAI | 0,40 | 1,60 | 1 047 576 | Oui (JSON Schema strict, Responses API) | Très bon | Non par défaut (résidence EU sur demande, offre entreprise/API « eu. ») | ~2–4 s | **0,0019 $** | **0,38 $** |
| gpt-5-mini | OpenAI | 0,25 | 2,00 | 400 000 | Oui | Très bon | idem | ~4–10 s (modèle « reasoning » : tokens de raisonnement facturés en sortie, à régler `reasoningEffort: minimal`) | 0,0020 $ (hors raisonnement) | 0,40 $ |
| gpt-5.4-mini | OpenAI | 0,75 | 4,50 | 400 000 | Oui | Excellent | idem | reasoning | 0,0047 $ | 0,95 $ |
| Claude Haiku 4.5 (`claude-haiku-4-5`) | Anthropic | 1,00 | 5,00 | 200 000 | Oui (structured outputs GA) | Excellent | Non par défaut (`inference_geo` US uniquement ; UE via Vertex AI/Bedrock régional +10 %) | ~2–4 s | 0,0055 $ | 1,10 $ |
| Gemini 2.5 Flash | Google | 0,30 | 2,50 | 1 048 576 | Oui (JSON Schema) | Très bon | Non via l'API Gemini Developer ; oui via Vertex AI (régions `europe-*`, +10 %) | ~2–4 s | 0,0025 $ | 0,49 $ |
| Gemini 2.5 Flash-Lite | Google | 0,10 | 0,40 | 1 048 576 | Oui | Bon | idem | ~1–3 s | 0,0005 $ | 0,09 $ |
| **Mistral Small 4** (`mistral-small-latest` = `mistral-small-2603`) | Mistral | 0,15 | 0,60 | 256 000 | Oui (`json_schema`) | Très bon (éditeur français) | **Oui** (API hébergée en UE) | ~2–4 s | **0,0007 $** | **0,14 $** |

Calcul : `(1 500 × prix entrée + 800 × prix sortie) / 1 000 000`. Les « modèles courants » pour la
famille gpt-5 sont aujourd'hui gpt-5.4-mini / nano ; gpt-5-mini reste disponible. Latences :
ordres de grandeur observés pour ~800 tokens de sortie, non mesurés ici.

Qualité française : appréciation a priori (taille du modèle, retours publics) — aucun test
comparatif n'a été exécuté dans ce projet (pas d'appel payant autorisé). À valider sur
5–10 recettes réelles avant de figer le choix.

## Recommandation par défaut : OpenAI `gpt-4.1-mini`

- **Coût** : ≈ 0,002 $ par recette, **≈ 0,40 $ pour 200 recettes/mois** — négligeable ; 5× moins
  cher que Claude Haiku 4.5 pour une qualité de traduction culinaire comparable sur ce type de
  tâche simple.
- **Sortie structurée** : JSON Schema strict natif (le modèle ne peut pas sortir du schéma :
  unité ∈ 37 codes, catégorie ∈ 9) — c'est le point qui évite le plus de recettes à corriger à la
  main. Pas de « reasoning » : réponse rapide, pas de tokens cachés facturés.
- **Français** : modèle de la génération 4.1, très bon en traduction ; fenêtre d'1 M tokens
  (sans objet ici, mais confortable pour la phase 5 : images/PDF).
- **Pragmatique** : Nina a déjà un compte et une clé OpenAI (`OPENAI_API_KEY` sur Vercel) :
  aucun nouveau compte, aucune nouvelle variable à créer, seul le modèle change
  (`gpt-4o-mini` → `gpt-4.1-mini`, +0,25 $/M en entrée, +1 $/M en sortie : toujours < 0,50 $/mois).

Pourquoi pas les autres par défaut :

- *gpt-5-mini / gpt-5.4-mini* : modèles « reasoning » — latence et tokens de raisonnement
  facturés en sortie, sans gain sur une extraction simple.
- *Claude Haiku 4.5* : excellent français et structured outputs GA, mais 3× le prix ; à garder
  comme option « qualité » si gpt-4.1-mini déçoit sur les sous-sections (`AI_PROVIDER=anthropic`).
- *Gemini 2.5 Flash-Lite* : le moins cher, mais qualité moindre sur les textes mal structurés ;
  Flash est au prix de gpt-4.1-mini sans l'avantage du compte existant.

## Alternative UE : Mistral `mistral-small-latest` (Mistral Small 4)

Si l'hébergement européen des données (recettes collées = données personnelles possibles, ex.
commentaires d'un blog) devient un critère : Mistral AI héberge son API dans l'UE, propose la
sortie structurée `json_schema`, et Small 4 est **le moins cher du tableau après Flash-Lite**
(≈ 0,14 $ pour 200 recettes). Bascule : créer une clé sur console.mistral.ai,
`AI_PROVIDER=mistral`, `MISTRAL_API_KEY=…` (modèle par défaut `mistral-small-latest`). Modèle
« hybride » (raisonnement optionnel) : vérifier la latence et la fidélité des sous-sections sur
quelques recettes.

## Transcription audio (phase 5)

| Modèle | Prix | Pour une recette dictée de 3 min | 200 / mois |
|---|---|---|---|
| OpenAI `gpt-4o-mini-transcribe` (recommandé) | 0,003 $/min | 0,009 $ | 1,80 $ |
| OpenAI `whisper-1` | 0,006 $/min | 0,018 $ | 3,60 $ |
| Mistral Voxtral Mini Transcribe | 0,006 $/min | 0,018 $ | 3,60 $ |

La transcription coûte ~5× plus que la structuration texte mais reste marginale. Une image
(photo de recette, ~1 000–1 500 tokens en entrée avec gpt-4.1-mini) ajoute ≈ 0,0006 $.
Voir `server/utils/ai/media.ts` pour le branchement (`experimental_transcribe`, images dans
`generateObject`).

## Mise en œuvre dans l'application

- Fournisseur et modèle : `AI_PROVIDER` / `AI_MODEL` (défauts : `openai` / `gpt-4.1-mini`),
  clés `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY`
  (`server/utils/ai/provider.ts`). `AI_PROVIDER=mock` : aucun appel réseau (dev local, tests).
- Quota : `AI_DAILY_QUOTA` (50 appels/jour/personne par défaut), table `ai_usage` avec coût estimé
  par appel (migration 0012). Pour suivre la dépense réelle : `select date_trunc('month',
  created_at), sum(estimated_cost_usd), count(*) from ai_usage group by 1`.
- Les quatre fournisseurs sont installés (`@ai-sdk/openai`, `@ai-sdk/anthropic`,
  `@ai-sdk/google`, `@ai-sdk/mistral`) : changer de fournisseur = changer deux variables sur
  Vercel, sans redéploiement de code.

## Sources (consultées le 2026-10-03)

- OpenAI, tarifs : https://developers.openai.com/api/docs/pricing — fiches modèles
  https://developers.openai.com/api/docs/models/gpt-4.1-mini et
  https://developers.openai.com/api/docs/models/gpt-5-mini — sorties structurées
  https://developers.openai.com/api/docs/guides/structured-outputs
- Anthropic, tarifs : https://platform.claude.com/docs/en/about-claude/pricing — sorties
  structurées (modèles supportés, dont Haiku 4.5) :
  https://platform.claude.com/docs/en/docs/build-with-claude/structured-outputs — fenêtre 200 k :
  référence des modèles (skill `claude-api`, cache du 2026-06-24)
- Google, tarifs : https://ai.google.dev/gemini-api/docs/pricing — fiche Gemini 2.5 Flash :
  https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash — résidence UE via Vertex AI :
  https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations
- Mistral, tarifs : https://mistral.ai/pricing#api-pricing — modèles :
  https://docs.mistral.ai/getting-started/models/models_overview/ — sortie structurée :
  https://docs.mistral.ai/capabilities/structured-output/custom_structured_output/ — fenêtre
  256 k de Small 4 : https://openrouter.ai/mistralai/mistral-small-2603 (fiche tierce)
- Vercel AI SDK (v7, `generateObject`, `experimental_transcribe`) : https://ai-sdk.dev/docs
