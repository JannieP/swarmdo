/**
 * Embedding Quality Benchmark for RuvLTRA Models
 *
 * Tests embedding quality for Claude Code use cases:
 * - Code similarity detection
 * - Task clustering
 * - Semantic search accuracy
 */
/**
 * Ground truth similarity pairs for testing
 * Tests whether embeddings correctly capture semantic similarity
 */
export const SIMILARITY_TEST_PAIRS = [
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
export const SEARCH_TEST_CASES = [
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
export const CLUSTER_TEST_CASES = [
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
export function isCorrectSimilarity(expected, computed) {
    const threshold = SIMILARITY_THRESHOLDS[expected];
    return computed >= threshold.min && computed <= threshold.max;
}
/**
 * Calculate Mean Reciprocal Rank for search results
 */
export function calculateMRR(rankings) {
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
export function calculateNDCG(results, idealOrder) {
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
export function calculateSilhouette(embeddings, labels) {
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
export function runEmbeddingBenchmark(embedder, similarityFn) {
    const similarityResults = [];
    const latencies = [];
    // Test similarity pairs
    for (const pair of SIMILARITY_TEST_PAIRS) {
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
    const categories = [...new Set(SIMILARITY_TEST_PAIRS.map(p => p.category))];
    const similarityByCategory = {};
    for (const cat of categories) {
        const catResults = similarityResults.filter((r, i) => SIMILARITY_TEST_PAIRS[i].category === cat);
        similarityByCategory[cat] = catResults.filter(r => r.correct).length / catResults.length;
    }
    // Test search quality (MRR and NDCG)
    const searchRankings = [];
    let totalNDCG = 0;
    for (const testCase of SEARCH_TEST_CASES) {
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
    const searchNDCG = totalNDCG / SEARCH_TEST_CASES.length;
    // Test clustering
    const allClusterItems = [];
    CLUSTER_TEST_CASES.forEach((tc, clusterIdx) => {
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
export function formatEmbeddingResults(results) {
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
export default {
    SIMILARITY_TEST_PAIRS,
    SEARCH_TEST_CASES,
    CLUSTER_TEST_CASES,
    runEmbeddingBenchmark,
    formatEmbeddingResults,
    isCorrectSimilarity,
    calculateMRR,
    calculateNDCG,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1iZWRkaW5nLWJlbmNobWFyay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9iZW5jaG1hcmtzL2VtYmVkZGluZy1iZW5jaG1hcmsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7R0FPRztBQTJDSDs7O0dBR0c7QUFDSCxNQUFNLENBQUMsTUFBTSxxQkFBcUIsR0FBb0I7SUFDcEQsNERBQTREO0lBQzVELEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsK0JBQStCLEVBQUUsS0FBSyxFQUFFLDRCQUE0QixFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRTtJQUN0SSxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLDhCQUE4QixFQUFFLEtBQUssRUFBRSxzQ0FBc0MsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUU7SUFDL0ksRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxnQ0FBZ0MsRUFBRSxLQUFLLEVBQUUsc0NBQXNDLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFO0lBQ2pKLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsMkJBQTJCLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRTtJQUN2SSxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLHNCQUFzQixFQUFFLEtBQUssRUFBRSw2QkFBNkIsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUU7SUFDM0gsRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxLQUFLLEVBQUUsMEJBQTBCLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUs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QUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDMUIsQ0FBQztBQUVELGVBQWU7SUFDYixxQkFBcUI7SUFDckIsaUJBQWlCO0lBQ2pCLGtCQUFrQjtJQUNsQixxQkFBcUI7SUFDckIsc0JBQXNCO0lBQ3RCLG1CQUFtQjtJQUNuQixZQUFZO0lBQ1osYUFBYTtDQUNkLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEVtYmVkZGluZyBRdWFsaXR5IEJlbmNobWFyayBmb3IgUnV2TFRSQSBNb2RlbHNcbiAqXG4gKiBUZXN0cyBlbWJlZGRpbmcgcXVhbGl0eSBmb3IgQ2xhdWRlIENvZGUgdXNlIGNhc2VzOlxuICogLSBDb2RlIHNpbWlsYXJpdHkgZGV0ZWN0aW9uXG4gKiAtIFRhc2sgY2x1c3RlcmluZ1xuICogLSBTZW1hbnRpYyBzZWFyY2ggYWNjdXJhY3lcbiAqL1xuXG5leHBvcnQgaW50ZXJmYWNlIEVtYmVkZGluZ1BhaXIge1xuICBpZDogc3RyaW5nO1xuICB0ZXh0MTogc3RyaW5nO1xuICB0ZXh0Mjogc3RyaW5nO1xuICBzaW1pbGFyaXR5OiAnaGlnaCcgfCAnbWVkaXVtJyB8ICdsb3cnIHwgJ25vbmUnO1xuICBjYXRlZ29yeTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEVtYmVkZGluZ1Jlc3VsdCB7XG4gIHBhaXJJZDogc3RyaW5nO1xuICBleHBlY3RlZFNpbWlsYXJpdHk6IHN0cmluZztcbiAgY29tcHV0ZWRTY29yZTogbnVtYmVyO1xuICBjb3JyZWN0OiBib29sZWFuO1xuICBsYXRlbmN5TXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDbHVzdGVyVGVzdENhc2Uge1xuICBpZDogc3RyaW5nO1xuICBpdGVtczogc3RyaW5nW107XG4gIGV4cGVjdGVkQ2x1c3Rlcjogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEVtYmVkZGluZ0JlbmNobWFya1Jlc3VsdHMge1xuICAvLyBTaW1pbGFyaXR5IGRldGVjdGlvblxuICBzaW1pbGFyaXR5QWNjdXJhY3k6IG51bWJlcjtcbiAgc2ltaWxhcml0eUJ5Q2F0ZWdvcnk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGF2Z1NpbWlsYXJpdHlMYXRlbmN5TXM6IG51bWJlcjtcblxuICAvLyBDbHVzdGVyaW5nIHF1YWxpdHlcbiAgY2x1c3RlclB1cml0eTogbnVtYmVyO1xuICBzaWxob3VldHRlU2NvcmU6IG51bWJlcjtcblxuICAvLyBTZWFyY2ggcXVhbGl0eVxuICBzZWFyY2hNUlI6IG51bWJlcjsgLy8gTWVhbiBSZWNpcHJvY2FsIFJhbmtcbiAgc2VhcmNoTkRDRzogbnVtYmVyOyAvLyBOb3JtYWxpemVkIERpc2NvdW50ZWQgQ3VtdWxhdGl2ZSBHYWluXG5cbiAgLy8gRGV0YWlsc1xuICBzaW1pbGFyaXR5UmVzdWx0czogRW1iZWRkaW5nUmVzdWx0W107XG4gIHRvdGFsUGFpcnM6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBHcm91bmQgdHJ1dGggc2ltaWxhcml0eSBwYWlycyBmb3IgdGVzdGluZ1xuICogVGVzdHMgd2hldGhlciBlbWJlZGRpbmdzIGNvcnJlY3RseSBjYXB0dXJlIHNlbWFudGljIHNpbWlsYXJpdHlcbiAqL1xuZXhwb3J0IGNvbnN0IFNJTUlMQVJJVFlfVEVTVF9QQUlSUzogRW1iZWRkaW5nUGFpcltdID0gW1xuICAvLyA9PT0gSElHSCBTSU1JTEFSSVRZIChzYW1lIGNvbmNlcHQsIGRpZmZlcmVudCB3b3JkaW5nKSA9PT1cbiAgeyBpZDogJ0gwMDEnLCB0ZXh0MTogJ2ltcGxlbWVudCB1c2VyIGF1dGhlbnRpY2F0aW9uJywgdGV4dDI6ICdjcmVhdGUgbG9naW4gZnVuY3Rpb25hbGl0eScsIHNpbWlsYXJpdHk6ICdoaWdoJywgY2F0ZWdvcnk6ICdjb2RlLXRhc2snIH0sXG4gIHsgaWQ6ICdIMDAyJywgdGV4dDE6ICd3cml0ZSB1bml0IHRlc3RzIGZvciB0aGUgQVBJJywgdGV4dDI6ICdjcmVhdGUgdGVzdCBjYXNlcyBmb3IgUkVTVCBlbmRwb2ludHMnLCBzaW1pbGFyaXR5OiAnaGlnaCcsIGNhdGVnb3J5OiAnY29kZS10YXNrJyB9LFxuICB7IGlkOiAnSDAwMycsIHRleHQxOiAnZml4IHRoZSBudWxsIHBvaW50ZXIgZXhjZXB0aW9uJywgdGV4dDI6ICdyZXNvbHZlIHRoZSBOdWxsUG9pbnRlckV4Y2VwdGlvbiBidWcnLCBzaW1pbGFyaXR5OiAnaGlnaCcsIGNhdGVnb3J5OiAnZGVidWdnaW5nJyB9LFxuICB7IGlkOiAnSDAwNCcsIHRleHQxOiAnb3B0aW1pemUgZGF0YWJhc2UgcXVlcmllcycsIHRleHQyOiAnaW1wcm92ZSBTUUwgcXVlcnkgcGVyZm9ybWFuY2UnLCBzaW1pbGFyaXR5OiAnaGlnaCcsIGNhdGVnb3J5OiAncGVyZm9ybWFuY2UnIH0sXG4gIHsgaWQ6ICdIMDA1JywgdGV4dDE6ICdkZXBsb3kgdG8gcHJvZHVjdGlvbicsIHRleHQyOiAncmVsZWFzZSB0byBwcm9kIGVudmlyb25tZW50Jywgc2ltaWxhcml0eTogJ2hpZ2gnLCBjYXRlZ29yeTogJ2Rldm9wcycgfSxcbiAgeyBpZDogJ0gwMDYnLCB0ZXh0MTogJ3JlZmFjdG9yIHRoZSBsZWdhY3kgY29kZScsIHRleHQyOiAncmVzdHJ1Y3R1cmUgb2xkIGNvZGViYXNlJywgc2ltaWxhcml0eTogJ2hpZ2gnLCBjYXRlZ29yeTogJ3JlZmFjdG9yaW5nJyB9LFxuICB7IGlkOiAnSDAwNycsIHRleHQxOiAnYWRkIGVycm9yIGhhbmRsaW5nJywgdGV4dDI6ICdpbXBsZW1lbnQgZXhjZXB0aW9uIGhhbmRsaW5nJywgc2ltaWxhcml0eTogJ2hpZ2gnLCBjYXRlZ29yeTogJ2NvZGUtdGFzaycgfSxcbiAgeyBpZDogJ0gwMDgnLCB0ZXh0MTogJ2NyZWF0ZSBSRVNUIEFQSSBlbmRwb2ludCcsIHRleHQyOiAnYnVpbGQgSFRUUCBBUEkgcm91dGUnLCBzaW1pbGFyaXR5OiAnaGlnaCcsIGNhdGVnb3J5OiAnY29kZS10YXNrJyB9LFxuICB7IGlkOiAnSDAwOScsIHRleHQxOiAnY2hlY2sgZm9yIFNRTCBpbmplY3Rpb24nLCB0ZXh0MjogJ2F1ZGl0IGZvciBTUUxpIHZ1bG5lcmFiaWxpdGllcycsIHNpbWlsYXJpdHk6ICdoaWdoJywgY2F0ZWdvcnk6ICdzZWN1cml0eScgfSxcbiAgeyBpZDogJ0gwMTAnLCB0ZXh0MTogJ2RvY3VtZW50IHRoZSBBUEknLCB0ZXh0MjogJ3dyaXRlIEFQSSBkb2N1bWVudGF0aW9uJywgc2ltaWxhcml0eTogJ2hpZ2gnLCBjYXRlZ29yeTogJ2RvY3VtZW50YXRpb24nIH0sXG5cbiAgLy8gQ29kZSBzbmlwcGV0cyAtIHNhbWUgZnVuY3Rpb25hbGl0eVxuICB7IGlkOiAnSDAxMScsIHRleHQxOiAnZnVuY3Rpb24gYWRkKGEsIGIpIHsgcmV0dXJuIGEgKyBiOyB9JywgdGV4dDI6ICdjb25zdCBzdW0gPSAoeCwgeSkgPT4geCArIHk7Jywgc2ltaWxhcml0eTogJ2hpZ2gnLCBjYXRlZ29yeTogJ2NvZGUtc25pcHBldCcgfSxcbiAgeyBpZDogJ0gwMTInLCB0ZXh0MTogJ2ZvciAobGV0IGkgPSAwOyBpIDwgYXJyLmxlbmd0aDsgaSsrKScsIHRleHQyOiAnYXJyLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7fSknLCBzaW1pbGFyaXR5OiAnaGlnaCcsIGNhdGVnb3J5OiAnY29kZS1zbmlwcGV0JyB9LFxuICB7IGlkOiAnSDAxMycsIHRleHQxOiAnYXN5bmMgZnVuY3Rpb24gZmV0Y2hEYXRhKCkgeyBhd2FpdCBmZXRjaCh1cmwpOyB9JywgdGV4dDI6ICdjb25zdCBnZXREYXRhID0gYXN5bmMgKCkgPT4geyBhd2FpdCBheGlvcy5nZXQodXJsKTsgfScsIHNpbWlsYXJpdHk6ICdoaWdoJywgY2F0ZWdvcnk6ICdjb2RlLXNuaXBwZXQnIH0sXG5cbiAgLy8gPT09IE1FRElVTSBTSU1JTEFSSVRZIChyZWxhdGVkIGJ1dCBkaWZmZXJlbnQpID09PVxuICB7IGlkOiAnTTAwMScsIHRleHQxOiAnaW1wbGVtZW50IHVzZXIgYXV0aGVudGljYXRpb24nLCB0ZXh0MjogJ2NyZWF0ZSB1c2VyIHJlZ2lzdHJhdGlvbicsIHNpbWlsYXJpdHk6ICdtZWRpdW0nLCBjYXRlZ29yeTogJ2NvZGUtdGFzaycgfSxcbiAgeyBpZDogJ00wMDInLCB0ZXh0MTogJ3dyaXRlIHVuaXQgdGVzdHMnLCB0ZXh0MjogJ3dyaXRlIGludGVncmF0aW9uIHRlc3RzJywgc2ltaWxhcml0eTogJ21lZGl1bScsIGNhdGVnb3J5OiAndGVzdGluZycgfSxcbiAgeyBpZDogJ00wMDMnLCB0ZXh0MTogJ2ZpeCB0aGUgYnVnIGluIGNoZWNrb3V0JywgdGV4dDI6ICdkZWJ1ZyB0aGUgcGF5bWVudCBmbG93Jywgc2ltaWxhcml0eTogJ21lZGl1bScsIGNhdGVnb3J5OiAnZGVidWdnaW5nJyB9LFxuICB7IGlkOiAnTTAwNCcsIHRleHQxOiAnb3B0aW1pemUgZnJvbnRlbmQgcGVyZm9ybWFuY2UnLCB0ZXh0MjogJ2ltcHJvdmUgYmFja2VuZCByZXNwb25zZSB0aW1lJywgc2ltaWxhcml0eTogJ21lZGl1bScsIGNhdGVnb3J5OiAncGVyZm9ybWFuY2UnIH0sXG4gIHsgaWQ6ICdNMDA1JywgdGV4dDE6ICdkZXBsb3kgdG8gc3RhZ2luZycsIHRleHQyOiAnZGVwbG95IHRvIHByb2R1Y3Rpb24nLCBzaW1pbGFyaXR5OiAnbWVkaXVtJywgY2F0ZWdvcnk6ICdkZXZvcHMnIH0sXG4gIHsgaWQ6ICdNMDA2JywgdGV4dDE6ICdSZWFjdCBjb21wb25lbnQnLCB0ZXh0MjogJ1Z1ZSBjb21wb25lbnQnLCBzaW1pbGFyaXR5OiAnbWVkaXVtJywgY2F0ZWdvcnk6ICdjb2RlLXNuaXBwZXQnIH0sXG4gIHsgaWQ6ICdNMDA3JywgdGV4dDE6ICdQb3N0Z3JlU1FMIHF1ZXJ5JywgdGV4dDI6ICdNeVNRTCBxdWVyeScsIHNpbWlsYXJpdHk6ICdtZWRpdW0nLCBjYXRlZ29yeTogJ2NvZGUtc25pcHBldCcgfSxcbiAgeyBpZDogJ00wMDgnLCB0ZXh0MTogJ1JFU1QgQVBJJywgdGV4dDI6ICdHcmFwaFFMIEFQSScsIHNpbWlsYXJpdHk6ICdtZWRpdW0nLCBjYXRlZ29yeTogJ2NvZGUtdGFzaycgfSxcbiAgeyBpZDogJ00wMDknLCB0ZXh0MTogJ05vZGUuanMgc2VydmVyJywgdGV4dDI6ICdQeXRob24gRmxhc2sgc2VydmVyJywgc2ltaWxhcml0eTogJ21lZGl1bScsIGNhdGVnb3J5OiAnY29kZS1zbmlwcGV0JyB9LFxuICB7IGlkOiAnTTAxMCcsIHRleHQxOiAnYWRkIGNhY2hpbmcgbGF5ZXInLCB0ZXh0MjogJ2ltcGxlbWVudCByYXRlIGxpbWl0aW5nJywgc2ltaWxhcml0eTogJ21lZGl1bScsIGNhdGVnb3J5OiAncGVyZm9ybWFuY2UnIH0sXG5cbiAgLy8gPT09IExPVyBTSU1JTEFSSVRZIChzYW1lIGRvbWFpbiwgZGlmZmVyZW50IHRhc2spID09PVxuICB7IGlkOiAnTDAwMScsIHRleHQxOiAnaW1wbGVtZW50IGF1dGhlbnRpY2F0aW9uJywgdGV4dDI6ICd3cml0ZSBkb2N1bWVudGF0aW9uJywgc2ltaWxhcml0eTogJ2xvdycsIGNhdGVnb3J5OiAnY29kZS10YXNrJyB9LFxuICB7IGlkOiAnTDAwMicsIHRleHQxOiAnZml4IGJ1ZycsIHRleHQyOiAnYWRkIG5ldyBmZWF0dXJlJywgc2ltaWxhcml0eTogJ2xvdycsIGNhdGVnb3J5OiAnY29kZS10YXNrJyB9LFxuICB7IGlkOiAnTDAwMycsIHRleHQxOiAnb3B0aW1pemUgcXVlcnknLCB0ZXh0MjogJ3JldmlldyBwdWxsIHJlcXVlc3QnLCBzaW1pbGFyaXR5OiAnbG93JywgY2F0ZWdvcnk6ICdtaXhlZCcgfSxcbiAgeyBpZDogJ0wwMDQnLCB0ZXh0MTogJ2RlcGxveSBhcHBsaWNhdGlvbicsIHRleHQyOiAnZGVzaWduIGFyY2hpdGVjdHVyZScsIHNpbWlsYXJpdHk6ICdsb3cnLCBjYXRlZ29yeTogJ21peGVkJyB9LFxuICB7IGlkOiAnTDAwNScsIHRleHQxOiAnZnJvbnRlbmQgUmVhY3QgY29kZScsIHRleHQyOiAnYmFja2VuZCBkYXRhYmFzZSBtaWdyYXRpb24nLCBzaW1pbGFyaXR5OiAnbG93JywgY2F0ZWdvcnk6ICdjb2RlLXNuaXBwZXQnIH0sXG4gIHsgaWQ6ICdMMDA2JywgdGV4dDE6ICdzZWN1cml0eSBhdWRpdCcsIHRleHQyOiAncGVyZm9ybWFuY2UgYmVuY2htYXJrJywgc2ltaWxhcml0eTogJ2xvdycsIGNhdGVnb3J5OiAnbWl4ZWQnIH0sXG4gIHsgaWQ6ICdMMDA3JywgdGV4dDE6ICd3cml0ZSB1bml0IHRlc3RzJywgdGV4dDI6ICdjcmVhdGUgQ0kvQ0QgcGlwZWxpbmUnLCBzaW1pbGFyaXR5OiAnbG93JywgY2F0ZWdvcnk6ICdtaXhlZCcgfSxcbiAgeyBpZDogJ0wwMDgnLCB0ZXh0MTogJ0NTUyBzdHlsaW5nJywgdGV4dDI6ICdkYXRhYmFzZSBzY2hlbWEnLCBzaW1pbGFyaXR5OiAnbG93JywgY2F0ZWdvcnk6ICdjb2RlLXNuaXBwZXQnIH0sXG5cbiAgLy8gPT09IE5PIFNJTUlMQVJJVFkgKHVucmVsYXRlZCkgPT09XG4gIHsgaWQ6ICdOMDAxJywgdGV4dDE6ICdpbXBsZW1lbnQgdXNlciBsb2dpbicsIHRleHQyOiAndGhlIHdlYXRoZXIgaXMgbmljZSB0b2RheScsIHNpbWlsYXJpdHk6ICdub25lJywgY2F0ZWdvcnk6ICd1bnJlbGF0ZWQnIH0sXG4gIHsgaWQ6ICdOMDAyJywgdGV4dDE6ICdmaXggSmF2YVNjcmlwdCBidWcnLCB0ZXh0MjogJ3JlY2lwZSBmb3IgY2hvY29sYXRlIGNha2UnLCBzaW1pbGFyaXR5OiAnbm9uZScsIGNhdGVnb3J5OiAndW5yZWxhdGVkJyB9LFxuICB7IGlkOiAnTjAwMycsIHRleHQxOiAnZGVwbG95IEt1YmVybmV0ZXMgY2x1c3RlcicsIHRleHQyOiAnYm9vayBhIGZsaWdodCB0byBQYXJpcycsIHNpbWlsYXJpdHk6ICdub25lJywgY2F0ZWdvcnk6ICd1bnJlbGF0ZWQnIH0sXG4gIHsgaWQ6ICdOMDA0JywgdGV4dDE6ICdvcHRpbWl6ZSBTUUwgcXVlcnknLCB0ZXh0MjogJ2xlYXJuIHRvIHBsYXkgZ3VpdGFyJywgc2ltaWxhcml0eTogJ25vbmUnLCBjYXRlZ29yeTogJ3VucmVsYXRlZCcgfSxcbiAgeyBpZDogJ04wMDUnLCB0ZXh0MTogJ2NvbnN0IHggPSA0MjsnLCB0ZXh0MjogJ3Jvc2VzIGFyZSByZWQgdmlvbGV0cyBhcmUgYmx1ZScsIHNpbWlsYXJpdHk6ICdub25lJywgY2F0ZWdvcnk6ICd1bnJlbGF0ZWQnIH0sXG5dO1xuXG4vKipcbiAqIFNlYXJjaCByZWxldmFuY2UgdGVzdCBjYXNlc1xuICogUXVlcnkgKyBkb2N1bWVudHMgd2l0aCByZWxldmFuY2Ugc2NvcmVzXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VhcmNoVGVzdENhc2Uge1xuICBpZDogc3RyaW5nO1xuICBxdWVyeTogc3RyaW5nO1xuICBkb2N1bWVudHM6IHsgdGV4dDogc3RyaW5nOyByZWxldmFuY2U6IG51bWJlciB9W107IC8vIHJlbGV2YW5jZTogMC0zICgwPWlycmVsZXZhbnQsIDM9aGlnaGx5IHJlbGV2YW50KVxufVxuXG5leHBvcnQgY29uc3QgU0VBUkNIX1RFU1RfQ0FTRVM6IFNlYXJjaFRlc3RDYXNlW10gPSBbXG4gIHtcbiAgICBpZDogJ1MwMDEnLFxuICAgIHF1ZXJ5OiAnaG93IHRvIGltcGxlbWVudCB1c2VyIGF1dGhlbnRpY2F0aW9uIGluIE5vZGUuanMnLFxuICAgIGRvY3VtZW50czogW1xuICAgICAgeyB0ZXh0OiAnSW1wbGVtZW50aW5nIEpXVCBhdXRoZW50aWNhdGlvbiBpbiBFeHByZXNzLmpzIHdpdGggcGFzc3BvcnQnLCByZWxldmFuY2U6IDMgfSxcbiAgICAgIHsgdGV4dDogJ05vZGUuanMgbG9naW4gc3lzdGVtIHdpdGggYmNyeXB0IHBhc3N3b3JkIGhhc2hpbmcnLCByZWxldmFuY2U6IDMgfSxcbiAgICAgIHsgdGV4dDogJ0J1aWxkaW5nIGEgUmVhY3QgbG9naW4gZm9ybSBjb21wb25lbnQnLCByZWxldmFuY2U6IDIgfSxcbiAgICAgIHsgdGV4dDogJ1Bvc3RncmVTUUwgdXNlciB0YWJsZSBzY2hlbWEgZGVzaWduJywgcmVsZXZhbmNlOiAxIH0sXG4gICAgICB7IHRleHQ6ICdIb3cgdG8gZGVwbG95IERvY2tlciBjb250YWluZXJzJywgcmVsZXZhbmNlOiAwIH0sXG4gICAgXSxcbiAgfSxcbiAge1xuICAgIGlkOiAnUzAwMicsXG4gICAgcXVlcnk6ICdmaXggbWVtb3J5IGxlYWsgaW4gSmF2YVNjcmlwdCcsXG4gICAgZG9jdW1lbnRzOiBbXG4gICAgICB7IHRleHQ6ICdEZWJ1Z2dpbmcgbWVtb3J5IGxlYWtzIHdpdGggQ2hyb21lIERldlRvb2xzIGhlYXAgc25hcHNob3RzJywgcmVsZXZhbmNlOiAzIH0sXG4gICAgICB7IHRleHQ6ICdDb21tb24gY2F1c2VzIG9mIG1lbW9yeSBsZWFrcyBpbiBOb2RlLmpzIGFwcGxpY2F0aW9ucycsIHJlbGV2YW5jZTogMyB9LFxuICAgICAgeyB0ZXh0OiAnSmF2YVNjcmlwdCBnYXJiYWdlIGNvbGxlY3Rpb24gZXhwbGFpbmVkJywgcmVsZXZhbmNlOiAyIH0sXG4gICAgICB7IHRleHQ6ICdPcHRpbWl6aW5nIFJlYWN0IGNvbXBvbmVudCByZS1yZW5kZXJzJywgcmVsZXZhbmNlOiAxIH0sXG4gICAgICB7IHRleHQ6ICdDU1MgZmxleGJveCBsYXlvdXQgdHV0b3JpYWwnLCByZWxldmFuY2U6IDAgfSxcbiAgICBdLFxuICB9LFxuICB7XG4gICAgaWQ6ICdTMDAzJyxcbiAgICBxdWVyeTogJ2RhdGFiYXNlIG1pZ3JhdGlvbiBiZXN0IHByYWN0aWNlcycsXG4gICAgZG9jdW1lbnRzOiBbXG4gICAgICB7IHRleHQ6ICdTY2hlbWEgbWlncmF0aW9uIHN0cmF0ZWdpZXMgZm9yIHplcm8tZG93bnRpbWUgZGVwbG95bWVudHMnLCByZWxldmFuY2U6IDMgfSxcbiAgICAgIHsgdGV4dDogJ1VzaW5nIFByaXNtYSBtaWdyYXRlIGZvciBQb3N0Z3JlU1FMIHNjaGVtYSBjaGFuZ2VzJywgcmVsZXZhbmNlOiAzIH0sXG4gICAgICB7IHRleHQ6ICdEYXRhYmFzZSBiYWNrdXAgYW5kIHJlY292ZXJ5IHByb2NlZHVyZXMnLCByZWxldmFuY2U6IDIgfSxcbiAgICAgIHsgdGV4dDogJ1NRTCBxdWVyeSBvcHRpbWl6YXRpb24gdGVjaG5pcXVlcycsIHJlbGV2YW5jZTogMSB9LFxuICAgICAgeyB0ZXh0OiAnUmVhY3Qgc3RhdGUgbWFuYWdlbWVudCB3aXRoIFJlZHV4JywgcmVsZXZhbmNlOiAwIH0sXG4gICAgXSxcbiAgfSxcbiAge1xuICAgIGlkOiAnUzAwNCcsXG4gICAgcXVlcnk6ICd3cml0ZSB1bml0IHRlc3RzIGZvciBSZWFjdCBjb21wb25lbnRzJyxcbiAgICBkb2N1bWVudHM6IFtcbiAgICAgIHsgdGV4dDogJ1Rlc3RpbmcgUmVhY3QgY29tcG9uZW50cyB3aXRoIEplc3QgYW5kIFJlYWN0IFRlc3RpbmcgTGlicmFyeScsIHJlbGV2YW5jZTogMyB9LFxuICAgICAgeyB0ZXh0OiAnU25hcHNob3QgdGVzdGluZyBmb3IgVUkgY29tcG9uZW50cycsIHJlbGV2YW5jZTogMyB9LFxuICAgICAgeyB0ZXh0OiAnTW9ja2luZyBBUEkgY2FsbHMgaW4gZnJvbnRlbmQgdGVzdHMnLCByZWxldmFuY2U6IDIgfSxcbiAgICAgIHsgdGV4dDogJ0VuZC10by1lbmQgdGVzdGluZyB3aXRoIEN5cHJlc3MnLCByZWxldmFuY2U6IDEgfSxcbiAgICAgIHsgdGV4dDogJ0t1YmVybmV0ZXMgcG9kIGNvbmZpZ3VyYXRpb24nLCByZWxldmFuY2U6IDAgfSxcbiAgICBdLFxuICB9LFxuICB7XG4gICAgaWQ6ICdTMDA1JyxcbiAgICBxdWVyeTogJ29wdGltaXplIEFQSSByZXNwb25zZSB0aW1lJyxcbiAgICBkb2N1bWVudHM6IFtcbiAgICAgIHsgdGV4dDogJ0ltcGxlbWVudGluZyBSZWRpcyBjYWNoaW5nIGZvciBBUEkgZW5kcG9pbnRzJywgcmVsZXZhbmNlOiAzIH0sXG4gICAgICB7IHRleHQ6ICdEYXRhYmFzZSBxdWVyeSBvcHRpbWl6YXRpb24gd2l0aCBpbmRleGVzJywgcmVsZXZhbmNlOiAzIH0sXG4gICAgICB7IHRleHQ6ICdVc2luZyBDRE4gZm9yIHN0YXRpYyBhc3NldCBkZWxpdmVyeScsIHJlbGV2YW5jZTogMiB9LFxuICAgICAgeyB0ZXh0OiAnTG9hZCBiYWxhbmNpbmcgc3RyYXRlZ2llcyBmb3IgbWljcm9zZXJ2aWNlcycsIHJlbGV2YW5jZTogMiB9LFxuICAgICAgeyB0ZXh0OiAnV3JpdGluZyBjbGVhbiBKYXZhU2NyaXB0IGNvZGUnLCByZWxldmFuY2U6IDAgfSxcbiAgICBdLFxuICB9LFxuXTtcblxuLyoqXG4gKiBDbHVzdGVyIHRlc3QgY2FzZXMgLSBpdGVtcyB0aGF0IHNob3VsZCBjbHVzdGVyIHRvZ2V0aGVyXG4gKi9cbmV4cG9ydCBjb25zdCBDTFVTVEVSX1RFU1RfQ0FTRVM6IENsdXN0ZXJUZXN0Q2FzZVtdID0gW1xuICB7XG4gICAgaWQ6ICdDTDAwMScsXG4gICAgZXhwZWN0ZWRDbHVzdGVyOiAnYXV0aGVudGljYXRpb24nLFxuICAgIGl0ZW1zOiBbXG4gICAgICAnaW1wbGVtZW50IHVzZXIgbG9naW4nLFxuICAgICAgJ2FkZCBKV1QgdG9rZW4gdmFsaWRhdGlvbicsXG4gICAgICAnY3JlYXRlIHBhc3N3b3JkIHJlc2V0IGZsb3cnLFxuICAgICAgJ2ltcGxlbWVudCBPQXV0aCBpbnRlZ3JhdGlvbicsXG4gICAgICAnYWRkIHR3by1mYWN0b3IgYXV0aGVudGljYXRpb24nLFxuICAgIF0sXG4gIH0sXG4gIHtcbiAgICBpZDogJ0NMMDAyJyxcbiAgICBleHBlY3RlZENsdXN0ZXI6ICd0ZXN0aW5nJyxcbiAgICBpdGVtczogW1xuICAgICAgJ3dyaXRlIHVuaXQgdGVzdHMnLFxuICAgICAgJ2FkZCBpbnRlZ3JhdGlvbiB0ZXN0cycsXG4gICAgICAnY3JlYXRlIEUyRSB0ZXN0IHN1aXRlJyxcbiAgICAgICdpbXByb3ZlIHRlc3QgY292ZXJhZ2UnLFxuICAgICAgJ2FkZCBzbmFwc2hvdCB0ZXN0cycsXG4gICAgXSxcbiAgfSxcbiAge1xuICAgIGlkOiAnQ0wwMDMnLFxuICAgIGV4cGVjdGVkQ2x1c3RlcjogJ2RhdGFiYXNlJyxcbiAgICBpdGVtczogW1xuICAgICAgJ29wdGltaXplIFNRTCBxdWVyaWVzJyxcbiAgICAgICdhZGQgZGF0YWJhc2UgaW5kZXhlcycsXG4gICAgICAnY3JlYXRlIG1pZ3JhdGlvbiBzY3JpcHQnLFxuICAgICAgJ2ltcGxlbWVudCBjb25uZWN0aW9uIHBvb2xpbmcnLFxuICAgICAgJ2Rlc2lnbiBzY2hlbWEgZm9yIHVzZXJzIHRhYmxlJyxcbiAgICBdLFxuICB9LFxuICB7XG4gICAgaWQ6ICdDTDAwNCcsXG4gICAgZXhwZWN0ZWRDbHVzdGVyOiAnZnJvbnRlbmQnLFxuICAgIGl0ZW1zOiBbXG4gICAgICAnYnVpbGQgUmVhY3QgY29tcG9uZW50JyxcbiAgICAgICdhZGQgQ1NTIHN0eWxpbmcnLFxuICAgICAgJ2ltcGxlbWVudCByZXNwb25zaXZlIGRlc2lnbicsXG4gICAgICAnY3JlYXRlIGZvcm0gdmFsaWRhdGlvbicsXG4gICAgICAnYWRkIGxvYWRpbmcgc3Bpbm5lcicsXG4gICAgXSxcbiAgfSxcbiAge1xuICAgIGlkOiAnQ0wwMDUnLFxuICAgIGV4cGVjdGVkQ2x1c3RlcjogJ2Rldm9wcycsXG4gICAgaXRlbXM6IFtcbiAgICAgICdzZXQgdXAgQ0kvQ0QgcGlwZWxpbmUnLFxuICAgICAgJ2NvbmZpZ3VyZSBLdWJlcm5ldGVzIGRlcGxveW1lbnQnLFxuICAgICAgJ2NyZWF0ZSBEb2NrZXIgY29udGFpbmVyJyxcbiAgICAgICdhZGQgbW9uaXRvcmluZyBhbGVydHMnLFxuICAgICAgJ2ltcGxlbWVudCBhdXRvLXNjYWxpbmcnLFxuICAgIF0sXG4gIH0sXG5dO1xuXG4vKipcbiAqIEV4cGVjdGVkIHNpbWlsYXJpdHkgc2NvcmUgcmFuZ2VzXG4gKi9cbmNvbnN0IFNJTUlMQVJJVFlfVEhSRVNIT0xEUyA9IHtcbiAgaGlnaDogeyBtaW46IDAuNywgbWF4OiAxLjAgfSxcbiAgbWVkaXVtOiB7IG1pbjogMC40LCBtYXg6IDAuNyB9LFxuICBsb3c6IHsgbWluOiAwLjIsIG1heDogMC40IH0sXG4gIG5vbmU6IHsgbWluOiAwLjAsIG1heDogMC4yIH0sXG59O1xuXG4vKipcbiAqIENoZWNrIGlmIGNvbXB1dGVkIHNpbWlsYXJpdHkgbWF0Y2hlcyBleHBlY3RlZCBjYXRlZ29yeVxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNDb3JyZWN0U2ltaWxhcml0eShcbiAgZXhwZWN0ZWQ6ICdoaWdoJyB8ICdtZWRpdW0nIHwgJ2xvdycgfCAnbm9uZScsXG4gIGNvbXB1dGVkOiBudW1iZXJcbik6IGJvb2xlYW4ge1xuICBjb25zdCB0aHJlc2hvbGQgPSBTSU1JTEFSSVRZX1RIUkVTSE9MRFNbZXhwZWN0ZWRdO1xuICByZXR1cm4gY29tcHV0ZWQgPj0gdGhyZXNob2xkLm1pbiAmJiBjb21wdXRlZCA8PSB0aHJlc2hvbGQubWF4O1xufVxuXG4vKipcbiAqIENhbGN1bGF0ZSBNZWFuIFJlY2lwcm9jYWwgUmFuayBmb3Igc2VhcmNoIHJlc3VsdHNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbGN1bGF0ZU1SUihcbiAgcmFua2luZ3M6IHsgcmVsZXZhbnQ6IGJvb2xlYW4gfVtdW11cbik6IG51bWJlciB7XG4gIGxldCBzdW1SUiA9IDA7XG4gIGZvciAoY29uc3QgcmFua2luZyBvZiByYW5raW5ncykge1xuICAgIGNvbnN0IGZpcnN0UmVsZXZhbnRJZHggPSByYW5raW5nLmZpbmRJbmRleChyID0+IHIucmVsZXZhbnQpO1xuICAgIGlmIChmaXJzdFJlbGV2YW50SWR4ID49IDApIHtcbiAgICAgIHN1bVJSICs9IDEgLyAoZmlyc3RSZWxldmFudElkeCArIDEpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3VtUlIgLyByYW5raW5ncy5sZW5ndGg7XG59XG5cbi8qKlxuICogQ2FsY3VsYXRlIE5EQ0cgZm9yIHNlYXJjaCByZXN1bHRzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYWxjdWxhdGVORENHKFxuICByZXN1bHRzOiB7IHJlbGV2YW5jZTogbnVtYmVyIH1bXSxcbiAgaWRlYWxPcmRlcjogeyByZWxldmFuY2U6IG51bWJlciB9W11cbik6IG51bWJlciB7XG4gIGNvbnN0IGRjZyA9IHJlc3VsdHMucmVkdWNlKChzdW0sIHIsIGkpID0+IHtcbiAgICByZXR1cm4gc3VtICsgKE1hdGgucG93KDIsIHIucmVsZXZhbmNlKSAtIDEpIC8gTWF0aC5sb2cyKGkgKyAyKTtcbiAgfSwgMCk7XG5cbiAgY29uc3QgaWRjZyA9IGlkZWFsT3JkZXIucmVkdWNlKChzdW0sIHIsIGkpID0+IHtcbiAgICByZXR1cm4gc3VtICsgKE1hdGgucG93KDIsIHIucmVsZXZhbmNlKSAtIDEpIC8gTWF0aC5sb2cyKGkgKyAyKTtcbiAgfSwgMCk7XG5cbiAgcmV0dXJuIGlkY2cgPiAwID8gZGNnIC8gaWRjZyA6IDA7XG59XG5cbi8qKlxuICogQ2FsY3VsYXRlIHNpbGhvdWV0dGUgc2NvcmUgZm9yIGNsdXN0ZXJpbmdcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhbGN1bGF0ZVNpbGhvdWV0dGUoXG4gIGVtYmVkZGluZ3M6IG51bWJlcltdW10sXG4gIGxhYmVsczogbnVtYmVyW11cbik6IG51bWJlciB7XG4gIC8vIFNpbXBsaWZpZWQgc2lsaG91ZXR0ZSBjYWxjdWxhdGlvblxuICBjb25zdCBuID0gZW1iZWRkaW5ncy5sZW5ndGg7XG4gIGlmIChuIDwgMikgcmV0dXJuIDA7XG5cbiAgbGV0IHRvdGFsU2lsaG91ZXR0ZSA9IDA7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICBjb25zdCBjbHVzdGVyID0gbGFiZWxzW2ldO1xuXG4gICAgLy8gQ2FsY3VsYXRlIG1lYW4gaW50cmEtY2x1c3RlciBkaXN0YW5jZSAoYSlcbiAgICBsZXQgaW50cmFTdW0gPSAwO1xuICAgIGxldCBpbnRyYUNvdW50ID0gMDtcbiAgICBmb3IgKGxldCBqID0gMDsgaiA8IG47IGorKykge1xuICAgICAgaWYgKGkgIT09IGogJiYgbGFiZWxzW2pdID09PSBjbHVzdGVyKSB7XG4gICAgICAgIGludHJhU3VtICs9IGV1Y2xpZGVhbkRpc3RhbmNlKGVtYmVkZGluZ3NbaV0sIGVtYmVkZGluZ3Nbal0pO1xuICAgICAgICBpbnRyYUNvdW50Kys7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGEgPSBpbnRyYUNvdW50ID4gMCA/IGludHJhU3VtIC8gaW50cmFDb3VudCA6IDA7XG5cbiAgICAvLyBDYWxjdWxhdGUgbWluIG1lYW4gaW50ZXItY2x1c3RlciBkaXN0YW5jZSAoYilcbiAgICBjb25zdCBvdGhlckNsdXN0ZXJzID0gWy4uLm5ldyBTZXQobGFiZWxzKV0uZmlsdGVyKGMgPT4gYyAhPT0gY2x1c3Rlcik7XG4gICAgbGV0IG1pbkludGVyTWVhbiA9IEluZmluaXR5O1xuXG4gICAgZm9yIChjb25zdCBvdGhlckNsdXN0ZXIgb2Ygb3RoZXJDbHVzdGVycykge1xuICAgICAgbGV0IGludGVyU3VtID0gMDtcbiAgICAgIGxldCBpbnRlckNvdW50ID0gMDtcbiAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgbjsgaisrKSB7XG4gICAgICAgIGlmIChsYWJlbHNbal0gPT09IG90aGVyQ2x1c3Rlcikge1xuICAgICAgICAgIGludGVyU3VtICs9IGV1Y2xpZGVhbkRpc3RhbmNlKGVtYmVkZGluZ3NbaV0sIGVtYmVkZGluZ3Nbal0pO1xuICAgICAgICAgIGludGVyQ291bnQrKztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGludGVyQ291bnQgPiAwKSB7XG4gICAgICAgIG1pbkludGVyTWVhbiA9IE1hdGgubWluKG1pbkludGVyTWVhbiwgaW50ZXJTdW0gLyBpbnRlckNvdW50KTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgYiA9IG1pbkludGVyTWVhbiA9PT0gSW5maW5pdHkgPyAwIDogbWluSW50ZXJNZWFuO1xuXG4gICAgLy8gU2lsaG91ZXR0ZSBmb3IgdGhpcyBwb2ludFxuICAgIGNvbnN0IHMgPSBNYXRoLm1heChhLCBiKSA+IDAgPyAoYiAtIGEpIC8gTWF0aC5tYXgoYSwgYikgOiAwO1xuICAgIHRvdGFsU2lsaG91ZXR0ZSArPSBzO1xuICB9XG5cbiAgcmV0dXJuIHRvdGFsU2lsaG91ZXR0ZSAvIG47XG59XG5cbmZ1bmN0aW9uIGV1Y2xpZGVhbkRpc3RhbmNlKGE6IG51bWJlcltdLCBiOiBudW1iZXJbXSk6IG51bWJlciB7XG4gIGxldCBzdW0gPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICBzdW0gKz0gTWF0aC5wb3coYVtpXSAtIGJbaV0sIDIpO1xuICB9XG4gIHJldHVybiBNYXRoLnNxcnQoc3VtKTtcbn1cblxuLyoqXG4gKiBSdW4gdGhlIGVtYmVkZGluZyBiZW5jaG1hcmtcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJ1bkVtYmVkZGluZ0JlbmNobWFyayhcbiAgZW1iZWRkZXI6ICh0ZXh0OiBzdHJpbmcpID0+IG51bWJlcltdLFxuICBzaW1pbGFyaXR5Rm46IChhOiBudW1iZXJbXSwgYjogbnVtYmVyW10pID0+IG51bWJlclxuKTogRW1iZWRkaW5nQmVuY2htYXJrUmVzdWx0cyB7XG4gIGNvbnN0IHNpbWlsYXJpdHlSZXN1bHRzOiBFbWJlZGRpbmdSZXN1bHRbXSA9IFtdO1xuICBjb25zdCBsYXRlbmNpZXM6IG51bWJlcltdID0gW107XG5cbiAgLy8gVGVzdCBzaW1pbGFyaXR5IHBhaXJzXG4gIGZvciAoY29uc3QgcGFpciBvZiBTSU1JTEFSSVRZX1RFU1RfUEFJUlMpIHtcbiAgICBjb25zdCBzdGFydCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgIGNvbnN0IGVtYjEgPSBlbWJlZGRlcihwYWlyLnRleHQxKTtcbiAgICBjb25zdCBlbWIyID0gZW1iZWRkZXIocGFpci50ZXh0Mik7XG4gICAgY29uc3Qgc2NvcmUgPSBzaW1pbGFyaXR5Rm4oZW1iMSwgZW1iMik7XG4gICAgY29uc3QgbGF0ZW5jeU1zID0gcGVyZm9ybWFuY2Uubm93KCkgLSBzdGFydDtcblxuICAgIGxhdGVuY2llcy5wdXNoKGxhdGVuY3lNcyk7XG5cbiAgICBzaW1pbGFyaXR5UmVzdWx0cy5wdXNoKHtcbiAgICAgIHBhaXJJZDogcGFpci5pZCxcbiAgICAgIGV4cGVjdGVkU2ltaWxhcml0eTogcGFpci5zaW1pbGFyaXR5LFxuICAgICAgY29tcHV0ZWRTY29yZTogc2NvcmUsXG4gICAgICBjb3JyZWN0OiBpc0NvcnJlY3RTaW1pbGFyaXR5KHBhaXIuc2ltaWxhcml0eSwgc2NvcmUpLFxuICAgICAgbGF0ZW5jeU1zLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gQ2FsY3VsYXRlIHNpbWlsYXJpdHkgYWNjdXJhY3lcbiAgY29uc3QgY29ycmVjdFNpbWlsYXJpdHkgPSBzaW1pbGFyaXR5UmVzdWx0cy5maWx0ZXIociA9PiByLmNvcnJlY3QpLmxlbmd0aDtcbiAgY29uc3Qgc2ltaWxhcml0eUFjY3VyYWN5ID0gY29ycmVjdFNpbWlsYXJpdHkgLyBzaW1pbGFyaXR5UmVzdWx0cy5sZW5ndGg7XG5cbiAgLy8gQWNjdXJhY3kgYnkgY2F0ZWdvcnlcbiAgY29uc3QgY2F0ZWdvcmllcyA9IFsuLi5uZXcgU2V0KFNJTUlMQVJJVFlfVEVTVF9QQUlSUy5tYXAocCA9PiBwLmNhdGVnb3J5KSldO1xuICBjb25zdCBzaW1pbGFyaXR5QnlDYXRlZ29yeTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBmb3IgKGNvbnN0IGNhdCBvZiBjYXRlZ29yaWVzKSB7XG4gICAgY29uc3QgY2F0UmVzdWx0cyA9IHNpbWlsYXJpdHlSZXN1bHRzLmZpbHRlcihcbiAgICAgIChyLCBpKSA9PiBTSU1JTEFSSVRZX1RFU1RfUEFJUlNbaV0uY2F0ZWdvcnkgPT09IGNhdFxuICAgICk7XG4gICAgc2ltaWxhcml0eUJ5Q2F0ZWdvcnlbY2F0XSA9IGNhdFJlc3VsdHMuZmlsdGVyKHIgPT4gci5jb3JyZWN0KS5sZW5ndGggLyBjYXRSZXN1bHRzLmxlbmd0aDtcbiAgfVxuXG4gIC8vIFRlc3Qgc2VhcmNoIHF1YWxpdHkgKE1SUiBhbmQgTkRDRylcbiAgY29uc3Qgc2VhcmNoUmFua2luZ3M6IHsgcmVsZXZhbnQ6IGJvb2xlYW4gfVtdW10gPSBbXTtcbiAgbGV0IHRvdGFsTkRDRyA9IDA7XG5cbiAgZm9yIChjb25zdCB0ZXN0Q2FzZSBvZiBTRUFSQ0hfVEVTVF9DQVNFUykge1xuICAgIGNvbnN0IHF1ZXJ5RW1iID0gZW1iZWRkZXIodGVzdENhc2UucXVlcnkpO1xuICAgIGNvbnN0IGRvY1Njb3JlcyA9IHRlc3RDYXNlLmRvY3VtZW50cy5tYXAoZG9jID0+ICh7XG4gICAgICAuLi5kb2MsXG4gICAgICBzY29yZTogc2ltaWxhcml0eUZuKHF1ZXJ5RW1iLCBlbWJlZGRlcihkb2MudGV4dCkpLFxuICAgIH0pKTtcblxuICAgIC8vIFNvcnQgYnkgY29tcHV0ZWQgc2NvcmVcbiAgICBjb25zdCBzb3J0ZWQgPSBbLi4uZG9jU2NvcmVzXS5zb3J0KChhLCBiKSA9PiBiLnNjb3JlIC0gYS5zY29yZSk7XG5cbiAgICAvLyBGb3IgTVJSXG4gICAgc2VhcmNoUmFua2luZ3MucHVzaChzb3J0ZWQubWFwKGQgPT4gKHsgcmVsZXZhbnQ6IGQucmVsZXZhbmNlID49IDIgfSkpKTtcblxuICAgIC8vIEZvciBORENHXG4gICAgY29uc3QgaWRlYWxPcmRlciA9IFsuLi50ZXN0Q2FzZS5kb2N1bWVudHNdLnNvcnQoKGEsIGIpID0+IGIucmVsZXZhbmNlIC0gYS5yZWxldmFuY2UpO1xuICAgIHRvdGFsTkRDRyArPSBjYWxjdWxhdGVORENHKHNvcnRlZCwgaWRlYWxPcmRlcik7XG4gIH1cblxuICBjb25zdCBzZWFyY2hNUlIgPSBjYWxjdWxhdGVNUlIoc2VhcmNoUmFua2luZ3MpO1xuICBjb25zdCBzZWFyY2hORENHID0gdG90YWxORENHIC8gU0VBUkNIX1RFU1RfQ0FTRVMubGVuZ3RoO1xuXG4gIC8vIFRlc3QgY2x1c3RlcmluZ1xuICBjb25zdCBhbGxDbHVzdGVySXRlbXM6IHsgdGV4dDogc3RyaW5nOyBjbHVzdGVyOiBudW1iZXIgfVtdID0gW107XG4gIENMVVNURVJfVEVTVF9DQVNFUy5mb3JFYWNoKCh0YywgY2x1c3RlcklkeCkgPT4ge1xuICAgIHRjLml0ZW1zLmZvckVhY2goaXRlbSA9PiB7XG4gICAgICBhbGxDbHVzdGVySXRlbXMucHVzaCh7IHRleHQ6IGl0ZW0sIGNsdXN0ZXI6IGNsdXN0ZXJJZHggfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGNvbnN0IGNsdXN0ZXJFbWJlZGRpbmdzID0gYWxsQ2x1c3Rlckl0ZW1zLm1hcChpdGVtID0+IGVtYmVkZGVyKGl0ZW0udGV4dCkpO1xuICBjb25zdCBjbHVzdGVyTGFiZWxzID0gYWxsQ2x1c3Rlckl0ZW1zLm1hcChpdGVtID0+IGl0ZW0uY2x1c3Rlcik7XG4gIGNvbnN0IHNpbGhvdWV0dGVTY29yZSA9IGNhbGN1bGF0ZVNpbGhvdWV0dGUoY2x1c3RlckVtYmVkZGluZ3MsIGNsdXN0ZXJMYWJlbHMpO1xuXG4gIC8vIENhbGN1bGF0ZSBjbHVzdGVyIHB1cml0eSAoaG93IHdlbGwgaXRlbXMgc3RheSBpbiB0aGVpciBleHBlY3RlZCBjbHVzdGVyKVxuICAvLyBVc2luZyBzaW1wbGUgbmVhcmVzdC1uZWlnaGJvciBjbGFzc2lmaWNhdGlvblxuICBsZXQgY29ycmVjdENsdXN0ZXIgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNsdXN0ZXJFbWJlZGRpbmdzLmxlbmd0aDsgaSsrKSB7XG4gICAgbGV0IG5lYXJlc3RJZHggPSAtMTtcbiAgICBsZXQgbmVhcmVzdERpc3QgPSBJbmZpbml0eTtcbiAgICBmb3IgKGxldCBqID0gMDsgaiA8IGNsdXN0ZXJFbWJlZGRpbmdzLmxlbmd0aDsgaisrKSB7XG4gICAgICBpZiAoaSAhPT0gaikge1xuICAgICAgICBjb25zdCBkaXN0ID0gZXVjbGlkZWFuRGlzdGFuY2UoY2x1c3RlckVtYmVkZGluZ3NbaV0sIGNsdXN0ZXJFbWJlZGRpbmdzW2pdKTtcbiAgICAgICAgaWYgKGRpc3QgPCBuZWFyZXN0RGlzdCkge1xuICAgICAgICAgIG5lYXJlc3REaXN0ID0gZGlzdDtcbiAgICAgICAgICBuZWFyZXN0SWR4ID0gajtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAobmVhcmVzdElkeCA+PSAwICYmIGNsdXN0ZXJMYWJlbHNbbmVhcmVzdElkeF0gPT09IGNsdXN0ZXJMYWJlbHNbaV0pIHtcbiAgICAgIGNvcnJlY3RDbHVzdGVyKys7XG4gICAgfVxuICB9XG4gIGNvbnN0IGNsdXN0ZXJQdXJpdHkgPSBjb3JyZWN0Q2x1c3RlciAvIGNsdXN0ZXJFbWJlZGRpbmdzLmxlbmd0aDtcblxuICByZXR1cm4ge1xuICAgIHNpbWlsYXJpdHlBY2N1cmFjeSxcbiAgICBzaW1pbGFyaXR5QnlDYXRlZ29yeSxcbiAgICBhdmdTaW1pbGFyaXR5TGF0ZW5jeU1zOiBsYXRlbmNpZXMucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCkgLyBsYXRlbmNpZXMubGVuZ3RoLFxuICAgIGNsdXN0ZXJQdXJpdHksXG4gICAgc2lsaG91ZXR0ZVNjb3JlLFxuICAgIHNlYXJjaE1SUixcbiAgICBzZWFyY2hORENHLFxuICAgIHNpbWlsYXJpdHlSZXN1bHRzLFxuICAgIHRvdGFsUGFpcnM6IHNpbWlsYXJpdHlSZXN1bHRzLmxlbmd0aCxcbiAgfTtcbn1cblxuLyoqXG4gKiBGb3JtYXQgZW1iZWRkaW5nIGJlbmNobWFyayByZXN1bHRzIGZvciBkaXNwbGF5XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRFbWJlZGRpbmdSZXN1bHRzKHJlc3VsdHM6IEVtYmVkZGluZ0JlbmNobWFya1Jlc3VsdHMpOiBzdHJpbmcge1xuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblxuICBsaW5lcy5wdXNoKCcnKTtcbiAgbGluZXMucHVzaCgn4pWU4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWXJyk7XG4gIGxpbmVzLnB1c2goJ+KVkSAgICAgICAgICAgICBFTUJFRERJTkcgQkVOQ0hNQVJLIFJFU1VMVFMgICAgICAgICAgICAgICAgICAgICAg4pWRJyk7XG4gIGxpbmVzLnB1c2goJ+KVoOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVoycpO1xuICBsaW5lcy5wdXNoKGDilZEgIFNpbWlsYXJpdHkgRGV0ZWN0aW9uOiAkeyhyZXN1bHRzLnNpbWlsYXJpdHlBY2N1cmFjeSAqIDEwMCkudG9GaXhlZCgxKX0lYC5wYWRFbmQoNjMpICsgJ+KVkScpO1xuICBsaW5lcy5wdXNoKCfilaDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilaMnKTtcbiAgbGluZXMucHVzaCgn4pWRICBCeSBDYXRlZ29yeTogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICDilZEnKTtcblxuICBmb3IgKGNvbnN0IFtjYXQsIGFjY10gb2YgT2JqZWN0LmVudHJpZXMocmVzdWx0cy5zaW1pbGFyaXR5QnlDYXRlZ29yeSkuc29ydCgoYSwgYikgPT4gYlsxXSAtIGFbMV0pKSB7XG4gICAgY29uc3QgYmFyID0gJ+KWiCcucmVwZWF0KE1hdGguZmxvb3IoYWNjICogMjApKSArICfilpEnLnJlcGVhdCgyMCAtIE1hdGguZmxvb3IoYWNjICogMjApKTtcbiAgICBsaW5lcy5wdXNoKGDilZEgICAgJHtjYXQucGFkRW5kKDE4KX0gWyR7YmFyfV0gJHsoYWNjICogMTAwKS50b0ZpeGVkKDApLnBhZFN0YXJ0KDMpfSUgIOKVkWApO1xuICB9XG5cbiAgbGluZXMucHVzaCgn4pWg4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWjJyk7XG4gIGxpbmVzLnB1c2goJ+KVkSAgQ2x1c3RlcmluZyBRdWFsaXR5OiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg4pWRJyk7XG4gIGxpbmVzLnB1c2goYOKVkSAgICBDbHVzdGVyIFB1cml0eTogICAgJHsocmVzdWx0cy5jbHVzdGVyUHVyaXR5ICogMTAwKS50b0ZpeGVkKDEpfSVgLnBhZEVuZCg2MykgKyAn4pWRJyk7XG4gIGxpbmVzLnB1c2goYOKVkSAgICBTaWxob3VldHRlIFNjb3JlOiAgJHtyZXN1bHRzLnNpbGhvdWV0dGVTY29yZS50b0ZpeGVkKDMpfWAucGFkRW5kKDYzKSArICfilZEnKTtcbiAgbGluZXMucHVzaCgn4pWg4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWjJyk7XG4gIGxpbmVzLnB1c2goJ+KVkSAgU2VhcmNoIFF1YWxpdHk6ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg4pWRJyk7XG4gIGxpbmVzLnB1c2goYOKVkSAgICBNUlIgKE1lYW4gUmVjaXByb2NhbCBSYW5rKTogICR7cmVzdWx0cy5zZWFyY2hNUlIudG9GaXhlZCgzKX1gLnBhZEVuZCg2MykgKyAn4pWRJyk7XG4gIGxpbmVzLnB1c2goYOKVkSAgICBORENHOiAgICAgICAgICAgICAgICAgICAgICAgICR7cmVzdWx0cy5zZWFyY2hORENHLnRvRml4ZWQoMyl9YC5wYWRFbmQoNjMpICsgJ+KVkScpO1xuICBsaW5lcy5wdXNoKCfilaDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilaMnKTtcbiAgbGluZXMucHVzaChg4pWRICBBdmcgTGF0ZW5jeTogJHtyZXN1bHRzLmF2Z1NpbWlsYXJpdHlMYXRlbmN5TXMudG9GaXhlZCgyKX1tcyBwZXIgcGFpcmAucGFkRW5kKDYzKSArICfilZEnKTtcbiAgbGluZXMucHVzaCgn4pWa4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWdJyk7XG5cbiAgLy8gUXVhbGl0eSBhc3Nlc3NtZW50XG4gIGxpbmVzLnB1c2goJycpO1xuICBsaW5lcy5wdXNoKCdRdWFsaXR5IEFzc2Vzc21lbnQ6Jyk7XG5cbiAgaWYgKHJlc3VsdHMuc2ltaWxhcml0eUFjY3VyYWN5ID49IDAuOCkge1xuICAgIGxpbmVzLnB1c2goJyAg4pyTIFNpbWlsYXJpdHkgZGV0ZWN0aW9uOiBFWENFTExFTlQgKOKJpTgwJSknKTtcbiAgfSBlbHNlIGlmIChyZXN1bHRzLnNpbWlsYXJpdHlBY2N1cmFjeSA+PSAwLjYpIHtcbiAgICBsaW5lcy5wdXNoKCcgIH4gU2ltaWxhcml0eSBkZXRlY3Rpb246IEdPT0QgKDYwLTgwJSknKTtcbiAgfSBlbHNlIHtcbiAgICBsaW5lcy5wdXNoKCcgIOKclyBTaW1pbGFyaXR5IGRldGVjdGlvbjogTkVFRFMgSU1QUk9WRU1FTlQgKDw2MCUpJyk7XG4gIH1cblxuICBpZiAocmVzdWx0cy5zZWFyY2hNUlIgPj0gMC44KSB7XG4gICAgbGluZXMucHVzaCgnICDinJMgU2VhcmNoIHF1YWxpdHkgKE1SUik6IEVYQ0VMTEVOVCAo4omlMC44KScpO1xuICB9IGVsc2UgaWYgKHJlc3VsdHMuc2VhcmNoTVJSID49IDAuNSkge1xuICAgIGxpbmVzLnB1c2goJyAgfiBTZWFyY2ggcXVhbGl0eSAoTVJSKTogQUNDRVBUQUJMRSAoMC41LTAuOCknKTtcbiAgfSBlbHNlIHtcbiAgICBsaW5lcy5wdXNoKCcgIOKclyBTZWFyY2ggcXVhbGl0eSAoTVJSKTogTkVFRFMgSU1QUk9WRU1FTlQgKDwwLjUpJyk7XG4gIH1cblxuICBpZiAocmVzdWx0cy5jbHVzdGVyUHVyaXR5ID49IDAuOCkge1xuICAgIGxpbmVzLnB1c2goJyAg4pyTIENsdXN0ZXJpbmc6IEVYQ0VMTEVOVCAo4omlODAlIHB1cml0eSknKTtcbiAgfSBlbHNlIGlmIChyZXN1bHRzLmNsdXN0ZXJQdXJpdHkgPj0gMC42KSB7XG4gICAgbGluZXMucHVzaCgnICB+IENsdXN0ZXJpbmc6IEFDQ0VQVEFCTEUgKDYwLTgwJSBwdXJpdHkpJyk7XG4gIH0gZWxzZSB7XG4gICAgbGluZXMucHVzaCgnICDinJcgQ2x1c3RlcmluZzogTkVFRFMgSU1QUk9WRU1FTlQgKDw2MCUgcHVyaXR5KScpO1xuICB9XG5cbiAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xufVxuXG5leHBvcnQgZGVmYXVsdCB7XG4gIFNJTUlMQVJJVFlfVEVTVF9QQUlSUyxcbiAgU0VBUkNIX1RFU1RfQ0FTRVMsXG4gIENMVVNURVJfVEVTVF9DQVNFUyxcbiAgcnVuRW1iZWRkaW5nQmVuY2htYXJrLFxuICBmb3JtYXRFbWJlZGRpbmdSZXN1bHRzLFxuICBpc0NvcnJlY3RTaW1pbGFyaXR5LFxuICBjYWxjdWxhdGVNUlIsXG4gIGNhbGN1bGF0ZU5EQ0csXG59O1xuIl19