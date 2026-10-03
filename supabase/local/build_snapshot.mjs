#!/usr/bin/env node
// ============================================================================
//  Construit supabase/local/snapshot/*.sql à partir d'exports JSON de la prod.
// ============================================================================
//  Entrée : supabase/local/snapshot/raw/<table>*.json (gitignoré), un ou
//  plusieurs fichiers par table (lots). Chaque fichier contient :
//    - soit un tableau JSON de lignes            → [{...}, {...}]
//    - soit le résultat brut du SQL Editor / MCP → [{"data": [...]}]
//    - soit l'enveloppe texte de l'outil MCP     → {"result": "...<untrusted-data-…>…"}
//  Tables attendues :
//    recipes, recipe_sections, recipe_ingredients, instructions,
//    user_data (un objet : {shopping_lists, shopping_items, planning,
//               planning_notes, favorites, profiles, users})
//  Les requêtes SQL exactes sont dans export_snapshot.md.
//
//  Sortie : snapshot/00_users.sql, 10_recipes.sql, 20_recipe_sections.sql,
//  30_recipe_ingredients.sql, 40_instructions.sql, 50_user_data.sql,
//  tous idempotents (on conflict … do nothing / do update), appliqués par
//  setup.sh APRÈS 0001/0002 et AVANT 0003 (colonnes « avant migration »).
//
//  Anonymisation : aucun e-mail réel n'est lu ni écrit. Les comptes locaux
//  deviennent admin@local.test, admin2@local.test, user@local.test, user2@…
//  (ordre de création en prod), mot de passe « password123 ».
//  Usage : node supabase/local/build_snapshot.mjs
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RAW = path.join(HERE, 'snapshot', 'raw')
const OUT = path.join(HERE, 'snapshot')
const PASSWORD = 'password123'
const TAG = '$snap$'

function loadJson(file) {
  let txt = fs.readFileSync(file, 'utf8').trim()
  if (txt.startsWith('{"result"')) {
    const outer = JSON.parse(txt)
    const m = /<untrusted-data-[^>]+>\n([\s\S]*?)\n<\/untrusted-data-/.exec(outer.result)
    if (!m) throw new Error(`Enveloppe MCP non reconnue : ${file}`)
    txt = m[1]
  }
  let v = JSON.parse(txt)
  if (Array.isArray(v) && v.length === 1 && v[0] && typeof v[0] === 'object' && Object.keys(v[0]).length === 1 && 'data' in v[0]) {
    v = v[0].data
  }
  return v
}

function rawFiles(prefix) {
  if (!fs.existsSync(RAW)) return []
  return fs.readdirSync(RAW)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
    .map(f => path.join(RAW, f))
}

function loadRows(table) {
  const files = rawFiles(table)
  if (files.length === 0) throw new Error(`Aucun fichier raw/${table}*.json`)
  const rows = []
  for (const f of files) {
    const v = loadJson(f)
    if (!Array.isArray(v)) throw new Error(`${f} : tableau attendu`)
    rows.push(...v)
  }
  const ids = new Set(rows.map(r => r.id))
  if (ids.size !== rows.length) throw new Error(`${table} : ids dupliqués entre lots`)
  return rows
}

function dollar(json) {
  if (json.includes(TAG)) throw new Error(`Le JSON contient ${TAG}`)
  return `${TAG}${json}${TAG}`
}

function lit(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

function insertFromJson(table, rows, { conflict = '(id)', update = null } = {}) {
  const action = update
    ? `do update set ${update.map(c => `${c} = excluded.${c}`).join(', ')}`
    : 'do nothing'
  return `-- ${rows.length} ligne(s)\ninsert into public.${table}\nselect * from jsonb_populate_recordset(null::public.${table}, ${dollar(JSON.stringify(rows))}::jsonb)\non conflict ${conflict} ${action};\n`
}

function header(title) {
  return `-- Snapshot prod anonymisé — ${title}\n-- Généré par build_snapshot.mjs le ${new Date().toISOString()} ; fichier GITIGNORÉ (données familiales).\n-- Appliqué par setup.sh après 0001/0002 et avant 0003.\n`
}

fs.mkdirSync(OUT, { recursive: true })

// --- Données utilisateurs (un seul objet) -----------------------------------
const userFiles = rawFiles('user_data')
if (userFiles.length !== 1) throw new Error('Exactement un fichier raw/user_data*.json attendu')
const ud = loadJson(userFiles[0])
const users = ud.users ?? []
const profiles = ud.profiles ?? []
const profileById = new Map(profiles.map(p => [p.id, p]))

// Attribution des e-mails locaux : admins (profiles.role) puis utilisateurs,
// dans l'ordre de création prod, les comptes sans profil en dernier. Le 1er
// admin = admin@local.test, le 1er utilisateur = user@local.test (comptes de
// test documentés, avec leurs favoris/planning/courses prod).
const sorted = [...users].sort((a, b) =>
  (profileById.has(b.id) ? 1 : 0) - (profileById.has(a.id) ? 1 : 0) || a.created_at.localeCompare(b.created_at))
let nAdmin = 0
let nUser = 0
const accounts = sorted.map(u => {
  const p = profileById.get(u.id)
  const role = p?.role === 'admin' ? 'admin' : 'user'
  const idx = role === 'admin' ? ++nAdmin : ++nUser
  const email = `${role}${idx === 1 ? '' : idx}@local.test`
  const name = p?.name ?? u.meta_name ?? u.meta_full_name ?? email
  return { id: u.id, email, role, name, created_at: u.created_at, updated_at: u.updated_at ?? u.created_at, hasProfile: !!p }
})

let usersSql = header('auth.users + auth.identities (mots de passe : password123)')
usersSql += '-- Correspondance (uuid prod conservé → e-mail local) :\n'
for (const a of accounts) usersSql += `--   ${a.id}  ${a.email.padEnd(18)} role=${a.role}${a.hasProfile ? '' : ' (sans profil en prod)'}\n`
usersSql += `
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token,
  is_sso_user, is_anonymous)
values
${accounts.map(a => `  ('00000000-0000-0000-0000-000000000000', ${lit(a.id)}, 'authenticated', 'authenticated', ${lit(a.email)},
   extensions.crypt(${lit(PASSWORD)}, extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ${lit(JSON.stringify({ name: a.name, role: a.role, email_verified: true }))}::jsonb,
   ${lit(a.created_at)}, ${lit(a.updated_at)}, '', '', '', '', '', '', '', '', false, false)`).join(',\n')}
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', now(), u.created_at, u.created_at
  from auth.users u
 where u.id in (${accounts.map(a => lit(a.id)).join(', ')})
on conflict (provider_id, provider) do nothing;
`
fs.writeFileSync(path.join(OUT, '00_users.sql'), usersSql)

// --- Contenu recettes --------------------------------------------------------
const recipes = loadRows('recipes')
const sections = loadRows('recipe_sections')
const ingredients = loadRows('recipe_ingredients')
const instructions = loadRows('instructions')

fs.writeFileSync(path.join(OUT, '10_recipes.sql'), header('recipes') + insertFromJson('recipes', recipes))
fs.writeFileSync(path.join(OUT, '20_recipe_sections.sql'), header('recipe_sections') + insertFromJson('recipe_sections', sections))
fs.writeFileSync(path.join(OUT, '30_recipe_ingredients.sql'), header('recipe_ingredients') + insertFromJson('recipe_ingredients', ingredients))
fs.writeFileSync(path.join(OUT, '40_instructions.sql'), header('instructions') + insertFromJson('instructions', instructions))

// --- Données personnelles ----------------------------------------------------
const emailById = new Map(accounts.map(a => [a.id, a.email]))
const profileRows = profiles.map(p => ({ ...p, email: emailById.get(p.id) ?? `${p.id}@local.test` }))

let userDataSql = header('profiles, shopping_lists, shopping_items, planning, planning_notes, favorites')
userDataSql += `
-- Le trigger anti-escalade (0001) interdit de changer profiles.role sans JWT admin :
-- on le suspend le temps d'aligner les profils (créés par handle_new_user) sur la prod.
alter table public.profiles disable trigger trg_prevent_role_change;
${insertFromJson('profiles', profileRows, { update: ['email', 'name', 'role', 'language', 'theme', 'notifications', 'created_at', 'updated_at'] })}
alter table public.profiles enable trigger trg_prevent_role_change;

${insertFromJson('shopping_lists', ud.shopping_lists ?? [])}
${insertFromJson('shopping_items', ud.shopping_items ?? [])}
${insertFromJson('planning', ud.planning ?? [])}
${insertFromJson('planning_notes', ud.planning_notes ?? [])}
${insertFromJson('favorites', ud.favorites ?? [])}
`
fs.writeFileSync(path.join(OUT, '50_user_data.sql'), userDataSql)

console.log(`Snapshot généré dans ${OUT} :`)
console.log(`  users ${accounts.length} (${accounts.map(a => a.email).join(', ')})`)
console.log(`  recipes ${recipes.length}, recipe_sections ${sections.length}, recipe_ingredients ${ingredients.length}, instructions ${instructions.length}`)
console.log(`  profiles ${profileRows.length}, shopping_lists ${(ud.shopping_lists ?? []).length}, shopping_items ${(ud.shopping_items ?? []).length}, planning ${(ud.planning ?? []).length}, planning_notes ${(ud.planning_notes ?? []).length}, favorites ${(ud.favorites ?? []).length}`)
