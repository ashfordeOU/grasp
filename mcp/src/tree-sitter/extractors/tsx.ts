// TSX = TypeScript + JSX. The TSX grammar adds JSX node types but function/class
// structure is identical to TypeScript — reuse the TypeScript extractor directly.
import { extractDefinitions, countCalls, countBranches } from './typescript';
export { extractDefinitions, countCalls, countBranches };
import { registerExtractor } from '../index';

registerExtractor('tsx', { extractDefinitions, countCalls, countBranches });
