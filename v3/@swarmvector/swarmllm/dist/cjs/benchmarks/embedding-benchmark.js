"use strict";
/**
 * Embedding Quality Benchmark for RuvLTRA Models
 *
 * Tests embedding quality for Claude Code use cases:
 * - Code similarity detection
 * - Task clustering
 * - Semantic search accuracy
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLUSTER_TEST_CASES = exports.SEARCH_TEST_CASES = exports.SIMILARITY_TEST_PAIRS = void 0;
exports.isCorrectSimilarity = isCorrectSimilarity;
exports.calculateMRR = calculateMRR;
exports.calculateNDCG = calculateNDCG;
exports.calculateSilhouette = calculateSilhouette;
exports.runEmbeddingBenchmark = runEmbeddingBenchmark;
exports.formatEmbeddingResults = formatEmbeddingResults;
/**
 * Ground truth similarity pairs for testing
 * Tests whether embeddings correctly capture semantic similarity
 */
exports.SIMILARITY_TEST_PAIRS = [
    // === HIGH SIMILARITY (same concept, different wording) ===
    { id: 'H001', text1: 'implement user authentication', text2: 'create login functionality', similarity: 'high', category: 'code-task' },
    { id: 'H002', text1: 'write unit tests for the API', text2: 'create test cases for REST endpoints', similarity: 'high', category: 'code-task' },
    { id: 'H003', text1: 'fix the null pointer exception', text2: 'resolve the NullPointerException bug', similarity: 'high', category: 'debugging' },
    { id: 'H004', text1: 'optimize database queries', text2: 'improve SQL query performance', similarity: 'high', category: 'performance' },
    { id: 'H005', text1: 'deploy to production', text2: 'release to prod environment', similarity: 'high', category: 'devops' },
    { id: 'H006', text1: 'refactor the legacy code', text2: 'restructure old codebase', similarity: 'high', category: 'refactoring' },
    { id: 'H007', text1: 'add error handling', text2: 'implement exception handling', similarity: 'high', category: 'code-task' },
    { id: 'H008', text1: 'create REST API endpoint', text2: 'build HTTP API route', similarity: 'high', category: 'code-task' },
    { id: 'H009', text1: 'check for SQL injection', text2: 'audit for SQLi vulnerabilities', similarity: 'high', category: 'security' },
    { id: 'H010', text1: 'document the API', text2: 'write API documentation', similarity: 'high', category: 'documentation' },
    // Code snippets - same functionality
    { id: 'H011', text1: 'function add(a, b) { return a + b; }', text2: 'const sum = (x, y) => x + y;', similarity: 'high', category: 'code-snippet' },
    { id: 'H012', text1: 'for (let i = 0; i < arr.length; i++)', text2: 'arr.forEach((item, index) => {})', similarity: 'high', category: 'code-snippet' },
    { id: 'H013', text1: 'async function fetchData() { await fetch(url); }', text2: 'const getData = async () => { await axios.get(url); }', similarity: 'high', category: 'code-snippet' },
    // === MEDIUM SIMILARITY (related but different) ===
    { id: 'M001', text1: 'implement user authentication', text2: 'create user registration', similarity: 'medium', category: 'code-task' },
    { id: 'M002', text1: 'write unit tests', text2: 'write integration tests', similarity: 'medium', category: 'testing' },
    { id: 'M003', text1: 'fix the bug in checkout', text2: 'debug the payment flow', similarity: 'medium', category: 'debugging' },
    { id: 'M004', text1: 'optimize frontend performance', text2: 'improve backend response time', similarity: 'medium', category: 'performance' },
    { id: 'M005', text1: 'deploy to staging', text2: 'deploy to production', similarity: 'medium', category: 'devops' },
    { id: 'M006', text1: 'React component', text2: 'Vue component', similarity: 'medium', category: 'code-snippet' },
    { id: 'M007', text1: 'PostgreSQL query', text2: 'MySQL query', similarity: 'medium', category: 'code-snippet' },
    { id: 'M008', text1: 'REST API', text2: 'GraphQL API', similarity: 'medium', category: 'code-task' },
    { id: 'M009', text1: 'Node.js server', text2: 'Python Flask server', similarity: 'medium', category: 'code-snippet' },
    { id: 'M010', text1: 'add caching layer', text2: 'implement rate limiting', similarity: 'medium', category: 'performance' },
    // === LOW SIMILARITY (same domain, different task) ===
    { id: 'L001', text1: 'implement authentication', text2: 'write documentation', similarity: 'low', category: 'code-task' },
    { id: 'L002', text1: 'fix bug', text2: 'add new feature', similarity: 'low', category: 'code-task' },
    { id: 'L003', text1: 'optimize query', text2: 'review pull request', similarity: 'low', category: 'mixed' },
    { id: 'L004', text1: 'deploy application', text2: 'design architecture', similarity: 'low', category: 'mixed' },
    { id: 'L005', text1: 'frontend React code', text2: 'backend database migration', similarity: 'low', category: 'code-snippet' },
    { id: 'L006', text1: 'security audit', text2: 'performance benchmark', similarity: 'low', category: 'mixed' },
    { id: 'L007', text1: 'write unit tests', text2: 'create CI/CD pipeline', similarity: 'low', category: 'mixed' },
    { id: 'L008', text1: 'CSS styling', text2: 'database schema', similarity: 'low', category: 'code-snippet' },
    // === NO SIMILARITY (unrelated) ===
    { id: 'N001', text1: 'implement user login', text2: 'the weather is nice today', similarity: 'none', category: 'unrelated' },
    { id: 'N002', text1: 'fix JavaScript bug', text2: 'recipe for chocolate cake', similarity: 'none', category: 'unrelated' },
    { id: 'N003', text1: 'deploy Kubernetes cluster', text2: 'book a flight to Paris', similarity: 'none', category: 'unrelated' },
    { id: 'N004', text1: 'optimize SQL query', text2: 'learn to play guitar', similarity: 'none', category: 'unrelated' },
    { id: 'N005', text1: 'const x = 42;', text2: 'roses are red violets are blue', similarity: 'none', category: 'unrelated' },
];
exports.SEARCH_TEST_CASES = [
    {
        id: 'S001',
        query: 'how to implement user authentication in Node.js',
        documents: [
            { text: 'Implementing JWT authentication in Express.js with passport', relevance: 3 },
            { text: 'Node.js login system with bcrypt password hashing', relevance: 3 },
            { text: 'Building a React login form component', relevance: 2 },
            { text: 'PostgreSQL user table schema design', relevance: 1 },
            { text: 'How to deploy Docker containers', relevance: 0 },
        ],
    },
    {
        id: 'S002',
        query: 'fix memory leak in JavaScript',
        documents: [
            { text: 'Debugging memory leaks with Chrome DevTools heap snapshots', relevance: 3 },
            { text: 'Common causes of memory leaks in Node.js applications', relevance: 3 },
            { text: 'JavaScript garbage collection explained', relevance: 2 },
            { text: 'Optimizing React component re-renders', relevance: 1 },
            { text: 'CSS flexbox layout tutorial', relevance: 0 },
        ],
    },
    {
        id: 'S003',
        query: 'database migration best practices',
        documents: [
            { text: 'Schema migration strategies for zero-downtime deployments', relevance: 3 },
            { text: 'Using Prisma migrate for PostgreSQL schema changes', relevance: 3 },
            { text: 'Database backup and recovery procedures', relevance: 2 },
            { text: 'SQL query optimization techniques', relevance: 1 },
            { text: 'React state management with Redux', relevance: 0 },
        ],
    },
    {
        id: 'S004',
        query: 'write unit tests for React components',
        documents: [
            { text: 'Testing React components with Jest and React Testing Library', relevance: 3 },
            { text: 'Snapshot testing for UI components', relevance: 3 },
            { text: 'Mocking API calls in frontend tests', relevance: 2 },
            { text: 'End-to-end testing with Cypress', relevance: 1 },
            { text: 'Kubernetes pod configuration', relevance: 0 },
        ],
    },
    {
        id: 'S005',
        query: 'optimize API response time',
        documents: [
            { text: 'Implementing Redis caching for API endpoints', relevance: 3 },
            { text: 'Database query optimization with indexes', relevance: 3 },
            { text: 'Using CDN for static asset delivery', relevance: 2 },
            { text: 'Load balancing strategies for microservices', relevance: 2 },
            { text: 'Writing clean JavaScript code', relevance: 0 },
        ],
    },
];
/**
 * Cluster test cases - items that should cluster together
 */
exports.CLUSTER_TEST_CASES = [
    {
        id: 'CL001',
        expectedCluster: 'authentication',
        items: [
            'implement user login',
            'add JWT token validation',
            'create password reset flow',
            'implement OAuth integration',
            'add two-factor authentication',
        ],
    },
    {
        id: 'CL002',
        expectedCluster: 'testing',
        items: [
            'write unit tests',
            'add integration tests',
            'create E2E test suite',
            'improve test coverage',
            'add snapshot tests',
        ],
    },
    {
        id: 'CL003',
        expectedCluster: 'database',
        items: [
            'optimize SQL queries',
            'add database indexes',
            'create migration script',
            'implement connection pooling',
            'design schema for users table',
        ],
    },
    {
        id: 'CL004',
        expectedCluster: 'frontend',
        items: [
            'build React component',
            'add CSS styling',
            'implement responsive design',
            'create form validation',
            'add loading spinner',
        ],
    },
    {
        id: 'CL005',
        expectedCluster: 'devops',
        items: [
            'set up CI/CD pipeline',
            'configure Kubernetes deployment',
            'create Docker container',
            'add monitoring alerts',
            'implement auto-scaling',
        ],
    },
];
/**
 * Expected similarity score ranges
 */
const SIMILARITY_THRESHOLDS = {
    high: { min: 0.7, max: 1.0 },
    medium: { min: 0.4, max: 0.7 },
    low: { min: 0.2, max: 0.4 },
    none: { min: 0.0, max: 0.2 },
};
/**
 * Check if computed similarity matches expected category
 */
function isCorrectSimilarity(expected, computed) {
    const threshold = SIMILARITY_THRESHOLDS[expected];
    return computed >= threshold.min && computed <= threshold.max;
}
/**
 * Calculate Mean Reciprocal Rank for search results
 */
function calculateMRR(rankings) {
    let sumRR = 0;
    for (const ranking of rankings) {
        const firstRelevantIdx = ranking.findIndex(r => r.relevant);
        if (firstRelevantIdx >= 0) {
            sumRR += 1 / (firstRelevantIdx + 1);
        }
    }
    return sumRR / rankings.length;
}
/**
 * Calculate NDCG for search results
 */
function calculateNDCG(results, idealOrder) {
    const dcg = results.reduce((sum, r, i) => {
        return sum + (Math.pow(2, r.relevance) - 1) / Math.log2(i + 2);
    }, 0);
    const idcg = idealOrder.reduce((sum, r, i) => {
        return sum + (Math.pow(2, r.relevance) - 1) / Math.log2(i + 2);
    }, 0);
    return idcg > 0 ? dcg / idcg : 0;
}
/**
 * Calculate silhouette score for clustering
 */
function calculateSilhouette(embeddings, labels) {
    // Simplified silhouette calculation
    const n = embeddings.length;
    if (n < 2)
        return 0;
    let totalSilhouette = 0;
    for (let i = 0; i < n; i++) {
        const cluster = labels[i];
        // Calculate mean intra-cluster distance (a)
        let intraSum = 0;
        let intraCount = 0;
        for (let j = 0; j < n; j++) {
            if (i !== j && labels[j] === cluster) {
                intraSum += euclideanDistance(embeddings[i], embeddings[j]);
                intraCount++;
            }
        }
        const a = intraCount > 0 ? intraSum / intraCount : 0;
        // Calculate min mean inter-cluster distance (b)
        const otherClusters = [...new Set(labels)].filter(c => c !== cluster);
        let minInterMean = Infinity;
        for (const otherCluster of otherClusters) {
            let interSum = 0;
            let interCount = 0;
            for (let j = 0; j < n; j++) {
                if (labels[j] === otherCluster) {
                    interSum += euclideanDistance(embeddings[i], embeddings[j]);
                    interCount++;
                }
            }
            if (interCount > 0) {
                minInterMean = Math.min(minInterMean, interSum / interCount);
            }
        }
        const b = minInterMean === Infinity ? 0 : minInterMean;
        // Silhouette for this point
        const s = Math.max(a, b) > 0 ? (b - a) / Math.max(a, b) : 0;
        totalSilhouette += s;
    }
    return totalSilhouette / n;
}
function euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
}
/**
 * Run the embedding benchmark
 */
function runEmbeddingBenchmark(embedder, similarityFn) {
    const similarityResults = [];
    const latencies = [];
    // Test similarity pairs
    for (const pair of exports.SIMILARITY_TEST_PAIRS) {
        const start = performance.now();
        const emb1 = embedder(pair.text1);
        const emb2 = embedder(pair.text2);
        const score = similarityFn(emb1, emb2);
        const latencyMs = performance.now() - start;
        latencies.push(latencyMs);
        similarityResults.push({
            pairId: pair.id,
            expectedSimilarity: pair.similarity,
            computedScore: score,
            correct: isCorrectSimilarity(pair.similarity, score),
            latencyMs,
        });
    }
    // Calculate similarity accuracy
    const correctSimilarity = similarityResults.filter(r => r.correct).length;
    const similarityAccuracy = correctSimilarity / similarityResults.length;
    // Accuracy by category
    const categories = [...new Set(exports.SIMILARITY_TEST_PAIRS.map(p => p.category))];
    const similarityByCategory = {};
    for (const cat of categories) {
        const catResults = similarityResults.filter((r, i) => exports.SIMILARITY_TEST_PAIRS[i].category === cat);
        similarityByCategory[cat] = catResults.filter(r => r.correct).length / catResults.length;
    }
    // Test search quality (MRR and NDCG)
    const searchRankings = [];
    let totalNDCG = 0;
    for (const testCase of exports.SEARCH_TEST_CASES) {
        const queryEmb = embedder(testCase.query);
        const docScores = testCase.documents.map(doc => ({
            ...doc,
            score: similarityFn(queryEmb, embedder(doc.text)),
        }));
        // Sort by computed score
        const sorted = [...docScores].sort((a, b) => b.score - a.score);
        // For MRR
        searchRankings.push(sorted.map(d => ({ relevant: d.relevance >= 2 })));
        // For NDCG
        const idealOrder = [...testCase.documents].sort((a, b) => b.relevance - a.relevance);
        totalNDCG += calculateNDCG(sorted, idealOrder);
    }
    const searchMRR = calculateMRR(searchRankings);
    const searchNDCG = totalNDCG / exports.SEARCH_TEST_CASES.length;
    // Test clustering
    const allClusterItems = [];
    exports.CLUSTER_TEST_CASES.forEach((tc, clusterIdx) => {
        tc.items.forEach(item => {
            allClusterItems.push({ text: item, cluster: clusterIdx });
        });
    });
    const clusterEmbeddings = allClusterItems.map(item => embedder(item.text));
    const clusterLabels = allClusterItems.map(item => item.cluster);
    const silhouetteScore = calculateSilhouette(clusterEmbeddings, clusterLabels);
    // Calculate cluster purity (how well items stay in their expected cluster)
    // Using simple nearest-neighbor classification
    let correctCluster = 0;
    for (let i = 0; i < clusterEmbeddings.length; i++) {
        let nearestIdx = -1;
        let nearestDist = Infinity;
        for (let j = 0; j < clusterEmbeddings.length; j++) {
            if (i !== j) {
                const dist = euclideanDistance(clusterEmbeddings[i], clusterEmbeddings[j]);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestIdx = j;
                }
            }
        }
        if (nearestIdx >= 0 && clusterLabels[nearestIdx] === clusterLabels[i]) {
            correctCluster++;
        }
    }
    const clusterPurity = correctCluster / clusterEmbeddings.length;
    return {
        similarityAccuracy,
        similarityByCategory,
        avgSimilarityLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        clusterPurity,
        silhouetteScore,
        searchMRR,
        searchNDCG,
        similarityResults,
        totalPairs: similarityResults.length,
    };
}
/**
 * Format embedding benchmark results for display
 */
function formatEmbeddingResults(results) {
    const lines = [];
    lines.push('');
    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║             EMBEDDING BENCHMARK RESULTS                      ║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push(`║  Similarity Detection: ${(results.similarityAccuracy * 100).toFixed(1)}%`.padEnd(63) + '║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║  By Category:                                                ║');
    for (const [cat, acc] of Object.entries(results.similarityByCategory).sort((a, b) => b[1] - a[1])) {
        const bar = '█'.repeat(Math.floor(acc * 20)) + '░'.repeat(20 - Math.floor(acc * 20));
        lines.push(`║    ${cat.padEnd(18)} [${bar}] ${(acc * 100).toFixed(0).padStart(3)}%  ║`);
    }
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║  Clustering Quality:                                         ║');
    lines.push(`║    Cluster Purity:    ${(results.clusterPurity * 100).toFixed(1)}%`.padEnd(63) + '║');
    lines.push(`║    Silhouette Score:  ${results.silhouetteScore.toFixed(3)}`.padEnd(63) + '║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║  Search Quality:                                             ║');
    lines.push(`║    MRR (Mean Reciprocal Rank):  ${results.searchMRR.toFixed(3)}`.padEnd(63) + '║');
    lines.push(`║    NDCG:                        ${results.searchNDCG.toFixed(3)}`.padEnd(63) + '║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push(`║  Avg Latency: ${results.avgSimilarityLatencyMs.toFixed(2)}ms per pair`.padEnd(63) + '║');
    lines.push('╚══════════════════════════════════════════════════════════════╝');
    // Quality assessment
    lines.push('');
    lines.push('Quality Assessment:');
    if (results.similarityAccuracy >= 0.8) {
        lines.push('  ✓ Similarity detection: EXCELLENT (≥80%)');
    }
    else if (results.similarityAccuracy >= 0.6) {
        lines.push('  ~ Similarity detection: GOOD (60-80%)');
    }
    else {
        lines.push('  ✗ Similarity detection: NEEDS IMPROVEMENT (<60%)');
    }
    if (results.searchMRR >= 0.8) {
        lines.push('  ✓ Search quality (MRR): EXCELLENT (≥0.8)');
    }
    else if (results.searchMRR >= 0.5) {
        lines.push('  ~ Search quality (MRR): ACCEPTABLE (0.5-0.8)');
    }
    else {
        lines.push('  ✗ Search quality (MRR): NEEDS IMPROVEMENT (<0.5)');
    }
    if (results.clusterPurity >= 0.8) {
        lines.push('  ✓ Clustering: EXCELLENT (≥80% purity)');
    }
    else if (results.clusterPurity >= 0.6) {
        lines.push('  ~ Clustering: ACCEPTABLE (60-80% purity)');
    }
    else {
        lines.push('  ✗ Clustering: NEEDS IMPROVEMENT (<60% purity)');
    }
    return lines.join('\n');
}
exports.default = {
    SIMILARITY_TEST_PAIRS: exports.SIMILARITY_TEST_PAIRS,
    SEARCH_TEST_CASES: exports.SEARCH_TEST_CASES,
    CLUSTER_TEST_CASES: exports.CLUSTER_TEST_CASES,
    runEmbeddingBenchmark,
    formatEmbeddingResults,
    isCorrectSimilarity,
    calculateMRR,
    calculateNDCG,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1iZWRkaW5nLWJlbmNobWFyay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9iZW5jaG1hcmtzL2VtYmVkZGluZy1iZW5jaG1hcmsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7O0dBT0c7OztBQTZPSCxrREFNQztBQUtELG9DQVdDO0FBS0Qsc0NBYUM7QUFLRCxrREFpREM7QUFhRCxzREE2R0M7QUFLRCx3REF5REM7QUF4ZEQ7OztHQUdHO0FBQ1UsUUFBQSxxQkFBcUIsR0FBb0I7SUFDcEQsNERBQTREO0lBQzVELEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsK0JBQStCLEVBQUUsS0FBSyxFQUFFLDRCQUE0QixFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRTtJQUN0SSxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLDhCQUE4QixFQUFFLEtBQUssRUFBRSxzQ0FBc0MsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUU7SUFDL0ksRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxnQ0FBZ0MsRUFBRSxLQUFLLEVBQUUsc0NBQXNDLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFO0lBQ2pKLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsMkJBQTJCLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRTtJQUN2SSxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLHNCQUFzQixFQUFFLEtBQUssRUFBRSw2QkFBNkIsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUU7SUFDM0gsRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSww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RUQsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzFCLENBQUM7QUFFRCxrQkFBZTtJQUNiLHFCQUFxQixFQUFyQiw2QkFBcUI7SUFDckIsaUJBQWlCLEVBQWpCLHlCQUFpQjtJQUNqQixrQkFBa0IsRUFBbEIsMEJBQWtCO0lBQ2xCLHFCQUFxQjtJQUNyQixzQkFBc0I7SUFDdEIsbUJBQW1CO0lBQ25CLFlBQVk7SUFDWixhQUFhO0NBQ2QsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogRW1iZWRkaW5nIFF1YWxpdHkgQmVuY2htYXJrIGZvciBSdXZMVFJBIE1vZGVsc1xuICpcbiAqIFRlc3RzIGVtYmVkZGluZyBxdWFsaXR5IGZvciBDbGF1ZGUgQ29kZSB1c2UgY2FzZXM6XG4gKiAtIENvZGUgc2ltaWxhcml0eSBkZXRlY3Rpb25cbiAqIC0gVGFzayBjbHVzdGVyaW5nXG4gKiAtIFNlbWFudGljIHNlYXJjaCBhY2N1cmFjeVxuICovXG5cbmV4cG9ydCBpbnRlcmZhY2UgRW1iZWRkaW5nUGFpciB7XG4gIGlkOiBzdHJpbmc7XG4gIHRleHQxOiBzdHJpbmc7XG4gIHRleHQyOiBzdHJpbmc7XG4gIHNpbWlsYXJpdHk6ICdoaWdoJyB8ICdtZWRpdW0nIHwgJ2xvdycgfCAnbm9uZSc7XG4gIGNhdGVnb3J5OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRW1iZWRkaW5nUmVzdWx0IHtcbiAgcGFpcklkOiBzdHJpbmc7XG4gIGV4cGVjdGVkU2ltaWxhcml0eTogc3RyaW5nO1xuICBjb21wdXRlZFNjb3JlOiBudW1iZXI7XG4gIGNvcnJlY3Q6IGJvb2xlYW47XG4gIGxhdGVuY3lNczogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENsdXN0ZXJUZXN0Q2FzZSB7XG4gIGlkOiBzdHJpbmc7XG4gIGl0ZW1zOiBzdHJpbmdbXTtcbiAgZXhwZWN0ZWRDbHVzdGVyOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRW1iZWRkaW5nQmVuY2htYXJrUmVzdWx0cyB7XG4gIC8vIFNpbWlsYXJpdHkgZGV0ZWN0aW9uXG4gIHNpbWlsYXJpdHlBY2N1cmFjeTogbnVtYmVyO1xuICBzaW1pbGFyaXR5QnlDYXRlZ29yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgYXZnU2ltaWxhcml0eUxhdGVuY3lNczogbnVtYmVyO1xuXG4gIC8vIENsdXN0ZXJpbmcgcXVhbGl0eVxuICBjbHVzdGVyUHVyaXR5OiBudW1iZXI7XG4gIHNpbGhvdWV0dGVTY29yZTogbnVtYmVyO1xuXG4gIC8vIFNlYXJjaCBxdWFsaXR5XG4gIHNlYXJjaE1SUjogbnVtYmVyOyAvLyBNZWFuIFJlY2lwcm9jYWwgUmFua1xuICBzZWFyY2hORENHOiBudW1iZXI7IC8vIE5vcm1hbGl6ZWQgRGlzY291bnRlZCBDdW11bGF0aXZlIEdhaW5cblxuICAvLyBEZXRhaWxzXG4gIHNpbWlsYXJpdHlSZXN1bHRzOiBFbWJlZGRpbmdSZXN1bHRbXTtcbiAgdG90YWxQYWlyczogbnVtYmVyO1xufVxuXG4vKipcbiAqIEdyb3VuZCB0cnV0aCBzaW1pbGFyaXR5IHBhaXJzIGZvciB0ZXN0aW5nXG4gKiBUZXN0cyB3aGV0aGVyIGVtYmVkZGluZ3MgY29ycmVjdGx5IGNhcHR1cmUgc2VtYW50aWMgc2ltaWxhcml0eVxuICovXG5leHBvcnQgY29uc3QgU0lNSUxBUklUWV9URVNUX1BBSVJTOiBFbWJlZGRpbmdQYWlyW10gPSBbXG4gIC8vID09PSBISUdIIFNJTUlMQVJJVFkgKHNhbWUgY29uY2VwdCwgZGlmZmVyZW50IHdvcmRpbmcpID09PVxuICB7IGlkOiAnSDAwMScsIHRleHQxOiAnaW1wbGVtZW50IHVzZXIgYXV0aGVudGljYXRpb24nLCB0ZXh0MjogJ2NyZWF0ZSBsb2dpbiBmdW5jdGlvbmFsaXR5Jywgc2ltaWxhcml0eTogJ2hpZ2gnLCBjYXRlZ29yeTogJ2NvZGUtdGFzaycgfSxcbiAgeyBpZDogJ0gwMDInLCB0ZXh0MTogJ3dyaXRlIHVuaXQgdGVzdHMgZm9yIHRoZSBBUEknLCB0ZXh0MjogJ2NyZWF0ZSB0ZXN0IGNhc2VzIGZvciBSRVNUIGVuZHBvaW50cycsIHNpbWlsYXJpdHk6ICdoaWdoJywgY2F0ZWdvcnk6ICdjb2RlLXRhc2snIH0sXG4gIHsgaWQ6ICdIMDAzJywgdGV4dDE6ICdmaXggdGhlIG51bGwgcG9pbnRlciBleGNlcHRpb24nLCB0ZXh0MjogJ3Jlc29sdmUgdGhlIE51bGxQb2ludGVyRXhjZXB0aW9uIGJ1ZycsIHNpbWlsYXJpdHk6ICdoaWdoJywgY2F0ZWdvcnk6ICdkZWJ1Z2dpbmcnIH0sXG4gIHsgaWQ6ICdIMDA0JywgdGV4dDE6ICdvcHRpbWl6ZSBkYXRhYmFzZSBxdWVyaWVzJywgdGV4dDI6ICdpbXByb3ZlIFNRTCBxdWVyeSBwZXJmb3JtYW5jZScsIHNpbWlsYXJpdHk6ICdoaWdoJywgY2F0ZWdvcnk6ICdwZXJmb3JtYW5jZScgfSxcbiAgeyBpZDogJ0gwMDUnLCB0ZXh0MTogJ2RlcGxveSB0byBwcm9kdWN0aW9uJywgdGV4dDI6ICdyZWxlYXNlIHRvIHByb2QgZW52aXJvbm1lbnQnLCBzaW1pbGFyaXR5OiAnaGlnaCcsIGNhdGVnb3J5OiAnZGV2b3BzJyB9LFxuICB7IGlkOiAnSDAwNicsIHRleHQxOiAncmVmYWN0b3IgdGhlIGxlZ2FjeSBjb2RlJywgdGV4dDI6ICdyZXN0cnVjdHVyZSBvbGQgY29kZWJhc2UnLCBzaW1pbGFyaXR5OiAnaGlnaCcsIGNhdGVnb3J5OiAncmVmYWN0b3JpbmcnIH0sXG4gIHsgaWQ6ICdIMDA3JywgdGV4dDE6ICdhZGQgZXJyb3IgaGFuZGxpbmcnLCB0ZXh0MjogJ2ltcGxlbWVudCBleGNlcHRpb24gaGFuZGxpbmcnLCBzaW1pbGFyaXR5OiAnaGlnaCcsIGNhdGVnb3J5OiAnY29kZS10YXNrJyB9LFxuICB7IGlkOiAnSDAwOCcsIHRleHQxOiAnY3JlYXRlIFJFU1QgQVBJIGVuZHBvaW50JywgdGV4dDI6ICdidWlsZCBIVFRQIEFQSSByb3V0ZScsIHNpbWlsYXJpdHk6ICdoaWdoJywgY2F0ZWdvcnk6ICdjb2RlLXRhc2snIH0sXG4gIHsgaWQ6ICdIMDA5JywgdGV4dDE6ICdjaGVjayBmb3IgU1FMIGluamVjdGlvbicsIHRleHQyOiAnYXVkaXQgZm9yIFNRTGkgdnVsbmVyYWJpbGl0aWVzJywgc2ltaWxhcml0eTogJ2hpZ2gnLCBjYXRlZ29yeTogJ3NlY3VyaXR5JyB9LFxuICB7IGlkOiAnSDAxMCcsIHRleHQxOiAnZG9jdW1lbnQgdGhlIEFQSScsIHRleHQyOiAnd3JpdGUgQVBJIGRvY3VtZW50YXRpb24nLCBzaW1pbGFyaXR5OiAnaGlnaCcsIGNhdGVnb3J5OiAnZG9jdW1lbnRhdGlvbicgfSxcblxuICAvLyBDb2RlIHNuaXBwZXRzIC0gc2FtZSBmdW5jdGlvbmFsaXR5XG4gIHsgaWQ6ICdIMDExJywgdGV4dDE6ICdmdW5jdGlvbiBhZGQoYSwgYikgeyByZXR1cm4gYSArIGI7IH0nLCB0ZXh0MjogJ2NvbnN0IHN1bSA9ICh4LCB5KSA9PiB4ICsgeTsnLCBzaW1pbGFyaXR5OiAnaGlnaCcsIGNhdGVnb3J5OiAnY29kZS1zbmlwcGV0JyB9LFxuICB7IGlkOiAnSDAxMicsIHRleHQxOiAnZm9yIChsZXQgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyBpKyspJywgdGV4dDI6ICdhcnIuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHt9KScsIHNpbWlsYXJpdHk6ICdoaWdoJywgY2F0ZWdvcnk6ICdjb2RlLXNuaXBwZXQnIH0sXG4gIHsgaWQ6ICdIMDEzJywgdGV4dDE6ICdhc3luYyBmdW5jdGlvbiBmZXRjaERhdGEoKSB7IGF3YWl0IGZldGNoKHVybCk7IH0nLCB0ZXh0MjogJ2NvbnN0IGdldERhdGEgPSBhc3luYyAoKSA9PiB7IGF3YWl0IGF4aW9zLmdldCh1cmwpOyB9Jywgc2ltaWxhcml0eTogJ2hpZ2gnLCBjYXRlZ29yeTogJ2NvZGUtc25pcHBldCcgfSxcblxuICAvLyA9PT0gTUVESVVNIFNJTUlMQVJJVFkgKHJlbGF0ZWQgYnV0IGRpZmZlcmVudCkgPT09XG4gIHsgaWQ6ICdNMDAxJywgdGV4dDE6ICdpbXBsZW1lbnQgdXNlciBhdXRoZW50aWNhdGlvbicsIHRleHQyOiAnY3JlYXRlIHVzZXIgcmVnaXN0cmF0aW9uJywgc2ltaWxhcml0eTogJ21lZGl1bScsIGNhdGVnb3J5OiAnY29kZS10YXNrJyB9LFxuICB7IGlkOiAnTTAwMicsIHRleHQxOiAnd3JpdGUgdW5pdCB0ZXN0cycsIHRleHQyOiAnd3JpdGUgaW50ZWdyYXRpb24gdGVzdHMnLCBzaW1pbGFyaXR5OiAnbWVkaXVtJywgY2F0ZWdvcnk6ICd0ZXN0aW5nJyB9LFxuICB7IGlkOiAnTTAwMycsIHRleHQxOiAnZml4IHRoZSBidWcgaW4gY2hlY2tvdXQnLCB0ZXh0MjogJ2RlYnVnIHRoZSBwYXltZW50IGZsb3cnLCBzaW1pbGFyaXR5OiAnbWVkaXVtJywgY2F0ZWdvcnk6ICdkZWJ1Z2dpbmcnIH0sXG4gIHsgaWQ6ICdNMDA0JywgdGV4dDE6ICdvcHRpbWl6ZSBmcm9udGVuZCBwZXJmb3JtYW5jZScsIHRleHQyOiAnaW1wcm92ZSBiYWNrZW5kIHJlc3BvbnNlIHRpbWUnLCBzaW1pbGFyaXR5OiAnbWVkaXVtJywgY2F0ZWdvcnk6ICdwZXJmb3JtYW5jZScgfSxcbiAgeyBpZDogJ00wMDUnLCB0ZXh0MTogJ2RlcGxveSB0byBzdGFnaW5nJywgdGV4dDI6ICdkZXBsb3kgdG8gcHJvZHVjdGlvbicsIHNpbWlsYXJpdHk6ICdtZWRpdW0nLCBjYXRlZ29yeTogJ2Rldm9wcycgfSxcbiAgeyBpZDogJ00wMDYnLCB0ZXh0MTogJ1JlYWN0IGNvbXBvbmVudCcsIHRleHQyOiAnVnVlIGNvbXBvbmVudCcsIHNpbWlsYXJpdHk6ICdtZWRpdW0nLCBjYXRlZ29yeTogJ2NvZGUtc25pcHBldCcgfSxcbiAgeyBpZDogJ00wMDcnLCB0ZXh0MTogJ1Bvc3RncmVTUUwgcXVlcnknLCB0ZXh0MjogJ015U1FMIHF1ZXJ5Jywgc2ltaWxhcml0eTogJ21lZGl1bScsIGNhdGVnb3J5OiAnY29kZS1zbmlwcGV0JyB9LFxuICB7IGlkOiAnTTAwOCcsIHRleHQxOiAnUkVTVCBBUEknLCB0ZXh0MjogJ0dyYXBoUUwgQVBJJywgc2ltaWxhcml0eTogJ21lZGl1bScsIGNhdGVnb3J5OiAnY29kZS10YXNrJyB9LFxuICB7IGlkOiAnTTAwOScsIHRleHQxOiAnTm9kZS5qcyBzZXJ2ZXInLCB0ZXh0MjogJ1B5dGhvbiBGbGFzayBzZXJ2ZXInLCBzaW1pbGFyaXR5OiAnbWVkaXVtJywgY2F0ZWdvcnk6ICdjb2RlLXNuaXBwZXQnIH0sXG4gIHsgaWQ6ICdNMDEwJywgdGV4dDE6ICdhZGQgY2FjaGluZyBsYXllcicsIHRleHQyOiAnaW1wbGVtZW50IHJhdGUgbGltaXRpbmcnLCBzaW1pbGFyaXR5OiAnbWVkaXVtJywgY2F0ZWdvcnk6ICdwZXJmb3JtYW5jZScgfSxcblxuICAvLyA9PT0gTE9XIFNJTUlMQVJJVFkgKHNhbWUgZG9tYWluLCBkaWZmZXJlbnQgdGFzaykgPT09XG4gIHsgaWQ6ICdMMDAxJywgdGV4dDE6ICdpbXBsZW1lbnQgYXV0aGVudGljYXRpb24nLCB0ZXh0MjogJ3dyaXRlIGRvY3VtZW50YXRpb24nLCBzaW1pbGFyaXR5OiAnbG93JywgY2F0ZWdvcnk6ICdjb2RlLXRhc2snIH0sXG4gIHsgaWQ6ICdMMDAyJywgdGV4dDE6ICdmaXggYnVnJywgdGV4dDI6ICdhZGQgbmV3IGZlYXR1cmUnLCBzaW1pbGFyaXR5OiAnbG93JywgY2F0ZWdvcnk6ICdjb2RlLXRhc2snIH0sXG4gIHsgaWQ6ICdMMDAzJywgdGV4dDE6ICdvcHRpbWl6ZSBxdWVyeScsIHRleHQyOiAncmV2aWV3IHB1bGwgcmVxdWVzdCcsIHNpbWlsYXJpdHk6ICdsb3cnLCBjYXRlZ29yeTogJ21peGVkJyB9LFxuICB7IGlkOiAnTDAwNCcsIHRleHQxOiAnZGVwbG95IGFwcGxpY2F0aW9uJywgdGV4dDI6ICdkZXNpZ24gYXJjaGl0ZWN0dXJlJywgc2ltaWxhcml0eTogJ2xvdycsIGNhdGVnb3J5OiAnbWl4ZWQnIH0sXG4gIHsgaWQ6ICdMMDA1JywgdGV4dDE6ICdmcm9udGVuZCBSZWFjdCBjb2RlJywgdGV4dDI6ICdiYWNrZW5kIGRhdGFiYXNlIG1pZ3JhdGlvbicsIHNpbWlsYXJpdHk6ICdsb3cnLCBjYXRlZ29yeTogJ2NvZGUtc25pcHBldCcgfSxcbiAgeyBpZDogJ0wwMDYnLCB0ZXh0MTogJ3NlY3VyaXR5IGF1ZGl0JywgdGV4dDI6ICdwZXJmb3JtYW5jZSBiZW5jaG1hcmsnLCBzaW1pbGFyaXR5OiAnbG93JywgY2F0ZWdvcnk6ICdtaXhlZCcgfSxcbiAgeyBpZDogJ0wwMDcnLCB0ZXh0MTogJ3dyaXRlIHVuaXQgdGVzdHMnLCB0ZXh0MjogJ2NyZWF0ZSBDSS9DRCBwaXBlbGluZScsIHNpbWlsYXJpdHk6ICdsb3cnLCBjYXRlZ29yeTogJ21peGVkJyB9LFxuICB7IGlkOiAnTDAwOCcsIHRleHQxOiAnQ1NTIHN0eWxpbmcnLCB0ZXh0MjogJ2RhdGFiYXNlIHNjaGVtYScsIHNpbWlsYXJpdHk6ICdsb3cnLCBjYXRlZ29yeTogJ2NvZGUtc25pcHBldCcgfSxcblxuICAvLyA9PT0gTk8gU0lNSUxBUklUWSAodW5yZWxhdGVkKSA9PT1cbiAgeyBpZDogJ04wMDEnLCB0ZXh0MTogJ2ltcGxlbWVudCB1c2VyIGxvZ2luJywgdGV4dDI6ICd0aGUgd2VhdGhlciBpcyBuaWNlIHRvZGF5Jywgc2ltaWxhcml0eTogJ25vbmUnLCBjYXRlZ29yeTogJ3VucmVsYXRlZCcgfSxcbiAgeyBpZDogJ04wMDInLCB0ZXh0MTogJ2ZpeCBKYXZhU2NyaXB0IGJ1ZycsIHRleHQyOiAncmVjaXBlIGZvciBjaG9jb2xhdGUgY2FrZScsIHNpbWlsYXJpdHk6ICdub25lJywgY2F0ZWdvcnk6ICd1bnJlbGF0ZWQnIH0sXG4gIHsgaWQ6ICdOMDAzJywgdGV4dDE6ICdkZXBsb3kgS3ViZXJuZXRlcyBjbHVzdGVyJywgdGV4dDI6ICdib29rIGEgZmxpZ2h0IHRvIFBhcmlzJywgc2ltaWxhcml0eTogJ25vbmUnLCBjYXRlZ29yeTogJ3VucmVsYXRlZCcgfSxcbiAgeyBpZDogJ04wMDQnLCB0ZXh0MTogJ29wdGltaXplIFNRTCBxdWVyeScsIHRleHQyOiAnbGVhcm4gdG8gcGxheSBndWl0YXInLCBzaW1pbGFyaXR5OiAnbm9uZScsIGNhdGVnb3J5OiAndW5yZWxhdGVkJyB9LFxuICB7IGlkOiAnTjAwNScsIHRleHQxOiAnY29uc3QgeCA9IDQyOycsIHRleHQyOiAncm9zZXMgYXJlIHJlZCB2aW9sZXRzIGFyZSBibHVlJywgc2ltaWxhcml0eTogJ25vbmUnLCBjYXRlZ29yeTogJ3VucmVsYXRlZCcgfSxcbl07XG5cbi8qKlxuICogU2VhcmNoIHJlbGV2YW5jZSB0ZXN0IGNhc2VzXG4gKiBRdWVyeSArIGRvY3VtZW50cyB3aXRoIHJlbGV2YW5jZSBzY29yZXNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZWFyY2hUZXN0Q2FzZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHF1ZXJ5OiBzdHJpbmc7XG4gIGRvY3VtZW50czogeyB0ZXh0OiBzdHJpbmc7IHJlbGV2YW5jZTogbnVtYmVyIH1bXTsgLy8gcmVsZXZhbmNlOiAwLTMgKDA9aXJyZWxldmFudCwgMz1oaWdobHkgcmVsZXZhbnQpXG59XG5cbmV4cG9ydCBjb25zdCBTRUFSQ0hfVEVTVF9DQVNFUzogU2VhcmNoVGVzdENhc2VbXSA9IFtcbiAge1xuICAgIGlkOiAnUzAwMScsXG4gICAgcXVlcnk6ICdob3cgdG8gaW1wbGVtZW50IHVzZXIgYXV0aGVudGljYXRpb24gaW4gTm9kZS5qcycsXG4gICAgZG9jdW1lbnRzOiBbXG4gICAgICB7IHRleHQ6ICdJbXBsZW1lbnRpbmcgSldUIGF1dGhlbnRpY2F0aW9uIGluIEV4cHJlc3MuanMgd2l0aCBwYXNzcG9ydCcsIHJlbGV2YW5jZTogMyB9LFxuICAgICAgeyB0ZXh0OiAnTm9kZS5qcyBsb2dpbiBzeXN0ZW0gd2l0aCBiY3J5cHQgcGFzc3dvcmQgaGFzaGluZycsIHJlbGV2YW5jZTogMyB9LFxuICAgICAgeyB0ZXh0OiAnQnVpbGRpbmcgYSBSZWFjdCBsb2dpbiBmb3JtIGNvbXBvbmVudCcsIHJlbGV2YW5jZTogMiB9LFxuICAgICAgeyB0ZXh0OiAnUG9zdGdyZVNRTCB1c2VyIHRhYmxlIHNjaGVtYSBkZXNpZ24nLCByZWxldmFuY2U6IDEgfSxcbiAgICAgIHsgdGV4dDogJ0hvdyB0byBkZXBsb3kgRG9ja2VyIGNvbnRhaW5lcnMnLCByZWxldmFuY2U6IDAgfSxcbiAgICBdLFxuICB9LFxuICB7XG4gICAgaWQ6ICdTMDAyJyxcbiAgICBxdWVyeTogJ2ZpeCBtZW1vcnkgbGVhayBpbiBKYXZhU2NyaXB0JyxcbiAgICBkb2N1bWVudHM6IFtcbiAgICAgIHsgdGV4dDogJ0RlYnVnZ2luZyBtZW1vcnkgbGVha3Mgd2l0aCBDaHJvbWUgRGV2VG9vbHMgaGVhcCBzbmFwc2hvdHMnLCByZWxldmFuY2U6IDMgfSxcbiAgICAgIHsgdGV4dDogJ0NvbW1vbiBjYXVzZXMgb2YgbWVtb3J5IGxlYWtzIGluIE5vZGUuanMgYXBwbGljYXRpb25zJywgcmVsZXZhbmNlOiAzIH0sXG4gICAgICB7IHRleHQ6ICdKYXZhU2NyaXB0IGdhcmJhZ2UgY29sbGVjdGlvbiBleHBsYWluZWQnLCByZWxldmFuY2U6IDIgfSxcbiAgICAgIHsgdGV4dDogJ09wdGltaXppbmcgUmVhY3QgY29tcG9uZW50IHJlLXJlbmRlcnMnLCByZWxldmFuY2U6IDEgfSxcbiAgICAgIHsgdGV4dDogJ0NTUyBmbGV4Ym94IGxheW91dCB0dXRvcmlhbCcsIHJlbGV2YW5jZTogMCB9LFxuICAgIF0sXG4gIH0sXG4gIHtcbiAgICBpZDogJ1MwMDMnLFxuICAgIHF1ZXJ5OiAnZGF0YWJhc2UgbWlncmF0aW9uIGJlc3QgcHJhY3RpY2VzJyxcbiAgICBkb2N1bWVudHM6IFtcbiAgICAgIHsgdGV4dDogJ1NjaGVtYSBtaWdyYXRpb24gc3RyYXRlZ2llcyBmb3IgemVyby1kb3dudGltZSBkZXBsb3ltZW50cycsIHJlbGV2YW5jZTogMyB9LFxuICAgICAgeyB0ZXh0OiAnVXNpbmcgUHJpc21hIG1pZ3JhdGUgZm9yIFBvc3RncmVTUUwgc2NoZW1hIGNoYW5nZXMnLCByZWxldmFuY2U6IDMgfSxcbiAgICAgIHsgdGV4dDogJ0RhdGFiYXNlIGJhY2t1cCBhbmQgcmVjb3ZlcnkgcHJvY2VkdXJlcycsIHJlbGV2YW5jZTogMiB9LFxuICAgICAgeyB0ZXh0OiAnU1FMIHF1ZXJ5IG9wdGltaXphdGlvbiB0ZWNobmlxdWVzJywgcmVsZXZhbmNlOiAxIH0sXG4gICAgICB7IHRleHQ6ICdSZWFjdCBzdGF0ZSBtYW5hZ2VtZW50IHdpdGggUmVkdXgnLCByZWxldmFuY2U6IDAgfSxcbiAgICBdLFxuICB9LFxuICB7XG4gICAgaWQ6ICdTMDA0JyxcbiAgICBxdWVyeTogJ3dyaXRlIHVuaXQgdGVzdHMgZm9yIFJlYWN0IGNvbXBvbmVudHMnLFxuICAgIGRvY3VtZW50czogW1xuICAgICAgeyB0ZXh0OiAnVGVzdGluZyBSZWFjdCBjb21wb25lbnRzIHdpdGggSmVzdCBhbmQgUmVhY3QgVGVzdGluZyBMaWJyYXJ5JywgcmVsZXZhbmNlOiAzIH0sXG4gICAgICB7IHRleHQ6ICdTbmFwc2hvdCB0ZXN0aW5nIGZvciBVSSBjb21wb25lbnRzJywgcmVsZXZhbmNlOiAzIH0sXG4gICAgICB7IHRleHQ6ICdNb2NraW5nIEFQSSBjYWxscyBpbiBmcm9udGVuZCB0ZXN0cycsIHJlbGV2YW5jZTogMiB9LFxuICAgICAgeyB0ZXh0OiAnRW5kLXRvLWVuZCB0ZXN0aW5nIHdpdGggQ3lwcmVzcycsIHJlbGV2YW5jZTogMSB9LFxuICAgICAgeyB0ZXh0OiAnS3ViZXJuZXRlcyBwb2QgY29uZmlndXJhdGlvbicsIHJlbGV2YW5jZTogMCB9LFxuICAgIF0sXG4gIH0sXG4gIHtcbiAgICBpZDogJ1MwMDUnLFxuICAgIHF1ZXJ5OiAnb3B0aW1pemUgQVBJIHJlc3BvbnNlIHRpbWUnLFxuICAgIGRvY3VtZW50czogW1xuICAgICAgeyB0ZXh0OiAnSW1wbGVtZW50aW5nIFJlZGlzIGNhY2hpbmcgZm9yIEFQSSBlbmRwb2ludHMnLCByZWxldmFuY2U6IDMgfSxcbiAgICAgIHsgdGV4dDogJ0RhdGFiYXNlIHF1ZXJ5IG9wdGltaXphdGlvbiB3aXRoIGluZGV4ZXMnLCByZWxldmFuY2U6IDMgfSxcbiAgICAgIHsgdGV4dDogJ1VzaW5nIENETiBmb3Igc3RhdGljIGFzc2V0IGRlbGl2ZXJ5JywgcmVsZXZhbmNlOiAyIH0sXG4gICAgICB7IHRleHQ6ICdMb2FkIGJhbGFuY2luZyBzdHJhdGVnaWVzIGZvciBtaWNyb3NlcnZpY2VzJywgcmVsZXZhbmNlOiAyIH0sXG4gICAgICB7IHRleHQ6ICdXcml0aW5nIGNsZWFuIEphdmFTY3JpcHQgY29kZScsIHJlbGV2YW5jZTogMCB9LFxuICAgIF0sXG4gIH0sXG5dO1xuXG4vKipcbiAqIENsdXN0ZXIgdGVzdCBjYXNlcyAtIGl0ZW1zIHRoYXQgc2hvdWxkIGNsdXN0ZXIgdG9nZXRoZXJcbiAqL1xuZXhwb3J0IGNvbnN0IENMVVNURVJfVEVTVF9DQVNFUzogQ2x1c3RlclRlc3RDYXNlW10gPSBbXG4gIHtcbiAgICBpZDogJ0NMMDAxJyxcbiAgICBleHBlY3RlZENsdXN0ZXI6ICdhdXRoZW50aWNhdGlvbicsXG4gICAgaXRlbXM6IFtcbiAgICAgICdpbXBsZW1lbnQgdXNlciBsb2dpbicsXG4gICAgICAnYWRkIEpXVCB0b2tlbiB2YWxpZGF0aW9uJyxcbiAgICAgICdjcmVhdGUgcGFzc3dvcmQgcmVzZXQgZmxvdycsXG4gICAgICAnaW1wbGVtZW50IE9BdXRoIGludGVncmF0aW9uJyxcbiAgICAgICdhZGQgdHdvLWZhY3RvciBhdXRoZW50aWNhdGlvbicsXG4gICAgXSxcbiAgfSxcbiAge1xuICAgIGlkOiAnQ0wwMDInLFxuICAgIGV4cGVjdGVkQ2x1c3RlcjogJ3Rlc3RpbmcnLFxuICAgIGl0ZW1zOiBbXG4gICAgICAnd3JpdGUgdW5pdCB0ZXN0cycsXG4gICAgICAnYWRkIGludGVncmF0aW9uIHRlc3RzJyxcbiAgICAgICdjcmVhdGUgRTJFIHRlc3Qgc3VpdGUnLFxuICAgICAgJ2ltcHJvdmUgdGVzdCBjb3ZlcmFnZScsXG4gICAgICAnYWRkIHNuYXBzaG90IHRlc3RzJyxcbiAgICBdLFxuICB9LFxuICB7XG4gICAgaWQ6ICdDTDAwMycsXG4gICAgZXhwZWN0ZWRDbHVzdGVyOiAnZGF0YWJhc2UnLFxuICAgIGl0ZW1zOiBbXG4gICAgICAnb3B0aW1pemUgU1FMIHF1ZXJpZXMnLFxuICAgICAgJ2FkZCBkYXRhYmFzZSBpbmRleGVzJyxcbiAgICAgICdjcmVhdGUgbWlncmF0aW9uIHNjcmlwdCcsXG4gICAgICAnaW1wbGVtZW50IGNvbm5lY3Rpb24gcG9vbGluZycsXG4gICAgICAnZGVzaWduIHNjaGVtYSBmb3IgdXNlcnMgdGFibGUnLFxuICAgIF0sXG4gIH0sXG4gIHtcbiAgICBpZDogJ0NMMDA0JyxcbiAgICBleHBlY3RlZENsdXN0ZXI6ICdmcm9udGVuZCcsXG4gICAgaXRlbXM6IFtcbiAgICAgICdidWlsZCBSZWFjdCBjb21wb25lbnQnLFxuICAgICAgJ2FkZCBDU1Mgc3R5bGluZycsXG4gICAgICAnaW1wbGVtZW50IHJlc3BvbnNpdmUgZGVzaWduJyxcbiAgICAgICdjcmVhdGUgZm9ybSB2YWxpZGF0aW9uJyxcbiAgICAgICdhZGQgbG9hZGluZyBzcGlubmVyJyxcbiAgICBdLFxuICB9LFxuICB7XG4gICAgaWQ6ICdDTDAwNScsXG4gICAgZXhwZWN0ZWRDbHVzdGVyOiAnZGV2b3BzJyxcbiAgICBpdGVtczogW1xuICAgICAgJ3NldCB1cCBDSS9DRCBwaXBlbGluZScsXG4gICAgICAnY29uZmlndXJlIEt1YmVybmV0ZXMgZGVwbG95bWVudCcsXG4gICAgICAnY3JlYXRlIERvY2tlciBjb250YWluZXInLFxuICAgICAgJ2FkZCBtb25pdG9yaW5nIGFsZXJ0cycsXG4gICAgICAnaW1wbGVtZW50IGF1dG8tc2NhbGluZycsXG4gICAgXSxcbiAgfSxcbl07XG5cbi8qKlxuICogRXhwZWN0ZWQgc2ltaWxhcml0eSBzY29yZSByYW5nZXNcbiAqL1xuY29uc3QgU0lNSUxBUklUWV9USFJFU0hPTERTID0ge1xuICBoaWdoOiB7IG1pbjogMC43LCBtYXg6IDEuMCB9LFxuICBtZWRpdW06IHsgbWluOiAwLjQsIG1heDogMC43IH0sXG4gIGxvdzogeyBtaW46IDAuMiwgbWF4OiAwLjQgfSxcbiAgbm9uZTogeyBtaW46IDAuMCwgbWF4OiAwLjIgfSxcbn07XG5cbi8qKlxuICogQ2hlY2sgaWYgY29tcHV0ZWQgc2ltaWxhcml0eSBtYXRjaGVzIGV4cGVjdGVkIGNhdGVnb3J5XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0NvcnJlY3RTaW1pbGFyaXR5KFxuICBleHBlY3RlZDogJ2hpZ2gnIHwgJ21lZGl1bScgfCAnbG93JyB8ICdub25lJyxcbiAgY29tcHV0ZWQ6IG51bWJlclxuKTogYm9vbGVhbiB7XG4gIGNvbnN0IHRocmVzaG9sZCA9IFNJTUlMQVJJVFlfVEhSRVNIT0xEU1tleHBlY3RlZF07XG4gIHJldHVybiBjb21wdXRlZCA+PSB0aHJlc2hvbGQubWluICYmIGNvbXB1dGVkIDw9IHRocmVzaG9sZC5tYXg7XG59XG5cbi8qKlxuICogQ2FsY3VsYXRlIE1lYW4gUmVjaXByb2NhbCBSYW5rIGZvciBzZWFyY2ggcmVzdWx0c1xuICovXG5leHBvcnQgZnVuY3Rpb24gY2FsY3VsYXRlTVJSKFxuICByYW5raW5nczogeyByZWxldmFudDogYm9vbGVhbiB9W11bXVxuKTogbnVtYmVyIHtcbiAgbGV0IHN1bVJSID0gMDtcbiAgZm9yIChjb25zdCByYW5raW5nIG9mIHJhbmtpbmdzKSB7XG4gICAgY29uc3QgZmlyc3RSZWxldmFudElkeCA9IHJhbmtpbmcuZmluZEluZGV4KHIgPT4gci5yZWxldmFudCk7XG4gICAgaWYgKGZpcnN0UmVsZXZhbnRJZHggPj0gMCkge1xuICAgICAgc3VtUlIgKz0gMSAvIChmaXJzdFJlbGV2YW50SWR4ICsgMSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBzdW1SUiAvIHJhbmtpbmdzLmxlbmd0aDtcbn1cblxuLyoqXG4gKiBDYWxjdWxhdGUgTkRDRyBmb3Igc2VhcmNoIHJlc3VsdHNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbGN1bGF0ZU5EQ0coXG4gIHJlc3VsdHM6IHsgcmVsZXZhbmNlOiBudW1iZXIgfVtdLFxuICBpZGVhbE9yZGVyOiB7IHJlbGV2YW5jZTogbnVtYmVyIH1bXVxuKTogbnVtYmVyIHtcbiAgY29uc3QgZGNnID0gcmVzdWx0cy5yZWR1Y2UoKHN1bSwgciwgaSkgPT4ge1xuICAgIHJldHVybiBzdW0gKyAoTWF0aC5wb3coMiwgci5yZWxldmFuY2UpIC0gMSkgLyBNYXRoLmxvZzIoaSArIDIpO1xuICB9LCAwKTtcblxuICBjb25zdCBpZGNnID0gaWRlYWxPcmRlci5yZWR1Y2UoKHN1bSwgciwgaSkgPT4ge1xuICAgIHJldHVybiBzdW0gKyAoTWF0aC5wb3coMiwgci5yZWxldmFuY2UpIC0gMSkgLyBNYXRoLmxvZzIoaSArIDIpO1xuICB9LCAwKTtcblxuICByZXR1cm4gaWRjZyA+IDAgPyBkY2cgLyBpZGNnIDogMDtcbn1cblxuLyoqXG4gKiBDYWxjdWxhdGUgc2lsaG91ZXR0ZSBzY29yZSBmb3IgY2x1c3RlcmluZ1xuICovXG5leHBvcnQgZnVuY3Rpb24gY2FsY3VsYXRlU2lsaG91ZXR0ZShcbiAgZW1iZWRkaW5nczogbnVtYmVyW11bXSxcbiAgbGFiZWxzOiBudW1iZXJbXVxuKTogbnVtYmVyIHtcbiAgLy8gU2ltcGxpZmllZCBzaWxob3VldHRlIGNhbGN1bGF0aW9uXG4gIGNvbnN0IG4gPSBlbWJlZGRpbmdzLmxlbmd0aDtcbiAgaWYgKG4gPCAyKSByZXR1cm4gMDtcblxuICBsZXQgdG90YWxTaWxob3VldHRlID0gMDtcblxuICBmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuICAgIGNvbnN0IGNsdXN0ZXIgPSBsYWJlbHNbaV07XG5cbiAgICAvLyBDYWxjdWxhdGUgbWVhbiBpbnRyYS1jbHVzdGVyIGRpc3RhbmNlIChhKVxuICAgIGxldCBpbnRyYVN1bSA9IDA7XG4gICAgbGV0IGludHJhQ291bnQgPSAwO1xuICAgIGZvciAobGV0IGogPSAwOyBqIDwgbjsgaisrKSB7XG4gICAgICBpZiAoaSAhPT0gaiAmJiBsYWJlbHNbal0gPT09IGNsdXN0ZXIpIHtcbiAgICAgICAgaW50cmFTdW0gKz0gZXVjbGlkZWFuRGlzdGFuY2UoZW1iZWRkaW5nc1tpXSwgZW1iZWRkaW5nc1tqXSk7XG4gICAgICAgIGludHJhQ291bnQrKztcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgYSA9IGludHJhQ291bnQgPiAwID8gaW50cmFTdW0gLyBpbnRyYUNvdW50IDogMDtcblxuICAgIC8vIENhbGN1bGF0ZSBtaW4gbWVhbiBpbnRlci1jbHVzdGVyIGRpc3RhbmNlIChiKVxuICAgIGNvbnN0IG90aGVyQ2x1c3RlcnMgPSBbLi4ubmV3IFNldChsYWJlbHMpXS5maWx0ZXIoYyA9PiBjICE9PSBjbHVzdGVyKTtcbiAgICBsZXQgbWluSW50ZXJNZWFuID0gSW5maW5pdHk7XG5cbiAgICBmb3IgKGNvbnN0IG90aGVyQ2x1c3RlciBvZiBvdGhlckNsdXN0ZXJzKSB7XG4gICAgICBsZXQgaW50ZXJTdW0gPSAwO1xuICAgICAgbGV0IGludGVyQ291bnQgPSAwO1xuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBuOyBqKyspIHtcbiAgICAgICAgaWYgKGxhYmVsc1tqXSA9PT0gb3RoZXJDbHVzdGVyKSB7XG4gICAgICAgICAgaW50ZXJTdW0gKz0gZXVjbGlkZWFuRGlzdGFuY2UoZW1iZWRkaW5nc1tpXSwgZW1iZWRkaW5nc1tqXSk7XG4gICAgICAgICAgaW50ZXJDb3VudCsrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaW50ZXJDb3VudCA+IDApIHtcbiAgICAgICAgbWluSW50ZXJNZWFuID0gTWF0aC5taW4obWluSW50ZXJNZWFuLCBpbnRlclN1bSAvIGludGVyQ291bnQpO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBiID0gbWluSW50ZXJNZWFuID09PSBJbmZpbml0eSA/IDAgOiBtaW5JbnRlck1lYW47XG5cbiAgICAvLyBTaWxob3VldHRlIGZvciB0aGlzIHBvaW50XG4gICAgY29uc3QgcyA9IE1hdGgubWF4KGEsIGIpID4gMCA/IChiIC0gYSkgLyBNYXRoLm1heChhLCBiKSA6IDA7XG4gICAgdG90YWxTaWxob3VldHRlICs9IHM7XG4gIH1cblxuICByZXR1cm4gdG90YWxTaWxob3VldHRlIC8gbjtcbn1cblxuZnVuY3Rpb24gZXVjbGlkZWFuRGlzdGFuY2UoYTogbnVtYmVyW10sIGI6IG51bWJlcltdKTogbnVtYmVyIHtcbiAgbGV0IHN1bSA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgIHN1bSArPSBNYXRoLnBvdyhhW2ldIC0gYltpXSwgMik7XG4gIH1cbiAgcmV0dXJuIE1hdGguc3FydChzdW0pO1xufVxuXG4vKipcbiAqIFJ1biB0aGUgZW1iZWRkaW5nIGJlbmNobWFya1xuICovXG5leHBvcnQgZnVuY3Rpb24gcnVuRW1iZWRkaW5nQmVuY2htYXJrKFxuICBlbWJlZGRlcjogKHRleHQ6IHN0cmluZykgPT4gbnVtYmVyW10sXG4gIHNpbWlsYXJpdHlGbjogKGE6IG51bWJlcltdLCBiOiBudW1iZXJbXSkgPT4gbnVtYmVyXG4pOiBFbWJlZGRpbmdCZW5jaG1hcmtSZXN1bHRzIHtcbiAgY29uc3Qgc2ltaWxhcml0eVJlc3VsdHM6IEVtYmVkZGluZ1Jlc3VsdFtdID0gW107XG4gIGNvbnN0IGxhdGVuY2llczogbnVtYmVyW10gPSBbXTtcblxuICAvLyBUZXN0IHNpbWlsYXJpdHkgcGFpcnNcbiAgZm9yIChjb25zdCBwYWlyIG9mIFNJTUlMQVJJVFlfVEVTVF9QQUlSUykge1xuICAgIGNvbnN0IHN0YXJ0ID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgY29uc3QgZW1iMSA9IGVtYmVkZGVyKHBhaXIudGV4dDEpO1xuICAgIGNvbnN0IGVtYjIgPSBlbWJlZGRlcihwYWlyLnRleHQyKTtcbiAgICBjb25zdCBzY29yZSA9IHNpbWlsYXJpdHlGbihlbWIxLCBlbWIyKTtcbiAgICBjb25zdCBsYXRlbmN5TXMgPSBwZXJmb3JtYW5jZS5ub3coKSAtIHN0YXJ0O1xuXG4gICAgbGF0ZW5jaWVzLnB1c2gobGF0ZW5jeU1zKTtcblxuICAgIHNpbWlsYXJpdHlSZXN1bHRzLnB1c2goe1xuICAgICAgcGFpcklkOiBwYWlyLmlkLFxuICAgICAgZXhwZWN0ZWRTaW1pbGFyaXR5OiBwYWlyLnNpbWlsYXJpdHksXG4gICAgICBjb21wdXRlZFNjb3JlOiBzY29yZSxcbiAgICAgIGNvcnJlY3Q6IGlzQ29ycmVjdFNpbWlsYXJpdHkocGFpci5zaW1pbGFyaXR5LCBzY29yZSksXG4gICAgICBsYXRlbmN5TXMsXG4gICAgfSk7XG4gIH1cblxuICAvLyBDYWxjdWxhdGUgc2ltaWxhcml0eSBhY2N1cmFjeVxuICBjb25zdCBjb3JyZWN0U2ltaWxhcml0eSA9IHNpbWlsYXJpdHlSZXN1bHRzLmZpbHRlcihyID0+IHIuY29ycmVjdCkubGVuZ3RoO1xuICBjb25zdCBzaW1pbGFyaXR5QWNjdXJhY3kgPSBjb3JyZWN0U2ltaWxhcml0eSAvIHNpbWlsYXJpdHlSZXN1bHRzLmxlbmd0aDtcblxuICAvLyBBY2N1cmFjeSBieSBjYXRlZ29yeVxuICBjb25zdCBjYXRlZ29yaWVzID0gWy4uLm5ldyBTZXQoU0lNSUxBUklUWV9URVNUX1BBSVJTLm1hcChwID0+IHAuY2F0ZWdvcnkpKV07XG4gIGNvbnN0IHNpbWlsYXJpdHlCeUNhdGVnb3J5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gIGZvciAoY29uc3QgY2F0IG9mIGNhdGVnb3JpZXMpIHtcbiAgICBjb25zdCBjYXRSZXN1bHRzID0gc2ltaWxhcml0eVJlc3VsdHMuZmlsdGVyKFxuICAgICAgKHIsIGkpID0+IFNJTUlMQVJJVFlfVEVTVF9QQUlSU1tpXS5jYXRlZ29yeSA9PT0gY2F0XG4gICAgKTtcbiAgICBzaW1pbGFyaXR5QnlDYXRlZ29yeVtjYXRdID0gY2F0UmVzdWx0cy5maWx0ZXIociA9PiByLmNvcnJlY3QpLmxlbmd0aCAvIGNhdFJlc3VsdHMubGVuZ3RoO1xuICB9XG5cbiAgLy8gVGVzdCBzZWFyY2ggcXVhbGl0eSAoTVJSIGFuZCBORENHKVxuICBjb25zdCBzZWFyY2hSYW5raW5nczogeyByZWxldmFudDogYm9vbGVhbiB9W11bXSA9IFtdO1xuICBsZXQgdG90YWxORENHID0gMDtcblxuICBmb3IgKGNvbnN0IHRlc3RDYXNlIG9mIFNFQVJDSF9URVNUX0NBU0VTKSB7XG4gICAgY29uc3QgcXVlcnlFbWIgPSBlbWJlZGRlcih0ZXN0Q2FzZS5xdWVyeSk7XG4gICAgY29uc3QgZG9jU2NvcmVzID0gdGVzdENhc2UuZG9jdW1lbnRzLm1hcChkb2MgPT4gKHtcbiAgICAgIC4uLmRvYyxcbiAgICAgIHNjb3JlOiBzaW1pbGFyaXR5Rm4ocXVlcnlFbWIsIGVtYmVkZGVyKGRvYy50ZXh0KSksXG4gICAgfSkpO1xuXG4gICAgLy8gU29ydCBieSBjb21wdXRlZCBzY29yZVxuICAgIGNvbnN0IHNvcnRlZCA9IFsuLi5kb2NTY29yZXNdLnNvcnQoKGEsIGIpID0+IGIuc2NvcmUgLSBhLnNjb3JlKTtcblxuICAgIC8vIEZvciBNUlJcbiAgICBzZWFyY2hSYW5raW5ncy5wdXNoKHNvcnRlZC5tYXAoZCA9PiAoeyByZWxldmFudDogZC5yZWxldmFuY2UgPj0gMiB9KSkpO1xuXG4gICAgLy8gRm9yIE5EQ0dcbiAgICBjb25zdCBpZGVhbE9yZGVyID0gWy4uLnRlc3RDYXNlLmRvY3VtZW50c10uc29ydCgoYSwgYikgPT4gYi5yZWxldmFuY2UgLSBhLnJlbGV2YW5jZSk7XG4gICAgdG90YWxORENHICs9IGNhbGN1bGF0ZU5EQ0coc29ydGVkLCBpZGVhbE9yZGVyKTtcbiAgfVxuXG4gIGNvbnN0IHNlYXJjaE1SUiA9IGNhbGN1bGF0ZU1SUihzZWFyY2hSYW5raW5ncyk7XG4gIGNvbnN0IHNlYXJjaE5EQ0cgPSB0b3RhbE5EQ0cgLyBTRUFSQ0hfVEVTVF9DQVNFUy5sZW5ndGg7XG5cbiAgLy8gVGVzdCBjbHVzdGVyaW5nXG4gIGNvbnN0IGFsbENsdXN0ZXJJdGVtczogeyB0ZXh0OiBzdHJpbmc7IGNsdXN0ZXI6IG51bWJlciB9W10gPSBbXTtcbiAgQ0xVU1RFUl9URVNUX0NBU0VTLmZvckVhY2goKHRjLCBjbHVzdGVySWR4KSA9PiB7XG4gICAgdGMuaXRlbXMuZm9yRWFjaChpdGVtID0+IHtcbiAgICAgIGFsbENsdXN0ZXJJdGVtcy5wdXNoKHsgdGV4dDogaXRlbSwgY2x1c3RlcjogY2x1c3RlcklkeCB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgY29uc3QgY2x1c3RlckVtYmVkZGluZ3MgPSBhbGxDbHVzdGVySXRlbXMubWFwKGl0ZW0gPT4gZW1iZWRkZXIoaXRlbS50ZXh0KSk7XG4gIGNvbnN0IGNsdXN0ZXJMYWJlbHMgPSBhbGxDbHVzdGVySXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5jbHVzdGVyKTtcbiAgY29uc3Qgc2lsaG91ZXR0ZVNjb3JlID0gY2FsY3VsYXRlU2lsaG91ZXR0ZShjbHVzdGVyRW1iZWRkaW5ncywgY2x1c3RlckxhYmVscyk7XG5cbiAgLy8gQ2FsY3VsYXRlIGNsdXN0ZXIgcHVyaXR5IChob3cgd2VsbCBpdGVtcyBzdGF5IGluIHRoZWlyIGV4cGVjdGVkIGNsdXN0ZXIpXG4gIC8vIFVzaW5nIHNpbXBsZSBuZWFyZXN0LW5laWdoYm9yIGNsYXNzaWZpY2F0aW9uXG4gIGxldCBjb3JyZWN0Q2x1c3RlciA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY2x1c3RlckVtYmVkZGluZ3MubGVuZ3RoOyBpKyspIHtcbiAgICBsZXQgbmVhcmVzdElkeCA9IC0xO1xuICAgIGxldCBuZWFyZXN0RGlzdCA9IEluZmluaXR5O1xuICAgIGZvciAobGV0IGogPSAwOyBqIDwgY2x1c3RlckVtYmVkZGluZ3MubGVuZ3RoOyBqKyspIHtcbiAgICAgIGlmIChpICE9PSBqKSB7XG4gICAgICAgIGNvbnN0IGRpc3QgPSBldWNsaWRlYW5EaXN0YW5jZShjbHVzdGVyRW1iZWRkaW5nc1tpXSwgY2x1c3RlckVtYmVkZGluZ3Nbal0pO1xuICAgICAgICBpZiAoZGlzdCA8IG5lYXJlc3REaXN0KSB7XG4gICAgICAgICAgbmVhcmVzdERpc3QgPSBkaXN0O1xuICAgICAgICAgIG5lYXJlc3RJZHggPSBqO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChuZWFyZXN0SWR4ID49IDAgJiYgY2x1c3RlckxhYmVsc1tuZWFyZXN0SWR4XSA9PT0gY2x1c3RlckxhYmVsc1tpXSkge1xuICAgICAgY29ycmVjdENsdXN0ZXIrKztcbiAgICB9XG4gIH1cbiAgY29uc3QgY2x1c3RlclB1cml0eSA9IGNvcnJlY3RDbHVzdGVyIC8gY2x1c3RlckVtYmVkZGluZ3MubGVuZ3RoO1xuXG4gIHJldHVybiB7XG4gICAgc2ltaWxhcml0eUFjY3VyYWN5LFxuICAgIHNpbWlsYXJpdHlCeUNhdGVnb3J5LFxuICAgIGF2Z1NpbWlsYXJpdHlMYXRlbmN5TXM6IGxhdGVuY2llcy5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSAvIGxhdGVuY2llcy5sZW5ndGgsXG4gICAgY2x1c3RlclB1cml0eSxcbiAgICBzaWxob3VldHRlU2NvcmUsXG4gICAgc2VhcmNoTVJSLFxuICAgIHNlYXJjaE5EQ0csXG4gICAgc2ltaWxhcml0eVJlc3VsdHMsXG4gICAgdG90YWxQYWlyczogc2ltaWxhcml0eVJlc3VsdHMubGVuZ3RoLFxuICB9O1xufVxuXG4vKipcbiAqIEZvcm1hdCBlbWJlZGRpbmcgYmVuY2htYXJrIHJlc3VsdHMgZm9yIGRpc3BsYXlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdEVtYmVkZGluZ1Jlc3VsdHMocmVzdWx0czogRW1iZWRkaW5nQmVuY2htYXJrUmVzdWx0cyk6IHN0cmluZyB7XG4gIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gIGxpbmVzLnB1c2goJycpO1xuICBsaW5lcy5wdXNoKCfilZTilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZcnKTtcbiAgbGluZXMucHVzaCgn4pWRICAgICAgICAgICAgIEVNQkVERElORyBCRU5DSE1BUksgUkVTVUxUUyAgICAgICAgICAgICAgICAgICAgICDilZEnKTtcbiAgbGluZXMucHVzaCgn4pWg4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWjJyk7XG4gIGxpbmVzLnB1c2goYOKVkSAgU2ltaWxhcml0eSBEZXRlY3Rpb246ICR7KHJlc3VsdHMuc2ltaWxhcml0eUFjY3VyYWN5ICogMTAwKS50b0ZpeGVkKDEpfSVgLnBhZEVuZCg2MykgKyAn4pWRJyk7XG4gIGxpbmVzLnB1c2goJ+KVoOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVoycpO1xuICBsaW5lcy5wdXNoKCfilZEgIEJ5IENhdGVnb3J5OiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIOKVkScpO1xuXG4gIGZvciAoY29uc3QgW2NhdCwgYWNjXSBvZiBPYmplY3QuZW50cmllcyhyZXN1bHRzLnNpbWlsYXJpdHlCeUNhdGVnb3J5KS5zb3J0KChhLCBiKSA9PiBiWzFdIC0gYVsxXSkpIHtcbiAgICBjb25zdCBiYXIgPSAn4paIJy5yZXBlYXQoTWF0aC5mbG9vcihhY2MgKiAyMCkpICsgJ+KWkScucmVwZWF0KDIwIC0gTWF0aC5mbG9vcihhY2MgKiAyMCkpO1xuICAgIGxpbmVzLnB1c2goYOKVkSAgICAke2NhdC5wYWRFbmQoMTgpfSBbJHtiYXJ9XSAkeyhhY2MgKiAxMDApLnRvRml4ZWQoMCkucGFkU3RhcnQoMyl9JSAg4pWRYCk7XG4gIH1cblxuICBsaW5lcy5wdXNoKCfilaDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilaMnKTtcbiAgbGluZXMucHVzaCgn4pWRICBDbHVzdGVyaW5nIFF1YWxpdHk6ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICDilZEnKTtcbiAgbGluZXMucHVzaChg4pWRICAgIENsdXN0ZXIgUHVyaXR5OiAgICAkeyhyZXN1bHRzLmNsdXN0ZXJQdXJpdHkgKiAxMDApLnRvRml4ZWQoMSl9JWAucGFkRW5kKDYzKSArICfilZEnKTtcbiAgbGluZXMucHVzaChg4pWRICAgIFNpbGhvdWV0dGUgU2NvcmU6ICAke3Jlc3VsdHMuc2lsaG91ZXR0ZVNjb3JlLnRvRml4ZWQoMyl9YC5wYWRFbmQoNjMpICsgJ+KVkScpO1xuICBsaW5lcy5wdXNoKCfilaDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilaMnKTtcbiAgbGluZXMucHVzaCgn4pWRICBTZWFyY2ggUXVhbGl0eTogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICDilZEnKTtcbiAgbGluZXMucHVzaChg4pWRICAgIE1SUiAoTWVhbiBSZWNpcHJvY2FsIFJhbmspOiAgJHtyZXN1bHRzLnNlYXJjaE1SUi50b0ZpeGVkKDMpfWAucGFkRW5kKDYzKSArICfilZEnKTtcbiAgbGluZXMucHVzaChg4pWRICAgIE5EQ0c6ICAgICAgICAgICAgICAgICAgICAgICAgJHtyZXN1bHRzLnNlYXJjaE5EQ0cudG9GaXhlZCgzKX1gLnBhZEVuZCg2MykgKyAn4pWRJyk7XG4gIGxpbmVzLnB1c2goJ+KVoOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVoycpO1xuICBsaW5lcy5wdXNoKGDilZEgIEF2ZyBMYXRlbmN5OiAke3Jlc3VsdHMuYXZnU2ltaWxhcml0eUxhdGVuY3lNcy50b0ZpeGVkKDIpfW1zIHBlciBwYWlyYC5wYWRFbmQoNjMpICsgJ+KVkScpO1xuICBsaW5lcy5wdXNoKCfilZrilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZ0nKTtcblxuICAvLyBRdWFsaXR5IGFzc2Vzc21lbnRcbiAgbGluZXMucHVzaCgnJyk7XG4gIGxpbmVzLnB1c2goJ1F1YWxpdHkgQXNzZXNzbWVudDonKTtcblxuICBpZiAocmVzdWx0cy5zaW1pbGFyaXR5QWNjdXJhY3kgPj0gMC44KSB7XG4gICAgbGluZXMucHVzaCgnICDinJMgU2ltaWxhcml0eSBkZXRlY3Rpb246IEVYQ0VMTEVOVCAo4omlODAlKScpO1xuICB9IGVsc2UgaWYgKHJlc3VsdHMuc2ltaWxhcml0eUFjY3VyYWN5ID49IDAuNikge1xuICAgIGxpbmVzLnB1c2goJyAgfiBTaW1pbGFyaXR5IGRldGVjdGlvbjogR09PRCAoNjAtODAlKScpO1xuICB9IGVsc2Uge1xuICAgIGxpbmVzLnB1c2goJyAg4pyXIFNpbWlsYXJpdHkgZGV0ZWN0aW9uOiBORUVEUyBJTVBST1ZFTUVOVCAoPDYwJSknKTtcbiAgfVxuXG4gIGlmIChyZXN1bHRzLnNlYXJjaE1SUiA+PSAwLjgpIHtcbiAgICBsaW5lcy5wdXNoKCcgIOKckyBTZWFyY2ggcXVhbGl0eSAoTVJSKTogRVhDRUxMRU5UICjiiaUwLjgpJyk7XG4gIH0gZWxzZSBpZiAocmVzdWx0cy5zZWFyY2hNUlIgPj0gMC41KSB7XG4gICAgbGluZXMucHVzaCgnICB+IFNlYXJjaCBxdWFsaXR5IChNUlIpOiBBQ0NFUFRBQkxFICgwLjUtMC44KScpO1xuICB9IGVsc2Uge1xuICAgIGxpbmVzLnB1c2goJyAg4pyXIFNlYXJjaCBxdWFsaXR5IChNUlIpOiBORUVEUyBJTVBST1ZFTUVOVCAoPDAuNSknKTtcbiAgfVxuXG4gIGlmIChyZXN1bHRzLmNsdXN0ZXJQdXJpdHkgPj0gMC44KSB7XG4gICAgbGluZXMucHVzaCgnICDinJMgQ2x1c3RlcmluZzogRVhDRUxMRU5UICjiiaU4MCUgcHVyaXR5KScpO1xuICB9IGVsc2UgaWYgKHJlc3VsdHMuY2x1c3RlclB1cml0eSA+PSAwLjYpIHtcbiAgICBsaW5lcy5wdXNoKCcgIH4gQ2x1c3RlcmluZzogQUNDRVBUQUJMRSAoNjAtODAlIHB1cml0eSknKTtcbiAgfSBlbHNlIHtcbiAgICBsaW5lcy5wdXNoKCcgIOKclyBDbHVzdGVyaW5nOiBORUVEUyBJTVBST1ZFTUVOVCAoPDYwJSBwdXJpdHkpJyk7XG4gIH1cblxuICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgU0lNSUxBUklUWV9URVNUX1BBSVJTLFxuICBTRUFSQ0hfVEVTVF9DQVNFUyxcbiAgQ0xVU1RFUl9URVNUX0NBU0VTLFxuICBydW5FbWJlZGRpbmdCZW5jaG1hcmssXG4gIGZvcm1hdEVtYmVkZGluZ1Jlc3VsdHMsXG4gIGlzQ29ycmVjdFNpbWlsYXJpdHksXG4gIGNhbGN1bGF0ZU1SUixcbiAgY2FsY3VsYXRlTkRDRyxcbn07XG4iXX0=