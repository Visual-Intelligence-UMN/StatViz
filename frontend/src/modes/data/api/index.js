/**
 * Data Mode — API / Service Layer
 *
 * All external calls originating from Data Mode live here.
 * Completely isolated from Q&A Mode's services (src/services/).
 *
 * Planned for Phase 4+:
 *   datasetService    — load, parse, and validate uploaded datasets
 *   llmService        — LLM calls scoped to data analysis prompts
 *   statsService      — statistical test execution (t-test, ANOVA, etc.)
 *   insightService    — summarise analysis results via LLM
 */
