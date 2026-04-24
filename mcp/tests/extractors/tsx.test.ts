import TreeSitter from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { tsx: TSXGrammar } = require('tree-sitter-typescript');
import { extractDefinitions, countCalls } from '../../src/tree-sitter/extractors/tsx';

const GOLDEN = `
import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
}

export function Button({ label, onClick }: ButtonProps): JSX.Element {
  return <button onClick={onClick}>{label}</button>;
}

export const IconButton = ({ label, onClick }: ButtonProps): JSX.Element => (
  <button onClick={onClick}>
    <span>{label}</span>
  </button>
);

export class FormWidget extends React.Component<ButtonProps> {
  handleClick(): void {
    this.props.onClick();
  }
  render(): JSX.Element {
    return <div><Button label={this.props.label} onClick={this.handleClick.bind(this)} /></div>;
  }
}
`;

describe('TSX extractor', () => {
  let parser: TreeSitter;

  beforeAll(() => {
    parser = new TreeSitter();
    parser.setLanguage(TSXGrammar);
  });

  test('extracts exported function component', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Button.tsx');
      const btn = fns.find(f => f.name === 'Button');
      expect(btn).toBeDefined();
      expect(btn!.type).toBe('function');
      expect(btn!.isExported).toBe(true);
      expect(btn!.astBacked).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts exported arrow function component', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Button.tsx');
      const icon = fns.find(f => f.name === 'IconButton');
      expect(icon).toBeDefined();
      expect(icon!.type).toBe('function');
      expect(icon!.isExported).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts exported class component', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Button.tsx');
      const widget = fns.find(f => f.name === 'FormWidget');
      expect(widget).toBeDefined();
      expect(widget!.type).toBe('class');
      expect(widget!.isExported).toBe(true);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts interface', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Button.tsx');
      const iface = fns.find(f => f.name === 'ButtonProps');
      expect(iface).toBeDefined();
      expect(iface!.type).toBe('interface');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('extracts class methods', () => {
    const tree = parser.parse(GOLDEN);
    try {
      const fns = extractDefinitions(tree, GOLDEN, 'Button.tsx');
      const handleClick = fns.find(f => f.name === 'handleClick' && f.type === 'method');
      expect(handleClick).toBeDefined();
      expect(handleClick!.isClassMethod).toBe(true);
      expect(handleClick!.className).toBe('FormWidget');
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });

  test('countCalls counts JSX-embedded calls', () => {
    const src = `
function App() {
  handleSubmit();
  handleSubmit();
  render();
}
`;
    const tree = parser.parse(src);
    try {
      const result = countCalls(tree, new Set(['handleSubmit', 'render', 'unused']));
      expect(result['handleSubmit']).toBe(2);
      expect(result['render']).toBe(1);
      expect(result['unused']).toBe(0);
    } finally {
      if (typeof (tree as any).delete === 'function') (tree as any).delete();
    }
  });
});
