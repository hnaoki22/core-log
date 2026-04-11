-- ==========================================================================
-- CORE Log Feature Tables Migration
-- Creates all tables needed for the 28 new features (Tier S through Tier G)
-- ==========================================================================

-- Tier S: Rumination analysis results
CREATE TABLE IF NOT EXISTS rumination_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  participant_name TEXT NOT NULL,
  log_id UUID REFERENCES logs(id),
  date DATE NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  is_ruminating BOOLEAN NOT NULL DEFAULT false,
  pattern TEXT DEFAULT '',
  reframe TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier S: Weekly conceptualization / thesis
CREATE TABLE IF NOT EXISTS weekly_concepts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  participant_name TEXT NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  week_summary TEXT DEFAULT '',
  theses JSONB DEFAULT '[]'::jsonb,
  selected_thesis_index INTEGER DEFAULT -1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier S: Structured input (fact/observation/lesson)
CREATE TABLE IF NOT EXISTS structured_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  participant_name TEXT NOT NULL,
  log_id UUID REFERENCES logs(id),
  date DATE NOT NULL,
  fact TEXT DEFAULT '',
  observation TEXT DEFAULT '',
  lesson TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier A: 1on1 Briefings
CREATE TABLE IF NOT EXISTS briefings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  manager_id UUID NOT NULL REFERENCES managers(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  participant_name TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now(),
  summary TEXT DEFAULT '',
  energy_trend TEXT DEFAULT '',
  rumination_risk TEXT DEFAULT '',
  suggested_questions JSONB DEFAULT '[]'::jsonb,
  key_themes JSONB DEFAULT '[]'::jsonb
);

-- Tier A: Burnout scores
CREATE TABLE IF NOT EXISTS burnout_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  participant_name TEXT NOT NULL,
  date DATE NOT NULL,
  energy_avg REAL DEFAULT 0,
  entry_rate REAL DEFAULT 0,
  rumination_avg REAL DEFAULT 0,
  composite_score REAL DEFAULT 0,
  risk_level TEXT DEFAULT 'low',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier A: Psych safety analysis
CREATE TABLE IF NOT EXISTS psych_safety_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  manager_id UUID REFERENCES managers(id),
  manager_name TEXT DEFAULT '',
  period_start DATE,
  period_end DATE,
  score INTEGER DEFAULT 5,
  signals JSONB DEFAULT '[]'::jsonb,
  positives JSONB DEFAULT '[]'::jsonb,
  summary TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier A: Manager self-reflection
CREATE TABLE IF NOT EXISTS manager_reflections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  manager_id UUID NOT NULL REFERENCES managers(id),
  manager_name TEXT NOT NULL,
  date DATE NOT NULL,
  week_num INTEGER DEFAULT 0,
  reflection TEXT DEFAULT '',
  support_actions TEXT DEFAULT '',
  challenges TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier B: AAR (After Action Review)
CREATE TABLE IF NOT EXISTS aar_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  participant_name TEXT NOT NULL,
  project_name TEXT NOT NULL,
  date DATE NOT NULL,
  expected TEXT DEFAULT '',
  actual TEXT DEFAULT '',
  gap TEXT DEFAULT '',
  lessons TEXT DEFAULT '',
  next_actions TEXT DEFAULT '',
  is_shared BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier B: Knowledge library
CREATE TABLE IF NOT EXISTS knowledge_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  participant_id UUID REFERENCES participants(id),
  author_name TEXT DEFAULT '匿名',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT DEFAULT 'thesis',
  tags JSONB DEFAULT '[]'::jsonb,
  likes INTEGER DEFAULT 0,
  is_anonymous BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier B: Peer reflections
CREATE TABLE IF NOT EXISTS peer_reflections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  from_participant_id UUID NOT NULL REFERENCES participants(id),
  to_participant_id UUID NOT NULL REFERENCES participants(id),
  from_name TEXT NOT NULL,
  to_name TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  answered_at TIMESTAMPTZ
);

-- Tier C: Unlearn challenges
CREATE TABLE IF NOT EXISTS unlearn_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  participant_name TEXT NOT NULL,
  date DATE NOT NULL,
  month_year TEXT NOT NULL,
  situation TEXT DEFAULT '',
  strength_that_failed TEXT DEFAULT '',
  insight TEXT DEFAULT '',
  new_approach TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier C: Identity tracking
CREATE TABLE IF NOT EXISTS identity_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  participant_name TEXT NOT NULL,
  date DATE NOT NULL,
  quarter TEXT NOT NULL,
  past_self TEXT DEFAULT '',
  current_self TEXT DEFAULT '',
  biggest_change TEXT DEFAULT '',
  trigger_event TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier C: Outsight tasks
CREATE TABLE IF NOT EXISTS outsight_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  participant_name TEXT NOT NULL,
  week_start DATE NOT NULL,
  task_description TEXT NOT NULL,
  status TEXT DEFAULT 'assigned',
  reflection TEXT DEFAULT '',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier D: HERO assessments
CREATE TABLE IF NOT EXISTS hero_assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  participant_name TEXT NOT NULL,
  date DATE NOT NULL,
  month_year TEXT NOT NULL,
  hope_score INTEGER DEFAULT 0,
  efficacy_score INTEGER DEFAULT 0,
  resilience_score INTEGER DEFAULT 0,
  optimism_score INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,
  answers JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier D: Hope design work
CREATE TABLE IF NOT EXISTS hope_designs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  participant_name TEXT NOT NULL,
  date DATE NOT NULL,
  quarter TEXT NOT NULL,
  goal TEXT DEFAULT '',
  pathways JSONB DEFAULT '[]'::jsonb,
  obstacles JSONB DEFAULT '[]'::jsonb,
  agency_thoughts TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier E: Micro ritual metrics (input time tracking)
CREATE TABLE IF NOT EXISTS micro_ritual_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  participant_name TEXT NOT NULL,
  date DATE NOT NULL,
  input_type TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier F: Before/After assessments
CREATE TABLE IF NOT EXISTS before_after_assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  participant_name TEXT NOT NULL,
  assessment_type TEXT NOT NULL DEFAULT 'before',
  date DATE NOT NULL,
  answers JSONB DEFAULT '{}'::jsonb,
  total_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier F: Growth ROI metrics (aggregated)
CREATE TABLE IF NOT EXISTS growth_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  participant_id UUID REFERENCES participants(id),
  participant_name TEXT DEFAULT '',
  date DATE NOT NULL,
  reflection_minutes REAL DEFAULT 0,
  thesis_count INTEGER DEFAULT 0,
  behavior_change_count INTEGER DEFAULT 0,
  entry_rate REAL DEFAULT 0,
  energy_avg REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tier G: Consultant interventions
CREATE TABLE IF NOT EXISTS consult_interventions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  consultant_name TEXT NOT NULL,
  intervention_type TEXT NOT NULL,
  date DATE NOT NULL,
  participant_ids JSONB DEFAULT '[]'::jsonb,
  description TEXT DEFAULT '',
  duration_minutes INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_rumination_participant ON rumination_analyses(tenant_id, participant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_concepts_participant ON weekly_concepts(tenant_id, participant_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_structured_participant ON structured_entries(tenant_id, participant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_briefings_manager ON briefings(tenant_id, manager_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_burnout_participant ON burnout_scores(tenant_id, participant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_manager_reflections ON manager_reflections(tenant_id, manager_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_aar_participant ON aar_entries(tenant_id, participant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_tenant ON knowledge_items(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_peer_to ON peer_reflections(tenant_id, to_participant_id, status);
CREATE INDEX IF NOT EXISTS idx_unlearn_participant ON unlearn_entries(tenant_id, participant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_identity_participant ON identity_entries(tenant_id, participant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_outsight_participant ON outsight_tasks(tenant_id, participant_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_hero_participant ON hero_assessments(tenant_id, participant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_hope_participant ON hope_designs(tenant_id, participant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ritual_participant ON micro_ritual_metrics(tenant_id, participant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_before_after ON before_after_assessments(tenant_id, participant_id, assessment_type);
CREATE INDEX IF NOT EXISTS idx_growth_participant ON growth_metrics(tenant_id, participant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_consult_tenant ON consult_interventions(tenant_id, date DESC);
