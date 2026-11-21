import React from 'react';
import katex from 'katex';

interface MathFormulaProps {
  formula: string;
  displayMode?: boolean;
  className?: string;
}

export const MathFormula: React.FC<MathFormulaProps> = ({
  formula,
  displayMode = false,
  className = '',
}) => {
  if (!formula || !formula.trim()) return null;

  try {
    const html = katex.renderToString(formula.trim(), {
      displayMode,
      throwOnError: false,
      strict: false,
    });
    return (
      <span
        className={className}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <code className={`font-mono text-sm ${className}`}>{formula}</code>;
  }
};

interface RichMathTextProps {
  text: string;
  className?: string;
}

/**
 * Renders prose containing inline ($...$) and block ($$...$$) LaTeX equations via KaTeX
 * while keeping all surrounding text safe as standard React text nodes.
 */
export const RichMathText: React.FC<RichMathTextProps> = ({ text, className = '' }) => {
  if (!text) return null;

  const segments: Array<{ type: 'text' | 'inline' | 'block'; value: string }> = [];
  const regex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('$$') && token.endsWith('$$')) {
      segments.push({ type: 'block', value: token.slice(2, -2) });
    } else {
      segments.push({ type: 'inline', value: token.slice(1, -1) });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return (
    <span className={className}>
      {segments.map((seg, idx) => {
        if (seg.type === 'text') {
          return <React.Fragment key={idx}>{seg.value}</React.Fragment>;
        }
        return (
          <MathFormula
            key={idx}
            formula={seg.value}
            displayMode={seg.type === 'block'}
          />
        );
      })}
    </span>
  );
};
