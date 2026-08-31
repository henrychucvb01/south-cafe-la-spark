# Ask SPARK V1 setup

Ask SPARK keeps its corpus in private Supabase tables and calls them only from the serverless backend.

## 1. Install the database migration

Run `supabase/migrations/202608310001_ask_spark.sql` in the Supabase SQL Editor. It enables pgvector, creates the private document and chunk tables, and installs the service-role-only hybrid search function.

For AR Training, also run `supabase/migrations/202608310002_ar_training.sql`. It creates the private answer key, school-level daily progress and attempt records, seeds the approved V1 answer key, and installs the duplicate-safe 10-point-per-weekday scoring function.

## 2. Configure backend secrets

Set these server-side environment variables in the hosting provider. Never prefix them with `REACT_APP_` and never commit their values.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- Optional: `ASK_SPARK_ALLOWED_ORIGINS` as a comma-separated list of deployed SPARK origins
- Optional: `ASK_SPARK_ANSWER_MODEL` (defaults to `gpt-4.1-mini`)
- Optional: `ASK_SPARK_EMBEDDING_MODEL` (defaults to `text-embedding-3-small`; it must produce 1,536 dimensions)

Add the required variables to every Vercel environment that will run Ask SPARK: Production, Preview, and Development. After adding or changing them, redeploy because existing deployments do not receive newly added variables.

Local API testing must use Vercel's local runtime from the repository root:

```powershell
npx vercel dev
```

Open the URL printed by Vercel and use `/api/ask-spark`. A plain `react-scripts start` process serves only the React frontend and cannot execute files in `api/`.

## 3. Validate and load the finalized corpus

Run the loader from a trusted local terminal. The first command is a dry run and must report exactly 96 documents and 1,415 chunks.

```powershell
npm run ask-spark:load -- "C:\Users\Lausd_User\Documents\Codex\training-analysis\ask-spark-phase1\chunks.jsonl"
```

After the dry run succeeds and the three secrets above exist in the terminal session, load the corpus:

```powershell
npm run ask-spark:load -- "C:\Users\Lausd_User\Documents\Codex\training-analysis\ask-spark-phase1\chunks.jsonl" --apply
```

The loader uploads only approved document metadata, citation-sized text chunks, locators, hashes, and embeddings. It intentionally omits original files, workstation source paths, and local extracted-text paths.

## 4. Optional exchange links

This checkout did not contain Food Exchange or Equipment Exchange destinations. If those tools are hosted elsewhere, preserve their existing URLs using `REACT_APP_FOOD_EXCHANGE_URL` and `REACT_APP_EQUIPMENT_EXCHANGE_URL` in the frontend deployment configuration.
