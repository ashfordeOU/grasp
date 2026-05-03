// =====================================================================
// graph-analytics.ts — public barrel for the five graph-analytics
// primitives. Each primitive lives in its own focused module so this
// file stays under the high-complexity threshold Grasp's analyzer flags.
//
// Each primitive computes over `result.files` and `result.connections`
// without touching Kuzu. Each returns a markdown report + structured
// payload, ready to be wrapped by an MCP tool.
// =====================================================================

export { hubNodes, type HubRow, type HubNodesReport } from './graph-hubs.js';
export { bridgeNodes, type BridgeRow, type BridgeNodesReport } from './graph-bridges.js';
export { surprisingConnections, type SurprisingRow, type SurprisingConnectionsReport } from './graph-surprising.js';
export { knowledgeGaps, type KnowledgeGapsReport } from './graph-knowledge-gaps.js';
export { suggestedQuestions, type SuggestedQuestion, type SuggestedQuestionsReport } from './graph-suggested-questions.js';
