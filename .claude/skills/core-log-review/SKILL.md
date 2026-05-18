---
name: core-log-review
description: Pre-commit / pre-merge structural review checklist for the core-log codebase. Triggers when modifying admin UI (/a/[token]/page.tsx), Supabase queries via @/lib/supabase, tenant-scoped CRUD endpoints under /api/admin/, edit modals that round-trip DB columns through React form state, feature-flag rendering with useFeatures().isOn, or migrating between Client and Server Components. Lists the silent-failure modes observed in this codebase and the patterns that prevent them from recurring.
---

# core-log review checklist (silent-failure trap prevention)

Bugs observed in this codebase repeatedly came from **silent failures**: code that ran without throwing but produced empty / wrong results. The user only noticed days later. Below are the five trap families and the structural rules that catch them at write-time.

Before merging anything that touches admin UI, Supabase, tenants, edit modals, or feature flags, run through the corresponding section.

---

## Trap 1: Implicit Conditional Coupling (UI rendering)

### Symptom
A UI element that the author intended to be "always visible" disappears when some other feature flag is toggled off. The element itself has no flag — but its **parent container** is conditional.

### Real example (the 例示管理 / placeholder examples bug)

```tsx
// BAD: 例示管理 is ungated but lives inside a 3-flag OR gated parent
{(isOn("tier-g.multiTenant") || isOn("tier-g.consultIntervention") || isOn("tier-b.knowledgeLibrary")) && (
  <div>
    <h2>運用管理</h2>
    <div className="grid">
      {isOn("tier-g.multiTenant") && <Link>マルチテナント</Link>}
      ...
      <Link>例示管理</Link>  {/* ← turned off when all 3 flags off */}
    </div>
  </div>
)}
```

### Rule
**The visibility of every UI card must be expressible by ONLY that card's own gates.** A card that is "always visible" must not be a descendant of any `{flag && (...)}`.

### Detection at write time
- For any new card / section: list its visibility intent (always, or behind flag X).
- Walk up the parent chain. If ANY ancestor is conditional, either:
  - (a) extract the child to its own section, OR
  - (b) attach the same flag to the child explicitly to make the coupling intentional.

### When grouping cards under a section
Render section chrome (title, grid wrapper) **only when at least one child is visible**:

```tsx
const operationsCards = [
  isOn("tier-g.multiTenant") && <MultiTenantCard />,
  isOn("tier-g.consultIntervention") && <ConsultCard />,
].filter(Boolean);

{operationsCards.length > 0 && (
  <div>
    <h2>運用管理</h2>
    <div className="grid">{operationsCards}</div>
  </div>
)}
```

This way the section header automatically follows the children, and there is no hidden gate to inherit.

---

## Trap 2: PostgREST / Supabase silent failures

### Symptom 2a — `.eq("col", null)` always matches 0 rows
PostgREST translates `.eq("col", null)` to SQL `col = NULL`. By SQL three-valued logic, `= NULL` is **never true** — NULL comparison requires `IS NULL`. The query runs without error and returns 0 rows. If you use it in an UPDATE / DELETE filter or a CAS pattern, the operation silently does nothing.

This is the bug that made stamps vanish after pressing (PR #17). The CAS line was:

```ts
// BAD
.eq("manager_reaction", row.manager_reaction ?? null)
```

### Rule
**Never call `.eq()` / `.neq()` / `.in()` with a value that might be null.** Branch explicitly:

```ts
// GOOD
let q = client.from(t).update(...).eq("id", id);
if (currentValue === null || currentValue === undefined) {
  q = q.is("col", null);
} else {
  q = q.eq("col", currentValue);
}
```

### Detection at write time
Grep for the pattern in any PR diff:
```bash
git diff main...HEAD | grep -E '\.eq\([^,]+,\s*[^,]*(\?\?|\|\|)\s*null'
# OR catch the literal:
git diff main...HEAD | grep -E '\.eq\([^,]+,\s*null'
```
If you see it, replace with `.is(col, null)` for the null branch.

### Symptom 2b — UPDATE matched 0 rows, treated as success
A SUPABASE update like:

```ts
const { error } = await client.from("missions").update(x).eq("id", missionId);
if (!error) return true;  // BAD — could be 0 rows
```

returns no error even when the WHERE matched nothing. Callers think the write succeeded.

### Rule
Always include `.select("id")` and check `data.length > 0`:

```ts
const { error, data } = await client.from("...").update(...).eq(...).select("id");
if (error) return false;
if (!data || data.length === 0) {
  logger.warn("Update matched 0 rows", { ... });
  return false;
}
return true;
```

Existing helpers in `src/lib/supabase.ts` (e.g., `updateMissionStatus`, `toggleManagerReaction`) already do this — follow that pattern for any new write helper.

---

## Trap 3: Actor's tenant vs Target's tenant (cross-tenant CRUD)

### Symptom
An admin can SEE participants from multiple tenants on the dashboard, but **editing them fails with "更新に失敗しました"**. The failure is silent at the DB layer (0 rows updated) and only surfaces because we check `data.length > 0` in the helper.

This was the bug that broke participant edit + manager edit (PR #16).

### Bad pattern
```ts
// BAD: tenant comes from the actor, not the target
const manager = await getManagerByToken(token);
const tenantId = resolveManagerTenantStrict(manager).tenantId;  // admin's home tenant
await updateParticipantInSupabase(participantId, updates, tenantId);
// → if participant is in another tenant, WHERE filter excludes the row
```

### Rule
For any admin operation on `participants` / `managers` / `missions` / `feedback` / `logs`:

1. **SELECT the target row's `tenant_id` first** (no tenant filter).
2. **Validate** that the actor is allowed to touch that tenant:
   - super-admin (`!manager.tenantId` AND `manager.isAdmin`) → allowed for any tenant
   - tenant-admin → allowed only when `manager.tenantId === target.tenant_id`
3. **UPDATE / DELETE** using the **target's** tenant_id.

Reference implementations:
- `src/app/api/admin/participants/[id]/route.ts` (post PR #16) — look-up-first pattern
- `src/app/api/admin/managers/[id]/route.ts` (post PR #16) — same pattern

### For settings APIs (ai_settings, phase_labels, feature_flags)
Same pattern but the "target" is the tenant itself, not a row. Use:
- `manager.tenantId` for tenant-admins
- `?tenant=slug` query param for super-admins (mirrors `/api/admin/ai-settings`)

Never default to `DEFAULT_TENANT_ID` for super-admins viewing a specific tenant; that writes to the wrong place and the GET reads the right place, so the UI looks "broken" with no error.

---

## Trap 4: Flex layout collapse on mobile

### Symptom
Cards on mobile show CJK text wrapping one character per line: "下地" / "範明" stacked vertically. Stats columns crushed to ~1-character width.

This was the bug in PR #15.

### Bad pattern
```tsx
<div className="flex items-start justify-between">  {/* always row */}
  <div className="flex-1">{/* left: long-form content */}</div>
  <div>                                              {/* right: many buttons */}
    <button>...</button>
    <button>...</button>
    <button>...</button>
    <button>...</button>
  </div>
</div>
```

On 375 px iPhone the right column eats ~280 px and the left collapses to ~95 px.

### Rule
For any `flex justify-between` with a multi-button or multi-stat right column:

1. Stack on mobile, side-by-side on `sm+`:
   ```
   flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3
   ```
2. Left column: `min-w-0 flex-1` (the `min-w-0` lets it shrink past content width).
3. Inner row of stats / buttons: add `flex-wrap` + per-item `whitespace-nowrap`.
4. Don't position action buttons with `absolute top-0 right-0` (overlaps title on mobile).

Reference: the participant card and the "参加者一覧" header in `src/app/a/[token]/page.tsx` (post PR #15).

---

## Trap 5: Form ↔ DB column round-trip with type mismatch

### Symptom
"保存ボタンを押すとエラー / 更新に失敗しました" on an edit modal — even when the user only changed one trivial field (e.g., name). The browser shows a generic alert; the server log has `invalid input syntax for type X: ""` (or NaN, or boolean-as-string, etc.).

### Real example (the participant edit bug)

```ts
// 1. Dashboard payload doesn't carry email/startDate/endDate/emailEnabled
type ParticipantData = { id, name, department, dojoPhase, managerId, fbPolicy, ... };

// 2. Edit modal opens. Form initializes the missing fields to ""/true:
setEditForm({
  name: p.name, department: p.department, dojoPhase: p.dojoPhase,
  email: "",        // ← not in ParticipantData
  startDate: "",    // ← not in ParticipantData
  endDate: "",      // ← not in ParticipantData
  emailEnabled: true,
  ...
});

// 3. User edits ONLY name, clicks save. The body spreads all of editForm:
fetch(`/api/admin/participants/${id}`, { body: JSON.stringify({ token, ...editForm }) });
//                                                                       ^^^^^^^^^^^^
//                                                                       sends startDate="" etc.

// 4. updateParticipantInSupabase forwards "" verbatim:
if (updates.startDate !== undefined) updateData.start_date = updates.startDate;
//                                                            ^^^^^^^^^^^^^^^^^^
//                                                            "" → "" sent to PG

// 5. PostgreSQL: start_date is `date` type. "" is not a valid date.
//    → ERROR 22007: invalid input syntax for type date: ""
//    → 500 → "更新に失敗しました"
```

The user only edited `name`, but the whole UPDATE was rejected. **The other fields silently corrupted the operation.**

### Why this hides for a long time
This bug can be masked by *another* bug in the same code path. In our case, before PR #16 the WHERE clause used the actor's home tenant, so cross-tenant edits already failed with 0-row update — the "" → date error never had a chance to surface. PR #16 fixed the WHERE filter and the older latent bug became reachable.

**When you fix a bug that was masking another, expect the next layer to surface.** Don't assume "I'm done" after a single fix; trace the full path and test the happy path end-to-end.

### Rule
For any edit form that round-trips DB columns:

1. **The form's `initial` values must come from the actual DB row**, not from a lightweight list payload. Add or call a dedicated GET endpoint that returns every editable column (`/api/admin/<resource>/[id]` GET).
2. **Add a defensive type-aware conversion** in the lib write helper:
   - DATE / TIMESTAMP column: convert `"" → null`
   - UUID column: convert `"" → null` (already done for `manager_id` in this repo — same pattern)
   - BOOLEAN column: do NOT accept strings — coerce or reject
   - NUMERIC column: do NOT accept NaN — coerce or reject
3. **Audit columns the form references against the DB schema** when adding/renaming fields. PostgreSQL is strict; empty string is NOT null.

### Detection at write time
```bash
# Look for date/timestamp/uuid columns being written from form state without null coercion.
# In a write helper, every line like:
#   updateData.<col> = updates.<field>;
# where <col> is date/timestamp/uuid should be:
#   updateData.<col> = updates.<field> || null;

git diff main...HEAD -- 'src/lib/supabase.ts' 'src/app/api/admin/**/route.ts' \
  | grep -E '\b(start_date|end_date|deadline|created_at|updated_at|.*_id)\s*=\s*updates\.[a-zA-Z]+;'
# If you see one without `|| null`, fix it.
```

### Reference implementations
- `src/app/api/admin/participants/[id]/route.ts` (post the PR that fixes participant edit) — GET + PUT with shared `authorizeWithToken()`
- `src/lib/supabase.ts` `updateParticipantInSupabase` — date columns now use `|| null`
- `src/app/a/[token]/page.tsx` `openEditParticipant` — calls the new GET in parallel with managers fetch

---

## Cross-cutting rule: PR review checklist

Before merging any PR that touches the five areas above:

- [ ] **Conditional coupling**: any new UI card / section — is it a descendant of `{flag && ...}`? Intentional or accidental?
- [ ] **NULL CAS**: any new `.eq(`...`, x)` where `x` can be null? Replace with `.is(col, null)` branch.
- [ ] **0-row writes**: any new `.update()` / `.delete()` — does it return `.select(...)` and check `data.length > 0`?
- [ ] **Tenant scope**: any new admin write — does WHERE use the target's tenant_id (not the actor's)?
- [ ] **Mobile layout**: any new `flex justify-between` — does it have `flex-col sm:flex-row` + `min-w-0` on left + `flex-wrap` on inner rows?
- [ ] **Form ↔ DB type match**: does the edit modal load real DB values (not defaulting to ""/true)? Does the write helper coerce "" → null for nullable date/uuid/timestamp columns?
- [ ] **Branch state vs production**: are you testing on **production** (where main may not yet be deployed) or **preview** (which has the PR branch)? When the user reports "no change", verify the branch they're hitting BEFORE optimizing further.
- [ ] **Layer masking**: when fixing a bug, ask "is there another bug below this one that was being masked?" — fix the SQL/DB layer error AND the UI layer that produced the bad value.

## Anti-pattern: optimizing blind
When a user reports performance / behavior regression, **verify the deploy is reachable** before iterating:
- Production custom domain = main branch (only what's merged + deployed)
- Per-commit preview URL = frozen at that commit (not auto-updated)
- Branch-alias preview URL (`...git-claude-deb-...vercel.app`) = always latest of that branch

If you can't reach the URL (auth-walled), explicitly ask the user which URL they are testing and whether the PR is merged + deployed before committing more code.
