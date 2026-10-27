AI Search + current Gemini evaluation

Scope
This is a private evaluation adapter, not a new public answer mode.
Railway stays stopped. No DNS, production setting, consent log or real user conversation is changed.
Cloudflare instance: motto-concierge-12-docs-eval (default namespace).
The instance has no public endpoint. Only the same twelve official files are uploaded.
corpus-manifest.json records uploaded and original hashes, bytes and canonical URLs.

Setup (support-finder root)
Authenticate using the official Wrangler CLI in evaluation/search-container.
Wrangler's short-lived OAuth is read in memory from its local config; never commit or print it.
If a query returns 401 after an hour, use the official CLI to refresh the session before resuming.
  cd evaluation/search-container
  npx wrangler ai-search list --json
  cd ../..
  python3 evaluation/ai-search/bootstrap.py
  python3 evaluation/ai-search/upload.py
bootstrap.py is an initial-creation script. Do not recreate an existing instance.
upload.py resumes successful uploads from private state. Do not delete this state and re-upload blindly.
Wrangler 4.153.0 initially required a service token even for builtin uploads.
The official REST API can create a builtin instance without an R2 service token; cf.py uses that API.
No token creation permission or newly copied API key is required for this evaluation.

Configuration
Qwen3 embedding 0.6B, 1250-token chunks, zero overlap, hybrid search.
Japanese keyword tokenizer: trigram. Match mode: or.
No response cache, reranking, query rewrite or Cloudflare answer generation.
Use search() only. The existing createDocsGPT(pipeline='search') owns context, Gemini and citation review.
The DocsGPT agent key is never forwarded to Cloudflare. Unknown item keys are discarded.
Canonical official links are obtained from the existing source manifest, not from model output.

PDF format compatibility
AI Search may return a real programme heading as a plain standalone line.
trusted-headings.json is derived from the prior DocsGPT extraction of the same twelve sources.
adapter.mjs restores Markdown heading formatting only when the standalone label is present in
the trusted source headings and names a known programme. It does not change words or their order.
The original citation validator remains unchanged; a different programme must still be rejected.
Rebuild and review the heading map when the source files change. It is not a general semantic classifier.

Compare
  node --test evaluation/ai-search/adapter.test.mjs
  node evaluation/ai-search/compare.mjs
The comparison resumes successful answers without generating them again.
Two six-turn conversations run against both providers. Provider order alternates.
Ten seconds of pacing before each generated answer are excluded from elapsedMs.
Rate-limited turns are flagged and excluded from normal latency summaries.
For a separate run, set AI_SEARCH_EVAL_FILE to a separate private JSON filename.
The normalized run reused the unchanged DocsGPT baseline and regenerated all twelve AI Search answers.
The initial run remains stored separately so the compatibility failure is not hidden.
  AI_SEARCH_EVAL_FILE=ai-search-comparison-normalized.json node evaluation/ai-search/compare.mjs
  AI_SEARCH_EVAL_FILE=ai-search-comparison-normalized.json node evaluation/ai-search/summarize.mjs
  AI_SEARCH_EVAL_FILE=ai-search-comparison-normalized.json node evaluation/ai-search/audit.mjs

Quality and cost
Read every answer and quote. A passed validator/HTTP link is not proof of factual entailment.
audit.mjs also checks whether quotes appear in the previous extraction and whether official URLs resolve.
Gemini charges are estimated from all generation attempts' usage metadata and published standard prices.
They are not an account invoice. AI Search pricing changes on 2026-11-01; report that basis explicitly.
API search calls and questions are different counts; candidate fan-out can make several searches per turn.
Local DocsGPT versus a remote Cloudflare REST endpoint is a practical-path comparison, not matched hardware.
The sample is too small to establish a stable distribution or statistical improvement.

Private results
.private/ai-search-instance.json / ai-search-upload.json / ai-search-items-complete.json
.private/ai-search-comparison.json (initial)
.private/ai-search-comparison-normalized.json (format-compatible)
Matching -summary.json and -audit.json files contain measurements and synthetic evidence only.

Cleanup
Do not remove or modify unrelated instances. If the trial is discarded, delete only
motto-concierge-12-docs-eval after retaining the necessary artificial evaluation evidence.
