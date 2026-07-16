// Tests for the multimodal ingestion + semantic knowledge-graph subsystem.
// Fully deterministic and network-free: embeddings disabled, LLM disabled,
// Ollama probe pointed at a dead port.

process.env.GRASP_DISABLE_EMBEDDINGS = '1';
process.env.OLLAMA_HOST = 'http://127.0.0.1:1'; // force "no local Ollama"

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

import { chunkText, kindForPath, isIngestable, ingestPath } from '../src/ingest/index';
import { htmlToText, decodeEntities } from '../src/ingest/html';
import { KnowledgeGraphStore } from '../src/semantic/kg-store';
import { extractToGraph } from '../src/semantic/extract';
import { ask, tracePath, explainEntity } from '../src/semantic/query';
import { exportKnowledgeGraph } from '../src/semantic/kg-export';
import { availableProviders, resolveProvider } from '../src/llm/provider';

describe('ingest — file kind detection', () => {
  test('maps extensions to kinds', () => {
    expect(kindForPath('a.pdf')).toBe('pdf');
    expect(kindForPath('a.docx')).toBe('docx');
    expect(kindForPath('a.xlsx')).toBe('xlsx');
    expect(kindForPath('a.png')).toBe('image');
    expect(kindForPath('a.mp4')).toBe('video');
    expect(kindForPath('a.mp3')).toBe('audio');
    expect(kindForPath('a.md')).toBe('markdown');
    expect(kindForPath('a.unknownext')).toBe('text');
  });

  test('isIngestable recognises URLs and known extensions', () => {
    expect(isIngestable('https://example.com')).toBe(true);
    expect(isIngestable('/tmp/report.pdf')).toBe(true);
    expect(isIngestable('/tmp/thing.qmd')).toBe(true);
    expect(isIngestable('/tmp/binary.unknownext')).toBe(false);
  });
});

describe('ingest — chunking', () => {
  test('short text yields a single chunk', () => {
    const chunks = chunkText('d', 'hello world');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].id).toBe('d#0');
  });

  test('long text splits into multiple ordered chunks', () => {
    const para = 'word '.repeat(400); // ~2000 chars
    const big = [para, para, para].join('\n\n');
    const chunks = chunkText('d', big, { maxTokens: 200 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => expect(c.index).toBe(i));
  });
});

describe('ingest — html extraction', () => {
  test('decodeEntities handles named and numeric entities', () => {
    expect(decodeEntities('a &amp; b &lt; c &#65;')).toBe('a & b < c A');
  });

  test('htmlToText strips script/style, keeps text and title', () => {
    const html = '<html><head><title>My Doc</title><style>.x{}</style></head><body><script>evil()</script><h1>Hi</h1><p>Alpha</p><p>Beta</p></body></html>';
    const { text, title } = htmlToText(html);
    expect(title).toBe('My Doc');
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
    expect(text).not.toContain('evil');
    expect(text).not.toContain('.x{}');
  });
});

describe('llm provider — selection (no network)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GRASP_LLM_PROVIDER']) delete process.env[k];
    Object.assign(process.env, { GRASP_DISABLE_EMBEDDINGS: '1', OLLAMA_HOST: 'http://127.0.0.1:1' });
  });
  afterAll(() => { process.env = saved; });

  test('no creds + no ollama → null / empty', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(await availableProviders()).toEqual([]);
    expect(await resolveProvider()).toBeNull();
  });

  test('OPENAI_API_KEY makes openai available and resolvable', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(await availableProviders()).toContain('openai');
    const p = await resolveProvider();
    expect(p?.name).toBe('openai');
  });

  test('explicit provider config overrides env', async () => {
    process.env.ANTHROPIC_API_KEY = 'x';
    const p = await resolveProvider({ provider: 'openai', apiKey: 'sk-test' });
    expect(p?.name).toBe('openai');
  });
});

describe('knowledge graph — end to end (deterministic)', () => {
  let dir: string;
  let store: KnowledgeGraphStore;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-test-'));
    const md = path.join(dir, 'doc.md');
    fs.writeFileSync(
      md,
      '# Project Atlas\n\nAtlas is maintained by Team Nova. Team Nova uses Postgres and Redis.\n\n## Services\n\nThe Billing Service depends on Postgres. Postgres stores Orders.',
    );
    store = new KnowledgeGraphStore(dir);
    const doc = await ingestPath(md, {});
    await extractToGraph(doc, store, { disableLlm: true, embedChunks: false });
  });

  afterAll(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('extraction populated entities and INFERRED relations', () => {
    const s = store.stats();
    expect(s.docs).toBe(1);
    expect(s.entities).toBeGreaterThan(3);
    expect(s.relations).toBeGreaterThan(3);
    expect(s.extracted).toBe(0); // deterministic mode is all INFERRED
    expect(s.inferred).toBe(s.relations);
  });

  test('findEntities locates a known entity', () => {
    const matches = store.findEntities('Postgres');
    expect(matches.some((e) => /postgres/i.test(e.name))).toBe(true);
  });

  test('ask returns retrieval-mode answer with citations', async () => {
    const res = await ask('What does the Billing Service depend on?', store, { disableLlm: true });
    expect(res.mode).toBe('retrieval');
    expect(res.citations.length).toBeGreaterThan(0);
    expect(res.answer.length).toBeGreaterThan(0);
  });

  test('tracePath connects entities within the same document', () => {
    const res = tracePath('Atlas', 'Redis', store);
    expect(res.found).toBe(true);
    expect(res.path[0]).toMatch(/atlas/i);
  });

  test('explainEntity returns facts for a known entity', () => {
    const res = explainEntity('Postgres', store);
    expect(res.found).toBe(true);
    expect(res.facts.length).toBeGreaterThan(0);
  });

  test('export produces valid cypher / json / graphml / mermaid', () => {
    expect(exportKnowledgeGraph(store, 'cypher')).toContain('CREATE (');
    const json = JSON.parse(exportKnowledgeGraph(store, 'json'));
    expect(Array.isArray(json.nodes)).toBe(true);
    expect(json.nodes.length).toBeGreaterThan(0);
    expect(exportKnowledgeGraph(store, 'graphml')).toContain('<graphml');
    expect(exportKnowledgeGraph(store, 'mermaid')).toContain('graph LR');
  });
});
