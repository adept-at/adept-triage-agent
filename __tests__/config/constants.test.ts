import {
  AGENT_MODEL,
  AgentStage,
  GPT56_CANDIDATE_MODEL,
  GPT56_CANDIDATE_REASONING,
  OPENAI,
  REASONING_EFFORT,
  resolveAgentModel,
  resolveReasoningEffort,
  supportsReasoningEffort,
} from '../../src/config/constants';

const STAGES: AgentStage[] = [
  'classification',
  'analysis',
  'investigation',
  'fixGeneration',
  'review',
];

describe('supportsReasoningEffort', () => {
  it('keeps reasoning enabled for GPT-5.5 aliases, snapshots, and pro variants', () => {
    expect(supportsReasoningEffort('gpt-5.5')).toBe(true);
    expect(supportsReasoningEffort('gpt-5.5-pro')).toBe(true);
    expect(supportsReasoningEffort('gpt-5.5-2026-04-23')).toBe(true);
  });

  it('keeps reasoning enabled for GPT-5.6 aliases and snapshots', () => {
    expect(supportsReasoningEffort('gpt-5.6')).toBe(true);
    expect(supportsReasoningEffort('gpt-5.6-sol')).toBe(true);
    expect(supportsReasoningEffort('gpt-5.6-2026-07-01')).toBe(true);
  });

  it('disables reasoning for non-5.5/5.6 rollback models', () => {
    expect(supportsReasoningEffort('gpt-4.1')).toBe(false);
    expect(supportsReasoningEffort('gpt-4o')).toBe(false);
    expect(supportsReasoningEffort('custom-model')).toBe(false);
    expect(supportsReasoningEffort('')).toBe(false);
  });

  it('accepts the production model pin so the pin can never desync from the reasoning gate', () => {
    expect(supportsReasoningEffort(OPENAI.MODEL)).toBe(true);
  });
});

describe('model routing (resolveAgentModel / resolveReasoningEffort)', () => {
  const ORIGINAL_PROFILE = process.env.TRIAGE_MODEL_PROFILE;

  beforeEach(() => {
    delete process.env.TRIAGE_MODEL_PROFILE;
  });

  afterEach(() => {
    if (ORIGINAL_PROFILE === undefined) {
      delete process.env.TRIAGE_MODEL_PROFILE;
    } else {
      process.env.TRIAGE_MODEL_PROFILE = ORIGINAL_PROFILE;
    }
  });

  describe('resolveAgentModel', () => {
    it.each(STAGES)(
      'defaults to the AGENT_MODEL production pin for %s',
      (stage) => {
        expect(resolveAgentModel(stage)).toBe(AGENT_MODEL[stage]);
      }
    );

    it.each(STAGES)(
      'AGENT_MODEL pin equals OPENAI.MODEL (gpt-5.6-sol) for %s',
      (stage) => {
        expect(AGENT_MODEL[stage]).toBe(OPENAI.MODEL);
        expect(resolveAgentModel(stage)).toBe('gpt-5.6-sol');
      }
    );

    it.each(STAGES)('explicit override wins for %s', (stage) => {
      expect(resolveAgentModel(stage, 'gpt-4o')).toBe('gpt-4o');
    });

    it('trims the override', () => {
      expect(resolveAgentModel('analysis', '  gpt-4o  ')).toBe('gpt-4o');
    });

    it('ignores empty and whitespace-only overrides', () => {
      expect(resolveAgentModel('analysis', '')).toBe(AGENT_MODEL.analysis);
      expect(resolveAgentModel('analysis', '   ')).toBe(AGENT_MODEL.analysis);
    });

    it.each(STAGES)(
      'TRIAGE_MODEL_PROFILE=gpt56-candidate routes %s to GPT56_CANDIDATE_MODEL',
      (stage) => {
        process.env.TRIAGE_MODEL_PROFILE = 'gpt56-candidate';
        expect(resolveAgentModel(stage)).toBe(GPT56_CANDIDATE_MODEL[stage]);
      }
    );

    it('explicit override beats the gpt56-candidate profile', () => {
      process.env.TRIAGE_MODEL_PROFILE = 'gpt56-candidate';
      expect(resolveAgentModel('review', 'gpt-4o')).toBe('gpt-4o');
    });

    it('unrecognized profile values fall through to the production pin', () => {
      process.env.TRIAGE_MODEL_PROFILE = 'some-other-profile';
      expect(resolveAgentModel('classification')).toBe(
        AGENT_MODEL.classification
      );
    });
  });

  describe('resolveReasoningEffort', () => {
    it.each(STAGES)(
      'returns none for models without reasoning support (%s)',
      (stage) => {
        expect(resolveReasoningEffort(stage, 'gpt-4o')).toBe('none');
      }
    );

    it('returns none for unsupported models even under the gpt56-candidate profile', () => {
      process.env.TRIAGE_MODEL_PROFILE = 'gpt56-candidate';
      expect(resolveReasoningEffort('analysis', 'gpt-4o')).toBe('none');
    });

    it.each(STAGES)(
      'returns GPT56_CANDIDATE_REASONING under gpt56-candidate profile for %s',
      (stage) => {
        process.env.TRIAGE_MODEL_PROFILE = 'gpt56-candidate';
        expect(
          resolveReasoningEffort(stage, GPT56_CANDIDATE_MODEL[stage])
        ).toBe(GPT56_CANDIDATE_REASONING[stage]);
      }
    );

    it.each(STAGES)(
      'returns REASONING_EFFORT for the production pin by default (%s)',
      (stage) => {
        expect(resolveReasoningEffort(stage, OPENAI.MODEL)).toBe(
          REASONING_EFFORT[stage]
        );
      }
    );
  });
});
