-- ai_usage: resume tailoring is metered, so the ledger has to accept it.
-- The check mirrors the `Feature` union in supabase/functions/_shared/plans.ts;
-- 0009 added the tailor feature without widening it, so every tailor run failed
-- its `spendAllowance` insert with 23514 and refused before reaching the model.

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

alter table public.ai_usage
  add constraint ai_usage_feature_check
  check (feature in (
    'resume_analysis',
    'resume_rewrite',
    'chat',
    'relevance_check',
    'tailor'
  ));
