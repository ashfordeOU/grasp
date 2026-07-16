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
import './extractors/javascript';
import './extractors/typescript';
import './extractors/tsx';
import './extractors/swift';
import './extractors/php';
import './extractors/scala';
import './extractors/zig';
import './extractors/bash';
import './extractors/elixir';
import './extractors/julia';

export { getExtractor, detectLang, preloadGrammars, getParser, isAstBacked } from './index';
