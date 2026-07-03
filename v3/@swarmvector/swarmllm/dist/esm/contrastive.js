/**
 * Contrastive Fine-tuning for RuvLTRA Claude Code Router
 *
 * Uses triplet loss to fine-tune embeddings:
 * - Anchor: task description
 * - Positive: correct agent description
 * - Negative: wrong agent description (hard negative)
 *
 * Goal: minimize distance(anchor, positive) and maximize distance(anchor, negative)
 *
 * @example
 * ```typescript
 * import { ContrastiveTrainer, tripletLoss, infoNCELoss } from '@swarmvector/swarmllm';
 *
 * const trainer = new ContrastiveTrainer({
 *   epochs: 10,
 *   batchSize: 16,
 *   margin: 0.5,
 * });
 *
 * // Add triplets
 * trainer.addTriplet(anchorEmb, positiveEmb, negativeEmb, true);
 *
 * // Train and export
 * const results = trainer.train();
 * trainer.exportTrainingData('./output');
 * ```
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
/**
 * Default contrastive config
 */
const DEFAULT_CONTRASTIVE_CONFIG = {
    epochs: 10,
    batchSize: 16,
    learningRate: 0.0001,
    margin: 0.5,
    temperature: 0.07,
    hardNegativeRatio: 0.7,
    outputPath: './training-output',
};
/**
 * Compute cosine similarity between two embeddings
 */
export function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length)
        return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}
/**
 * Compute triplet loss
 * L = max(0, margin + d(anchor, positive) - d(anchor, negative))
 */
export function tripletLoss(anchorEmb, positiveEmb, negativeEmb, margin = 0.5) {
    const posDist = 1 - cosineSimilarity(anchorEmb, positiveEmb);
    const negDist = 1 - cosineSimilarity(anchorEmb, negativeEmb);
    return Math.max(0, margin + posDist - negDist);
}
/**
 * Compute InfoNCE loss (contrastive)
 */
export function infoNCELoss(anchorEmb, positiveEmb, negativeEmbs, temperature = 0.07) {
    const posSim = cosineSimilarity(anchorEmb, positiveEmb) / temperature;
    const negSims = negativeEmbs.map(neg => cosineSimilarity(anchorEmb, neg) / temperature);
    // Softmax denominator
    const maxSim = Math.max(posSim, ...negSims);
    const expPos = Math.exp(posSim - maxSim);
    const expNegs = negSims.map(sim => Math.exp(sim - maxSim));
    const denominator = expPos + expNegs.reduce((a, b) => a + b, 0);
    // Cross-entropy loss
    return -Math.log(expPos / denominator);
}
/**
 * Compute gradient for embedding update (simplified)
 */
export function computeGradient(anchorEmb, positiveEmb, negativeEmb, lr = 0.0001) {
    const dim = anchorEmb.length;
    const gradient = new Array(dim).fill(0);
    // Pull anchor towards positive
    for (let i = 0; i < dim; i++) {
        gradient[i] += lr * (positiveEmb[i] - anchorEmb[i]);
    }
    // Push anchor away from negative
    for (let i = 0; i < dim; i++) {
        gradient[i] -= lr * 0.5 * (negativeEmb[i] - anchorEmb[i]);
    }
    return gradient;
}
/**
 * Contrastive Trainer for RuvLTRA models
 *
 * Implements triplet loss and InfoNCE loss for embedding fine-tuning.
 */
export class ContrastiveTrainer {
    constructor(config) {
        this.triplets = [];
        this.history = [];
        this.agentEmbeddings = new Map();
        this.config = { ...DEFAULT_CONTRASTIVE_CONFIG, ...config };
    }
    /**
     * Add a training triplet
     */
    addTriplet(anchor, anchorEmb, positive, positiveEmb, negative, negativeEmb, isHard = false) {
        this.triplets.push({
            anchor,
            anchorEmb,
            positive,
            positiveEmb,
            negative,
            negativeEmb,
            isHard,
        });
    }
    /**
     * Add agent embedding for reference
     */
    addAgentEmbedding(agentName, embedding) {
        this.agentEmbeddings.set(agentName, embedding);
    }
    /**
     * Get all agent embeddings
     */
    getAgentEmbeddings() {
        return this.agentEmbeddings;
    }
    /**
     * Get triplet count
     */
    getTripletCount() {
        return this.triplets.length;
    }
    /**
     * Simulate training (compute losses without actual backprop)
     * In a full implementation, this would use proper gradient descent
     */
    train() {
        const startTime = Date.now();
        const { epochs, batchSize, margin } = this.config;
        if (this.triplets.length === 0) {
            return {
                tripletCount: 0,
                finalLoss: 0,
                initialLoss: 0,
                improvement: 0,
                history: [],
                durationMs: 0,
            };
        }
        for (let epoch = 0; epoch < epochs; epoch++) {
            let epochLoss = 0;
            let batchCount = 0;
            // Shuffle triplets
            const shuffled = [...this.triplets].sort(() => Math.random() - 0.5);
            for (let i = 0; i < shuffled.length; i += batchSize) {
                const batch = shuffled.slice(i, i + batchSize);
                let batchLoss = 0;
                for (const triplet of batch) {
                    const loss = tripletLoss(triplet.anchorEmb, triplet.positiveEmb, triplet.negativeEmb, margin);
                    batchLoss += loss;
                }
                epochLoss += batchLoss / batch.length;
                batchCount++;
            }
            const avgLoss = epochLoss / batchCount;
            this.history.push({ epoch: epoch + 1, loss: avgLoss });
        }
        const initialLoss = this.history[0]?.loss || 0;
        const finalLoss = this.history[this.history.length - 1]?.loss || 0;
        const improvement = initialLoss > 0 ? (1 - finalLoss / initialLoss) * 100 : 0;
        return {
            tripletCount: this.triplets.length,
            finalLoss,
            initialLoss,
            improvement,
            history: this.history,
            durationMs: Date.now() - startTime,
        };
    }
    /**
     * Export training data for external fine-tuning tools
     */
    exportTrainingData(outputPath) {
        const outDir = outputPath || this.config.outputPath;
        if (!existsSync(outDir)) {
            mkdirSync(outDir, { recursive: true });
        }
        // JSONL format for fine-tuning
        const jsonlData = this.triplets.map(t => ({
            anchor: t.anchor,
            positive: t.positive,
            negative: t.negative,
            isHard: t.isHard,
        }));
        // CSV format for analysis
        const csvData = [
            'anchor,positive,negative,is_hard',
            ...this.triplets.map(t => `"${t.anchor.replace(/"/g, '""')}",${t.positive},${t.negative},${t.isHard}`),
        ].join('\n');
        // Embedding matrix for direct training
        const embeddingData = {
            anchors: this.triplets.map(t => t.anchorEmb),
            positives: this.triplets.map(t => t.positiveEmb),
            negatives: this.triplets.map(t => t.negativeEmb),
            labels: this.triplets.map(t => t.positive),
        };
        writeFileSync(join(outDir, 'triplets.jsonl'), jsonlData.map(item => JSON.stringify(item)).join('\n'));
        writeFileSync(join(outDir, 'triplets.csv'), csvData);
        writeFileSync(join(outDir, 'embeddings.json'), JSON.stringify(embeddingData, null, 2));
        return outDir;
    }
    /**
     * Generate LoRA adapter configuration
     */
    generateLoRAConfig(outputPath) {
        const outDir = outputPath || this.config.outputPath;
        const loraConfig = {
            model_type: 'qwen2',
            base_model: 'Qwen/Qwen2.5-0.5B',
            output_dir: outDir,
            lora_r: 8,
            lora_alpha: 16,
            lora_dropout: 0.05,
            target_modules: ['q_proj', 'v_proj', 'k_proj', 'o_proj'],
            learning_rate: this.config.learningRate,
            num_train_epochs: this.config.epochs,
            per_device_train_batch_size: this.config.batchSize,
            gradient_accumulation_steps: 4,
            warmup_ratio: 0.1,
            loss_type: 'triplet',
            margin: this.config.margin,
            temperature: this.config.temperature,
            train_data: join(outDir, 'triplets.jsonl'),
            eval_data: join(outDir, 'eval.jsonl'),
        };
        if (!existsSync(outDir)) {
            mkdirSync(outDir, { recursive: true });
        }
        writeFileSync(join(outDir, 'lora_config.json'), JSON.stringify(loraConfig, null, 2));
        return loraConfig;
    }
    /**
     * Generate training script for external tools
     */
    generateTrainingScript(outputPath) {
        const outDir = outputPath || this.config.outputPath;
        const script = `#!/bin/bash
# RuvLTRA Fine-tuning Script
# Prerequisites: pip install transformers peft accelerate

set -e

MODEL_PATH="${outDir}"
BASE_MODEL="Qwen/Qwen2.5-0.5B"

echo "=== RuvLTRA Contrastive Fine-tuning ==="
echo "Base model: $BASE_MODEL"
echo "Output: $MODEL_PATH"

# Check for training data
if [ ! -f "$MODEL_PATH/triplets.jsonl" ]; then
  echo "Error: Training data not found at $MODEL_PATH/triplets.jsonl"
  exit 1
fi

# Install dependencies if needed
python3 -c "import transformers, peft" 2>/dev/null || {
  echo "Installing dependencies..."
  pip install transformers peft accelerate sentencepiece
}

# Fine-tune with LoRA
python3 << 'PYTHON'
import json
import torch
from pathlib import Path
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model, TaskType

# Load config
config_path = Path("${outDir}/lora_config.json")
with open(config_path) as f:
    config = json.load(f)

print(f"Loading base model: {config['base_model']}")

# Load model and tokenizer
tokenizer = AutoTokenizer.from_pretrained(config['base_model'])
model = AutoModelForCausalLM.from_pretrained(
    config['base_model'],
    torch_dtype=torch.float16,
    device_map='auto'
)

# Configure LoRA
lora_config = LoraConfig(
    r=config['lora_r'],
    lora_alpha=config['lora_alpha'],
    lora_dropout=config['lora_dropout'],
    target_modules=config['target_modules'],
    task_type=TaskType.CAUSAL_LM,
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

print("Model ready for fine-tuning!")
print(f"Training data: {config['train_data']}")
print("Note: Full training requires GPU. This script validates the setup.")
PYTHON

echo ""
echo "=== Setup Complete ==="
echo "To train on GPU, run the full training pipeline."
echo "Training data exported to: $MODEL_PATH/triplets.jsonl"
`;
        if (!existsSync(outDir)) {
            mkdirSync(outDir, { recursive: true });
        }
        const scriptPath = join(outDir, 'train.sh');
        writeFileSync(scriptPath, script);
        return scriptPath;
    }
    /**
     * Get training history
     */
    getHistory() {
        return [...this.history];
    }
    /**
     * Reset trainer
     */
    reset() {
        this.triplets = [];
        this.history = [];
    }
}
/**
 * Agent Training Data for Claude Code Router
 */
export const AGENT_TRAINING_DATA = {
    coder: {
        description: 'Implementation specialist for writing clean, efficient code. Handles coding tasks, feature implementation, and code generation.',
        keywords: ['implement', 'code', 'write', 'build', 'create', 'develop', 'function', 'class', 'component', 'feature'],
        examples: [
            'Implement a binary search function',
            'Write a React component for user registration',
            'Create a REST API endpoint for user authentication',
            'Build a caching layer for the database queries',
        ],
        confusing_with: ['refactorer', 'debugger'],
    },
    tester: {
        description: 'Testing specialist for writing and maintaining tests. Creates unit tests, integration tests, and ensures code quality through testing.',
        keywords: ['test', 'unit test', 'integration test', 'coverage', 'mock', 'assertion', 'spec', 'jest', 'pytest'],
        examples: [
            'Write unit tests for the authentication module',
            'Add integration tests for the payment gateway',
            'Create test coverage for the user service',
            'Write e2e tests for the checkout flow',
        ],
        confusing_with: ['reviewer'],
    },
    reviewer: {
        description: 'Code review specialist for analyzing code quality, identifying issues, and suggesting improvements.',
        keywords: ['review', 'analyze', 'check', 'inspect', 'audit', 'evaluate', 'assess', 'critique'],
        examples: [
            'Review the pull request for code quality',
            'Check the code for potential security vulnerabilities',
            'Analyze the implementation for best practices',
            'Evaluate the architecture decisions in this PR',
        ],
        confusing_with: ['tester', 'security-architect'],
    },
    researcher: {
        description: 'Research specialist for investigating technologies, gathering information, and analyzing options.',
        keywords: ['research', 'investigate', 'explore', 'analyze', 'study', 'compare', 'evaluate', 'learn'],
        examples: [
            'Research best practices for React state management',
            'Investigate the performance issues in the dashboard',
            'Compare different authentication strategies',
            'Study the codebase architecture for the new feature',
        ],
        confusing_with: ['planner'],
    },
    architect: {
        description: 'System architect for designing software architecture, making technical decisions, and planning system structure.',
        keywords: ['design', 'architect', 'structure', 'plan', 'schema', 'model', 'pattern', 'system'],
        examples: [
            'Design the database schema for user profiles',
            'Plan the architecture for real-time notifications',
            'Create a system design for the microservices migration',
            'Design the API structure for the new product catalog',
        ],
        confusing_with: ['planner'],
    },
    debugger: {
        description: 'Debugging specialist for finding and fixing bugs, analyzing errors, and troubleshooting issues.',
        keywords: ['debug', 'fix', 'bug', 'error', 'issue', 'crash', 'exception', 'troubleshoot'],
        examples: [
            'Fix the null pointer exception in the login handler',
            'Debug the memory leak in the WebSocket handler',
            'Troubleshoot the race condition in the payment processor',
            'Find the root cause of the intermittent test failures',
        ],
        confusing_with: ['coder'],
    },
    'security-architect': {
        description: 'Security specialist for auditing code security, identifying vulnerabilities, and implementing security measures.',
        keywords: ['security', 'vulnerability', 'xss', 'sql injection', 'auth', 'encryption', 'audit', 'penetration'],
        examples: [
            'Audit the API endpoints for XSS vulnerabilities',
            'Review the authentication flow for security issues',
            'Implement input validation for the user forms',
            'Check for SQL injection vulnerabilities in the search',
        ],
        confusing_with: ['reviewer'],
    },
    documenter: {
        description: 'Documentation specialist for writing technical documentation, comments, and API docs.',
        keywords: ['document', 'comment', 'jsdoc', 'readme', 'docs', 'explain', 'describe', 'annotate'],
        examples: [
            'Write JSDoc comments for the utility functions',
            'Create README documentation for the new module',
            'Document the API endpoints with examples',
            'Add inline comments explaining the algorithm',
        ],
        confusing_with: ['api-docs'],
    },
    refactorer: {
        description: 'Refactoring specialist for improving code structure, cleaning up technical debt, and modernizing codebases.',
        keywords: ['refactor', 'clean', 'restructure', 'modernize', 'improve', 'simplify', 'extract', 'rename'],
        examples: [
            'Refactor the payment module to use async/await',
            'Clean up the legacy authentication code',
            'Extract common logic into a shared utility',
            'Simplify the complex conditional logic in checkout',
        ],
        confusing_with: ['coder'],
    },
    optimizer: {
        description: 'Performance optimization specialist for improving speed, reducing memory usage, and optimizing queries.',
        keywords: ['optimize', 'performance', 'speed', 'memory', 'cache', 'index', 'query', 'latency'],
        examples: [
            'Optimize the database queries for the dashboard',
            'Improve the page load time for the homepage',
            'Add caching to reduce API response times',
            'Reduce memory usage in the image processing pipeline',
        ],
        confusing_with: ['researcher'],
    },
    devops: {
        description: 'DevOps specialist for CI/CD pipelines, deployment automation, and infrastructure management.',
        keywords: ['deploy', 'ci/cd', 'pipeline', 'docker', 'kubernetes', 'terraform', 'aws', 'infrastructure'],
        examples: [
            'Set up the CI/CD pipeline for the microservices',
            'Configure Docker containers for the application',
            'Deploy the application to the staging environment',
            'Create Terraform scripts for the AWS infrastructure',
        ],
        confusing_with: [],
    },
    'api-docs': {
        description: 'API documentation specialist for creating OpenAPI specs, Swagger documentation, and API references.',
        keywords: ['openapi', 'swagger', 'api docs', 'endpoint', 'specification', 'schema', 'rest'],
        examples: [
            'Generate OpenAPI documentation for the REST API',
            'Create Swagger specs for the user endpoints',
            'Document the API authentication requirements',
            'Update the API reference with new endpoints',
        ],
        confusing_with: ['documenter'],
    },
    planner: {
        description: 'Project planning specialist for creating task plans, sprint planning, and roadmap development.',
        keywords: ['plan', 'roadmap', 'sprint', 'milestone', 'timeline', 'estimate', 'breakdown', 'prioritize'],
        examples: [
            'Create a sprint plan for the next two weeks',
            'Break down the feature into smaller tasks',
            'Estimate the effort for the migration project',
            'Prioritize the bug fixes for the release',
        ],
        confusing_with: ['architect', 'researcher'],
    },
};
/**
 * Generate training dataset from agent data
 */
export function generateTrainingDataset() {
    const examples = [];
    for (const [agent, data] of Object.entries(AGENT_TRAINING_DATA)) {
        // Add direct examples
        for (const example of data.examples) {
            examples.push({
                task: example,
                agent,
                complexity: 'medium',
            });
        }
        // Generate variations with keywords
        for (const keyword of data.keywords) {
            examples.push({
                task: `${keyword} a solution for the authentication system`,
                agent,
                complexity: 'low',
            });
        }
        // Add confusing pairs for hard negatives
        if (data.confusing_with) {
            for (const confusingAgent of data.confusing_with) {
                for (const example of data.examples.slice(0, 2)) {
                    examples.push({
                        task: example,
                        agent,
                        complexity: 'hard',
                        confusing_with: confusingAgent,
                    });
                }
            }
        }
    }
    return examples;
}
/**
 * Generate contrastive pairs for training
 */
export function generateContrastivePairs() {
    const pairs = [];
    const agents = Object.keys(AGENT_TRAINING_DATA);
    for (const [agent, data] of Object.entries(AGENT_TRAINING_DATA)) {
        for (const example of data.examples) {
            // Hard negatives from confusing agents
            if (data.confusing_with) {
                for (const negAgent of data.confusing_with) {
                    pairs.push({
                        anchor: example,
                        positive: agent,
                        negative: negAgent,
                        isHard: true,
                    });
                }
            }
            // Random negatives
            const randomNegs = agents.filter(a => a !== agent).slice(0, 2);
            for (const negAgent of randomNegs) {
                pairs.push({
                    anchor: example,
                    positive: agent,
                    negative: negAgent,
                    isHard: false,
                });
            }
        }
    }
    return pairs;
}
/**
 * Get dataset statistics
 */
export function getDatasetStats() {
    const examples = generateTrainingDataset();
    const pairs = generateContrastivePairs();
    const agents = Object.keys(AGENT_TRAINING_DATA);
    return {
        totalExamples: examples.length,
        contrastivePairs: pairs.length,
        agentTypes: agents.length,
        agents,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJhc3RpdmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29udHJhc3RpdmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTJCRztBQUVILE9BQU8sRUFBRSxhQUFhLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxNQUFNLElBQUksQ0FBQztBQUMxRCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sTUFBTSxDQUFDO0FBeUY1Qjs7R0FFRztBQUNILE1BQU0sMEJBQTBCLEdBQWdDO0lBQzlELE1BQU0sRUFBRSxFQUFFO0lBQ1YsU0FBUyxFQUFFLEVBQUU7SUFDYixZQUFZLEVBQUUsTUFBTTtJQUNwQixNQUFNLEVBQUUsR0FBRztJQUNYLFdBQVcsRUFBRSxJQUFJO0lBQ2pCLGlCQUFpQixFQUFFLEdBQUc7SUFDdEIsVUFBVSxFQUFFLG1CQUFtQjtDQUNoQyxDQUFDO0FBRUY7O0dBRUc7QUFDSCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsQ0FBWSxFQUFFLENBQVk7SUFDekQsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxNQUFNO1FBQUUsT0FBTyxDQUFDLENBQUM7SUFDaEQsSUFBSSxHQUFHLEdBQUcsQ0FBQyxFQUFFLEtBQUssR0FBRyxDQUFDLEVBQUUsS0FBSyxHQUFHLENBQUMsQ0FBQztJQUNsQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ2xDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25CLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JCLEtBQUssSUFB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LENBQUM7SUFFaEQsT0FBTztRQUNMLGFBQWEsRUFBRSxRQUFRLENBQUMsTUFBTTtRQUM5QixnQkFBZ0IsRUFBRSxLQUFLLENBQUMsTUFBTTtRQUM5QixVQUFVLEVBQUUsTUFBTSxDQUFDLE1BQU07UUFDekIsTUFBTTtLQUNQLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDb250cmFzdGl2ZSBGaW5lLXR1bmluZyBmb3IgUnV2TFRSQSBDbGF1ZGUgQ29kZSBSb3V0ZXJcbiAqXG4gKiBVc2VzIHRyaXBsZXQgbG9zcyB0byBmaW5lLXR1bmUgZW1iZWRkaW5nczpcbiAqIC0gQW5jaG9yOiB0YXNrIGRlc2NyaXB0aW9uXG4gKiAtIFBvc2l0aXZlOiBjb3JyZWN0IGFnZW50IGRlc2NyaXB0aW9uXG4gKiAtIE5lZ2F0aXZlOiB3cm9uZyBhZ2VudCBkZXNjcmlwdGlvbiAoaGFyZCBuZWdhdGl2ZSlcbiAqXG4gKiBHb2FsOiBtaW5pbWl6ZSBkaXN0YW5jZShhbmNob3IsIHBvc2l0aXZlKSBhbmQgbWF4aW1pemUgZGlzdGFuY2UoYW5jaG9yLCBuZWdhdGl2ZSlcbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogaW1wb3J0IHsgQ29udHJhc3RpdmVUcmFpbmVyLCB0cmlwbGV0TG9zcywgaW5mb05DRUxvc3MgfSBmcm9tICdAcnVmdmVjdG9yL3J1ZmxsbSc7XG4gKlxuICogY29uc3QgdHJhaW5lciA9IG5ldyBDb250cmFzdGl2ZVRyYWluZXIoe1xuICogICBlcG9jaHM6IDEwLFxuICogICBiYXRjaFNpemU6IDE2LFxuICogICBtYXJnaW46IDAuNSxcbiAqIH0pO1xuICpcbiAqIC8vIEFkZCB0cmlwbGV0c1xuICogdHJhaW5lci5hZGRUcmlwbGV0KGFuY2hvckVtYiwgcG9zaXRpdmVFbWIsIG5lZ2F0aXZlRW1iLCB0cnVlKTtcbiAqXG4gKiAvLyBUcmFpbiBhbmQgZXhwb3J0XG4gKiBjb25zdCByZXN1bHRzID0gdHJhaW5lci50cmFpbigpO1xuICogdHJhaW5lci5leHBvcnRUcmFpbmluZ0RhdGEoJy4vb3V0cHV0Jyk7XG4gKiBgYGBcbiAqL1xuXG5pbXBvcnQgeyB3cml0ZUZpbGVTeW5jLCBta2RpclN5bmMsIGV4aXN0c1N5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBFbWJlZGRpbmcgfSBmcm9tICcuL3R5cGVzJztcblxuLyoqXG4gKiBDb250cmFzdGl2ZSB0cmFpbmluZyBjb25maWd1cmF0aW9uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ29udHJhc3RpdmVDb25maWcge1xuICAvKiogTnVtYmVyIG9mIHRyYWluaW5nIGVwb2NocyAoZGVmYXVsdDogMTApICovXG4gIGVwb2Nocz86IG51bWJlcjtcbiAgLyoqIEJhdGNoIHNpemUgKGRlZmF1bHQ6IDE2KSAqL1xuICBiYXRjaFNpemU/OiBudW1iZXI7XG4gIC8qKiBMZWFybmluZyByYXRlIChkZWZhdWx0OiAwLjAwMDEpICovXG4gIGxlYXJuaW5nUmF0ZT86IG51bWJlcjtcbiAgLyoqIFRyaXBsZXQgbG9zcyBtYXJnaW4gKGRlZmF1bHQ6IDAuNSkgKi9cbiAgbWFyZ2luPzogbnVtYmVyO1xuICAvKiogSW5mb05DRSB0ZW1wZXJhdHVyZSAoZGVmYXVsdDogMC4wNykgKi9cbiAgdGVtcGVyYXR1cmU/OiBudW1iZXI7XG4gIC8qKiBSYXRpbyBvZiBoYXJkIG5lZ2F0aXZlcyAoZGVmYXVsdDogMC43KSAqL1xuICBoYXJkTmVnYXRpdmVSYXRpbz86IG51bWJlcjtcbiAgLyoqIE91dHB1dCBkaXJlY3RvcnkgZm9yIHRyYWluaW5nIGRhdGEgKi9cbiAgb3V0cHV0UGF0aD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBUcmFpbmluZyB0cmlwbGV0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgVHJhaW5pbmdUcmlwbGV0IHtcbiAgLyoqIEFuY2hvciBlbWJlZGRpbmcgKHRhc2spICovXG4gIGFuY2hvcjogc3RyaW5nO1xuICBhbmNob3JFbWI6IEVtYmVkZGluZztcbiAgLyoqIFBvc2l0aXZlIGV4YW1wbGUgKGNvcnJlY3QgYWdlbnQpICovXG4gIHBvc2l0aXZlOiBzdHJpbmc7XG4gIHBvc2l0aXZlRW1iOiBFbWJlZGRpbmc7XG4gIC8qKiBOZWdhdGl2ZSBleGFtcGxlICh3cm9uZyBhZ2VudCkgKi9cbiAgbmVnYXRpdmU6IHN0cmluZztcbiAgbmVnYXRpdmVFbWI6IEVtYmVkZGluZztcbiAgLyoqIFdoZXRoZXIgdGhpcyBpcyBhIGhhcmQgbmVnYXRpdmUgKi9cbiAgaXNIYXJkOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFRyYWluaW5nIGhpc3RvcnkgZW50cnlcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBUcmFpbmluZ0hpc3RvcnlFbnRyeSB7XG4gIGVwb2NoOiBudW1iZXI7XG4gIGxvc3M6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBDb250cmFzdGl2ZSB0cmFpbmluZyByZXN1bHRzXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ29udHJhc3RpdmVUcmFpbmluZ1Jlc3VsdCB7XG4gIC8qKiBUb3RhbCB0cmlwbGV0cyB0cmFpbmVkIG9uICovXG4gIHRyaXBsZXRDb3VudDogbnVtYmVyO1xuICAvKiogRmluYWwgbG9zcyB2YWx1ZSAqL1xuICBmaW5hbExvc3M6IG51bWJlcjtcbiAgLyoqIEluaXRpYWwgbG9zcyB2YWx1ZSAqL1xuICBpbml0aWFsTG9zczogbnVtYmVyO1xuICAvKiogSW1wcm92ZW1lbnQgcGVyY2VudGFnZSAqL1xuICBpbXByb3ZlbWVudDogbnVtYmVyO1xuICAvKiogVHJhaW5pbmcgaGlzdG9yeSAqL1xuICBoaXN0b3J5OiBUcmFpbmluZ0hpc3RvcnlFbnRyeVtdO1xuICAvKiogRHVyYXRpb24gaW4gbXMgKi9cbiAgZHVyYXRpb25NczogbnVtYmVyO1xufVxuXG4vKipcbiAqIExvUkEgY29uZmlndXJhdGlvbiBmb3IgZmluZS10dW5pbmdcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBMb1JBRXhwb3J0Q29uZmlnIHtcbiAgbW9kZWxfdHlwZTogc3RyaW5nO1xuICBiYXNlX21vZGVsOiBzdHJpbmc7XG4gIG91dHB1dF9kaXI6IHN0cmluZztcbiAgbG9yYV9yOiBudW1iZXI7XG4gIGxvcmFfYWxwaGE6IG51bWJlcjtcbiAgbG9yYV9kcm9wb3V0OiBudW1iZXI7XG4gIHRhcmdldF9tb2R1bGVzOiBzdHJpbmdbXTtcbiAgbGVhcm5pbmdfcmF0ZTogbnVtYmVyO1xuICBudW1fdHJhaW5fZXBvY2hzOiBudW1iZXI7XG4gIHBlcl9kZXZpY2VfdHJhaW5fYmF0Y2hfc2l6ZTogbnVtYmVyO1xuICBncmFkaWVudF9hY2N1bXVsYXRpb25fc3RlcHM6IG51bWJlcjtcbiAgd2FybXVwX3JhdGlvOiBudW1iZXI7XG4gIGxvc3NfdHlwZTogc3RyaW5nO1xuICBtYXJnaW46IG51bWJlcjtcbiAgdGVtcGVyYXR1cmU6IG51bWJlcjtcbiAgdHJhaW5fZGF0YTogc3RyaW5nO1xuICBldmFsX2RhdGE6IHN0cmluZztcbn1cblxuLyoqXG4gKiBEZWZhdWx0IGNvbnRyYXN0aXZlIGNvbmZpZ1xuICovXG5jb25zdCBERUZBVUxUX0NPTlRSQVNUSVZFX0NPTkZJRzogUmVxdWlyZWQ8Q29udHJhc3RpdmVDb25maWc+ID0ge1xuICBlcG9jaHM6IDEwLFxuICBiYXRjaFNpemU6IDE2LFxuICBsZWFybmluZ1JhdGU6IDAuMDAwMSxcbiAgbWFyZ2luOiAwLjUsXG4gIHRlbXBlcmF0dXJlOiAwLjA3LFxuICBoYXJkTmVnYXRpdmVSYXRpbzogMC43LFxuICBvdXRwdXRQYXRoOiAnLi90cmFpbmluZy1vdXRwdXQnLFxufTtcblxuLyoqXG4gKiBDb21wdXRlIGNvc2luZSBzaW1pbGFyaXR5IGJldHdlZW4gdHdvIGVtYmVkZGluZ3NcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvc2luZVNpbWlsYXJpdHkoYTogRW1iZWRkaW5nLCBiOiBFbWJlZGRpbmcpOiBudW1iZXIge1xuICBpZiAoIWEgfHwgIWIgfHwgYS5sZW5ndGggIT09IGIubGVuZ3RoKSByZXR1cm4gMDtcbiAgbGV0IGRvdCA9IDAsIG5vcm1BID0gMCwgbm9ybUIgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICBkb3QgKz0gYVtpXSAqIGJbaV07XG4gICAgbm9ybUEgKz0gYVtpXSAqIGFbaV07XG4gICAgbm9ybUIgKz0gYltpXSAqIGJbaV07XG4gIH1cbiAgcmV0dXJuIGRvdCAvIChNYXRoLnNxcnQobm9ybUEpICogTWF0aC5zcXJ0KG5vcm1CKSB8fCAxKTtcbn1cblxuLyoqXG4gKiBDb21wdXRlIHRyaXBsZXQgbG9zc1xuICogTCA9IG1heCgwLCBtYXJnaW4gKyBkKGFuY2hvciwgcG9zaXRpdmUpIC0gZChhbmNob3IsIG5lZ2F0aXZlKSlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRyaXBsZXRMb3NzKFxuICBhbmNob3JFbWI6IEVtYmVkZGluZyxcbiAgcG9zaXRpdmVFbWI6IEVtYmVkZGluZyxcbiAgbmVnYXRpdmVFbWI6IEVtYmVkZGluZyxcbiAgbWFyZ2luOiBudW1iZXIgPSAwLjVcbik6IG51bWJlciB7XG4gIGNvbnN0IHBvc0Rpc3QgPSAxIC0gY29zaW5lU2ltaWxhcml0eShhbmNob3JFbWIsIHBvc2l0aXZlRW1iKTtcbiAgY29uc3QgbmVnRGlzdCA9IDEgLSBjb3NpbmVTaW1pbGFyaXR5KGFuY2hvckVtYiwgbmVnYXRpdmVFbWIpO1xuICByZXR1cm4gTWF0aC5tYXgoMCwgbWFyZ2luICsgcG9zRGlzdCAtIG5lZ0Rpc3QpO1xufVxuXG4vKipcbiAqIENvbXB1dGUgSW5mb05DRSBsb3NzIChjb250cmFzdGl2ZSlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluZm9OQ0VMb3NzKFxuICBhbmNob3JFbWI6IEVtYmVkZGluZyxcbiAgcG9zaXRpdmVFbWI6IEVtYmVkZGluZyxcbiAgbmVnYXRpdmVFbWJzOiBFbWJlZGRpbmdbXSxcbiAgdGVtcGVyYXR1cmU6IG51bWJlciA9IDAuMDdcbik6IG51bWJlciB7XG4gIGNvbnN0IHBvc1NpbSA9IGNvc2luZVNpbWlsYXJpdHkoYW5jaG9yRW1iLCBwb3NpdGl2ZUVtYikgLyB0ZW1wZXJhdHVyZTtcbiAgY29uc3QgbmVnU2ltcyA9IG5lZ2F0aXZlRW1icy5tYXAobmVnID0+IGNvc2luZVNpbWlsYXJpdHkoYW5jaG9yRW1iLCBuZWcpIC8gdGVtcGVyYXR1cmUpO1xuXG4gIC8vIFNvZnRtYXggZGVub21pbmF0b3JcbiAgY29uc3QgbWF4U2ltID0gTWF0aC5tYXgocG9zU2ltLCAuLi5uZWdTaW1zKTtcbiAgY29uc3QgZXhwUG9zID0gTWF0aC5leHAocG9zU2ltIC0gbWF4U2ltKTtcbiAgY29uc3QgZXhwTmVncyA9IG5lZ1NpbXMubWFwKHNpbSA9PiBNYXRoLmV4cChzaW0gLSBtYXhTaW0pKTtcbiAgY29uc3QgZGVub21pbmF0b3IgPSBleHBQb3MgKyBleHBOZWdzLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApO1xuXG4gIC8vIENyb3NzLWVudHJvcHkgbG9zc1xuICByZXR1cm4gLU1hdGgubG9nKGV4cFBvcyAvIGRlbm9taW5hdG9yKTtcbn1cblxuLyoqXG4gKiBDb21wdXRlIGdyYWRpZW50IGZvciBlbWJlZGRpbmcgdXBkYXRlIChzaW1wbGlmaWVkKVxuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZUdyYWRpZW50KFxuICBhbmNob3JFbWI6IEVtYmVkZGluZyxcbiAgcG9zaXRpdmVFbWI6IEVtYmVkZGluZyxcbiAgbmVnYXRpdmVFbWI6IEVtYmVkZGluZyxcbiAgbHI6IG51bWJlciA9IDAuMDAwMVxuKTogRW1iZWRkaW5nIHtcbiAgY29uc3QgZGltID0gYW5jaG9yRW1iLmxlbmd0aDtcbiAgY29uc3QgZ3JhZGllbnQ6IG51bWJlcltdID0gbmV3IEFycmF5KGRpbSkuZmlsbCgwKTtcblxuICAvLyBQdWxsIGFuY2hvciB0b3dhcmRzIHBvc2l0aXZlXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgZGltOyBpKyspIHtcbiAgICBncmFkaWVudFtpXSArPSBsciAqIChwb3NpdGl2ZUVtYltpXSAtIGFuY2hvckVtYltpXSk7XG4gIH1cblxuICAvLyBQdXNoIGFuY2hvciBhd2F5IGZyb20gbmVnYXRpdmVcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBkaW07IGkrKykge1xuICAgIGdyYWRpZW50W2ldIC09IGxyICogMC41ICogKG5lZ2F0aXZlRW1iW2ldIC0gYW5jaG9yRW1iW2ldKTtcbiAgfVxuXG4gIHJldHVybiBncmFkaWVudDtcbn1cblxuLyoqXG4gKiBDb250cmFzdGl2ZSBUcmFpbmVyIGZvciBSdXZMVFJBIG1vZGVsc1xuICpcbiAqIEltcGxlbWVudHMgdHJpcGxldCBsb3NzIGFuZCBJbmZvTkNFIGxvc3MgZm9yIGVtYmVkZGluZyBmaW5lLXR1bmluZy5cbiAqL1xuZXhwb3J0IGNsYXNzIENvbnRyYXN0aXZlVHJhaW5lciB7XG4gIHByaXZhdGUgY29uZmlnOiBSZXF1aXJlZDxDb250cmFzdGl2ZUNvbmZpZz47XG4gIHByaXZhdGUgdHJpcGxldHM6IFRyYWluaW5nVHJpcGxldFtdID0gW107XG4gIHByaXZhdGUgaGlzdG9yeTogVHJhaW5pbmdIaXN0b3J5RW50cnlbXSA9IFtdO1xuICBwcml2YXRlIGFnZW50RW1iZWRkaW5nczogTWFwPHN0cmluZywgRW1iZWRkaW5nPiA9IG5ldyBNYXAoKTtcblxuICBjb25zdHJ1Y3Rvcihjb25maWc/OiBDb250cmFzdGl2ZUNvbmZpZykge1xuICAgIHRoaXMuY29uZmlnID0geyAuLi5ERUZBVUxUX0NPTlRSQVNUSVZFX0NPTkZJRywgLi4uY29uZmlnIH07XG4gIH1cblxuICAvKipcbiAgICogQWRkIGEgdHJhaW5pbmcgdHJpcGxldFxuICAgKi9cbiAgYWRkVHJpcGxldChcbiAgICBhbmNob3I6IHN0cmluZyxcbiAgICBhbmNob3JFbWI6IEVtYmVkZGluZyxcbiAgICBwb3NpdGl2ZTogc3RyaW5nLFxuICAgIHBvc2l0aXZlRW1iOiBFbWJlZGRpbmcsXG4gICAgbmVnYXRpdmU6IHN0cmluZyxcbiAgICBuZWdhdGl2ZUVtYjogRW1iZWRkaW5nLFxuICAgIGlzSGFyZDogYm9vbGVhbiA9IGZhbHNlXG4gICk6IHZvaWQge1xuICAgIHRoaXMudHJpcGxldHMucHVzaCh7XG4gICAgICBhbmNob3IsXG4gICAgICBhbmNob3JFbWIsXG4gICAgICBwb3NpdGl2ZSxcbiAgICAgIHBvc2l0aXZlRW1iLFxuICAgICAgbmVnYXRpdmUsXG4gICAgICBuZWdhdGl2ZUVtYixcbiAgICAgIGlzSGFyZCxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYWdlbnQgZW1iZWRkaW5nIGZvciByZWZlcmVuY2VcbiAgICovXG4gIGFkZEFnZW50RW1iZWRkaW5nKGFnZW50TmFtZTogc3RyaW5nLCBlbWJlZGRpbmc6IEVtYmVkZGluZyk6IHZvaWQge1xuICAgIHRoaXMuYWdlbnRFbWJlZGRpbmdzLnNldChhZ2VudE5hbWUsIGVtYmVkZGluZyk7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGFsbCBhZ2VudCBlbWJlZGRpbmdzXG4gICAqL1xuICBnZXRBZ2VudEVtYmVkZGluZ3MoKTogTWFwPHN0cmluZywgRW1iZWRkaW5nPiB7XG4gICAgcmV0dXJuIHRoaXMuYWdlbnRFbWJlZGRpbmdzO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0cmlwbGV0IGNvdW50XG4gICAqL1xuICBnZXRUcmlwbGV0Q291bnQoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy50cmlwbGV0cy5sZW5ndGg7XG4gIH1cblxuICAvKipcbiAgICogU2ltdWxhdGUgdHJhaW5pbmcgKGNvbXB1dGUgbG9zc2VzIHdpdGhvdXQgYWN0dWFsIGJhY2twcm9wKVxuICAgKiBJbiBhIGZ1bGwgaW1wbGVtZW50YXRpb24sIHRoaXMgd291bGQgdXNlIHByb3BlciBncmFkaWVudCBkZXNjZW50XG4gICAqL1xuICB0cmFpbigpOiBDb250cmFzdGl2ZVRyYWluaW5nUmVzdWx0IHtcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgIGNvbnN0IHsgZXBvY2hzLCBiYXRjaFNpemUsIG1hcmdpbiB9ID0gdGhpcy5jb25maWc7XG5cbiAgICBpZiAodGhpcy50cmlwbGV0cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHRyaXBsZXRDb3VudDogMCxcbiAgICAgICAgZmluYWxMb3NzOiAwLFxuICAgICAgICBpbml0aWFsTG9zczogMCxcbiAgICAgICAgaW1wcm92ZW1lbnQ6IDAsXG4gICAgICAgIGhpc3Rvcnk6IFtdLFxuICAgICAgICBkdXJhdGlvbk1zOiAwLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBmb3IgKGxldCBlcG9jaCA9IDA7IGVwb2NoIDwgZXBvY2hzOyBlcG9jaCsrKSB7XG4gICAgICBsZXQgZXBvY2hMb3NzID0gMDtcbiAgICAgIGxldCBiYXRjaENvdW50ID0gMDtcblxuICAgICAgLy8gU2h1ZmZsZSB0cmlwbGV0c1xuICAgICAgY29uc3Qgc2h1ZmZsZWQgPSBbLi4udGhpcy50cmlwbGV0c10uc29ydCgoKSA9PiBNYXRoLnJhbmRvbSgpIC0gMC41KTtcblxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzaHVmZmxlZC5sZW5ndGg7IGkgKz0gYmF0Y2hTaXplKSB7XG4gICAgICAgIGNvbnN0IGJhdGNoID0gc2h1ZmZsZWQuc2xpY2UoaSwgaSArIGJhdGNoU2l6ZSk7XG4gICAgICAgIGxldCBiYXRjaExvc3MgPSAwO1xuXG4gICAgICAgIGZvciAoY29uc3QgdHJpcGxldCBvZiBiYXRjaCkge1xuICAgICAgICAgIGNvbnN0IGxvc3MgPSB0cmlwbGV0TG9zcyhcbiAgICAgICAgICAgIHRyaXBsZXQuYW5jaG9yRW1iLFxuICAgICAgICAgICAgdHJpcGxldC5wb3NpdGl2ZUVtYixcbiAgICAgICAgICAgIHRyaXBsZXQubmVnYXRpdmVFbWIsXG4gICAgICAgICAgICBtYXJnaW5cbiAgICAgICAgICApO1xuICAgICAgICAgIGJhdGNoTG9zcyArPSBsb3NzO1xuICAgICAgICB9XG5cbiAgICAgICAgZXBvY2hMb3NzICs9IGJhdGNoTG9zcyAvIGJhdGNoLmxlbmd0aDtcbiAgICAgICAgYmF0Y2hDb3VudCsrO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBhdmdMb3NzID0gZXBvY2hMb3NzIC8gYmF0Y2hDb3VudDtcbiAgICAgIHRoaXMuaGlzdG9yeS5wdXNoKHsgZXBvY2g6IGVwb2NoICsgMSwgbG9zczogYXZnTG9zcyB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBpbml0aWFsTG9zcyA9IHRoaXMuaGlzdG9yeVswXT8ubG9zcyB8fCAwO1xuICAgIGNvbnN0IGZpbmFsTG9zcyA9IHRoaXMuaGlzdG9yeVt0aGlzLmhpc3RvcnkubGVuZ3RoIC0gMV0/Lmxvc3MgfHwgMDtcbiAgICBjb25zdCBpbXByb3ZlbWVudCA9IGluaXRpYWxMb3NzID4gMCA/ICgxIC0gZmluYWxMb3NzIC8gaW5pdGlhbExvc3MpICogMTAwIDogMDtcblxuICAgIHJldHVybiB7XG4gICAgICB0cmlwbGV0Q291bnQ6IHRoaXMudHJpcGxldHMubGVuZ3RoLFxuICAgICAgZmluYWxMb3NzLFxuICAgICAgaW5pdGlhbExvc3MsXG4gICAgICBpbXByb3ZlbWVudCxcbiAgICAgIGhpc3Rvcnk6IHRoaXMuaGlzdG9yeSxcbiAgICAgIGR1cmF0aW9uTXM6IERhdGUubm93KCkgLSBzdGFydFRpbWUsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFeHBvcnQgdHJhaW5pbmcgZGF0YSBmb3IgZXh0ZXJuYWwgZmluZS10dW5pbmcgdG9vbHNcbiAgICovXG4gIGV4cG9ydFRyYWluaW5nRGF0YShvdXRwdXRQYXRoPzogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBvdXREaXIgPSBvdXRwdXRQYXRoIHx8IHRoaXMuY29uZmlnLm91dHB1dFBhdGg7XG5cbiAgICBpZiAoIWV4aXN0c1N5bmMob3V0RGlyKSkge1xuICAgICAgbWtkaXJTeW5jKG91dERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuXG4gICAgLy8gSlNPTkwgZm9ybWF0IGZvciBmaW5lLXR1bmluZ1xuICAgIGNvbnN0IGpzb25sRGF0YSA9IHRoaXMudHJpcGxldHMubWFwKHQgPT4gKHtcbiAgICAgIGFuY2hvcjogdC5hbmNob3IsXG4gICAgICBwb3NpdGl2ZTogdC5wb3NpdGl2ZSxcbiAgICAgIG5lZ2F0aXZlOiB0Lm5lZ2F0aXZlLFxuICAgICAgaXNIYXJkOiB0LmlzSGFyZCxcbiAgICB9KSk7XG5cbiAgICAvLyBDU1YgZm9ybWF0IGZvciBhbmFseXNpc1xuICAgIGNvbnN0IGNzdkRhdGEgPSBbXG4gICAgICAnYW5jaG9yLHBvc2l0aXZlLG5lZ2F0aXZlLGlzX2hhcmQnLFxuICAgICAgLi4udGhpcy50cmlwbGV0cy5tYXAodCA9PlxuICAgICAgICBgXCIke3QuYW5jaG9yLnJlcGxhY2UoL1wiL2csICdcIlwiJyl9XCIsJHt0LnBvc2l0aXZlfSwke3QubmVnYXRpdmV9LCR7dC5pc0hhcmR9YFxuICAgICAgKSxcbiAgICBdLmpvaW4oJ1xcbicpO1xuXG4gICAgLy8gRW1iZWRkaW5nIG1hdHJpeCBmb3IgZGlyZWN0IHRyYWluaW5nXG4gICAgY29uc3QgZW1iZWRkaW5nRGF0YSA9IHtcbiAgICAgIGFuY2hvcnM6IHRoaXMudHJpcGxldHMubWFwKHQgPT4gdC5hbmNob3JFbWIpLFxuICAgICAgcG9zaXRpdmVzOiB0aGlzLnRyaXBsZXRzLm1hcCh0ID0+IHQucG9zaXRpdmVFbWIpLFxuICAgICAgbmVnYXRpdmVzOiB0aGlzLnRyaXBsZXRzLm1hcCh0ID0+IHQubmVnYXRpdmVFbWIpLFxuICAgICAgbGFiZWxzOiB0aGlzLnRyaXBsZXRzLm1hcCh0ID0+IHQucG9zaXRpdmUpLFxuICAgIH07XG5cbiAgICB3cml0ZUZpbGVTeW5jKGpvaW4ob3V0RGlyLCAndHJpcGxldHMuanNvbmwnKSwganNvbmxEYXRhLm1hcChpdGVtID0+IEpTT04uc3RyaW5naWZ5KGl0ZW0pKS5qb2luKCdcXG4nKSk7XG4gICAgd3JpdGVGaWxlU3luYyhqb2luKG91dERpciwgJ3RyaXBsZXRzLmNzdicpLCBjc3ZEYXRhKTtcbiAgICB3cml0ZUZpbGVTeW5jKGpvaW4ob3V0RGlyLCAnZW1iZWRkaW5ncy5qc29uJyksIEpTT04uc3RyaW5naWZ5KGVtYmVkZGluZ0RhdGEsIG51bGwsIDIpKTtcblxuICAgIHJldHVybiBvdXREaXI7XG4gIH1cblxuICAvKipcbiAgICogR2VuZXJhdGUgTG9SQSBhZGFwdGVyIGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGdlbmVyYXRlTG9SQUNvbmZpZyhvdXRwdXRQYXRoPzogc3RyaW5nKTogTG9SQUV4cG9ydENvbmZpZyB7XG4gICAgY29uc3Qgb3V0RGlyID0gb3V0cHV0UGF0aCB8fCB0aGlzLmNvbmZpZy5vdXRwdXRQYXRoO1xuXG4gICAgY29uc3QgbG9yYUNvbmZpZzogTG9SQUV4cG9ydENvbmZpZyA9IHtcbiAgICAgIG1vZGVsX3R5cGU6ICdxd2VuMicsXG4gICAgICBiYXNlX21vZGVsOiAnUXdlbi9Rd2VuMi41LTAuNUInLFxuICAgICAgb3V0cHV0X2Rpcjogb3V0RGlyLFxuICAgICAgbG9yYV9yOiA4LFxuICAgICAgbG9yYV9hbHBoYTogMTYsXG4gICAgICBsb3JhX2Ryb3BvdXQ6IDAuMDUsXG4gICAgICB0YXJnZXRfbW9kdWxlczogWydxX3Byb2onLCAndl9wcm9qJywgJ2tfcHJvaicsICdvX3Byb2onXSxcbiAgICAgIGxlYXJuaW5nX3JhdGU6IHRoaXMuY29uZmlnLmxlYXJuaW5nUmF0ZSxcbiAgICAgIG51bV90cmFpbl9lcG9jaHM6IHRoaXMuY29uZmlnLmVwb2NocyxcbiAgICAgIHBlcl9kZXZpY2VfdHJhaW5fYmF0Y2hfc2l6ZTogdGhpcy5jb25maWcuYmF0Y2hTaXplLFxuICAgICAgZ3JhZGllbnRfYWNjdW11bGF0aW9uX3N0ZXBzOiA0LFxuICAgICAgd2FybXVwX3JhdGlvOiAwLjEsXG4gICAgICBsb3NzX3R5cGU6ICd0cmlwbGV0JyxcbiAgICAgIG1hcmdpbjogdGhpcy5jb25maWcubWFyZ2luLFxuICAgICAgdGVtcGVyYXR1cmU6IHRoaXMuY29uZmlnLnRlbXBlcmF0dXJlLFxuICAgICAgdHJhaW5fZGF0YTogam9pbihvdXREaXIsICd0cmlwbGV0cy5qc29ubCcpLFxuICAgICAgZXZhbF9kYXRhOiBqb2luKG91dERpciwgJ2V2YWwuanNvbmwnKSxcbiAgICB9O1xuXG4gICAgaWYgKCFleGlzdHNTeW5jKG91dERpcikpIHtcbiAgICAgIG1rZGlyU3luYyhvdXREaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cblxuICAgIHdyaXRlRmlsZVN5bmMoam9pbihvdXREaXIsICdsb3JhX2NvbmZpZy5qc29uJyksIEpTT04uc3RyaW5naWZ5KGxvcmFDb25maWcsIG51bGwsIDIpKTtcbiAgICByZXR1cm4gbG9yYUNvbmZpZztcbiAgfVxuXG4gIC8qKlxuICAgKiBHZW5lcmF0ZSB0cmFpbmluZyBzY3JpcHQgZm9yIGV4dGVybmFsIHRvb2xzXG4gICAqL1xuICBnZW5lcmF0ZVRyYWluaW5nU2NyaXB0KG91dHB1dFBhdGg/OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IG91dERpciA9IG91dHB1dFBhdGggfHwgdGhpcy5jb25maWcub3V0cHV0UGF0aDtcblxuICAgIGNvbnN0IHNjcmlwdCA9IGAjIS9iaW4vYmFzaFxuIyBSdXZMVFJBIEZpbmUtdHVuaW5nIFNjcmlwdFxuIyBQcmVyZXF1aXNpdGVzOiBwaXAgaW5zdGFsbCB0cmFuc2Zvcm1lcnMgcGVmdCBhY2NlbGVyYXRlXG5cbnNldCAtZVxuXG5NT0RFTF9QQVRIPVwiJHtvdXREaXJ9XCJcbkJBU0VfTU9ERUw9XCJRd2VuL1F3ZW4yLjUtMC41QlwiXG5cbmVjaG8gXCI9PT0gUnV2TFRSQSBDb250cmFzdGl2ZSBGaW5lLXR1bmluZyA9PT1cIlxuZWNobyBcIkJhc2UgbW9kZWw6ICRCQVNFX01PREVMXCJcbmVjaG8gXCJPdXRwdXQ6ICRNT0RFTF9QQVRIXCJcblxuIyBDaGVjayBmb3IgdHJhaW5pbmcgZGF0YVxuaWYgWyAhIC1mIFwiJE1PREVMX1BBVEgvdHJpcGxldHMuanNvbmxcIiBdOyB0aGVuXG4gIGVjaG8gXCJFcnJvcjogVHJhaW5pbmcgZGF0YSBub3QgZm91bmQgYXQgJE1PREVMX1BBVEgvdHJpcGxldHMuanNvbmxcIlxuICBleGl0IDFcbmZpXG5cbiMgSW5zdGFsbCBkZXBlbmRlbmNpZXMgaWYgbmVlZGVkXG5weXRob24zIC1jIFwiaW1wb3J0IHRyYW5zZm9ybWVycywgcGVmdFwiIDI+L2Rldi9udWxsIHx8IHtcbiAgZWNobyBcIkluc3RhbGxpbmcgZGVwZW5kZW5jaWVzLi4uXCJcbiAgcGlwIGluc3RhbGwgdHJhbnNmb3JtZXJzIHBlZnQgYWNjZWxlcmF0ZSBzZW50ZW5jZXBpZWNlXG59XG5cbiMgRmluZS10dW5lIHdpdGggTG9SQVxucHl0aG9uMyA8PCAnUFlUSE9OJ1xuaW1wb3J0IGpzb25cbmltcG9ydCB0b3JjaFxuZnJvbSBwYXRobGliIGltcG9ydCBQYXRoXG5mcm9tIHRyYW5zZm9ybWVycyBpbXBvcnQgQXV0b01vZGVsRm9yQ2F1c2FsTE0sIEF1dG9Ub2tlbml6ZXJcbmZyb20gcGVmdCBpbXBvcnQgTG9yYUNvbmZpZywgZ2V0X3BlZnRfbW9kZWwsIFRhc2tUeXBlXG5cbiMgTG9hZCBjb25maWdcbmNvbmZpZ19wYXRoID0gUGF0aChcIiR7b3V0RGlyfS9sb3JhX2NvbmZpZy5qc29uXCIpXG53aXRoIG9wZW4oY29uZmlnX3BhdGgpIGFzIGY6XG4gICAgY29uZmlnID0ganNvbi5sb2FkKGYpXG5cbnByaW50KGZcIkxvYWRpbmcgYmFzZSBtb2RlbDoge2NvbmZpZ1snYmFzZV9tb2RlbCddfVwiKVxuXG4jIExvYWQgbW9kZWwgYW5kIHRva2VuaXplclxudG9rZW5pemVyID0gQXV0b1Rva2VuaXplci5mcm9tX3ByZXRyYWluZWQoY29uZmlnWydiYXNlX21vZGVsJ10pXG5tb2RlbCA9IEF1dG9Nb2RlbEZvckNhdXNhbExNLmZyb21fcHJldHJhaW5lZChcbiAgICBjb25maWdbJ2Jhc2VfbW9kZWwnXSxcbiAgICB0b3JjaF9kdHlwZT10b3JjaC5mbG9hdDE2LFxuICAgIGRldmljZV9tYXA9J2F1dG8nXG4pXG5cbiMgQ29uZmlndXJlIExvUkFcbmxvcmFfY29uZmlnID0gTG9yYUNvbmZpZyhcbiAgICByPWNvbmZpZ1snbG9yYV9yJ10sXG4gICAgbG9yYV9hbHBoYT1jb25maWdbJ2xvcmFfYWxwaGEnXSxcbiAgICBsb3JhX2Ryb3BvdXQ9Y29uZmlnWydsb3JhX2Ryb3BvdXQnXSxcbiAgICB0YXJnZXRfbW9kdWxlcz1jb25maWdbJ3RhcmdldF9tb2R1bGVzJ10sXG4gICAgdGFza190eXBlPVRhc2tUeXBlLkNBVVNBTF9MTSxcbilcblxubW9kZWwgPSBnZXRfcGVmdF9tb2RlbChtb2RlbCwgbG9yYV9jb25maWcpXG5tb2RlbC5wcmludF90cmFpbmFibGVfcGFyYW1ldGVycygpXG5cbnByaW50KFwiTW9kZWwgcmVhZHkgZm9yIGZpbmUtdHVuaW5nIVwiKVxucHJpbnQoZlwiVHJhaW5pbmcgZGF0YToge2NvbmZpZ1sndHJhaW5fZGF0YSddfVwiKVxucHJpbnQoXCJOb3RlOiBGdWxsIHRyYWluaW5nIHJlcXVpcmVzIEdQVS4gVGhpcyBzY3JpcHQgdmFsaWRhdGVzIHRoZSBzZXR1cC5cIilcblBZVEhPTlxuXG5lY2hvIFwiXCJcbmVjaG8gXCI9PT0gU2V0dXAgQ29tcGxldGUgPT09XCJcbmVjaG8gXCJUbyB0cmFpbiBvbiBHUFUsIHJ1biB0aGUgZnVsbCB0cmFpbmluZyBwaXBlbGluZS5cIlxuZWNobyBcIlRyYWluaW5nIGRhdGEgZXhwb3J0ZWQgdG86ICRNT0RFTF9QQVRIL3RyaXBsZXRzLmpzb25sXCJcbmA7XG5cbiAgICBpZiAoIWV4aXN0c1N5bmMob3V0RGlyKSkge1xuICAgICAgbWtkaXJTeW5jKG91dERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuXG4gICAgY29uc3Qgc2NyaXB0UGF0aCA9IGpvaW4ob3V0RGlyLCAndHJhaW4uc2gnKTtcbiAgICB3cml0ZUZpbGVTeW5jKHNjcmlwdFBhdGgsIHNjcmlwdCk7XG5cbiAgICByZXR1cm4gc2NyaXB0UGF0aDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdHJhaW5pbmcgaGlzdG9yeVxuICAgKi9cbiAgZ2V0SGlzdG9yeSgpOiBUcmFpbmluZ0hpc3RvcnlFbnRyeVtdIHtcbiAgICByZXR1cm4gWy4uLnRoaXMuaGlzdG9yeV07XG4gIH1cblxuICAvKipcbiAgICogUmVzZXQgdHJhaW5lclxuICAgKi9cbiAgcmVzZXQoKTogdm9pZCB7XG4gICAgdGhpcy50cmlwbGV0cyA9IFtdO1xuICAgIHRoaXMuaGlzdG9yeSA9IFtdO1xuICB9XG59XG5cbi8qKlxuICogQWdlbnQgVHJhaW5pbmcgRGF0YSBJbnRlcmZhY2VcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBBZ2VudFRyYWluaW5nRGF0YSB7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGtleXdvcmRzOiBzdHJpbmdbXTtcbiAgZXhhbXBsZXM6IHN0cmluZ1tdO1xuICBjb25mdXNpbmdfd2l0aD86IHN0cmluZ1tdO1xufVxuXG4vKipcbiAqIFRyYWluaW5nIEV4YW1wbGUgSW50ZXJmYWNlXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgVHJhaW5pbmdFeGFtcGxlIHtcbiAgdGFzazogc3RyaW5nO1xuICBhZ2VudDogc3RyaW5nO1xuICBjb21wbGV4aXR5Pzogc3RyaW5nO1xuICBjb25mdXNpbmdfd2l0aD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBEYXRhc2V0IFN0YXRpc3RpY3NcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBEYXRhc2V0U3RhdHMge1xuICB0b3RhbEV4YW1wbGVzOiBudW1iZXI7XG4gIGNvbnRyYXN0aXZlUGFpcnM6IG51bWJlcjtcbiAgYWdlbnRUeXBlczogbnVtYmVyO1xuICBhZ2VudHM6IHN0cmluZ1tdO1xufVxuXG4vKipcbiAqIEFnZW50IFRyYWluaW5nIERhdGEgZm9yIENsYXVkZSBDb2RlIFJvdXRlclxuICovXG5leHBvcnQgY29uc3QgQUdFTlRfVFJBSU5JTkdfREFUQTogUmVjb3JkPHN0cmluZywgQWdlbnRUcmFpbmluZ0RhdGE+ID0ge1xuICBjb2Rlcjoge1xuICAgIGRlc2NyaXB0aW9uOiAnSW1wbGVtZW50YXRpb24gc3BlY2lhbGlzdCBmb3Igd3JpdGluZyBjbGVhbiwgZWZmaWNpZW50IGNvZGUuIEhhbmRsZXMgY29kaW5nIHRhc2tzLCBmZWF0dXJlIGltcGxlbWVudGF0aW9uLCBhbmQgY29kZSBnZW5lcmF0aW9uLicsXG4gICAga2V5d29yZHM6IFsnaW1wbGVtZW50JywgJ2NvZGUnLCAnd3JpdGUnLCAnYnVpbGQnLCAnY3JlYXRlJywgJ2RldmVsb3AnLCAnZnVuY3Rpb24nLCAnY2xhc3MnLCAnY29tcG9uZW50JywgJ2ZlYXR1cmUnXSxcbiAgICBleGFtcGxlczogW1xuICAgICAgJ0ltcGxlbWVudCBhIGJpbmFyeSBzZWFyY2ggZnVuY3Rpb24nLFxuICAgICAgJ1dyaXRlIGEgUmVhY3QgY29tcG9uZW50IGZvciB1c2VyIHJlZ2lzdHJhdGlvbicsXG4gICAgICAnQ3JlYXRlIGEgUkVTVCBBUEkgZW5kcG9pbnQgZm9yIHVzZXIgYXV0aGVudGljYXRpb24nLFxuICAgICAgJ0J1aWxkIGEgY2FjaGluZyBsYXllciBmb3IgdGhlIGRhdGFiYXNlIHF1ZXJpZXMnLFxuICAgIF0sXG4gICAgY29uZnVzaW5nX3dpdGg6IFsncmVmYWN0b3JlcicsICdkZWJ1Z2dlciddLFxuICB9LFxuICB0ZXN0ZXI6IHtcbiAgICBkZXNjcmlwdGlvbjogJ1Rlc3Rpbmcgc3BlY2lhbGlzdCBmb3Igd3JpdGluZyBhbmQgbWFpbnRhaW5pbmcgdGVzdHMuIENyZWF0ZXMgdW5pdCB0ZXN0cywgaW50ZWdyYXRpb24gdGVzdHMsIGFuZCBlbnN1cmVzIGNvZGUgcXVhbGl0eSB0aHJvdWdoIHRlc3RpbmcuJyxcbiAgICBrZXl3b3JkczogWyd0ZXN0JywgJ3VuaXQgdGVzdCcsICdpbnRlZ3JhdGlvbiB0ZXN0JywgJ2NvdmVyYWdlJywgJ21vY2snLCAnYXNzZXJ0aW9uJywgJ3NwZWMnLCAnamVzdCcsICdweXRlc3QnXSxcbiAgICBleGFtcGxlczogW1xuICAgICAgJ1dyaXRlIHVuaXQgdGVzdHMgZm9yIHRoZSBhdXRoZW50aWNhdGlvbiBtb2R1bGUnLFxuICAgICAgJ0FkZCBpbnRlZ3JhdGlvbiB0ZXN0cyBmb3IgdGhlIHBheW1lbnQgZ2F0ZXdheScsXG4gICAgICAnQ3JlYXRlIHRlc3QgY292ZXJhZ2UgZm9yIHRoZSB1c2VyIHNlcnZpY2UnLFxuICAgICAgJ1dyaXRlIGUyZSB0ZXN0cyBmb3IgdGhlIGNoZWNrb3V0IGZsb3cnLFxuICAgIF0sXG4gICAgY29uZnVzaW5nX3dpdGg6IFsncmV2aWV3ZXInXSxcbiAgfSxcbiAgcmV2aWV3ZXI6IHtcbiAgICBkZXNjcmlwdGlvbjogJ0NvZGUgcmV2aWV3IHNwZWNpYWxpc3QgZm9yIGFuYWx5emluZyBjb2RlIHF1YWxpdHksIGlkZW50aWZ5aW5nIGlzc3VlcywgYW5kIHN1Z2dlc3RpbmcgaW1wcm92ZW1lbnRzLicsXG4gICAga2V5d29yZHM6IFsncmV2aWV3JywgJ2FuYWx5emUnLCAnY2hlY2snLCAnaW5zcGVjdCcsICdhdWRpdCcsICdldmFsdWF0ZScsICdhc3Nlc3MnLCAnY3JpdGlxdWUnXSxcbiAgICBleGFtcGxlczogW1xuICAgICAgJ1JldmlldyB0aGUgcHVsbCByZXF1ZXN0IGZvciBjb2RlIHF1YWxpdHknLFxuICAgICAgJ0NoZWNrIHRoZSBjb2RlIGZvciBwb3RlbnRpYWwgc2VjdXJpdHkgdnVsbmVyYWJpbGl0aWVzJyxcbiAgICAgICdBbmFseXplIHRoZSBpbXBsZW1lbnRhdGlvbiBmb3IgYmVzdCBwcmFjdGljZXMnLFxuICAgICAgJ0V2YWx1YXRlIHRoZSBhcmNoaXRlY3R1cmUgZGVjaXNpb25zIGluIHRoaXMgUFInLFxuICAgIF0sXG4gICAgY29uZnVzaW5nX3dpdGg6IFsndGVzdGVyJywgJ3NlY3VyaXR5LWFyY2hpdGVjdCddLFxuICB9LFxuICByZXNlYXJjaGVyOiB7XG4gICAgZGVzY3JpcHRpb246ICdSZXNlYXJjaCBzcGVjaWFsaXN0IGZvciBpbnZlc3RpZ2F0aW5nIHRlY2hub2xvZ2llcywgZ2F0aGVyaW5nIGluZm9ybWF0aW9uLCBhbmQgYW5hbHl6aW5nIG9wdGlvbnMuJyxcbiAgICBrZXl3b3JkczogWydyZXNlYXJjaCcsICdpbnZlc3RpZ2F0ZScsICdleHBsb3JlJywgJ2FuYWx5emUnLCAnc3R1ZHknLCAnY29tcGFyZScsICdldmFsdWF0ZScsICdsZWFybiddLFxuICAgIGV4YW1wbGVzOiBbXG4gICAgICAnUmVzZWFyY2ggYmVzdCBwcmFjdGljZXMgZm9yIFJlYWN0IHN0YXRlIG1hbmFnZW1lbnQnLFxuICAgICAgJ0ludmVzdGlnYXRlIHRoZSBwZXJmb3JtYW5jZSBpc3N1ZXMgaW4gdGhlIGRhc2hib2FyZCcsXG4gICAgICAnQ29tcGFyZSBkaWZmZXJlbnQgYXV0aGVudGljYXRpb24gc3RyYXRlZ2llcycsXG4gICAgICAnU3R1ZHkgdGhlIGNvZGViYXNlIGFyY2hpdGVjdHVyZSBmb3IgdGhlIG5ldyBmZWF0dXJlJyxcbiAgICBdLFxuICAgIGNvbmZ1c2luZ193aXRoOiBbJ3BsYW5uZXInXSxcbiAgfSxcbiAgYXJjaGl0ZWN0OiB7XG4gICAgZGVzY3JpcHRpb246ICdTeXN0ZW0gYXJjaGl0ZWN0IGZvciBkZXNpZ25pbmcgc29mdHdhcmUgYXJjaGl0ZWN0dXJlLCBtYWtpbmcgdGVjaG5pY2FsIGRlY2lzaW9ucywgYW5kIHBsYW5uaW5nIHN5c3RlbSBzdHJ1Y3R1cmUuJyxcbiAgICBrZXl3b3JkczogWydkZXNpZ24nLCAnYXJjaGl0ZWN0JywgJ3N0cnVjdHVyZScsICdwbGFuJywgJ3NjaGVtYScsICdtb2RlbCcsICdwYXR0ZXJuJywgJ3N5c3RlbSddLFxuICAgIGV4YW1wbGVzOiBbXG4gICAgICAnRGVzaWduIHRoZSBkYXRhYmFzZSBzY2hlbWEgZm9yIHVzZXIgcHJvZmlsZXMnLFxuICAgICAgJ1BsYW4gdGhlIGFyY2hpdGVjdHVyZSBmb3IgcmVhbC10aW1lIG5vdGlmaWNhdGlvbnMnLFxuICAgICAgJ0NyZWF0ZSBhIHN5c3RlbSBkZXNpZ24gZm9yIHRoZSBtaWNyb3NlcnZpY2VzIG1pZ3JhdGlvbicsXG4gICAgICAnRGVzaWduIHRoZSBBUEkgc3RydWN0dXJlIGZvciB0aGUgbmV3IHByb2R1Y3QgY2F0YWxvZycsXG4gICAgXSxcbiAgICBjb25mdXNpbmdfd2l0aDogWydwbGFubmVyJ10sXG4gIH0sXG4gIGRlYnVnZ2VyOiB7XG4gICAgZGVzY3JpcHRpb246ICdEZWJ1Z2dpbmcgc3BlY2lhbGlzdCBmb3IgZmluZGluZyBhbmQgZml4aW5nIGJ1Z3MsIGFuYWx5emluZyBlcnJvcnMsIGFuZCB0cm91Ymxlc2hvb3RpbmcgaXNzdWVzLicsXG4gICAga2V5d29yZHM6IFsnZGVidWcnLCAnZml4JywgJ2J1ZycsICdlcnJvcicsICdpc3N1ZScsICdjcmFzaCcsICdleGNlcHRpb24nLCAndHJvdWJsZXNob290J10sXG4gICAgZXhhbXBsZXM6IFtcbiAgICAgICdGaXggdGhlIG51bGwgcG9pbnRlciBleGNlcHRpb24gaW4gdGhlIGxvZ2luIGhhbmRsZXInLFxuICAgICAgJ0RlYnVnIHRoZSBtZW1vcnkgbGVhayBpbiB0aGUgV2ViU29ja2V0IGhhbmRsZXInLFxuICAgICAgJ1Ryb3VibGVzaG9vdCB0aGUgcmFjZSBjb25kaXRpb24gaW4gdGhlIHBheW1lbnQgcHJvY2Vzc29yJyxcbiAgICAgICdGaW5kIHRoZSByb290IGNhdXNlIG9mIHRoZSBpbnRlcm1pdHRlbnQgdGVzdCBmYWlsdXJlcycsXG4gICAgXSxcbiAgICBjb25mdXNpbmdfd2l0aDogWydjb2RlciddLFxuICB9LFxuICAnc2VjdXJpdHktYXJjaGl0ZWN0Jzoge1xuICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgc3BlY2lhbGlzdCBmb3IgYXVkaXRpbmcgY29kZSBzZWN1cml0eSwgaWRlbnRpZnlpbmcgdnVsbmVyYWJpbGl0aWVzLCBhbmQgaW1wbGVtZW50aW5nIHNlY3VyaXR5IG1lYXN1cmVzLicsXG4gICAga2V5d29yZHM6IFsnc2VjdXJpdHknLCAndnVsbmVyYWJpbGl0eScsICd4c3MnLCAnc3FsIGluamVjdGlvbicsICdhdXRoJywgJ2VuY3J5cHRpb24nLCAnYXVkaXQnLCAncGVuZXRyYXRpb24nXSxcbiAgICBleGFtcGxlczogW1xuICAgICAgJ0F1ZGl0IHRoZSBBUEkgZW5kcG9pbnRzIGZvciBYU1MgdnVsbmVyYWJpbGl0aWVzJyxcbiAgICAgICdSZXZpZXcgdGhlIGF1dGhlbnRpY2F0aW9uIGZsb3cgZm9yIHNlY3VyaXR5IGlzc3VlcycsXG4gICAgICAnSW1wbGVtZW50IGlucHV0IHZhbGlkYXRpb24gZm9yIHRoZSB1c2VyIGZvcm1zJyxcbiAgICAgICdDaGVjayBmb3IgU1FMIGluamVjdGlvbiB2dWxuZXJhYmlsaXRpZXMgaW4gdGhlIHNlYXJjaCcsXG4gICAgXSxcbiAgICBjb25mdXNpbmdfd2l0aDogWydyZXZpZXdlciddLFxuICB9LFxuICBkb2N1bWVudGVyOiB7XG4gICAgZGVzY3JpcHRpb246ICdEb2N1bWVudGF0aW9uIHNwZWNpYWxpc3QgZm9yIHdyaXRpbmcgdGVjaG5pY2FsIGRvY3VtZW50YXRpb24sIGNvbW1lbnRzLCBhbmQgQVBJIGRvY3MuJyxcbiAgICBrZXl3b3JkczogWydkb2N1bWVudCcsICdjb21tZW50JywgJ2pzZG9jJywgJ3JlYWRtZScsICdkb2NzJywgJ2V4cGxhaW4nLCAnZGVzY3JpYmUnLCAnYW5ub3RhdGUnXSxcbiAgICBleGFtcGxlczogW1xuICAgICAgJ1dyaXRlIEpTRG9jIGNvbW1lbnRzIGZvciB0aGUgdXRpbGl0eSBmdW5jdGlvbnMnLFxuICAgICAgJ0NyZWF0ZSBSRUFETUUgZG9jdW1lbnRhdGlvbiBmb3IgdGhlIG5ldyBtb2R1bGUnLFxuICAgICAgJ0RvY3VtZW50IHRoZSBBUEkgZW5kcG9pbnRzIHdpdGggZXhhbXBsZXMnLFxuICAgICAgJ0FkZCBpbmxpbmUgY29tbWVudHMgZXhwbGFpbmluZyB0aGUgYWxnb3JpdGhtJyxcbiAgICBdLFxuICAgIGNvbmZ1c2luZ193aXRoOiBbJ2FwaS1kb2NzJ10sXG4gIH0sXG4gIHJlZmFjdG9yZXI6IHtcbiAgICBkZXNjcmlwdGlvbjogJ1JlZmFjdG9yaW5nIHNwZWNpYWxpc3QgZm9yIGltcHJvdmluZyBjb2RlIHN0cnVjdHVyZSwgY2xlYW5pbmcgdXAgdGVjaG5pY2FsIGRlYnQsIGFuZCBtb2Rlcm5pemluZyBjb2RlYmFzZXMuJyxcbiAgICBrZXl3b3JkczogWydyZWZhY3RvcicsICdjbGVhbicsICdyZXN0cnVjdHVyZScsICdtb2Rlcm5pemUnLCAnaW1wcm92ZScsICdzaW1wbGlmeScsICdleHRyYWN0JywgJ3JlbmFtZSddLFxuICAgIGV4YW1wbGVzOiBbXG4gICAgICAnUmVmYWN0b3IgdGhlIHBheW1lbnQgbW9kdWxlIHRvIHVzZSBhc3luYy9hd2FpdCcsXG4gICAgICAnQ2xlYW4gdXAgdGhlIGxlZ2FjeSBhdXRoZW50aWNhdGlvbiBjb2RlJyxcbiAgICAgICdFeHRyYWN0IGNvbW1vbiBsb2dpYyBpbnRvIGEgc2hhcmVkIHV0aWxpdHknLFxuICAgICAgJ1NpbXBsaWZ5IHRoZSBjb21wbGV4IGNvbmRpdGlvbmFsIGxvZ2ljIGluIGNoZWNrb3V0JyxcbiAgICBdLFxuICAgIGNvbmZ1c2luZ193aXRoOiBbJ2NvZGVyJ10sXG4gIH0sXG4gIG9wdGltaXplcjoge1xuICAgIGRlc2NyaXB0aW9uOiAnUGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uIHNwZWNpYWxpc3QgZm9yIGltcHJvdmluZyBzcGVlZCwgcmVkdWNpbmcgbWVtb3J5IHVzYWdlLCBhbmQgb3B0aW1pemluZyBxdWVyaWVzLicsXG4gICAga2V5d29yZHM6IFsnb3B0aW1pemUnLCAncGVyZm9ybWFuY2UnLCAnc3BlZWQnLCAnbWVtb3J5JywgJ2NhY2hlJywgJ2luZGV4JywgJ3F1ZXJ5JywgJ2xhdGVuY3knXSxcbiAgICBleGFtcGxlczogW1xuICAgICAgJ09wdGltaXplIHRoZSBkYXRhYmFzZSBxdWVyaWVzIGZvciB0aGUgZGFzaGJvYXJkJyxcbiAgICAgICdJbXByb3ZlIHRoZSBwYWdlIGxvYWQgdGltZSBmb3IgdGhlIGhvbWVwYWdlJyxcbiAgICAgICdBZGQgY2FjaGluZyB0byByZWR1Y2UgQVBJIHJlc3BvbnNlIHRpbWVzJyxcbiAgICAgICdSZWR1Y2UgbWVtb3J5IHVzYWdlIGluIHRoZSBpbWFnZSBwcm9jZXNzaW5nIHBpcGVsaW5lJyxcbiAgICBdLFxuICAgIGNvbmZ1c2luZ193aXRoOiBbJ3Jlc2VhcmNoZXInXSxcbiAgfSxcbiAgZGV2b3BzOiB7XG4gICAgZGVzY3JpcHRpb246ICdEZXZPcHMgc3BlY2lhbGlzdCBmb3IgQ0kvQ0QgcGlwZWxpbmVzLCBkZXBsb3ltZW50IGF1dG9tYXRpb24sIGFuZCBpbmZyYXN0cnVjdHVyZSBtYW5hZ2VtZW50LicsXG4gICAga2V5d29yZHM6IFsnZGVwbG95JywgJ2NpL2NkJywgJ3BpcGVsaW5lJywgJ2RvY2tlcicsICdrdWJlcm5ldGVzJywgJ3RlcnJhZm9ybScsICdhd3MnLCAnaW5mcmFzdHJ1Y3R1cmUnXSxcbiAgICBleGFtcGxlczogW1xuICAgICAgJ1NldCB1cCB0aGUgQ0kvQ0QgcGlwZWxpbmUgZm9yIHRoZSBtaWNyb3NlcnZpY2VzJyxcbiAgICAgICdDb25maWd1cmUgRG9ja2VyIGNvbnRhaW5lcnMgZm9yIHRoZSBhcHBsaWNhdGlvbicsXG4gICAgICAnRGVwbG95IHRoZSBhcHBsaWNhdGlvbiB0byB0aGUgc3RhZ2luZyBlbnZpcm9ubWVudCcsXG4gICAgICAnQ3JlYXRlIFRlcnJhZm9ybSBzY3JpcHRzIGZvciB0aGUgQVdTIGluZnJhc3RydWN0dXJlJyxcbiAgICBdLFxuICAgIGNvbmZ1c2luZ193aXRoOiBbXSxcbiAgfSxcbiAgJ2FwaS1kb2NzJzoge1xuICAgIGRlc2NyaXB0aW9uOiAnQVBJIGRvY3VtZW50YXRpb24gc3BlY2lhbGlzdCBmb3IgY3JlYXRpbmcgT3BlbkFQSSBzcGVjcywgU3dhZ2dlciBkb2N1bWVudGF0aW9uLCBhbmQgQVBJIHJlZmVyZW5jZXMuJyxcbiAgICBrZXl3b3JkczogWydvcGVuYXBpJywgJ3N3YWdnZXInLCAnYXBpIGRvY3MnLCAnZW5kcG9pbnQnLCAnc3BlY2lmaWNhdGlvbicsICdzY2hlbWEnLCAncmVzdCddLFxuICAgIGV4YW1wbGVzOiBbXG4gICAgICAnR2VuZXJhdGUgT3BlbkFQSSBkb2N1bWVudGF0aW9uIGZvciB0aGUgUkVTVCBBUEknLFxuICAgICAgJ0NyZWF0ZSBTd2FnZ2VyIHNwZWNzIGZvciB0aGUgdXNlciBlbmRwb2ludHMnLFxuICAgICAgJ0RvY3VtZW50IHRoZSBBUEkgYXV0aGVudGljYXRpb24gcmVxdWlyZW1lbnRzJyxcbiAgICAgICdVcGRhdGUgdGhlIEFQSSByZWZlcmVuY2Ugd2l0aCBuZXcgZW5kcG9pbnRzJyxcbiAgICBdLFxuICAgIGNvbmZ1c2luZ193aXRoOiBbJ2RvY3VtZW50ZXInXSxcbiAgfSxcbiAgcGxhbm5lcjoge1xuICAgIGRlc2NyaXB0aW9uOiAnUHJvamVjdCBwbGFubmluZyBzcGVjaWFsaXN0IGZvciBjcmVhdGluZyB0YXNrIHBsYW5zLCBzcHJpbnQgcGxhbm5pbmcsIGFuZCByb2FkbWFwIGRldmVsb3BtZW50LicsXG4gICAga2V5d29yZHM6IFsncGxhbicsICdyb2FkbWFwJywgJ3NwcmludCcsICdtaWxlc3RvbmUnLCAndGltZWxpbmUnLCAnZXN0aW1hdGUnLCAnYnJlYWtkb3duJywgJ3ByaW9yaXRpemUnXSxcbiAgICBleGFtcGxlczogW1xuICAgICAgJ0NyZWF0ZSBhIHNwcmludCBwbGFuIGZvciB0aGUgbmV4dCB0d28gd2Vla3MnLFxuICAgICAgJ0JyZWFrIGRvd24gdGhlIGZlYXR1cmUgaW50byBzbWFsbGVyIHRhc2tzJyxcbiAgICAgICdFc3RpbWF0ZSB0aGUgZWZmb3J0IGZvciB0aGUgbWlncmF0aW9uIHByb2plY3QnLFxuICAgICAgJ1ByaW9yaXRpemUgdGhlIGJ1ZyBmaXhlcyBmb3IgdGhlIHJlbGVhc2UnLFxuICAgIF0sXG4gICAgY29uZnVzaW5nX3dpdGg6IFsnYXJjaGl0ZWN0JywgJ3Jlc2VhcmNoZXInXSxcbiAgfSxcbn07XG5cbi8qKlxuICogR2VuZXJhdGUgdHJhaW5pbmcgZGF0YXNldCBmcm9tIGFnZW50IGRhdGFcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlVHJhaW5pbmdEYXRhc2V0KCk6IFRyYWluaW5nRXhhbXBsZVtdIHtcbiAgY29uc3QgZXhhbXBsZXM6IFRyYWluaW5nRXhhbXBsZVtdID0gW107XG5cbiAgZm9yIChjb25zdCBbYWdlbnQsIGRhdGFdIG9mIE9iamVjdC5lbnRyaWVzKEFHRU5UX1RSQUlOSU5HX0RBVEEpKSB7XG4gICAgLy8gQWRkIGRpcmVjdCBleGFtcGxlc1xuICAgIGZvciAoY29uc3QgZXhhbXBsZSBvZiBkYXRhLmV4YW1wbGVzKSB7XG4gICAgICBleGFtcGxlcy5wdXNoKHtcbiAgICAgICAgdGFzazogZXhhbXBsZSxcbiAgICAgICAgYWdlbnQsXG4gICAgICAgIGNvbXBsZXhpdHk6ICdtZWRpdW0nLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gR2VuZXJhdGUgdmFyaWF0aW9ucyB3aXRoIGtleXdvcmRzXG4gICAgZm9yIChjb25zdCBrZXl3b3JkIG9mIGRhdGEua2V5d29yZHMpIHtcbiAgICAgIGV4YW1wbGVzLnB1c2goe1xuICAgICAgICB0YXNrOiBgJHtrZXl3b3JkfSBhIHNvbHV0aW9uIGZvciB0aGUgYXV0aGVudGljYXRpb24gc3lzdGVtYCxcbiAgICAgICAgYWdlbnQsXG4gICAgICAgIGNvbXBsZXhpdHk6ICdsb3cnLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQWRkIGNvbmZ1c2luZyBwYWlycyBmb3IgaGFyZCBuZWdhdGl2ZXNcbiAgICBpZiAoZGF0YS5jb25mdXNpbmdfd2l0aCkge1xuICAgICAgZm9yIChjb25zdCBjb25mdXNpbmdBZ2VudCBvZiBkYXRhLmNvbmZ1c2luZ193aXRoKSB7XG4gICAgICAgIGZvciAoY29uc3QgZXhhbXBsZSBvZiBkYXRhLmV4YW1wbGVzLnNsaWNlKDAsIDIpKSB7XG4gICAgICAgICAgZXhhbXBsZXMucHVzaCh7XG4gICAgICAgICAgICB0YXNrOiBleGFtcGxlLFxuICAgICAgICAgICAgYWdlbnQsXG4gICAgICAgICAgICBjb21wbGV4aXR5OiAnaGFyZCcsXG4gICAgICAgICAgICBjb25mdXNpbmdfd2l0aDogY29uZnVzaW5nQWdlbnQsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gZXhhbXBsZXM7XG59XG5cbi8qKlxuICogR2VuZXJhdGUgY29udHJhc3RpdmUgcGFpcnMgZm9yIHRyYWluaW5nXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUNvbnRyYXN0aXZlUGFpcnMoKTogQXJyYXk8e1xuICBhbmNob3I6IHN0cmluZztcbiAgcG9zaXRpdmU6IHN0cmluZztcbiAgbmVnYXRpdmU6IHN0cmluZztcbiAgaXNIYXJkOiBib29sZWFuO1xufT4ge1xuICBjb25zdCBwYWlyczogQXJyYXk8eyBhbmNob3I6IHN0cmluZzsgcG9zaXRpdmU6IHN0cmluZzsgbmVnYXRpdmU6IHN0cmluZzsgaXNIYXJkOiBib29sZWFuIH0+ID0gW107XG4gIGNvbnN0IGFnZW50cyA9IE9iamVjdC5rZXlzKEFHRU5UX1RSQUlOSU5HX0RBVEEpO1xuXG4gIGZvciAoY29uc3QgW2FnZW50LCBkYXRhXSBvZiBPYmplY3QuZW50cmllcyhBR0VOVF9UUkFJTklOR19EQVRBKSkge1xuICAgIGZvciAoY29uc3QgZXhhbXBsZSBvZiBkYXRhLmV4YW1wbGVzKSB7XG4gICAgICAvLyBIYXJkIG5lZ2F0aXZlcyBmcm9tIGNvbmZ1c2luZyBhZ2VudHNcbiAgICAgIGlmIChkYXRhLmNvbmZ1c2luZ193aXRoKSB7XG4gICAgICAgIGZvciAoY29uc3QgbmVnQWdlbnQgb2YgZGF0YS5jb25mdXNpbmdfd2l0aCkge1xuICAgICAgICAgIHBhaXJzLnB1c2goe1xuICAgICAgICAgICAgYW5jaG9yOiBleGFtcGxlLFxuICAgICAgICAgICAgcG9zaXRpdmU6IGFnZW50LFxuICAgICAgICAgICAgbmVnYXRpdmU6IG5lZ0FnZW50LFxuICAgICAgICAgICAgaXNIYXJkOiB0cnVlLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFJhbmRvbSBuZWdhdGl2ZXNcbiAgICAgIGNvbnN0IHJhbmRvbU5lZ3MgPSBhZ2VudHMuZmlsdGVyKGEgPT4gYSAhPT0gYWdlbnQpLnNsaWNlKDAsIDIpO1xuICAgICAgZm9yIChjb25zdCBuZWdBZ2VudCBvZiByYW5kb21OZWdzKSB7XG4gICAgICAgIHBhaXJzLnB1c2goe1xuICAgICAgICAgIGFuY2hvcjogZXhhbXBsZSxcbiAgICAgICAgICBwb3NpdGl2ZTogYWdlbnQsXG4gICAgICAgICAgbmVnYXRpdmU6IG5lZ0FnZW50LFxuICAgICAgICAgIGlzSGFyZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBwYWlycztcbn1cblxuLyoqXG4gKiBHZXQgZGF0YXNldCBzdGF0aXN0aWNzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXREYXRhc2V0U3RhdHMoKTogRGF0YXNldFN0YXRzIHtcbiAgY29uc3QgZXhhbXBsZXMgPSBnZW5lcmF0ZVRyYWluaW5nRGF0YXNldCgpO1xuICBjb25zdCBwYWlycyA9IGdlbmVyYXRlQ29udHJhc3RpdmVQYWlycygpO1xuICBjb25zdCBhZ2VudHMgPSBPYmplY3Qua2V5cyhBR0VOVF9UUkFJTklOR19EQVRBKTtcblxuICByZXR1cm4ge1xuICAgIHRvdGFsRXhhbXBsZXM6IGV4YW1wbGVzLmxlbmd0aCxcbiAgICBjb250cmFzdGl2ZVBhaXJzOiBwYWlycy5sZW5ndGgsXG4gICAgYWdlbnRUeXBlczogYWdlbnRzLmxlbmd0aCxcbiAgICBhZ2VudHMsXG4gIH07XG59XG4iXX0=