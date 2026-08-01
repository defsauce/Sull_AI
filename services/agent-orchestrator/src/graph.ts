export const GRAPH_STEPS = ['planner', 'researcher', 'critic', 'executor'] as const;

export type GraphStepName = (typeof GRAPH_STEPS)[number];

export interface GraphStepResult {
  stepName: GraphStepName;
  status: 'completed' | 'failed';
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface GraphExecutionResult {
  steps: GraphStepResult[];
  output: Record<string, unknown>;
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}

function extractObjective(input: Record<string, unknown>): string {
  return (
    asString(input.objective) ||
    asString(input.query) ||
    asString(input.prompt) ||
    asString(input.task) ||
    'Complete the requested task using available context.'
  );
}

function extractContext(input: Record<string, unknown>): string[] {
  const contextValues: string[] = [];
  if (Array.isArray(input.context)) {
    for (const item of input.context) {
      if (typeof item === 'string') {
        contextValues.push(item);
      }
    }
  }
  if (typeof input.background === 'string') {
    contextValues.push(input.background);
  }
  if (typeof input.notes === 'string') {
    contextValues.push(input.notes);
  }
  return contextValues;
}

export function executeAgentGraph(input: Record<string, unknown>): GraphExecutionResult {
  const objective = extractObjective(input);
  const context = extractContext(input);
  const steps: GraphStepResult[] = [];

  const plannerOutput = {
    objective,
    subtasks: buildSubtasks(objective),
    constraints: buildConstraints(input),
  };
  steps.push({
    stepName: 'planner',
    status: 'completed',
    input: { objective, contextCount: context.length },
    output: plannerOutput,
  });

  const researcherOutput = {
    findings: buildFindings(objective, context, plannerOutput.subtasks),
    sources: context.length,
    confidence: context.length > 0 ? 0.85 : 0.65,
  };
  steps.push({
    stepName: 'researcher',
    status: 'completed',
    input: { objective, subtasks: plannerOutput.subtasks },
    output: researcherOutput,
  });

  const criticOutput = reviewPlan(plannerOutput, researcherOutput);
  steps.push({
    stepName: 'critic',
    status: 'completed',
    input: { planner: plannerOutput, research: researcherOutput },
    output: criticOutput,
  });

  const executorOutput = {
    answer: synthesizeAnswer(objective, researcherOutput.findings, criticOutput.approved),
    actions: criticOutput.approved ? plannerOutput.subtasks : ['revise-plan'],
    qualityScore: criticOutput.score,
  };
  steps.push({
    stepName: 'executor',
    status: 'completed',
    input: { objective, approved: criticOutput.approved },
    output: executorOutput,
  });

  return {
    steps,
    output: {
      objective,
      answer: executorOutput.answer,
      qualityScore: executorOutput.qualityScore,
      stepsCompleted: steps.length,
    },
  };
}

function buildSubtasks(objective: string): string[] {
  const words = objective.split(/\s+/).filter((word) => word.length > 3);
  const focus = words.slice(0, 3).join(' ') || objective;
  return [
    `Clarify requirements for ${focus}`,
    `Gather supporting evidence for ${focus}`,
    `Produce a structured response covering risks and next steps`,
  ];
}

function buildConstraints(input: Record<string, unknown>): string[] {
  const constraints = ['Stay within tenant policy', 'Prefer concise actionable output'];
  if (typeof input.deadline === 'string') {
    constraints.push(`Respect deadline ${input.deadline}`);
  }
  if (typeof input.audience === 'string') {
    constraints.push(`Tailor response for ${input.audience}`);
  }
  return constraints;
}

function buildFindings(objective: string, context: string[], subtasks: string[]): string[] {
  const findings = [`Primary objective: ${objective}`];
  for (const [index, item] of context.entries()) {
    findings.push(`Context ${index + 1}: ${item}`);
  }
  for (const subtask of subtasks) {
    findings.push(`Planned work item: ${subtask}`);
  }
  if (context.length === 0) {
    findings.push('No external context supplied; relying on objective decomposition.');
  }
  return findings;
}

function reviewPlan(
  plannerOutput: { subtasks: string[]; constraints: string[] },
  researcherOutput: { findings: string[]; confidence: number },
): { approved: boolean; score: number; feedback: string[] } {
  const feedback: string[] = [];
  if (plannerOutput.subtasks.length < 2) {
    feedback.push('Plan should include at least two subtasks.');
  }
  if (researcherOutput.findings.length < 2) {
    feedback.push('Research findings are thin; add more context.');
  }
  if (researcherOutput.confidence < 0.7) {
    feedback.push('Research confidence is low.');
  }

  const score = Math.min(
    1,
    0.5 + plannerOutput.subtasks.length * 0.1 + researcherOutput.confidence * 0.3,
  );
  return {
    approved: feedback.length === 0,
    score: Number(score.toFixed(2)),
    feedback,
  };
}

function synthesizeAnswer(objective: string, findings: string[], approved: boolean): string {
  if (!approved) {
    return `Draft response for "${objective}" requires revision. Address critic feedback before finalizing.`;
  }
  const highlights = findings.slice(0, 3).join(' ');
  return `Completed analysis for "${objective}". Key points: ${highlights}`;
}
