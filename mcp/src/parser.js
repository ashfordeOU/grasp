'use strict';

// In Node.js (MCP server / CLI) context: load acorn from npm so the
// AST-based JS/TS extractor works without browser globals.
if(typeof acorn==='undefined'&&typeof require==='function'){
    try{var acorn=require('acorn');}catch(e){}
}

// Tree-sitter bundle — available in dist/ after build; null = fallback to regex
var _tsBundle = null;
if (typeof require === 'function') {
    try { _tsBundle = require('./tree-sitter/bundle'); } catch(e) {}
}

var THRESHOLDS={
    complexityCritical:30,      // Cyclomatic complexity: critical level
    complexityHigh:20,          // Cyclomatic complexity: high level
    complexityMedium:10,        // Cyclomatic complexity: medium level
    duplicateMinLength:80,      // Min code block length (chars) to check for duplication
    duplicateSimilarity:0.7,    // Min similarity ratio to flag as duplicate (0–1)
    fetchConcurrency:20,        // Max parallel GitHub API calls (when rate limit allows)
    healthPassScore:70,         // CI/CD pass threshold (0–100)
    lcsMaxCells:1000000,        // Max DP cells in LCS; proportionally sampled above this
    maxCouplingIn:30,           // Fan-in threshold: files imported by this many+ are "highly coupled"
    maxFunctionsPerFile:50,     // God-file threshold: files with this many+ functions are flagged
    maxSnapshotsStored:10,      // Max snapshots kept per repo in localStorage
};

const Parser={
    // tree-sitter Python parser (real AST parser, loaded async via WASM)
    _tsParser:null,        // null=uninitialised, false=failed/timeout, object=ready
    _tsInitPromise:null,
    _tsAvailable:null,     // tri-state: null=unknown, true=ok, false=unavailable
    initTreeSitter: async function() { return null; },
    preloadGrammars: async function(filePaths) {
        if (!_tsBundle) return;
        try { await _tsBundle.preloadGrammars(filePaths); } catch(e) {}
    },
    codeExts:['.js','.jsx','.ts','.tsx','.mjs','.cjs','.py','.pyw','.pyi','.java','.go','.rb','.php','.vue','.svelte','.rs','.c','.cpp','.cc','.h','.hpp','.cs','.swift','.kt','.kts','.scala','.clj','.ex','.exs','.erl','.hs','.lua','.r','.R','.jl','.dart','.elm','.fs','.fsx','.ml','.pl','.pm','.sh','.bash','.zsh','.fish','.ps1','.psm1','.groovy','.gradle','.vba','.bas','.cls','.xlsm','.xlam','.xlsb','.xla','.xlw','.zig','.v','.nim','.cr','.ipynb','.adb','.ads'],
    textExts:['.md','.txt','.json','.yaml','.yml','.toml','.xml','.html','.htm','.css','.scss','.sass','.less','.svg','.graphql','.gql','.sql','.prisma','.proto','.tf','.tfvars','.dockerfile','.env','.env.example','.gitignore','.eslintrc','.prettierrc','.babelrc','.editorconfig','.ini','.cfg','.conf','.properties','.lock','.csv','.rst','.tex','.makefile','.cmake','.rake','.vba','.bas','.cls','.xlsm','.xlam','.xlsb','.xla','.xlw'],
    binExts:['.png','.jpg','.jpeg','.gif','.ico','.webp','.bmp','.svg','.woff','.woff2','.ttf','.eot','.otf','.pdf','.zip','.tar','.gz','.rar','.7z','.exe','.dll','.so','.dylib','.bin','.dat','.db','.sqlite','.mp3','.mp4','.wav','.avi','.mov','.webm'],
    isCode:function(n){return Parser.codeExts.some(function(e){return n.toLowerCase().endsWith(e);});},
    isText:function(n){return Parser.textExts.some(function(e){return n.toLowerCase().endsWith(e);});},
    isBinary:function(n){return Parser.binExts.some(function(e){return n.toLowerCase().endsWith(e);});},
    isIncluded:function(n){return !Parser.isBinary(n);},
    isVBA:function(n){return ['.vba','.bas','.cls','.xlsm','.xlam','.xlsb','.xla','.xlw'].some(function(e){return n.toLowerCase().endsWith(e);});},
    isHTML:function(n){return ['.html','.htm','.xhtml'].some(function(e){return n.toLowerCase().endsWith(e);});},
    isCSS:function(n){return ['.css','.scss','.sass','.less'].some(function(e){return n.toLowerCase().endsWith(e);});},
    isJSON:function(n){return ['.json'].some(function(e){return n.toLowerCase().endsWith(e);});},
    parseNotebook:function(content){
        // Parse Jupyter notebook JSON → extract code cells as pseudo-file content + reproducibility issues
        try{
            var nb=JSON.parse(content);
            var cells=nb.cells||[];
            var codeCells=cells.filter(function(c){return c.cell_type==='code';});
            var lines=[];
            var issues=[];
            var hasRandom=false,hasRandomSeed=false,hasAbsPath=false,hasPipInstall=false,hasPercentRun=false;
            codeCells.forEach(function(cell,i){
                var src=Array.isArray(cell.source)?cell.source.join(''):String(cell.source||'');
                var cellName='cell_'+(i+1);
                // Use first comment line as cell name
                var m=src.match(/^#\s*(.+)$/m);if(m)cellName=m[1].trim().replace(/[^a-zA-Z0-9_]/g,'_').substring(0,40)||cellName;
                lines.push('# Cell '+String(i+1)+': '+cellName);
                lines.push(src);
                // Reproducibility checks
                if(src.match(/\brandom\b\./))hasRandom=true;
                if(src.match(/random\.seed\s*\(|np\.random\.seed\s*\(|torch\.manual_seed\s*\(/))hasRandomSeed=true;
                if(src.match(/["'](\/[Uu]sers\/|C:\\|\/home\/)/))hasAbsPath=true;
                if(src.match(/!pip install|!pip3 install|%pip install/i))hasPipInstall=true;
                if(src.match(/%run\s+/))hasPercentRun=true;
            });
            if(hasRandom&&!hasRandomSeed)issues.push('missing random seed');
            if(hasAbsPath)issues.push('non-portable absolute path');
            if(hasPipInstall)issues.push('runtime pip install');
            if(hasPercentRun)issues.push('%run magic (external dependency)');
            return{content:lines.join('\n'),issues:issues,codeCellCount:codeCells.length};
        }catch(e){return null;}
    },
    detectLayer:function(p){
        var l=p.toLowerCase();
        if(l.endsWith('.ipynb'))return'notebook';
        // Test files
        if(l.includes('/test')||l.match(/test_\w+\.py$/)||l.match(/\w+_test\.py$/)||l.includes('conftest'))return'test';
        // UI/View layer
        if(l.includes('/ui/')||l.includes('/views/')||l.includes('/pages/')||l.includes('/templates/')||l.includes('/static/'))return'ui';
        if(l.includes('/component'))return'components';
        // Service/API layer
        if(l.includes('/service')||l.includes('/api/')||l.includes('/controller')||l.includes('/endpoint')||l.includes('/router'))return'services';
        // Python middleware/handler layer
        if(l.includes('/middleware')||l.includes('/handler')||l.includes('/signal'))return'services';
        // Utility/Helper layer
        if(l.includes('/util')||l.includes('/helper')||l.includes('/lib/')||l.includes('/common/'))return'utils';
        // Data/Model layer
        if(l.includes('/data')||l.includes('/model')||l.includes('/store')||l.includes('/schema')||l.includes('/serializer'))return'data';
        // Python-specific data layers
        if(l.includes('/migration'))return'data';
        if(l.includes('/fixtures/'))return'data';
        // Task/Worker layer
        if(l.includes('/task')||l.includes('/worker')||l.includes('/celery')||l.includes('/job'))return'services';
        // Config layer
        if(l.includes('/config')||l.includes('/settings')||l.match(/settings\.py$/))return'config';
        // VBA-specific layer detection
        if(l.includes('/modules/')||l.includes('/bas/'))return'modules';
        if(l.includes('/forms/')||l.includes('/userforms/'))return'ui';
        if(l.includes('/classes/'))return'data';
        if(l.includes('/standard/'))return'utils';
        return'utils';
    },
    detectPatterns:function(files){
        var patterns=[];
        var singletons=files.filter(function(f){return f.content&&(f.content.includes('getInstance')||f.content.match(/let\s+instance\s*=/)||f.content.match(/private\s+static\s+instance/));});
        if(singletons.length)patterns.push({name:'Singleton',icon:'🔒',desc:'Ensures a class has only one instance. Common for configuration, logging, or connection pools.',severity:'info',files:singletons.map(function(f){return{name:f.name,path:f.path};}),metrics:{instances:singletons.length}});
        var factories=files.filter(function(f){return f.content&&(f.name.toLowerCase().includes('factory')||f.content.match(/create[A-Z]\w*\s*\(/)||f.content.includes('return new'));});
        if(factories.length)patterns.push({name:'Factory',icon:'🏭',desc:'Creates objects without specifying exact class. Enables loose coupling and extensibility.',severity:'info',files:factories.map(function(f){return{name:f.name,path:f.path};}),metrics:{factories:factories.length}});
        var observers=files.filter(function(f){return f.content&&(f.content.includes('subscribe')||f.content.includes('addEventListener')||f.content.includes('.on(')||f.content.includes('emit('));});
        if(observers.length)patterns.push({name:'Observer/Event',icon:'👁️',desc:'Defines a subscription mechanism for event-driven architecture. Great for decoupling.',severity:'info',files:observers.map(function(f){return{name:f.name,path:f.path};}),metrics:{emitters:observers.length}});
        var strategies=files.filter(function(f){return f.content&&(f.name.toLowerCase().includes('strategy')||f.content.match(/class\s+\w+Strategy\b/)||f.content.match(/setStrategy\s*\(/)||f.content.match(/\bstrategy\s*[=:]\s*\w+/i));});
        if(strategies.length)patterns.push({name:'Strategy',icon:'♟️',desc:'Defines a family of interchangeable algorithms. Enables switching behaviour at runtime without changing the client.',severity:'info',files:strategies.map(function(f){return{name:f.name,path:f.path};}),metrics:{strategies:strategies.length}});
        var commands=files.filter(function(f){return f.content&&(f.name.toLowerCase().includes('command')||f.content.match(/class\s+\w+Command\b/)||f.content.match(/\bexecute\s*\(\s*\)[\s\S]{0,60}\bundo\s*\(\s*\)/));});
        if(commands.length)patterns.push({name:'Command',icon:'📨',desc:'Encapsulates a request as an object with execute/undo. Enables queuing, logging, and undo history.',severity:'info',files:commands.map(function(f){return{name:f.name,path:f.path};}),metrics:{commands:commands.length}});
        var states=files.filter(function(f){return f.content&&(f.name.toLowerCase().includes('state')||f.content.match(/class\s+\w+State\b/)||f.content.match(/setState\s*\(/)||f.content.match(/\btransitionTo\s*\(/)||f.content.match(/\bfsm\b|\bstateMachine\b/i));});
        if(states.length)patterns.push({name:'State Machine',icon:'🔀',desc:'Manages object behaviour based on internal state. Common in UI flows, game logic, and protocol handling.',severity:'info',files:states.map(function(f){return{name:f.name,path:f.path};}),metrics:{states:states.length}});
        var hooks=files.filter(function(f){return f.content&&f.content.match(/export\s+(?:const|function)\s+use[A-Z]/);});
        if(hooks.length)patterns.push({name:'Custom Hooks',icon:'🪝',desc:'React hooks for reusable stateful logic. Promotes code reuse and separation of concerns.',severity:'info',files:hooks.map(function(f){return{name:f.name,path:f.path};}),metrics:{hooks:hooks.length}});
        var hocs=files.filter(function(f){return f.content&&(f.content.match(/with[A-Z]\w*\s*=\s*\(/)||f.content.match(/export\s+default\s+connect/));});
        if(hocs.length)patterns.push({name:'Higher-Order Component',icon:'🎁',desc:'Functions that take a component and return an enhanced component.',severity:'info',files:hocs.map(function(f){return{name:f.name,path:f.path};}),metrics:{hocs:hocs.length}});
        var providers=files.filter(function(f){return f.content&&(f.content.includes('createContext')||f.content.includes('Provider')||f.content.includes('useContext'));});
        if(providers.length)patterns.push({name:'Context Provider',icon:'🌐',desc:'React Context for global state. Alternative to prop drilling.',severity:'info',files:providers.map(function(f){return{name:f.name,path:f.path};}),metrics:{contexts:providers.length}});
        // VBA-specific patterns
        var vbaUserForms=files.filter(function(f){return f.content&&(f.content.match(/Attribute\s+VB_Name\s*=\s*["']UserForm/i)||f.name.match(/UserForm/i));});
        if(vbaUserForms.length)patterns.push({name:'UserForms',icon:'🖼️',desc:'VBA UserForms for UI components. Common in Excel/Access automation.',severity:'info',files:vbaUserForms.map(function(f){return{name:f.name,path:f.path};}),metrics:{forms:vbaUserForms.length}});
        var vbaModules=files.filter(function(f){return f.content&&(f.content.match(/Attribute\s+VB_Name\s*=\s*["']Module/i)||f.name.match(/Module/i));});
        if(vbaModules.length)patterns.push({name:'Modules',icon:'📦',desc:'VBA Modules for reusable code and business logic.',severity:'info',files:vbaModules.map(function(f){return{name:f.name,path:f.path};}),metrics:{modules:vbaModules.length}});
        var vbaClasses=files.filter(function(f){return f.content&&(f.content.match(/Attribute\s+VB_Name\s*=\s*["']Class/i)||f.name.match(/Class/i));});
        if(vbaClasses.length)patterns.push({name:'Class Modules',icon:'🏛️',desc:'VBA Class Modules for object-oriented programming patterns.',severity:'info',files:vbaClasses.map(function(f){return{name:f.name,path:f.path};}),metrics:{classes:vbaClasses.length}});
        // Python-specific patterns
        var decoratorFiles=files.filter(function(f){return f.content&&f.name.endsWith('.py')&&f.content.match(/@\w+\s*(?:\(.*\))?\s*\n\s*(?:def|class)/);});
        var pyDecorators=decoratorFiles.filter(function(f){return f.content.match(/@(?:app\.route|router\.|blueprint\.|get|post|put|delete|patch)\s*\(/);});
        if(pyDecorators.length)patterns.push({name:'Route Decorators',icon:'🛤️',desc:'Flask/FastAPI/Django route decorators for URL routing. Common in Python web frameworks.',severity:'info',files:pyDecorators.map(function(f){return{name:f.name,path:f.path};}),metrics:{routes:pyDecorators.length}});
        var dataclasses=files.filter(function(f){return f.content&&f.name.endsWith('.py')&&f.content.match(/@dataclass/);});
        if(dataclasses.length)patterns.push({name:'Dataclasses',icon:'📋',desc:'Python dataclasses for structured data. Reduces boilerplate for data-holding classes.',severity:'info',files:dataclasses.map(function(f){return{name:f.name,path:f.path};}),metrics:{dataclasses:dataclasses.length}});
        var abcFiles=files.filter(function(f){return f.content&&f.name.endsWith('.py')&&(f.content.match(/\bABC\b/)||f.content.match(/@abstractmethod/)||f.content.match(/ABCMeta/));});
        if(abcFiles.length)patterns.push({name:'Abstract Base Classes',icon:'🏗️',desc:'Python ABCs enforce interface contracts. Ensures subclasses implement required methods.',severity:'info',files:abcFiles.map(function(f){return{name:f.name,path:f.path};}),metrics:{abcs:abcFiles.length}});
        var ctxManagers=files.filter(function(f){return f.content&&f.name.endsWith('.py')&&(f.content.match(/@contextmanager/)||f.content.match(/def\s+__enter__/));});
        if(ctxManagers.length)patterns.push({name:'Context Managers',icon:'🔄',desc:'Python context managers for resource management (with statement). Ensures proper cleanup.',severity:'info',files:ctxManagers.map(function(f){return{name:f.name,path:f.path};}),metrics:{managers:ctxManagers.length}});
        var pyMixins=files.filter(function(f){return f.content&&f.name.endsWith('.py')&&f.content.match(/class\s+\w*Mixin\w*\s*[\(:]?/);});
        if(pyMixins.length)patterns.push({name:'Mixins',icon:'🧩',desc:'Python mixins for reusable behavior through multiple inheritance.',severity:'info',files:pyMixins.map(function(f){return{name:f.name,path:f.path};}),metrics:{mixins:pyMixins.length}});
        var pySignals=files.filter(function(f){return f.content&&f.name.endsWith('.py')&&(f.content.match(/Signal\s*\(/)||f.content.match(/@receiver\s*\(/)||f.content.match(/\.connect\s*\(/));});
        if(pySignals.length)patterns.push({name:'Django Signals',icon:'📡',desc:'Django signals for decoupled event-driven communication between components.',severity:'info',files:pySignals.map(function(f){return{name:f.name,path:f.path};}),metrics:{signals:pySignals.length}});
        var pyMiddleware=files.filter(function(f){return f.content&&f.name.endsWith('.py')&&(f.content.match(/class\s+\w*Middleware/)||f.content.match(/def\s+middleware\s*\(/)||f.name.toLowerCase().includes('middleware'));});
        if(pyMiddleware.length)patterns.push({name:'Middleware',icon:'🔗',desc:'Request/response middleware for cross-cutting concerns (auth, logging, CORS).',severity:'info',files:pyMiddleware.map(function(f){return{name:f.name,path:f.path};}),metrics:{middleware:pyMiddleware.length}});
        var godFiles=files.filter(function(f){return f.isCode!==false&&f.functions&&f.functions.length>THRESHOLDS.maxFunctionsPerFile;});
        if(godFiles.length)patterns.push({name:'God Object',icon:'⚠️',desc:'Files with too many responsibilities ('+THRESHOLDS.maxFunctionsPerFile+'+ functions). Consider splitting into smaller modules.',severity:'warning',isAnti:true,files:godFiles.map(function(f){return{name:f.name,path:f.path,fns:f.functions.length};}),metrics:{files:godFiles.length,avgFns:Math.round(godFiles.reduce(function(s,f){return s+f.functions.length;},0)/godFiles.length)}});
        var longFiles=files.filter(function(f){return f.isCode!==false&&f.lines&&f.lines>500;});
        if(longFiles.length)patterns.push({name:'Long File',icon:'📜',desc:'Files over 500 lines are harder to maintain. Consider breaking into smaller modules.',severity:'warning',isAnti:true,files:longFiles.map(function(f){return{name:f.name,path:f.path,lines:f.lines};}),metrics:{files:longFiles.length,avgLines:Math.round(longFiles.reduce(function(s,f){return s+f.lines;},0)/longFiles.length)}});
        // VBA-specific anti-patterns
        var vbaGodFiles=files.filter(function(f){return f.isCode!==false&&f.functions&&f.functions.length>20;});
        if(vbaGodFiles.length)patterns.push({name:'VBA God Module',icon:'⚠️',desc:'VBA modules with 20+ procedures. Consider splitting into smaller modules.',severity:'warning',isAnti:true,files:vbaGodFiles.map(function(f){return{name:f.name,path:f.path,fns:f.functions.length,lines:f.lines};}),metrics:{files:vbaGodFiles.length,avgFns:Math.round(vbaGodFiles.reduce(function(s,f){return s+f.functions.length;},0)/vbaGodFiles.length)}});
        return patterns;
    },
    /**
     * Detect duplicate code by comparing function fingerprints and LCS similarity across files.
     * @param {Array<{path:string, content:string, functions:Array}>} files
     * @param {Array<{name:string, file:string, code:string}>} allFns
     * @returns {Array<{name:string, type:string, files:Array, suggestion:string}>}
     */
    detectDuplicates:function(files,allFns){
        var duplicates=[];

        // Common function names that are expected to be duplicated across files
        // These are idiomatic patterns, not DRY violations
        var commonNames=new Set([
            // React lifecycle and handlers
            'render','componentDidMount','componentWillUnmount','componentDidUpdate',
            'shouldComponentUpdate','getDerivedStateFromProps','getSnapshotBeforeUpdate',
            'handleClick','handleChange','handleSubmit','handleInput','handleKeyDown',
            'handleKeyUp','handleKeyPress','handleBlur','handleFocus','handleScroll',
            'handleMouseEnter','handleMouseLeave','handleDrag','handleDrop',
            'onClick','onChange','onSubmit','onBlur','onFocus','onKeyDown',
            // Common utility names
            'init','setup','cleanup','destroy','reset','clear','update','refresh',
            'validate','parse','format','transform','convert','process','execute',
            'get','set','fetch','load','save','create','delete','remove','add',
            'find','filter','map','reduce','sort','merge','clone','copy',
            // Test patterns
            'beforeEach','afterEach','beforeAll','afterAll','describe','it','test',
            'setUp','tearDown','mock',
            // Common class methods
            'toString','valueOf','equals','hashCode','compare','clone',
            'serialize','deserialize','toJSON','fromJSON',
            // Express/API patterns
            'index','show','store','update','destroy','create','edit',
            // Python common patterns
            '__init__','__str__','__repr__','__len__','__eq__','__hash__','__enter__','__exit__',
            '__getattr__','__setattr__','__delattr__','__getitem__','__setitem__','__contains__',
            '__iter__','__next__','__call__','__bool__','__lt__','__gt__','__le__','__ge__',
            'upgrade','downgrade','setUp','tearDown','setUpClass','tearDownClass',
            'main','create_app','configure','register','on_startup','on_shutdown','lifespan',
            // Vue lifecycle
            'mounted','created','updated','destroyed','beforeCreate','beforeMount',
            // Angular lifecycle
            'ngOnInit','ngOnDestroy','ngOnChanges','ngAfterViewInit',
            // Svelte
            'onMount','onDestroy'
        ]);

        // Group functions by name (excluding common names)
        var fnByName={};
        allFns.forEach(function(fn){
            // Skip common/idiomatic names
            if(commonNames.has(fn.name))return;
            // Skip very short names (likely false positives)
            if(fn.name.length<3)return;
            // Skip class methods (same method name in different classes is normal)
            if(fn.isClassMethod)return;
            // Skip Python class-scoped names (ClassName.method)
            if(fn.name.includes('.'))return;
            // Skip decorated functions (framework handlers have similar structures by design)
            if(fn.decorators&&fn.decorators.length>0)return;

            if(!fnByName[fn.name])fnByName[fn.name]=[];
            fnByName[fn.name].push(fn);
        });

        // Find duplicate names across different files - only report if suspicious
        Object.entries(fnByName).forEach(function(entry){
            var name=entry[0],fns=entry[1];
            var uniqueFiles=[...new Set(fns.map(function(f){return f.file;}))];

            // Only flag if in 3+ files (2 files might be intentional)
            if(uniqueFiles.length>=3){
                // Check if the code is actually similar (not just same name)
                var codeSamples=fns.filter(function(f){return f.code&&f.code.length>30;});
                if(codeSamples.length>=2){
                    // Compare first two code samples for similarity
                    var sim=Parser.codeSimilarity(codeSamples[0].code,codeSamples[1].code);
                    if(sim>THRESHOLDS.duplicateSimilarity){  // similarity threshold - likely a real duplicate
                        duplicates.push({
                            type:'name',
                            name:name,
                            count:uniqueFiles.length,
                            files:fns.map(function(f){return{file:f.file,line:f.line};}),
                            similarity:Math.round(sim*100),
                            suggestion:'Function "'+name+'" appears in '+uniqueFiles.length+' files with '+Math.round(sim*100)+'% similarity - consider consolidating'
                        });
                    }
                }
            }
        });

        // Find similar code blocks (improved algorithm)
        // Use structural hash that captures the essence of the code
        var codeGroups={};
        allFns.forEach(function(fn){
            if(!fn.code||fn.code.length<80)return;  // Skip very short functions

            // Create a structural fingerprint
            var fingerprint=Parser.codeFingerprint(fn.code);
            if(!fingerprint)return;

            if(!codeGroups[fingerprint])codeGroups[fingerprint]=[];
            codeGroups[fingerprint].push(fn);
        });

        Object.values(codeGroups).forEach(function(fns){
            if(fns.length>1){
                var uniqueFiles=[...new Set(fns.map(function(f){return f.file;}))];
                // Must be in different files to be a real duplication issue
                if(uniqueFiles.length>1){
                    // Verify with actual similarity check
                    var sim=Parser.codeSimilarity(fns[0].code,fns[1].code);
                    if(sim>THRESHOLDS.duplicateSimilarity){  // similarity threshold
                        duplicates.push({
                            type:'code',
                            name:fns.map(function(f){return f.name;}).join(', '),
                            count:fns.length,
                            files:fns.map(function(f){return{file:f.file,name:f.name,line:f.line};}),
                            similarity:Math.round(sim*100),
                            suggestion:'Similar code blocks ('+Math.round(sim*100)+'% match) - consider extracting to a shared utility'
                        });
                    }
                }
            }
        });

        return duplicates;
    },

    // Calculate code similarity using normalized comparison (0-1 scale)
    /**
     * Compute normalized similarity between two code strings using LCS (0 = no match, 1 = identical).
     * @param {string} code1
     * @param {string} code2
     * @returns {number}
     */
    codeSimilarity:function(code1,code2){
        if(!code1||!code2)return 0;

        // Normalize both code blocks
        function normalize(code){
            return code
                .replace(/\/\/.*$/gm,'')           // Remove JS single-line comments
                .replace(/#.*$/gm,'')              // Remove Python/Ruby comments
                .replace(/\/\*[\s\S]*?\*\//g,'')   // Remove multi-line comments
                .replace(/"""[\s\S]*?"""/g,'S')    // Remove Python docstrings (triple double)
                .replace(/'''[\s\S]*?'''/g,'S')    // Remove Python docstrings (triple single)
                .replace(/['"`][^'"`]*['"`]/g,'S') // Normalize strings
                .replace(/\b\d+\.?\d*\b/g,'N')     // Normalize numbers
                .replace(/\s+/g,' ')               // Normalize whitespace
                .trim();
        }

        var n1=normalize(code1);
        var n2=normalize(code2);

        if(n1===n2)return 1;
        if(n1.length===0||n2.length===0)return 0;

        // Use longest common subsequence ratio
        var lcs=Parser.lcsLength(n1,n2);
        var maxLen=Math.max(n1.length,n2.length);
        return lcs/maxLen;
    },

    /**
     * Longest Common Subsequence (LCS) length.
     * Algorithm: standard O(n·m) DP with proportional sampling when n·m > THRESHOLDS.lcsMaxCells
     * to prevent UI freeze on large inputs.
     * @param {string} s1
     * @param {string} s2
     * @returns {number} LCS length
     */
    lcsLength:function(s1,s2){
        if(s1.length*s2.length>THRESHOLDS.lcsMaxCells){
            // Sample both strings proportionally so cell count stays ≤1M
            var ratio=Math.sqrt(1000000/(s1.length*s2.length));
            var step=Math.ceil(1/ratio);
            s1=s1.split('').filter(function(_,i){return i%step===0;}).join('');
            s2=s2.split('').filter(function(_,i){return i%step===0;}).join('');
        }
        var m=s1.length,n=s2.length;
        var prev=new Array(n+1).fill(0);
        var curr=new Array(n+1).fill(0);
        for(var i=1;i<=m;i++){
            for(var j=1;j<=n;j++){
                if(s1[i-1]===s2[j-1]){curr[j]=prev[j-1]+1;}
                else{curr[j]=Math.max(prev[j],curr[j-1]);}
            }
            var tmp=prev;prev=curr;curr=tmp;
            curr.fill(0);
        }
        return prev[n];
    },

    // Create a structural fingerprint for code (for grouping similar code)
    /**
     * Create a structural fingerprint of a code snippet for fast duplicate grouping.
     * Strips identifiers/literals, keeping only structural tokens (keywords, operators, punctuation).
     * @param {string} code
     * @returns {string|null} fingerprint string, or null if code is too short
     */
    codeFingerprint:function(code){
        if(!code||code.length<50)return null;

        // Extract structural elements
        var structure=code
            .replace(/\/\/.*$/gm,'')           // Remove comments
            .replace(/\/\*[\s\S]*?\*\//g,'')
            .replace(/['"`][^'"`]*['"`]/g,'')  // Remove string contents
            .replace(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g,'I')  // All identifiers -> I
            .replace(/\b\d+\.?\d*\b/g,'N')     // All numbers -> N
            .replace(/\s+/g,'');               // Remove whitespace

        // Take a hash-like fingerprint based on structure length and key patterns
        var patterns={
            loops:(structure.match(/for|while/g)||[]).length,
            conditions:(structure.match(/if|\?/g)||[]).length,
            calls:(structure.match(/I\(/g)||[]).length,
            returns:(structure.match(/return/g)||[]).length,
            len:Math.floor(structure.length/50)*50  // Bucket by length
        };

        // Create fingerprint string
        return 'L'+patterns.loops+'C'+patterns.conditions+'F'+patterns.calls+'R'+patterns.returns+'S'+patterns.len;
    },
    /**
     * Detect architectural layer violations: foundational layers importing from presentation layers.
     * Layer order: config(0) < utils(1) < data(2) < services(3) < modules(4) < ui(5) < test(6).
     * A violation occurs when a lower-numbered layer imports from a layer more than 1 level above it.
     * @param {Array<{path:string, layer:string}>} files
     * @param {Array<{source:string, target:string, fn:string}>} connections
     * @returns {Array<{source:string, srcLayer:string, target:string, tgtLayer:string, fn:string}>}
     */
    detectLayerViolations:function(files,connections){
        var violations=[];
        // Higher number = higher abstraction (closer to user). Violation = foundational layer imports presentation layer.
        var layerOrder={config:0,util:1,utils:1,helper:1,lib:1,core:1,data:2,model:2,classes:2,service:3,services:3,api:3,feature:3,modules:4,component:4,components:4,ui:5,page:5,view:5,presentation:5,forms:5,test:6};
        connections.forEach(function(c){
            var srcFile=files.find(function(f){return f.path===c.source;});
            var tgtFile=files.find(function(f){return f.path===c.target;});
            if(!srcFile||!tgtFile)return;
            var srcLayer=(srcFile.layer||'').toLowerCase();
            var tgtLayer=(tgtFile.layer||'').toLowerCase();
            var srcLevel=layerOrder[srcLayer];
            var tgtLevel=layerOrder[tgtLayer];
            // Violation: foundational layer (low number) importing from presentation layer (high number)
            if(srcLevel!==undefined&&tgtLevel!==undefined&&srcLevel<tgtLevel&&tgtLevel-srcLevel>1){
                violations.push({
                    from:srcFile.path,
                    fromLayer:srcFile.layer,
                    to:tgtFile.path,
                    toLayer:tgtFile.layer,
                    fn:c.fn,
                    suggestion:srcFile.layer+' should not import from '+tgtFile.layer+'. Consider inverting the dependency or using dependency injection.'
                });
            }
        });
        return violations;
    },
    /**
     * Compute cyclomatic complexity for a source file.
     * Counts branching keywords (if/else/while/for/case/try/catch) using language-specific patterns.
     * @param {string} content - raw file content
     * @param {string} filePath - used to detect language (Python vs JS)
     * @returns {{score:number, level:'low'|'medium'|'high'|'critical'}}
     */
    calcNestingDepth:function(content){
        if(!content)return 0;
        var max=0,cur=0;
        for(var i=0;i<content.length;i++){
            var c=content[i];
            if(c==='{')cur++;else if(c==='}')cur--;
            if(cur>max)max=cur;
        }
        return max;
    },
    calcComplexity:function(content,filePath){
        if(!content)return{score:0,level:'low'};
        // AST-backed complexity — more accurate than regex (ignores strings/comments)
        if(_tsBundle){
            try{
                var astLang=_tsBundle.detectLang(filePath||'');
                var astParser=astLang?_tsBundle.getParser(astLang):null;
                var astExtractor=astLang?_tsBundle.getExtractor(astLang):null;
                if(astParser&&astExtractor&&typeof astExtractor.countBranches==='function'){
                    var astTree=astParser.parse(content);
                    var branches=astExtractor.countBranches(astTree);
                    if(typeof astTree.delete==='function')astTree.delete();
                    var astScore=1+branches;
                    var astLevel=astScore>THRESHOLDS.complexityCritical?'critical':astScore>THRESHOLDS.complexityHigh?'high':astScore>THRESHOLDS.complexityMedium?'medium':'low';
                    return{score:astScore,level:astLevel};
                }
            }catch(e){/* fall through to regex */}
        }
        var complexity=1;
        var isPython=filePath&&/\.py[iwx]?$/.test(filePath);
        if(isPython){
            // Python-only patterns — no JS patterns applied
            var pyPats=[/\bif\s+/g,/\belif\s+/g,/\bwhile\s+/g,/\bfor\s+\w+\s+in\s+/g,/\bexcept\b/g,/\bwith\s+/g,/\band\b/g,/\bor\b/g];
            pyPats.forEach(function(p){var m=content.match(p);if(m)complexity+=m.length;});
        } else {
            // JS/TS/C-style patterns — no Python patterns applied
            var jsPats=[/\bif\s*\(/g,/\belse\s+if\s*\(/g,/\bwhile\s*\(/g,/\bfor\s*\(/g,/\bcase\s+/g,/\bcatch\s*\(/g,/(?<!\?)\?(?!\?)\s+[^:?\n][^:\n]*:/g,/&&/g,/\|\|/g];
            jsPats.forEach(function(p){var m=content.match(p);if(m)complexity+=m.length;});
        }
        var level=complexity>THRESHOLDS.complexityCritical?'critical':complexity>THRESHOLDS.complexityHigh?'high':complexity>THRESHOLDS.complexityMedium?'medium':'low';
        return{score:complexity,level:level};
    },
    generateSuggestions:function(data){
        var suggestions=[];
        // Based on dead functions
        if(data.stats.dead>10){
            suggestions.push({priority:'high',icon:'🧹',title:'Remove Dead Code',desc:data.stats.dead+' unused functions detected. Removing them will improve maintainability and reduce bundle size.',action:'Review unused functions in the Issues panel',impact:'Reduces codebase by ~'+(data.stats.dead*15)+' lines'});
        }
        // Based on circular dependencies
        var circular=data.issues.filter(function(i){return i.title&&i.title.includes('Circular');});
        if(circular.length){
            suggestions.push({priority:'critical',icon:'🔄',title:'Break Circular Dependencies',desc:circular.length+' circular dependencies found. These cause tight coupling and make testing difficult.',action:'Extract shared code to a new module or use dependency injection',impact:'Improves testability and modularity'});
        }
        // Based on god files
        var godFiles=data.issues.filter(function(i){return i.title&&i.title.includes('Large');});
        if(godFiles.length){
            suggestions.push({priority:'high',icon:'✂️',title:'Split Large Files',desc:godFiles.length+' files have too many functions. Split by responsibility.',action:'Group related functions and extract to separate modules',impact:'Improves code navigation and testing'});
        }
        // Based on high coupling
        var coupling=data.issues.filter(function(i){return i.title&&i.title.includes('Coupled');});
        if(coupling.length){
            suggestions.push({priority:'medium',icon:'🔗',title:'Reduce Coupling',desc:coupling.length+' files are imported by many others. Consider if this is intentional.',action:'Review if these should be split or if importers should be consolidated',impact:'Reduces blast radius of changes'});
        }
        // Based on duplicates
        if(data.duplicates&&data.duplicates.length>0){
            var nameDups=data.duplicates.filter(function(d){return d.type==='name';});
            var codeDups=data.duplicates.filter(function(d){return d.type==='code';});
            if(nameDups.length){
                suggestions.push({priority:'medium',icon:'📛',title:'Resolve Naming Conflicts',desc:nameDups.length+' function names are duplicated across files. This can cause confusion.',action:'Rename functions to be more specific or consolidate into shared module',impact:'Prevents bugs from importing wrong function'});
            }
            if(codeDups.length){
                suggestions.push({priority:'high',icon:'📋',title:'Extract Duplicated Code',desc:codeDups.length+' instances of similar code found. DRY principle violation.',action:'Create shared utility functions',impact:'Reduces maintenance burden and potential bugs'});
            }
        }
        // Based on layer violations
        if(data.layerViolations&&data.layerViolations.length>0){
            suggestions.push({priority:'high',icon:'🏗️',title:'Fix Architecture Violations',desc:data.layerViolations.length+' layer violations found. Lower layers should not depend on higher layers.',action:'Invert dependencies or use interfaces/events',impact:'Improves architecture and testability'});
        }
        // Based on security
        var highSec=data.securityIssues?data.securityIssues.filter(function(s){return s.severity==='high';}):[];
        if(highSec.length){
            suggestions.push({priority:'critical',icon:'🔐',title:'Fix Security Issues',desc:highSec.length+' high-severity security issues found.',action:'Address hardcoded secrets, injection risks immediately',impact:'Prevents potential security breaches'});
        }
        // Test coverage hint
        var testFiles=data.files.filter(function(f){return f.name.includes('.test.')||f.name.includes('.spec.')||f.path.includes('__tests__');});
        var testRatio=data.files.length>0?(testFiles.length/data.files.length*100):0;
        if(testRatio<10&&data.files.length>10){
            suggestions.push({priority:'medium',icon:'🧪',title:'Add Test Coverage',desc:'Only '+testFiles.length+' test files found ('+Math.round(testRatio)+'%). Consider adding more tests.',action:'Focus on testing critical paths and high-complexity files',impact:'Prevents regressions and improves confidence'});
        }
        return suggestions.sort(function(a,b){var p={critical:0,high:1,medium:2,low:3};return p[a.priority]-p[b.priority];});
    },
    detectSecurity:function(files){
        var issues=[];
        files.forEach(function(f){
            if(!f.content)return;
            var lines=f.content.split('\n');
            var isTestFile=f.path.includes('/tests/')||f.path.includes('/test/')||f.name.match(/\.(test|spec)\./)||f.path.includes('__tests__');
            if(!f.name.match(/\.(?:md|txt)$/)&&!isTestFile){lines.forEach(function(line,idx){
                if(line.match(/(?:password|passwd|pwd|secret|api_key|apikey|token|auth)\s*[=:]\s*['"][^'"]{4,}['"]/i)&&!line.includes('process.env')&&!line.includes('config.')&&!line.match(/["']\$/)&&!line.match(/\.startsWith\s*\(['"]/)&&!line.match(/args\.(find|filter|some|every)\s*\(/)){
                    issues.push({severity:'high',title:'Hardcoded Secret',file:f.name,path:f.path,line:idx+1,desc:'Credentials should never be hardcoded. Use environment variables or a secrets manager.',code:line.trim().substring(0,80)});
                }
            });}
            // Skip SQL injection check for graph/Kuzu files — they use Cypher (not SQL) with proper esc() helpers
            var isKuzuFile=f.content.includes('CREATE NODE TABLE')||f.content.includes('CREATE REL TABLE')||f.content.includes("require('kuzu")||f.content.includes('require("kuzu');
            if(!isKuzuFile&&(f.content.match(/query\s*\(\s*['"`][^'"`]*\s*\+/)||f.content.match(/execute\s*\(\s*['"`][^'"`]*\$\{/)||f.content.match(/\$\{.*\}.*\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i))){
                var m=f.content.match(/.*(query|execute|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b).*(\+|\$\{).*/i);
                issues.push({severity:'high',title:'SQL Injection Risk',file:f.name,path:f.path,desc:'String concatenation in SQL queries. Use parameterized queries instead.',code:m?m[0].trim().substring(0,80):''});
            }
            if(f.content.match(/innerHTML\s*=/)){
                var xssLine=lines.findIndex(function(l){return l.match(/innerHTML\s*=/)&&!l.match(/[/"'`]innerHTML/)&&!l.includes('.includes(');});
                if(xssLine>=0){issues.push({severity:'high',title:'XSS Vulnerability',file:f.name,path:f.path,desc:'Direct HTML injection can lead to XSS attacks. Sanitize user input.',code:''});}
            }
            if(!f.name.match(/\.(?:md|txt)$/)&&f.content.includes('eval(')){
                var evalLine=lines.findIndex(function(l){return l.includes('eval(')&&!l.match(/["'`]eval\(/)&&!l.includes('.includes(')&&!l.match(/eval\(\)/);});
                if(evalLine>=0){issues.push({severity:'medium',title:'Dynamic Code Execution',file:f.name,path:f.path,line:evalLine+1,desc:'eval() executes arbitrary code. Avoid if possible or validate input strictly.',code:lines[evalLine].trim().substring(0,80)});}
            }
            if(f.content.includes('Function(')||f.content.match(/new\s+Function\s*\(/)){
                var funcLine=lines.findIndex(function(l){return(l.includes('Function(')||l.match(/new\s+Function\s*\(/))&&!l.includes('.includes(')&&!l.match(/["'`/]Function\(/)&&!l.match(/\w+Function\s*\(/)&&!l.match(/\bTABLE\b.*Function\s*\(/);});
                if(funcLine>=0){issues.push({severity:'medium',title:'Function Constructor',file:f.name,path:f.path,desc:'Function constructor is similar to eval. Consider alternatives.',code:''});}
            }
            if(f.content.match(/\.exec\s*\(/)||f.content.match(/child_process/)){
                var execCmdLine=lines.findIndex(function(l){return(l.match(/\.exec\s*\(`[^`]*\$\{/)||l.match(/\bspawn\s*\(\s*`[^`]*\$\{/));});
                if(execCmdLine>=0){issues.push({severity:'medium',title:'Command Execution',file:f.name,path:f.path,desc:'Shell command execution detected. Ensure input is sanitized to prevent injection.',code:''});}
            }
            if(f.content.match(/console\.(log|debug|info)\(/)){
                var consoleCount=(f.content.match(/console\.(log|debug|info)\(/g)||[]).length;
                // Skip CLI entry points and server files where console output is intentional
                var isCliOrServer=f.name.match(/^cli\.[jt]sx?$|^server\.[jt]sx?$|^bin\.[jt]sx?$/)
                    ||f.path.includes('/cli/')||f.path.includes('/bin/');
                if(!isCliOrServer&&consoleCount>3){
                    issues.push({severity:'low',title:'Debug Statements',file:f.name,path:f.path,desc:consoleCount+' console statements found. Remove before production.',code:''});
                }
            }
            // VBA-specific security checks
            if(f.content.match(/SendKeys\s*\(/i)){
                issues.push({severity:'high',title:'SendKeys Usage',file:f.name,path:f.path,desc:'SendKeys can be exploited for code injection. Avoid using SendKeys.',code:''});
            }
            if(f.content.match(/Shell\s*\(/i)){
                var shellVbaLine=lines.findIndex(function(l){return l.match(/\bShell\s*\(/i)&&!l.match(/['"\/`].*Shell\s*\(/i)&&!l.match(/\.match\s*\(/);});
                if(shellVbaLine>=0){issues.push({severity:'high',title:'Shell Command Execution',file:f.name,path:f.path,desc:'Shell() executes system commands. Ensure input is validated.',code:''});}
            }
            if(f.content.match(/CreateObject\s*\(\s*["']WScript\.Shell["']/i)){
                issues.push({severity:'high',title:'WScript.Shell Creation',file:f.name,path:f.path,desc:'Creating WScript.Shell object allows command execution. Use with caution.',code:''});
            }
            if(f.content.match(/Application\.Run\s*\(/i)){
                issues.push({severity:'medium',title:'Dynamic Code Execution',file:f.name,path:f.path,desc:'Application.Run can execute arbitrary code. Validate input.',code:''});
            }
            if(f.content.match(/On Error Resume Next/i)){
                var errorResumeLines=lines.filter(function(l){return /On Error Resume Next/i.test(l)&&!l.match(/\.match\s*\(/)&&!l.match(/['"\/`].*On Error Resume Next/i);});
                if(errorResumeLines.length>2){
                    issues.push({severity:'medium',title:'Excessive Error Suppression',file:f.name,path:f.path,desc:errorResumeLines.length+' instances of "On Error Resume Next" found. This can hide bugs.',code:''});
                }
            }
            if(f.content.match(/TODO|FIXME|HACK|XXX/)){
                // Only count actual comment lines, not regex/string literals that contain these words
                var todoLines=lines.filter(function(l){
                    var t=l.trim();
                    return(t.startsWith('//')||t.startsWith('*')||t.startsWith('#'))&&/\b(?:TODO|FIXME|HACK|XXX)\b/.test(t);
                });
                if(todoLines.length>0){
                    issues.push({severity:'low',title:'Code Comments',file:f.name,path:f.path,desc:todoLines.length+' TODO/FIXME comments found. Address before release.',code:''});
                }
            }
            // Python-specific security checks
            var isPyFile=f.name.endsWith('.py')||f.name.endsWith('.pyw');
            if(isPyFile&&f.content){
                // eval() and exec() - arbitrary code execution
                if(f.content.match(/\beval\s*\(/)){
                    var evalLine=lines.findIndex(function(l){return l.match(/\beval\s*\(/);});
                    issues.push({severity:'high',title:'Python eval()',file:f.name,path:f.path,line:evalLine>=0?evalLine+1:undefined,desc:'eval() executes arbitrary Python code. Use ast.literal_eval() for safe parsing.',code:evalLine>=0?lines[evalLine].trim().substring(0,80):''});
                }
                if(f.content.match(/\bexec\s*\(/)){
                    var execLine=lines.findIndex(function(l){return l.match(/\bexec\s*\(/);});
                    issues.push({severity:'high',title:'Python exec()',file:f.name,path:f.path,line:execLine>=0?execLine+1:undefined,desc:'exec() executes arbitrary Python code. This is almost always a security risk.',code:execLine>=0?lines[execLine].trim().substring(0,80):''});
                }
                // pickle - deserialization attacks
                if(f.content.match(/\bpickle\.load/)||f.content.match(/\bunpickle/)){
                    issues.push({severity:'high',title:'Pickle Deserialization',file:f.name,path:f.path,desc:'pickle.load() can execute arbitrary code from untrusted data. Use JSON or safe alternatives.',code:''});
                }
                // subprocess with shell=True
                if(f.content.match(/subprocess\.\w+\([^)]*shell\s*=\s*True/)){
                    issues.push({severity:'high',title:'Shell Injection Risk',file:f.name,path:f.path,desc:'subprocess with shell=True is vulnerable to command injection. Use shell=False with a list of args.',code:''});
                }
                // os.system / os.popen - command injection
                if(f.content.match(/\bos\.system\s*\(/)||f.content.match(/\bos\.popen\s*\(/)){
                    var osLine=lines.findIndex(function(l){return l.match(/\bos\.(system|popen)\s*\(/);});
                    issues.push({severity:'high',title:'OS Command Execution',file:f.name,path:f.path,line:osLine>=0?osLine+1:undefined,desc:'os.system()/os.popen() are vulnerable to command injection. Use subprocess with shell=False.',code:osLine>=0?lines[osLine].trim().substring(0,80):''});
                }
                // __import__ - dynamic imports
                if(f.content.match(/__import__\s*\(/)){
                    issues.push({severity:'medium',title:'Dynamic Import',file:f.name,path:f.path,desc:'__import__() with user input can load arbitrary modules. Validate module names against an allowlist.',code:''});
                }
                // Bare except clauses
                var bareExcepts=(f.content.match(/\bexcept\s*:/g)||[]).length;
                if(bareExcepts>2){
                    issues.push({severity:'medium',title:'Bare Except Clauses',file:f.name,path:f.path,desc:bareExcepts+' bare except: clauses found. These catch all exceptions including SystemExit and KeyboardInterrupt.',code:''});
                }
                // assert in non-test files
                if(!f.name.includes('test')&&!f.path.includes('test')){
                    var assertCount=(f.content.match(/\bassert\s+/g)||[]).length;
                    if(assertCount>5){
                        issues.push({severity:'low',title:'Assert in Production',file:f.name,path:f.path,desc:assertCount+' assert statements found. Assertions are stripped with python -O. Use proper validation.',code:''});
                    }
                }
                // Hardcoded DEBUG = True
                if(f.content.match(/\bDEBUG\s*=\s*True\b/)){
                    issues.push({severity:'medium',title:'Debug Mode Enabled',file:f.name,path:f.path,desc:'DEBUG = True found. Ensure this is disabled in production.',code:''});
                }
            }
        });
        return issues.sort(function(a,b){var sev={high:0,medium:1,low:2};return sev[a.severity]-sev[b.severity];});
    },
    detectMISRA:function(files){
        var issues=[];
        var safetyExts=/\.(?:c|cpp|cc|cxx|h|hpp|ada|adb|ads)$/i;
        files.forEach(function(f){
            if(!f.content)return;
            if(!f.name.match(safetyExts))return;
            var lines=f.content.split('\n');
            var isEntryFile=f.name.match(/^(?:main|init|startup)\./i);
            // Track function nesting to detect multiple returns
            var inFunctionLines=0,returnCount=0,functionStart=-1;
            lines.forEach(function(line,idx){
                var t=line.trim();
                // Rule 20.4/20.9 — dynamic memory
                if(t.match(/\b(?:malloc|calloc|realloc|free)\s*\(/)&&!isEntryFile){
                    issues.push({severity:'high',title:'MISRA Rule 20.4 — Dynamic Memory',file:f.name,path:f.path,line:idx+1,desc:'Dynamic memory allocation/deallocation (malloc/calloc/realloc/free) is prohibited in safety-critical code after initialisation.',code:t.substring(0,80),category:'misra'});
                }
                // Rule 17.2 — recursion (simple heuristic: fn name appears in its own body)
                if(functionStart===-1&&t.match(/^(?:static\s+)?(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*\{/)){
                    var m=t.match(/\b(\w+)\s*\([^)]*\)\s*\{$/);
                    if(m){f._currentFn=m[1];functionStart=idx;returnCount=0;inFunctionLines=0;}
                }
                if(functionStart!==-1){
                    inFunctionLines++;
                    if(t.match(/\breturn\b/))returnCount++;
                    if(f._currentFn&&new RegExp('\\b'+f._currentFn+'\\s*\\(').test(t)&&idx>functionStart){
                        issues.push({severity:'high',title:'MISRA Rule 17.2 — Recursive Call',file:f.name,path:f.path,line:idx+1,desc:'Recursive function calls are prohibited under MISRA C. Use iterative algorithms instead.',code:t.substring(0,80),category:'misra'});
                    }
                    if(t==='}'){
                        if(inFunctionLines>15&&returnCount>1){
                            issues.push({severity:'low',title:'MISRA Rule 15.5 — Multiple Returns',file:f.name,path:f.path,line:functionStart+1,desc:'Function has '+returnCount+' return statements. MISRA recommends a single exit point for functions >15 lines.',code:'',category:'misra'});
                        }
                        functionStart=-1;f._currentFn=null;
                    }
                }
                // Rule 15.1 — goto
                if(t.match(/\bgoto\b/)){
                    issues.push({severity:'medium',title:'MISRA Rule 15.1 — goto Statement',file:f.name,path:f.path,line:idx+1,desc:'The goto statement is prohibited under MISRA C. Use structured control flow.',code:t.substring(0,80),category:'misra'});
                }
                // Safety general — abort/exit outside main
                if(t.match(/\b(?:abort|exit)\s*\(/)&&!isEntryFile){
                    issues.push({severity:'high',title:'Safety — Unsafe Process Termination',file:f.name,path:f.path,line:idx+1,desc:'abort()/exit() outside the main entry point can leave hardware in an undefined state in safety-critical systems.',code:t.substring(0,80),category:'misra'});
                }
                // Safety general — printf family in non-debug
                if(t.match(/\b(?:printf|fprintf|sprintf)\s*\(/)){
                    issues.push({severity:'medium',title:'Safety — Formatted Output in Mission Code',file:f.name,path:f.path,line:idx+1,desc:'printf/fprintf/sprintf usage in safety-critical code. Formatted I/O should be confined to designated debug/ground-support modules.',code:t.substring(0,80),category:'misra'});
                }
                // Ada — Unchecked_Conversion / Unchecked_Deallocation
                if(t.match(/Ada\.Unchecked_Conversion|Ada\.Unchecked_Deallocation/)){
                    issues.push({severity:'high',title:'Ada Safety — Unchecked Operation',file:f.name,path:f.path,line:idx+1,desc:t.includes('Conversion')?'Ada.Unchecked_Conversion bypasses type safety — prohibited in certified software.':'Ada.Unchecked_Deallocation bypasses storage reclamation control — prohibited in certified software.',code:t.substring(0,80),category:'misra'});
                }
            });
        });
        return issues.sort(function(a,b){var sev={high:0,medium:1,low:2};return sev[a.severity]-sev[b.severity];});
    },
    // AST-based function extraction - accurate detection without false positives
    extract:function(content,filename){
        // Try tree-sitter AST extraction first
        if (_tsBundle) {
            try {
                var tslang = _tsBundle.detectLang(filename);
                var tsp = tslang && _tsBundle.getParser(tslang);
                var tse = tslang && _tsBundle.getExtractor(tslang);
                if (tsp && tse) {
                    var tsTree = tsp.parse(content);
                    try { return tse.extractDefinitions(tsTree, content, filename); }
                    finally { try { tsTree.delete(); } catch(_) {} }
                }
            } catch(e) { /* fall through to regex */ }
        }
        var fns=[];
        var lines=content.split('\n');

        // Helper to extract code snippet for a function
        function extractCode(startLine,endLine){
            var code=[];
            var start=Math.max(0,startLine-1);
            var end=Math.min(lines.length,endLine||startLine+20);
            for(var i=start;i<end&&code.length<15;i++){
                code.push(lines[i]);
            }
            if(code.length>=15)code.push('  // ...');
            return code.join('\n');
        }

        // Track functions by line to allow same name at different locations
        var seenAtLine={};
        function addFn(fnObj){
            var key=fnObj.name+'@'+fnObj.line;
            if(!seenAtLine[key]){
                seenAtLine[key]=true;
                fns.push(fnObj);
            }
        }

        // Check file type
        var ext=filename.toLowerCase();
        var isJS=ext.endsWith('.js')||ext.endsWith('.jsx')||ext.endsWith('.mjs')||ext.endsWith('.cjs');
        var isTS=ext.endsWith('.ts')||ext.endsWith('.tsx');
        var isVue=ext.endsWith('.vue');
        var isSvelte=ext.endsWith('.svelte');
        var isPython=ext.endsWith('.py')||ext.endsWith('.pyw')||ext.endsWith('.pyi');
        var isAda=ext.endsWith('.adb')||ext.endsWith('.ads');

        // Extract script content from Vue/Svelte files
        var scriptContent=content;
        var scriptOffset=0;
        if(isVue||isSvelte){
            var scriptMatch=content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
            if(scriptMatch){
                scriptContent=scriptMatch[1];
                scriptOffset=content.substring(0,content.indexOf(scriptMatch[1])).split('\n').length-1;
                isJS=true;  // Treat extracted script as JS
                // Check if it's TypeScript
                if(content.match(/<script[^>]*lang=["']ts["'][^>]*>/i)){
                    isTS=true;
                    isJS=false;
                }
            }else{
                // No script tag found
                return fns;
            }
            lines=scriptContent.split('\n');
        }

        // Try AST parsing for JS/TS files using real parsers
        if((isJS||isTS)&&typeof acorn!=='undefined'){
            var parseContent=scriptContent;
            var parseSuccess=false;

            // Use Babel (real parser) to handle JSX and TypeScript properly
            // Babel transforms JSX → React.createElement and strips TS types,
            // producing clean JS that acorn can parse into a proper AST
            if(typeof Babel!=='undefined'){
                try{
                    var babelPresets=['react'];
                    if(isTS)babelPresets.push('typescript');
                    var babelResult=Babel.transform(parseContent,{
                        presets:babelPresets,
                        filename:filename||'file.js',
                        sourceType:'module',
                        retainLines:true
                    });
                    parseContent=babelResult.code;
                }catch(babelErr){
                    // Babel failed, fall back to manual TypeScript stripping
                    if(isTS){
                        parseContent=Parser.stripTypeScript(scriptContent);
                    }
                }
            }else if(isTS){
                parseContent=Parser.stripTypeScript(scriptContent);
            }

            // Parse clean JS with acorn
            try{
                var ast=acorn.parse(parseContent,{
                    ecmaVersion:2022,
                    sourceType:'module',
                    allowHashBang:true,
                    allowAwaitOutsideFunction:true,
                    allowImportExportEverywhere:true,
                    allowReturnOutsideFunction:true,
                    locations:true
                });
                parseSuccess=true;

                // Walk the AST to find ALL function definitions
                function walk(node,scope,parentIsExport){
                    if(!node||typeof node!=='object')return;

                    var isTopLevel=(scope===0);

                    // FunctionDeclaration: function foo() {}
                    if(node.type==='FunctionDeclaration'&&node.id&&node.id.name){
                        var line=(node.loc?node.loc.start.line:1)+scriptOffset;
                        var endLine=(node.loc?node.loc.end.line:line)+scriptOffset;
                        addFn({
                            name:node.id.name,
                            file:filename,
                            line:line,
                            code:extractCode(line,endLine),
                            isTopLevel:isTopLevel,
                            isExported:parentIsExport||false,
                            type:'function'
                        });
                    }

                    // VariableDeclaration: const foo = () => {} or const foo = function() {}
                    if(node.type==='VariableDeclaration'){
                        node.declarations.forEach(function(decl){
                            if(decl.id&&decl.id.type==='Identifier'&&decl.init){
                                var init=decl.init;
                                // Direct function expression or arrow function ONLY
                                // NOT CallExpression (e.g., array.map(x => x))
                                if(init.type==='FunctionExpression'||init.type==='ArrowFunctionExpression'){
                                    var line=(decl.loc?decl.loc.start.line:1)+scriptOffset;
                                    var endLine=(decl.loc?decl.loc.end.line:line)+scriptOffset;
                                    addFn({
                                        name:decl.id.name,
                                        file:filename,
                                        line:line,
                                        code:extractCode(line,endLine),
                                        isTopLevel:isTopLevel,
                                        isExported:parentIsExport||false,
                                        type:init.type==='ArrowFunctionExpression'?'arrow':'function'
                                    });
                                }
                            }
                        });
                    }

                    // MethodDefinition in classes
                    if(node.type==='MethodDefinition'&&node.key){
                        var name=node.key.name||(typeof node.key.value==='string'?node.key.value:null);
                        if(name&&name!=='constructor'){
                            var line=(node.loc?node.loc.start.line:1)+scriptOffset;
                            var endLine=(node.loc?node.loc.end.line:line)+scriptOffset;
                            addFn({
                                name:name,
                                file:filename,
                                line:line,
                                code:extractCode(line,endLine),
                                isTopLevel:false,
                                isExported:false,
                                type:'method',
                                isClassMethod:true,
                                isGetter:node.kind==='get',
                                isSetter:node.kind==='set'
                            });
                        }
                    }

                    // Property with method shorthand: { foo() {} }
                    if(node.type==='Property'&&node.method&&node.key){
                        var name=node.key.name||(typeof node.key.value==='string'?node.key.value:null);
                        if(name){
                            var line=(node.loc?node.loc.start.line:1)+scriptOffset;
                            var endLine=(node.loc?node.loc.end.line:line)+scriptOffset;
                            addFn({
                                name:name,
                                file:filename,
                                line:line,
                                code:extractCode(line,endLine),
                                isTopLevel:false,
                                isExported:false,
                                type:'method'
                            });
                        }
                    }

                    // Property with function value: { foo: function() {} } or { foo: () => {} }
                    if(node.type==='Property'&&!node.method&&node.value&&node.key){
                        var val=node.value;
                        if(val.type==='FunctionExpression'||val.type==='ArrowFunctionExpression'){
                            var name=node.key.name||(typeof node.key.value==='string'?node.key.value:null);
                            if(name){
                                var line=(node.loc?node.loc.start.line:1)+scriptOffset;
                                var endLine=(node.loc?node.loc.end.line:line)+scriptOffset;
                                addFn({
                                    name:name,
                                    file:filename,
                                    line:line,
                                    code:extractCode(line,endLine),
                                    isTopLevel:false,
                                    isExported:false,
                                    type:'method'
                                });
                            }
                        }
                    }

                    // Handle exports
                    var nextIsExport=false;
                    if(node.type==='ExportNamedDeclaration'||node.type==='ExportDefaultDeclaration'){
                        nextIsExport=true;
                        if(node.declaration){
                            walk(node.declaration,scope,true);
                            return;
                        }
                    }

                    // Recurse - increase scope for function bodies
                    var newScope=scope;
                    if(node.type==='FunctionDeclaration'||node.type==='FunctionExpression'||
                       node.type==='ArrowFunctionExpression'||node.type==='ClassDeclaration'||
                       node.type==='ClassExpression'){
                        newScope=scope+1;
                    }

                    for(var key in node){
                        if(key==='loc'||key==='range'||key==='start'||key==='end'||key==='raw')continue;
                        var child=node[key];
                        if(Array.isArray(child)){
                            child.forEach(function(c){walk(c,newScope,nextIsExport);});
                        }else if(child&&typeof child==='object'&&child.type){
                            walk(child,newScope,nextIsExport);
                        }
                    }
                }

                walk(ast,0,false);

            }catch(e){
                // AST parsing failed
                parseSuccess=false;
            }

            // If AST parsing failed, use comprehensive regex fallback
            if(!parseSuccess){
                Parser.extractWithRegex(scriptContent,filename,scriptOffset,addFn,extractCode);
            }
        }else if(isPython){
            // Python: extract classes, functions, async functions, decorators, and methods
            var currentClass=null;
            var classIndent=-1;
            var decorators=[];
            lines.forEach(function(line,idx){
                var trimmed=line.trimStart();
                var indent=(line.match(/^(\s*)/)||['',''])[1].length;

                // Track decorators
                if(trimmed.match(/^@\w/)){
                    decorators.push(trimmed);
                    return;
                }

                // Detect class definitions
                var classMatch=line.match(/^(\s*)class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[\(:]?/);
                if(classMatch){
                    var cIndent=classMatch[1].length;
                    var className=classMatch[2];
                    var cEndLine=idx+1;
                    for(var i=idx+1;i<lines.length;i++){
                        var nl=lines[i];
                        if(nl.trim()===''||nl.match(/^\s*#/))continue;
                        var ni=(nl.match(/^(\s*)/)||['',''])[1].length;
                        if(ni<=cIndent&&nl.trim()!==''){cEndLine=i;break;}
                        cEndLine=i+1;
                    }
                    var hasDecorator=decorators.length>0;
                    var isDataclass=decorators.some(function(d){return d.includes('dataclass');});
                    var isABC=line.includes('ABC')||line.includes('ABCMeta');
                    addFn({
                        name:className,
                        file:filename,
                        line:idx+1,
                        code:extractCode(idx+1,Math.min(idx+20,cEndLine)),
                        isTopLevel:cIndent===0,
                        isExported:cIndent===0,
                        type:isDataclass?'dataclass':isABC?'abstract_class':'class',
                        decorators:hasDecorator?decorators.slice():undefined
                    });
                    currentClass=className;
                    classIndent=cIndent;
                    decorators=[];
                    return;
                }

                // Reset class context when dedented
                if(currentClass!==null&&indent<=classIndent&&trimmed!==''&&!trimmed.startsWith('#')){
                    currentClass=null;
                    classIndent=-1;
                }

                // Detect function/method definitions (including async def)
                var m=line.match(/^(\s*)(?:async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
                if(m){
                    var fIndent=m[1].length;
                    var name=m[2];
                    var isAsync=line.match(/\basync\s+def\b/)!==null;
                    var isMethod=currentClass!==null&&fIndent>classIndent;
                    var isDunder=name.startsWith('__')&&name.endsWith('__');
                    var isPrivate=name.startsWith('_')&&!isDunder;
                    var isSelf=line.match(/def\s+\w+\s*\(\s*self[\s,)]/);
                    var isCls=line.match(/def\s+\w+\s*\(\s*cls[\s,)]/);
                    var hasDecorator=decorators.length>0;
                    var isProperty=decorators.some(function(d){return d.includes('@property');});
                    var isStaticmethod=decorators.some(function(d){return d.includes('@staticmethod');});
                    var isClassmethod=decorators.some(function(d){return d.includes('@classmethod');});

                    var endLine=idx+1;
                    for(var i=idx+1;i<lines.length;i++){
                        var nextLine=lines[i];
                        if(nextLine.trim()===''||nextLine.match(/^\s*#/))continue;
                        var nextIndent=(nextLine.match(/^(\s*)/)||['',''])[1].length;
                        if(nextIndent<=fIndent&&nextLine.trim()!==''){endLine=i;break;}
                        endLine=i+1;
                    }

                    var fnType='function';
                    if(isMethod){
                        if(isProperty)fnType='property';
                        else if(isStaticmethod)fnType='staticmethod';
                        else if(isClassmethod)fnType='classmethod';
                        else fnType='method';
                    }
                    if(isAsync)fnType='async_'+fnType;

                    addFn({
                        name:isMethod&&currentClass?currentClass+'.'+name:name,
                        file:filename,
                        line:idx+1,
                        code:extractCode(idx+1,endLine),
                        isTopLevel:fIndent===0,
                        isExported:fIndent===0&&!isPrivate,
                        isClassMethod:isMethod,
                        type:fnType,
                        className:isMethod?currentClass:undefined,
                        decorators:hasDecorator?decorators.slice():undefined
                    });
                    decorators=[];
                }else if(!classMatch){
                    // Reset decorators if line is not a def or class
                    if(trimmed!==''&&!trimmed.startsWith('#')&&!trimmed.startsWith('@')){
                        decorators=[];
                    }
                }
            });
        }else if(isAda){
            // Ada/SPARK: use dedicated Ada parser
            var adaResult=Parser.parseAdaFile(content,filename);
            adaResult.functions.forEach(function(fn){
                addFn({
                    name:fn.name,
                    file:filename,
                    line:fn.line,
                    code:extractCode(fn.line),
                    isTopLevel:true,
                    isExported:fn.isExported,
                    type:fn.type
                });
            });
        }else{
            // Other languages: use language-specific regex
            Parser.extractOtherLanguages(content,filename,addFn,extractCode);
        }

        return fns;
    },

    // Strip Python string literals and comments for accurate token-level analysis
    // This is a proper tokenizer approach: preserves code structure while removing non-code content
    stripPythonNonCode:function(content){
        var result=[];
        var i=0;
        var len=content.length;
        while(i<len){
            // Triple-quoted strings (must check before single quotes)
            if(i<len-2&&((content[i]==='"'&&content[i+1]==='"'&&content[i+2]==='"')||(content[i]==="'"&&content[i+1]==="'"&&content[i+2]==="'"))){
                var q3=content[i];
                i+=3;
                while(i<len-2){
                    if(content[i]===q3&&content[i+1]===q3&&content[i+2]===q3){i+=3;break;}
                    result.push(content[i]==='\n'?'\n':' ');
                    i++;
                }
            }
            // String prefixes (f/r/b/u and combinations like rb, fr, etc.)
            else if(i<len-1&&/^[frbuFRBU]{1,2}$/.test(content.slice(i,i+1+(content[i+1]&&/[frbuFRBU"']/.test(content[i+1])?1:0)).replace(/["']/g,''))&&
                    (content[i+1]==='"'||content[i+1]==="'"||content[i+2]==='"'||content[i+2]==="'")){
                // Skip prefix chars
                while(i<len&&content[i]!=='"'&&content[i]!=="'"){result.push(' ');i++;}
                // Fall through to string handling below (don't continue)
                if(i>=len)break;
                // Check for triple-quoted prefixed string
                if(i<len-2&&content[i+1]===content[i]&&content[i+2]===content[i]){
                    var pq3=content[i];i+=3;
                    while(i<len-2){
                        if(content[i]===pq3&&content[i+1]===pq3&&content[i+2]===pq3){i+=3;break;}
                        result.push(content[i]==='\n'?'\n':' ');i++;
                    }
                }else{
                    var pq=content[i];result.push(' ');i++;
                    while(i<len&&content[i]!==pq&&content[i]!=='\n'){
                        if(content[i]==='\\'){result.push(' ');i++;}
                        if(i<len){result.push(content[i]==='\n'?'\n':' ');i++;}
                    }
                    if(i<len&&content[i]===pq){result.push(' ');i++;}
                }
            }
            // Regular single/double quoted strings
            else if(content[i]==='"'||content[i]==="'"){
                var q=content[i];result.push(' ');i++;
                while(i<len&&content[i]!==q&&content[i]!=='\n'){
                    if(content[i]==='\\'){result.push(' ');i++;}
                    if(i<len){result.push(content[i]==='\n'?'\n':' ');i++;}
                }
                if(i<len&&content[i]===q){result.push(' ');i++;}
            }
            // Comments
            else if(content[i]==='#'){
                while(i<len&&content[i]!=='\n'){result.push(' ');i++;}
            }
            // Normal code - pass through
            else{
                result.push(content[i]);i++;
            }
        }
        return result.join('');
    },

    // Strip TypeScript syntax for Acorn parsing
    stripTypeScript:function(content){
        // Process line by line for more control
        var lines=content.split('\n');
        var result=[];
        var inInterface=false;
        var braceDepth=0;

        for(var i=0;i<lines.length;i++){
            var line=lines[i];

            // Skip type-only imports/exports
            if(line.match(/^\s*import\s+type\s/)||line.match(/^\s*export\s+type\s/)){
                result.push('');
                continue;
            }

            // Track interface/type blocks to skip
            if(line.match(/^\s*(?:export\s+)?interface\s+/)||line.match(/^\s*(?:export\s+)?type\s+\w+\s*=/)){
                inInterface=true;
                braceDepth=0;
            }

            if(inInterface){
                for(var j=0;j<line.length;j++){
                    if(line[j]==='{')braceDepth++;
                    if(line[j]==='}')braceDepth--;
                }
                if(braceDepth<=0&&(line.includes('}')||line.includes(';')||!line.match(/[{;]/))){
                    inInterface=false;
                }
                result.push('');
                continue;
            }

            // Remove type annotations carefully
            // Function params: (x: Type) -> (x)
            line=line.replace(/(\w)\s*:\s*[A-Za-z_$<>[\]|&\s,]+(?=[,\)])/g,'$1');
            // Return types: ): Type => -> ) =>  or ): Type { -> ) {
            line=line.replace(/\)\s*:\s*[A-Za-z_$<>[\]|&\s]+(?=\s*[{=>])/g,')');
            // Variable types: let x: Type = -> let x =
            line=line.replace(/(let|const|var)\s+(\w+)\s*:\s*[A-Za-z_$<>[\]|&\s]+\s*=/g,'$1 $2 =');
            // Generic type params: func<T>( -> func(
            line=line.replace(/<[A-Za-z_$,\s]+>(?=\s*\()/g,'');
            // As casts: x as Type -> x
            line=line.replace(/\s+as\s+[A-Za-z_$<>[\]|&\s]+(?=[,;\)\]\}]|$)/g,'');
            // Non-null assertions: x! -> x
            line=line.replace(/!(?=[\.\[\)\],;\s])/g,'');
            // Declare statements
            if(line.match(/^\s*declare\s+/)){
                result.push('');
                continue;
            }

            result.push(line);
        }

        return result.join('\n');
    },

    // Comprehensive regex fallback for JS/TS when AST fails
    extractWithRegex:function(content,filename,offset,addFn,extractCode){
        var lines=content.split('\n');

        lines.forEach(function(line,idx){
            var lineNum=idx+1+offset;
            var m;

            // Named function declarations (capture export keyword for isExported)
            if((m=line.match(/(export\s+(?:default\s+)?)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/)))
                addFn({name:m[2],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,isExported:!!m[1],type:'function'});

            // Arrow functions assigned to const/let/var at START of meaningful content
            // Must have = directly followed by arrow function pattern
            if((m=line.match(/(export\s+)?(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/)))
                addFn({name:m[2],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,isExported:!!m[1],type:'arrow'});

            // Arrow functions with single param (no parens): const foo = x =>
            if((m=line.match(/(export\s+)?(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/)))
                addFn({name:m[2],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,isExported:!!m[1],type:'arrow'});

            // Function expressions: const foo = function
            if((m=line.match(/(export\s+)?(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?function\s*[(\w]/)))
                addFn({name:m[2],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,isExported:!!m[1],type:'function'});

            // Class methods (inside class body): methodName() { or async methodName() {
            if((m=line.match(/^\s+(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/))&&!line.match(/^s*(if|for|while|switch|catch|function|const|let|var)/))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:false,type:'method',isClassMethod:true});

            // Object method shorthand (indented): foo() { or foo: function
            if((m=line.match(/^\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(?:async\s+)?function/)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:false,type:'method'});

            // Object property arrow: foo: () =>
            if((m=line.match(/^\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(?:async\s*)?\([^)]*\)\s*=>/)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:false,type:'method'});
        });
    },

    // Extract functions from other languages
    extractOtherLanguages:function(content,filename,addFn,extractCode){
        var lines=content.split('\n');

        lines.forEach(function(line,idx){
            var lineNum=idx+1;
            var m;

            // Go: func name(
            if((m=line.match(/^func\s+(?:\([^)]+\)\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});

            // Java/C#/Kotlin: public void methodName( or similar
            if((m=line.match(/(?:public|private|protected|internal|static|final|override|virtual|abstract|async)\s+(?:(?:static|final|override|virtual|abstract|async)\s+)*(?:\w+\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:false,type:'method'});

            // Kotlin: fun name(
            if((m=line.match(/(?:suspend\s+)?fun\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[<(]/)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});

            // Ruby: def name
            if((m=line.match(/^\s*def\s+([a-zA-Z_][a-zA-Z0-9_?!]*)/)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});

            // Rust: fn name or pub fn name
            if((m=line.match(/(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[<(]/)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});

            // PHP: function name( or public function name(
            if((m=line.match(/(?:public|private|protected|static)?\s*function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});

            // C/C++: type name( at start or with visibility
            if((m=line.match(/^(?:static\s+)?(?:inline\s+)?(?:virtual\s+)?(?:\w+\s+)+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^;]*$/)))
                if(!line.match(/^\s*(if|for|while|switch|return|sizeof|typeof)/))
                    addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});

            // Swift: func name
            if((m=line.match(/(?:public|private|internal|fileprivate|open)?\s*(?:static\s+)?(?:class\s+)?func\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[<(]/)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});

            // Scala: def name
            if((m=line.match(/\bdef\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[(\[]/)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});

            // Elixir: def name or defp name
            if((m=line.match(/\bdefp?\s+([a-zA-Z_][a-zA-Z0-9_?!]*)/)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});

            // Lua: function name( or local function name(
            if((m=line.match(/(?:local\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_.:]*)\s*\(/)))
                addFn({name:m[1].split(/[.:]/).pop(),file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});

            // VBA: Sub Name() or Function Name()
            if((m=line.match(/(?:Public|Private|Friend)?\s*(?:Sub|Function)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/i)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});

            // Zig: fn name( or pub fn name(
            if((m=line.match(/(?:pub\s+)?fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});

            // V (Vlang): fn name( or pub fn name(
            if((m=line.match(/(?:pub\s+)?fn\s+(?:\([^)]+\)\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});

            // Nim: proc name( or func name( or method name(
            if((m=line.match(/(?:proc|func|method|template|macro|converter)\s+([a-zA-Z_][a-zA-Z0-9_`]*)\s*[*]?\s*\(/)))
                addFn({name:m[1].replace(/`/g,''),file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});

            // Crystal: def name or def self.name
            if((m=line.match(/^\s*def\s+(?:self\.)?([a-zA-Z_][a-zA-Z0-9_?!]*)/)))
                addFn({name:m[1],file:filename,line:lineNum,code:extractCode(lineNum),isTopLevel:true,type:'function'});
        });
    },

    parseAdaFile:function(content,filePath){
        var functions=[];
        var imports=[];

        var fnRegex=/\b(procedure|function)\s+(\w+)\s*(?:\([^)]*\))?\s*(?:return\s+\w+)?\s*is/gi;
        var match;
        while((match=fnRegex.exec(content))!==null){
            functions.push({
                name:match[2],
                type:match[1].toLowerCase(),
                line:content.slice(0,match.index).split('\n').length,
                isExported:!content.slice(0,match.index).includes('private')
            });
        }

        var withRegex=/^\s*with\s+([\w.]+)\s*;/gm;
        while((match=withRegex.exec(content))!==null){
            imports.push(match[1].replace(/\./g,'/'));
        }

        var sparkIssues=[];
        if(/Ada\.Unchecked_Conversion/.test(content))sparkIssues.push({type:'warning',msg:'Ada.Unchecked_Conversion — potential type safety issue'});
        if(/Ada\.Unchecked_Deallocation/.test(content))sparkIssues.push({type:'warning',msg:'Ada.Unchecked_Deallocation — potential memory safety issue'});

        return{functions:functions,imports:imports,sparkIssues:sparkIssues,language:'Ada'};
    },

    // Pre-compile regex patterns once per analysis run to avoid 500K+ compilations
    prepareCallPatterns:function(fnNames){
        var pats={};
        fnNames.forEach(function(fn){
            if(!fn||typeof fn!=='string'||fn.length<=1)return;
            var esc=fn.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
            pats[fn]={
                call:new RegExp('\\b'+esc+'\\s*\\(','g'),
                def:new RegExp('(?:function\\s+'+esc+'\\s*\\(|(?:async\\s+)?def\\s+'+esc+'\\s*\\(|class\\s+'+esc+'\\s*\\()','g'),
                ref:new RegExp('[,\\[:\\(]\\s*'+esc+'\\s*[,\\]\\)\\}]','g'),
                jsxTag:new RegExp('<\\/?\\s*'+esc+'[\\s>\\/{]','g'),
                jsxExpr:new RegExp('[{=]\\s*'+esc+'\\s*[}(,;\\s]','g'),
                vba:new RegExp('(?:Call\\s+|Application\\.Run\\s*["\'])'+esc+'(?:["\'])?\\s*\\(','gi'),
                pyDef:new RegExp('(?:(?:async\\s+)?def|class)\\s+'+esc+'\\s*[\\(:]','g'),
                pyDec:new RegExp('@'+esc+'\\b','g'),
                pyMethod:new RegExp('\\w+\\.'+esc+'\\s*\\(','g'),
                pyRef:new RegExp('[,\\[\\(=:\\{]\\s*'+esc+'\\s*[,\\]\\)\\n\\r}]','g'),
                pyRet:new RegExp('(?:return|yield)\\s+'+esc+'\\s*$','gm')
            };
        });
        return pats;
    },

    /**
     * Count how many times each named function is called/referenced in a file's content.
     * Uses tree-sitter AST for Python (if available) and regex fallback for all other languages.
     * Pre-compiled patterns should be passed when analyzing many files to avoid 500K+ RegExp compilations.
     * @param {string} content - raw file content
     * @param {string[]} fnNames - list of function names to look for
     * @param {string} definingFile - path of the file being analyzed (determines language)
     * @param {Array<{name:string, file:string, line:number}>} fnDefs - function definitions (to exclude self-definitions)
     * @param {Object} [precompiledPatterns] - result of prepareCallPatterns(fnNames); omit to auto-compile
     * @returns {Object<string, number>} fnName → call count
     */
    findCalls:function(content,fnNames,definingFile,fnDefs,precompiledPatterns){
        var calls={};
        var refs={};  // Functions used as callbacks/references without ()
        fnNames.forEach(function(fn){calls[fn]=0;refs[fn]=0;});

        // Build a set of definition lines to exclude
        var defLines={};
        if(fnDefs){
            fnDefs.forEach(function(fn){
                if(fn.file===definingFile){
                    defLines[fn.name]=fn.line;
                }
            });
        }

        // Detect file language from defining file extension
        var ext=definingFile?definingFile.split('.').pop().toLowerCase():'';
        var isPython=['py','pyw','pyi'].indexOf(ext)>=0;
        var isJS=['js','jsx','ts','tsx','mjs','cjs','vue','svelte'].indexOf(ext)>=0;
        var isVBA=['vba','bas','cls','xlsm','xlam'].indexOf(ext)>=0;

        // Python: try tree-sitter countCalls first, fall through to regex on failure
        if (isPython && _tsBundle) {
            try {
                var pyp = _tsBundle.getParser('python');
                var pye = _tsBundle.getExtractor('python');
                if (pyp && pye) {
                    var pyTree = pyp.parse(content);
                    try { return pye.countCalls(pyTree, new Set(fnNames)); }
                    finally { try { pyTree.delete(); } catch(_) {} }
                }
            } catch(e) { /* fall through */ }
        }

        // Python: fallback to token-level analysis with string/comment stripping
        if(isPython){
            // Fallback: token-level analysis with string/comment stripping
            var cleanContent=Parser.stripPythonNonCode(content);
            var wordSet=new Set(cleanContent.match(/\b[a-zA-Z_]\w*\b/g)||[]);
            var importText='';
            var multiImports=cleanContent.match(/from\s+\S+\s+import\s*\([\s\S]*?\)/g)||[];
            multiImports.forEach(function(imp){importText+=imp+'\n';});
            var singleImports=cleanContent.match(/^(?:from\s+\S+\s+import\s+[^(\n].+|import\s+.+)$/gm)||[];
            singleImports.forEach(function(imp){importText+=imp+'\n';});
            var pats=precompiledPatterns||Parser.prepareCallPatterns(fnNames);
            fnNames.forEach(function(fn){
                if(!wordSet.has(fn))return;
                if(!pats[fn])return;
                if(importText.match(new RegExp('\\b'+fn+'\\b'))){calls[fn]++;}
            });
            fnNames.forEach(function(fn){
                if(!wordSet.has(fn))return;
                var p=pats[fn];if(!p)return;
                var m=cleanContent.match(p.call);
                var callCount=m?m.length:0;
                var defMatch=cleanContent.match(p.pyDef);
                if(defMatch)callCount-=defMatch.length;
                var decMatch=cleanContent.match(p.pyDec);
                if(decMatch)callCount=Math.max(0,callCount)+(decMatch.length);
                var methodMatch=cleanContent.match(p.pyMethod);
                if(methodMatch)callCount+=methodMatch.length;
                var refMatch=cleanContent.match(p.pyRef);
                var refCount=refMatch?refMatch.length:0;
                var retMatch=cleanContent.match(p.pyRet);
                if(retMatch)refCount+=retMatch.length;
                calls[fn]=Math.max(0,callCount)+refCount;
            });
            return calls;
        }

        // Non-JS/Python: try tree-sitter countCalls
        if (_tsBundle && !isJS && !isVBA) {
            try {
                var tscLang = _tsBundle.detectLang(definingFile || '');
                if (tscLang && tscLang !== 'python') {
                    var tscp = _tsBundle.getParser(tscLang);
                    var tsce = _tsBundle.getExtractor(tscLang);
                    if (tscp && tsce) {
                        var tscTree = tscp.parse(content);
                        try { return tsce.countCalls(tscTree, new Set(fnNames)); }
                        finally { try { tscTree.delete(); } catch(_) {} }
                    }
                }
            } catch(e) { /* fall through to regex */ }
        }

        if(isJS&&typeof acorn!=='undefined'){
            try{
                // Use Babel (real parser) to handle JSX and TypeScript
                // Babel transforms JSX → React.createElement calls and strips TS types,
                // so acorn can parse the result into a proper AST for accurate call detection
                var jsContent=content;
                if(typeof Babel!=='undefined'){
                    try{
                        var babelPresets=['react'];
                        if(ext==='ts'||ext==='tsx')babelPresets.push('typescript');
                        var babelResult=Babel.transform(content,{
                            presets:babelPresets,
                            filename:definingFile||'file.js',
                            sourceType:'module',
                            retainLines:true
                        });
                        jsContent=babelResult.code;
                    }catch(babelErr){
                        // Babel failed, fall back to manual TypeScript stripping
                        jsContent=content
                            .replace(/:\s*[A-Za-z_$][\w$<>,\s|&\[\]]*(?=\s*[=,\)\}\];])/g,'')
                            .replace(/\bas\s+[A-Za-z_$][\w$<>,\s|&\[\]]*(?=\s*[,\)\}\];])/g,'')
                            .replace(/<[A-Za-z_$][\w$<>,\s|&\[\]]*>(?=\s*\()/g,'')
                            .replace(/^import\s+type\s+.*/gm,'')
                            .replace(/^export\s+type\s+.*/gm,'')
                            .replace(/^export\s+interface\s+.*/gm,'')
                            .replace(/interface\s+[A-Za-z_$][\w$]*\s*\{[^}]*\}/g,'')
                            .replace(/type\s+[A-Za-z_$][\w$]*\s*=\s*[^;]+;/g,'');
                    }
                }else{
                    jsContent=content
                        .replace(/:\s*[A-Za-z_$][\w$<>,\s|&\[\]]*(?=\s*[=,\)\}\];])/g,'')
                        .replace(/\bas\s+[A-Za-z_$][\w$<>,\s|&\[\]]*(?=\s*[,\)\}\];])/g,'')
                        .replace(/<[A-Za-z_$][\w$<>,\s|&\[\]]*>(?=\s*\()/g,'')
                        .replace(/^import\s+type\s+.*/gm,'')
                        .replace(/^export\s+type\s+.*/gm,'')
                        .replace(/^export\s+interface\s+.*/gm,'')
                        .replace(/interface\s+[A-Za-z_$][\w$]*\s*\{[^}]*\}/g,'')
                        .replace(/type\s+[A-Za-z_$][\w$]*\s*=\s*[^;]+;/g,'');
                }

                var ast=acorn.parse(jsContent,{
                    ecmaVersion:2022,
                    sourceType:'module',
                    allowHashBang:true,
                    allowAwaitOutsideFunction:true,
                    allowImportExportEverywhere:true,
                    locations:true,
                    tolerant:true
                });

                var fnSet=new Set(fnNames);

                function walk(node,inDeclaration){
                    if(!node||typeof node!=='object')return;

                    // Track if we're in a function declaration to skip counting the name
                    var isDecl=node.type==='FunctionDeclaration'||node.type==='VariableDeclarator';

                    // CallExpression: foo() or foo.bar()
                    if(node.type==='CallExpression'){
                        var callee=node.callee;
                        if(callee.type==='Identifier'&&fnSet.has(callee.name)){
                            var line=callee.loc?callee.loc.start.line:0;
                            // Don't count if this is the definition line
                            if(!defLines[callee.name]||defLines[callee.name]!==line){
                                calls[callee.name]++;
                            }
                        }
                        // Also check arguments for function references
                        node.arguments.forEach(function(arg){
                            if(arg.type==='Identifier'&&fnSet.has(arg.name)){
                                refs[arg.name]++;
                            }
                        });
                    }

                    // Function passed as reference (callback): arr.map(fn), addEventListener('click', fn)
                    if(node.type==='Identifier'&&fnSet.has(node.name)&&!inDeclaration){
                        // This is handled via parent context - check if parent is not a CallExpression callee
                        // refs tracking happens in CallExpression arguments above
                    }

                    // Array element or object property value containing function ref
                    if(node.type==='ArrayExpression'){
                        node.elements.forEach(function(el){
                            if(el&&el.type==='Identifier'&&fnSet.has(el.name)){
                                refs[el.name]++;
                            }
                        });
                    }
                    if(node.type==='Property'&&node.value&&node.value.type==='Identifier'&&fnSet.has(node.value.name)){
                        refs[node.value.name]++;
                    }

                    // Recurse
                    for(var key in node){
                        if(key==='loc'||key==='range'||key==='start'||key==='end')continue;
                        var child=node[key];
                        var nextInDecl=isDecl&&(key==='id'||key==='key');
                        if(Array.isArray(child)){
                            child.forEach(function(c){walk(c,nextInDecl);});
                        }else if(child&&typeof child==='object'&&child.type){
                            walk(child,nextInDecl);
                        }
                    }
                }

                walk(ast,false);

                // Combine calls and refs
                fnNames.forEach(function(fn){
                    calls[fn]=calls[fn]+(refs[fn]||0);
                });

                return calls;

            }catch(e){
                // Fall back to regex but be more careful
            }
        }

        // Fallback: regex-based but more careful
        // Build word set for fast pre-filtering (avoids creating regex for every function name)
        var wordSet=new Set(content.match(/\b[a-zA-Z_$]\w*\b/g)||[]);
        // Use pre-compiled patterns (avoids 500K+ RegExp compilations per analysis run)
        var pats=precompiledPatterns||Parser.prepareCallPatterns(fnNames);
        fnNames.forEach(function(fn){
            if(!wordSet.has(fn))return;
            var p=pats[fn];if(!p)return;
            var m=content.match(p.call);
            var callCount=m?m.length:0;
            var defMatch=content.match(p.def);
            if(defMatch)callCount-=defMatch.length;
            var refMatch=content.match(p.ref);
            var refCount=refMatch?refMatch.length:0;
            var vbaMatch=content.match(p.vba);
            if(vbaMatch)callCount+=vbaMatch.length;
            if(isJS){
                var jsxTagMatch=content.match(p.jsxTag);
                if(jsxTagMatch)refCount+=jsxTagMatch.length;
                var jsxExprMatch=content.match(p.jsxExpr);
                if(jsxExprMatch)refCount+=jsxExprMatch.length;
            }
            calls[fn]=Math.max(0,callCount)+refCount;
        });

        return calls;
    },

    /**
     * Parse manifests across a file list. Mirrors index.html Parser.parseManifests.
     * Returns deduped [{ecosystem, name, version, fromFile, source:'manifest'|'lockfile'}].
     * Ecosystems: npm, PyPI, Go, crates.io, Maven (matches OSV.dev).
     */
    parseManifests:function(files){
        if(!files||!files.length)return [];
        var result=[];
        // Per-directory lockMap so saas/package.json can't be resolved against browser-extension's lockfile.
        var lockMap={npm:{},cargo:{}};
        function dirOf(p){var i=p.lastIndexOf('/');return i<0?'':p.substring(0,i);}
        files.forEach(function(f){
            if(!f.content)return;
            var nm=f.name||'';
            if(nm==='package-lock.json'||f.path.endsWith('/package-lock.json')){
                var dir=dirOf(f.path);
                var sub=lockMap.npm[dir]=lockMap.npm[dir]||{};
                try{
                    var pl=JSON.parse(f.content);
                    if(pl.packages){
                        Object.entries(pl.packages).forEach(function(e){
                            if(!e[0])return;
                            var m=e[0].match(/node_modules\/((?:@[^/]+\/)?[^/]+)$/);
                            if(m&&e[1]&&e[1].version)sub[m[1]]=e[1].version;
                        });
                    }else if(pl.dependencies){
                        Object.entries(pl.dependencies).forEach(function(e){if(e[1]&&e[1].version)sub[e[0]]=e[1].version;});
                    }
                }catch(e){}
            }else if(nm==='Cargo.lock'||f.path.endsWith('/Cargo.lock')){
                var dir2=dirOf(f.path);
                var sub2=lockMap.cargo[dir2]=lockMap.cargo[dir2]||{};
                f.content.split(/\[\[package\]\]/).forEach(function(blk){
                    var n=blk.match(/^name\s*=\s*"([^"]+)"/m);
                    var v=blk.match(/^version\s*=\s*"([^"]+)"/m);
                    if(n&&v)sub2[n[1]]=v[1];
                });
            }
        });
        files.forEach(function(f){
            if(!f.content)return;
            var nm=f.name||'';
            // Skip test fixtures regardless of manifest type — they often pin deliberately-old/vulnerable versions
            if(/(?:^|\/)(?:tests?\/fixtures?|__fixtures__|test-fixtures?|test-data)\//.test(f.path))return;
            if(nm==='package.json'||f.path.endsWith('/package.json')){
                if(/(?:^|\/)node_modules\//.test(f.path))return;
                var npmLock=lockMap.npm[dirOf(f.path)]||{};
                try{
                    var pkg=JSON.parse(f.content);
                    var deps=Object.assign({},pkg.dependencies||{},pkg.devDependencies||{});
                    Object.entries(deps).forEach(function(e){
                        var pname=e[0];
                        var rawVer=String(e[1]).replace(/[\^~>=<\s]/g,'').replace(/^v/,'');
                        var ver=npmLock[pname]||rawVer;
                        if(!ver||ver.startsWith('file:')||ver.startsWith('link:')||ver.startsWith('git')||ver.startsWith('http'))return;
                        if(ver.indexOf(' ')>=0||ver==='*'||ver==='latest')return;
                        result.push({ecosystem:'npm',name:pname,version:ver,fromFile:f.path,source:npmLock[pname]?'lockfile':'manifest'});
                    });
                }catch(e){}
            }else if(nm==='requirements.txt'||f.path.endsWith('/requirements.txt')){
                f.content.split('\n').forEach(function(line){
                    line=line.trim().split('#')[0].trim();
                    if(!line||line.startsWith('-'))return;
                    var m=line.match(/^([A-Za-z0-9_.\-]+)\s*(?:\[[^\]]*\])?\s*([=<>!~]=?)\s*([^\s;,]+)/);
                    if(m&&m[2]==='==')result.push({ecosystem:'PyPI',name:m[1],version:m[3],fromFile:f.path,source:'manifest'});
                });
            }else if(nm==='pyproject.toml'||f.path.endsWith('/pyproject.toml')){
                var blk=f.content.match(/\[(?:tool\.poetry\.)?dependencies\]([\s\S]*?)(?:\n\[|$)/);
                if(blk){
                    blk[1].split('\n').forEach(function(line){
                        line=line.trim();
                        if(!line||line.startsWith('#'))return;
                        var m=line.match(/^([A-Za-z0-9_.\-]+)\s*=\s*"([^"]+)"/);
                        if(m){var ver=m[2].replace(/[\^~>=<\s]/g,'');if(ver&&ver!=='*'&&m[1]!=='python')result.push({ecosystem:'PyPI',name:m[1],version:ver,fromFile:f.path,source:'manifest'});}
                    });
                }
            }else if(nm==='go.mod'||f.path.endsWith('/go.mod')){
                var inReq=false;
                f.content.split('\n').forEach(function(line){
                    var t=line.trim();
                    if(!t||t.startsWith('//'))return;
                    if(/^require\s*\($/.test(t)){inReq=true;return;}
                    if(t==='){'||t===')'){inReq=false;return;}
                    var rl=t.replace(/^require\s+/,'');
                    var m=rl.match(/^([^\s]+)\s+(v[^\s]+)/);
                    if(m&&m[1]!=='module'&&m[1]!=='go'&&m[1].indexOf('.')>0)result.push({ecosystem:'Go',name:m[1],version:m[2],fromFile:f.path,source:'manifest'});
                });
            }else if(nm==='Cargo.toml'||f.path.endsWith('/Cargo.toml')){
                var cargoLock=lockMap.cargo[dirOf(f.path)]||{};
                var inDeps2=false;
                f.content.split('\n').forEach(function(line){
                    var t=line.trim();
                    if(/^\[/.test(t)){inDeps2=/dependencies\]$/.test(t);return;}
                    if(!inDeps2)return;
                    var m=t.match(/^([A-Za-z0-9_\-]+)\s*=\s*(?:"([^"]+)"|.*version\s*=\s*"([^"]+)")/);
                    if(m){var rawVer=(m[2]||m[3]||'').replace(/[\^~>=<\s]/g,'');var ver=cargoLock[m[1]]||rawVer;if(ver&&ver!=='*')result.push({ecosystem:'crates.io',name:m[1],version:ver,fromFile:f.path,source:cargoLock[m[1]]?'lockfile':'manifest'});}
                });
            }else if(nm==='pom.xml'||f.path.endsWith('/pom.xml')){
                var depRe=/<dependency>([\s\S]*?)<\/dependency>/g;
                var dm;
                while((dm=depRe.exec(f.content))!==null){
                    var b=dm[1];
                    var gid=b.match(/<groupId>\s*([^<]+?)\s*<\/groupId>/);
                    var aid=b.match(/<artifactId>\s*([^<]+?)\s*<\/artifactId>/);
                    var ver=b.match(/<version>\s*([^<]+?)\s*<\/version>/);
                    if(gid&&aid&&ver&&!ver[1].includes('${'))result.push({ecosystem:'Maven',name:gid[1]+':'+aid[1],version:ver[1],fromFile:f.path,source:'manifest'});
                }
            }
        });
        var seen={};
        return result.filter(function(p){var k=p.ecosystem+'|'+p.name+'|'+p.version;if(seen[k])return false;seen[k]=true;return true;});
    },

    /** Query OSV.dev for a list of {ecosystem,name,version} packages. Uses Node fetch. */
    queryOSV:async function(packages){
        if(!packages||!packages.length)return [];
        var BATCH=1000;
        var hits=[];
        for(var i=0;i<packages.length;i+=BATCH){
            var chunk=packages.slice(i,i+BATCH);
            var queries=chunk.map(function(p){return {package:{name:p.name,ecosystem:p.ecosystem},version:p.version};});
            try{
                var resp=await fetch('https://api.osv.dev/v1/querybatch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({queries:queries})});
                if(!resp.ok)continue;
                var json=await resp.json();
                var rs=json.results||[];
                for(var j=0;j<rs.length;j++){
                    var r=rs[j]||{};
                    if(r.vulns&&r.vulns.length){
                        var p=chunk[j];
                        hits.push({ecosystem:p.ecosystem,name:p.name,version:p.version,fromFile:p.fromFile,vulnIds:r.vulns.map(function(v){return v.id;})});
                    }
                }
            }catch(e){/* degrade */}
        }
        var allIds={};hits.forEach(function(h){h.vulnIds.forEach(function(id){allIds[id]=1;});});
        var ids=Object.keys(allIds);
        var detail={};
        var CONC=10;
        for(var k=0;k<ids.length;k+=CONC){
            var slice=ids.slice(k,k+CONC);
            var ps=slice.map(function(id){return fetch('https://api.osv.dev/v1/vulns/'+encodeURIComponent(id)).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});});
            var rs2=await Promise.all(ps);
            for(var l=0;l<slice.length;l++){if(rs2[l])detail[slice[l]]=rs2[l];}
        }
        var self2=Parser;
        return hits.map(function(h){
            return {ecosystem:h.ecosystem,name:h.name,version:h.version,fromFile:h.fromFile,vulns:h.vulnIds.map(function(id){
                var d=detail[id]||{};
                return {id:id,summary:d.summary||d.details||'',severity:self2._osvSeverity(d),fixed:self2._osvFixedVersion(d,h.ecosystem,h.name),url:'https://osv.dev/vulnerability/'+encodeURIComponent(id)};
            })};
        });
    },
    _osvSeverity:function(vuln){
        if(Array.isArray(vuln.severity)){
            for(var i=0;i<vuln.severity.length;i++){
                var s=vuln.severity[i];
                if(s.type&&(String(s.type).includes('CVSS_V3')||String(s.type).includes('CVSS_V4'))&&s.score){
                    var num=parseFloat(s.score);
                    var score=isNaN(num)?Parser._cvssVectorToScore(s.score):num;
                    if(!isNaN(score)){if(score>=9)return 'critical';if(score>=7)return 'high';if(score>=4)return 'medium';return 'low';}
                }
            }
        }
        if(vuln.database_specific&&vuln.database_specific.severity)return String(vuln.database_specific.severity).toLowerCase();
        return 'medium';
    },
    _cvssVectorToScore:function(vec){
        var v=String(vec);
        if(/AV:N/i.test(v)&&/AC:L/i.test(v)&&/C:H/i.test(v)&&/I:H/i.test(v)&&/A:H/i.test(v))return 9.8;
        if(/AV:N/i.test(v)&&/AC:L/i.test(v)&&/[CIA]:H/i.test(v))return 8.0;
        if(/[CIA]:H/i.test(v))return 7.0;
        if(/[CIA]:[LM]/i.test(v))return 5.0;
        return 3.0;
    },
    _osvFixedVersion:function(vuln,ecosystem,name){
        if(!vuln.affected)return null;
        for(var i=0;i<vuln.affected.length;i++){
            var a=vuln.affected[i];
            if(a.package&&a.package.ecosystem===ecosystem&&a.package.name===name&&a.ranges){
                for(var j=0;j<a.ranges.length;j++){
                    if(a.ranges[j].events){
                        for(var k=0;k<a.ranges[j].events.length;k++){
                            if(a.ranges[j].events[k].fixed)return a.ranges[j].events[k].fixed;
                        }
                    }
                }
            }
        }
        return null;
    },
    detectVulnerabilities:async function(files){
        var packages=this.parseManifests(files);
        if(!packages.length)return {packages:[],vulnerablePackages:[],totalVulns:0,severityCounts:{critical:0,high:0,medium:0,low:0}};
        var vulnerablePackages=await this.queryOSV(packages);
        var sev={critical:0,high:0,medium:0,low:0};
        var total=0;
        vulnerablePackages.forEach(function(p){p.vulns.forEach(function(v){sev[v.severity]=(sev[v.severity]||0)+1;total++;});});
        return {packages:packages,vulnerablePackages:vulnerablePackages,totalVulns:total,severityCounts:sev};
    },

    // Parse dependency files into [{name, version, type}]
    parseDependencyFile:function(filename, content){
        var deps=[];
        if(filename==='requirements.txt'||filename.endsWith('/requirements.txt')){
            content.split('\n').forEach(function(line){
                line=line.trim();if(!line||line.startsWith('#'))return;
                var m=line.match(/^([A-Za-z0-9_.\-]+)\s*(?:[=<>!~^]+\s*([^\s;#,]+))?/);
                if(m)deps.push({name:m[1],version:m[2]||'*',type:'python'});
            });
        } else if(filename==='Cargo.toml'||filename.endsWith('/Cargo.toml')){
            var inDeps=false;
            content.split('\n').forEach(function(line){
                if(/^\[.*dependencies\]/.test(line.trim())){inDeps=true;return;}
                if(/^\[/.test(line.trim())&&!/dependencies/.test(line)){inDeps=false;return;}
                if(!inDeps)return;
                var m=line.match(/^(\w[\w\-_]*)\s*=\s*(?:"([^"]+)"|.*version\s*=\s*"([^"]+)")/);
                if(m)deps.push({name:m[1],version:m[2]||m[3]||'*',type:'rust'});
            });
        } else if(filename==='go.mod'||filename.endsWith('/go.mod')){
            content.split('\n').forEach(function(line){
                line=line.trim();
                var m=line.match(/^([^\s]+)\s+(v[^\s]+)/);
                if(m&&m[1]!=='module'&&m[1]!=='go')deps.push({name:m[1],version:m[2],type:'go'});
            });
        } else if(filename==='pyproject.toml'||filename.endsWith('/pyproject.toml')){
            var inPyDeps=false;
            content.split('\n').forEach(function(line){
                if(/^\[tool\.poetry\.dependencies\]|\[project\.dependencies\]/.test(line.trim())){inPyDeps=true;return;}
                if(/^\[/.test(line.trim())&&line.trim()!=='[project.dependencies]'&&!line.includes('poetry.dependencies')){inPyDeps=false;return;}
                if(!inPyDeps)return;
                var m=line.match(/^([A-Za-z0-9_.\-]+)\s*=\s*["']?([^\s"',\]]+)["']?/);
                if(m&&m[1]!=='python')deps.push({name:m[1],version:m[2]||'*',type:'python'});
            });
        }
        return deps;
    }
};

module.exports = { Parser, THRESHOLDS };
