// Bundled entry point for parser.js — imports all extractors (triggers self-registration) and re-exports APIs
import './extractors/python';
import './extractors/go';
import './extractors/java';
import './extractors/kotlin';
import './extractors/rust';
import './extractors/c';
import './extractors/cpp';
import './extractors/csharp';
import './extractors/ruby';

export { getExtractor, detectLang, preloadGrammars, getParser, isAstBacked } from './index';
