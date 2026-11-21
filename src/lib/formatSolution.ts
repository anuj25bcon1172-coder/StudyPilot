import { SolvedAssignmentSolution } from '../types';

export function formatSolvedAssignmentText(item: {
  assignmentName: string;
  subject: string;
  question: string;
  solution: SolvedAssignmentSolution;
}): string {
  const lines: string[] = [
    `${item.assignmentName} (${item.subject})`,
    '',
    `Question:`,
    item.question,
    '',
    `Step-by-Step Solution:`,
  ];

  item.solution.steps.forEach((step) => {
    lines.push(`Step ${step.stepNumber}: ${step.title}`);
    if (step.explanation) {
      lines.push(step.explanation);
    }
    if (step.formula) {
      lines.push(step.formula);
    }
    lines.push('');
  });

  if (item.solution.finalAnswer) {
    lines.push(`Final Answer: ${item.solution.finalAnswer}`);
  }

  return lines.join('\n').trim();
}
