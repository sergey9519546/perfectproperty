# Perfect Property product KPIs

## Decision supported

Determine whether the landing and workspace experience turns qualified interest into an evidence-backed underwriting action without degrading decision quality, privacy, or frontend performance. Review the funnel weekly and decision-quality guardrails monthly.

## Primary metrics

### Qualified Workflow Activation Rate

The percentage of eligible landing sessions that complete this ordered journey within 30 minutes of entering the workspace:

1. `landing_view`
2. `workspace_opened`
3. deliberate `market_selected`
4. at least five seconds of continuous `evidence_viewed`
5. server-confirmed `underwrite_succeeded` or `brief_export_succeeded`

The selection, evidence, and action must reference the same market. Formula: qualified sessions / landing sessions. Autoplay, video completion, CTA clicks, and timestamps assembled across different markets never qualify a session.

### Seven-day Repeat Workflow Rate

The percentage of newly activated anonymous browser identities that complete another server-confirmed workflow action on a later day within seven days. This is a browser-level retention proxy until workspace access requires authentication; it does not reconcile users across devices or cleared storage.

### Median Time to Underwriting Action

Median elapsed seconds from `workspace_opened` to the first server-confirmed workflow action. Sessions without a confirmed action are excluded and should be reviewed through the funnel counts rather than treated as zero-duration sessions.

## Drivers

- Landing-to-workspace rate: landing sessions with a subsequent workspace entry / landing sessions.
- Evidence-to-action rate: evidence sessions with a subsequent confirmed action / evidence sessions.
- Story exposure: continuous visibility of at least 35% of the motion showcase for five seconds. This is diagnostic only.

## Guardrails

- Decision quality: latest calibration slope/flag, PSI band, and risk-appetite status from `portfolio_metrics`.
- Experience quality: daily p75 LCP, p75 browser interaction latency, average CLS, and media-error sessions. Interaction latency is a browser-native diagnostic and is intentionally not labeled standards-compliant INP.
- Auditability: client code cannot submit success events. Successful underwrite and export events are emitted only by the transactional workflow-action function.

## Event contract

Every event has a UUID event ID, session and anonymous IDs, server-clamped occurrence time, route, device class, reduced-motion preference, optional experiment assignment, and a bounded property object. Event names and property sizes are allowlisted by the server. Database functions enforce idempotency and per-session rate limits.

Authenticated attribution is attached opportunistically to server-confirmed workflow actions. The Supabase client is loaded only when an action is submitted, so attribution does not increase the landing-page startup path. Anonymous browser identity remains the funnel denominator until access policy requires sign-in.

The client honors Do Not Track and Global Privacy Control for analytics. Required workflow actions still persist, but their analytics event is omitted when either signal is active. Raw events contain no IP address, full referrer URL, email address, or free-form user text.

Raw `product_events` are retained for 400 days and pruned weekly by a bounded database function. `workflow_actions` are not removed by that job because they are operational audit records; their legal retention policy should be reviewed separately before automated deletion is introduced.

## Targets

Collect 14–28 days of clean baseline data before setting absolute targets. Initial experiment thresholds are provisional:

- at least 15% relative improvement in Qualified Workflow Activation Rate;
- at least 10% relative reduction in median time to action;
- no material regression in seven-day repeat rate, decision quality, media reliability, or p75 experience metrics.

Do not declare a win from point estimates alone. Choose the sample-size and uncertainty rule before starting a controlled experiment.

## Sources of truth

- `product_events`: raw, server-validated journey and experience events.
- `workflow_actions`: authoritative underwrite and brief-export confirmations.
- `product_kpi_daily`: session funnel and time-to-action rollup.
- `product_kpi_weekly`: seven-day browser-identity activation cohorts.
- `product_experience_daily`: frontend performance and media guardrails.
- `portfolio_metrics`, `prediction_outcomes`, and `decision_audit`: underwriting quality and governance.
