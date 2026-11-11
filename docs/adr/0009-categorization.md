# ADR 0009 — Categorization: rules, payee memory, local model, review queue (P6)

- Status: **Proposed** — owner review required (where the model runs differs from PLAN §6; auto-assign thresholds)
- Plan: §6, §5 (normalize), §10 P6 · Builds on ADR 0005 (repository), ADR 0007 (sync), ADR 0008 (import)

## Context
PLAN §6 describes categorization as rules, then exact payee memory, then a local ML classifier, with low-confidence
results going to a review queue. P6 builds all of it. This ADR records where the plan left room and where the
implementation deliberately differs. No schema change: the `rules`, `payee_aliases` and `ml_models` tables from P1 are
used as they are.

## Decisions
1. **One decision function.** `categorize()` in `packages/categorize` is the only place that decides: user rules, then
   payee memory, then the model. Import calls it; the review queue call the same code. A suggestion
   whose category type contradicts the sign (an income category on an outflow) is ignored at every step.
2. **Rule semantics.** All conditions of a rule must hold; rules are tried by ascending `priority`, ties by id so every
   device agrees. Text compares accent- and case-insensitively; `regex` is case-insensitive, also tried on the
   accent-free text, and an invalid pattern never matches. `amount` compares the **absolute value** in minor units, so
   "at least 50,00" covers a spend and a refund; `sign` is `expense` or `income`. The first matching rule that sets a
   category wins; rename and tag actions of earlier matching rules still apply. Rules never overwrite a category with
   `method = 'user'`, and "apply to existing transactions" only sets categories (renames and tags happen on import).
   The rule form has no tag picker yet (the data model and engine support tags; editing a rule keeps its tags).
3. **Payee memory.** A normalized payee categorized by the user at least twice, with the same category in at least 80 %
   of those cases, maps to that category with confidence 0.95. Only `method = 'user'` rows count: guesses never become
   memories.
4. **Thresholds and review.** Model probability >= 0.85 assigns (`method = 'ml'`); 0.5 to 0.85 assigns tentatively and
   sets `needs_review`; below 0.5 the transaction stays uncategorized and `needs_review` is set. This applies on import,
   so every uncategorized imported row lands in the review queue (the plan's "Z need review" in the import summary now
   includes them). Manually entered transactions are not flagged.
5. **Classifier.** Multinomial logistic regression over hashed features (word tokens and character 3-5-grams of payee and
   description with digit runs collapsed, amount magnitude on a log2 scale, sign, account, weekday), L2-normalized,
   trained with AdaGrad from a seeded shuffle, then a single temperature fitted on a calibration split so probabilities
   match observed accuracy. Deterministic: the same data gives the same model. Held-out rows (20 %) are chosen by a hash
   of the row id, so a row stays on the same side across retrains. Needs at least 60 labelled rows and two categories
   with two or more examples each. Measured on a synthetic 50k-row, 40-category set: about 5 s to train, 1.2 MB of JSON.
6. **The server trains; the device scores.** This differs from PLAN §6 ("runs on the server"). The server trains per user
   from the synced `transactions` (only `method = 'user'` rows), keeps versions in `ml_models` (gzipped), and serves the
   active model at `GET /ml/model` (ETag `"v<version>"`). Devices download it after syncs into device-local
   `sync_meta` and score locally on import and in the review queue. Reason: if the server wrote categories, it would write
   synced rows (HLC stamping, `server_seq`, conflicts with a user's offline edit), which the plan marks as owner-review
   territory. Scoring on the device needs none of that, works offline, and every categorization still reaches other
   devices through the normal outbox. The cost: a device that has never synced has no model (rules and payee memory still
   work), and the web build without a server session has none either.
7. **Retraining, promotion, rollback.** A nightly job (03:30) trains users with any change; a 15-minute check trains users
   with at least 20 new or changed labelled rows (PLAN: "after every 20 user corrections"). A new model is promoted unless
   its held-out accuracy is more than one point below the active model's accuracy **on the same held-out rows**;
   otherwise it is stored inactive with the reason and the active model stays. A rejected version is not a rollback
   target and is not retried on the same data. `POST /ml/rollback` re-activates the previous good version; `POST
   /ml/train` trains now. Five older versions are kept.
8. **Payee aliases.** Same semantics as the import pipeline's `derivePayee` (regular expression, plain text when the
   pattern is invalid), first match in list order (oldest first) wins, applied before rules see the payee. Aliases have
   no reorder UI. "Apply to existing transactions" renames by the first matching alias and may overwrite a payee the
   user edited by hand; the form shows how many would change before anything is applied.
9. **Cold-start rules are offered, not seeded.** The ~40 Portuguese merchant rules are added on request ("Add common
   Portuguese merchants"), by name, idempotently. Seeding on every device would create per-device duplicates, which is
   the problem `dedupeSystemCategories` exists to repair for categories. Keywords match as whole words, so "bp" or
   "edp" do not fire inside unrelated text. A test ties each rule's category key to the seeded categories.
10. **Review queue.** Accepting a suggestion or picking a category sets `method = 'user'` (a label, and training data).
    "Always categorise this payee as this category" creates a rule (payee + sign) and applies it to every other
    non-user transaction it matches, which also clears their flag. "Keep as is" clears the flag without a category. A
    sheet offers the queue once per app open. Phone: swipe cards; tablet and desktop: list plus detail with the keyboard
    flow of the plan (arrows, 1-9, Enter, plus S to skip and A to toggle "always").
11. **Metrics.** Auto-categorized share, per method, over the last 90 days (a SQL aggregate, no scan in JS); model accuracy,
    confident-prediction coverage and precision, and counts from `GET /ml/status`.

## Consequences
- Categorization quality is measurable and reversible: a worse model is never promoted, and one tap rolls back.
- Everything categorical goes through the repository, so sync's "user beats ML" rule keeps working unchanged.
- Training runs inside the server process and blocks it for a few seconds at 50k rows. Acceptable for one user at night;
  if it is felt during the day (the 15-minute check), move it to a worker thread.
- Not verified: Android (swipe gestures were checked only through web emulation of a phone width), light theme.
- Open points for the owner: whether to accept device-side scoring (6), the 0.85/0.5 thresholds on first use, and the
  rule form's missing tag picker.
