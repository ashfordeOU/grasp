import { buildServiceGraph } from '../src/distributed.js';

test('buildServiceGraph merges service traces into graph', () => {
  const traces = [
    { service: 'auth-service', calls: [{ to: 'user-service', count: 150 }] },
    { service: 'user-service', calls: [] },
  ];
  const graph = buildServiceGraph(traces);
  expect(graph.services).toHaveLength(2);
  expect(graph.edges[0]).toMatchObject({ from: 'auth-service', to: 'user-service', weight: 150 });
});

test('buildServiceGraph returns empty graph for no traces', () => {
  const graph = buildServiceGraph([]);
  expect(graph.services).toHaveLength(0);
  expect(graph.edges).toHaveLength(0);
});
