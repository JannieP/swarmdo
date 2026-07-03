"use strict";
/**
 * Contrastive Fine-tuning for SwarmLTRA Claude Code Router
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_TRAINING_DATA = exports.ContrastiveTrainer = void 0;
exports.cosineSimilarity = cosineSimilarity;
exports.tripletLoss = tripletLoss;
exports.infoNCELoss = infoNCELoss;
exports.computeGradient = computeGradient;
exports.generateTrainingDataset = generateTrainingDataset;
exports.generateContrastivePairs = generateContrastivePairs;
exports.getDatasetStats = getDatasetStats;
const fs_1 = require("fs");
const path_1 = require("path");
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
function cosineSimilarity(a, b) {
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
function tripletLoss(anchorEmb, positiveEmb, negativeEmb, margin = 0.5) {
    const posDist = 1 - cosineSimilarity(anchorEmb, positiveEmb);
    const negDist = 1 - cosineSimilarity(anchorEmb, negativeEmb);
    return Math.max(0, margin + posDist - negDist);
}
/**
 * Compute InfoNCE loss (contrastive)
 */
function infoNCELoss(anchorEmb, positiveEmb, negativeEmbs, temperature = 0.07) {
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
function computeGradient(anchorEmb, positiveEmb, negativeEmb, lr = 0.0001) {
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
 * Contrastive Trainer for SwarmLTRA models
 *
 * Implements triplet loss and InfoNCE loss for embedding fine-tuning.
 */
class ContrastiveTrainer {
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
        if (!(0, fs_1.existsSync)(outDir)) {
            (0, fs_1.mkdirSync)(outDir, { recursive: true });
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
        (0, fs_1.writeFileSync)((0, path_1.join)(outDir, 'triplets.jsonl'), jsonlData.map(item => JSON.stringify(item)).join('\n'));
        (0, fs_1.writeFileSync)((0, path_1.join)(outDir, 'triplets.csv'), csvData);
        (0, fs_1.writeFileSync)((0, path_1.join)(outDir, 'embeddings.json'), JSON.stringify(embeddingData, null, 2));
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
            train_data: (0, path_1.join)(outDir, 'triplets.jsonl'),
            eval_data: (0, path_1.join)(outDir, 'eval.jsonl'),
        };
        if (!(0, fs_1.existsSync)(outDir)) {
            (0, fs_1.mkdirSync)(outDir, { recursive: true });
        }
        (0, fs_1.writeFileSync)((0, path_1.join)(outDir, 'lora_config.json'), JSON.stringify(loraConfig, null, 2));
        return loraConfig;
    }
    /**
     * Generate training script for external tools
     */
    generateTrainingScript(outputPath) {
        const outDir = outputPath || this.config.outputPath;
        const script = `#!/bin/bash
# SwarmLTRA Fine-tuning Script
# Prerequisites: pip install transformers peft accelerate

set -e

MODEL_PATH="${outDir}"
BASE_MODEL="Qwen/Qwen2.5-0.5B"

echo "=== SwarmLTRA Contrastive Fine-tuning ==="
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
        if (!(0, fs_1.existsSync)(outDir)) {
            (0, fs_1.mkdirSync)(outDir, { recursive: true });
        }
        const scriptPath = (0, path_1.join)(outDir, 'train.sh');
        (0, fs_1.writeFileSync)(scriptPath, script);
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
exports.ContrastiveTrainer = ContrastiveTrainer;
/**
 * Agent Training Data for Claude Code Router
 */
exports.AGENT_TRAINING_DATA = {
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
function generateTrainingDataset() {
    const examples = [];
    for (const [agent, data] of Object.entries(exports.AGENT_TRAINING_DATA)) {
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
function generateContrastivePairs() {
    const pairs = [];
    const agents = Object.keys(exports.AGENT_TRAINING_DATA);
    for (const [agent, data] of Object.entries(exports.AGENT_TRAINING_DATA)) {
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
function getDatasetStats() {
    const examples = generateTrainingDataset();
    const pairs = generateContrastivePairs();
    const agents = Object.keys(exports.AGENT_TRAINING_DATA);
    return {
        totalExamples: examples.length,
        contrastivePairs: pairs.length,
        agentTypes: agents.length,
        agents,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJhc3RpdmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29udHJhc3RpdmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0EyQkc7OztBQTRHSCw0Q0FTQztBQU1ELGtDQVNDO0FBS0Qsa0NBaUJDO0FBS0QsMENBb0JDO0FBbWVELDBEQXNDQztBQUtELDREQXFDQztBQUtELDBDQVdDO0FBcHZCRCwyQkFBMEQ7QUFDMUQsK0JBQTRCO0FBeUY1Qjs7R0FFRztBQUNILE1BQU0sMEJBQTBCLEdBQWdDO0lBQzlELE1BQU0sRUFBRSxFQUFFO0lBQ1YsU0FBUyxFQUFFLEVBQUU7SUFDYixZQUFZLEVBQUUsTUFBTTtJQUNwQixNQUFNLEVBQUUsR0FBRztJQUNYLFdBQVcsRUFBRSxJQUFJO0lBQ2pCLGlCQUFpQixFQUFFLEdBQUc7SUFDdEIsVUFBVSxFQUFFLG1CQUFtQjtDQUNoQyxDQUFDO0FBRUY7O0dBRUc7QUFDSCxTQUFnQixnQkFBZ0IsQ0FBQyxDQUFZLEVBQUUsQ0FBWTtJQUN6RCxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLE1BQU07UUFBRSxPQUFPLENBQUMsQ0FBQztJQUNoRCxJQUFJLEdBQUcsR0FBRyxDQUFDLEVBQUUsS0FBSyxHQUFHLENBQUMsRUFBRSxLQUFLLEdBQUcsQ0FBQyxDQUFDO0lBQ2xDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDbEMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkIsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckIs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QUssR0FBRyx3QkFBd0IsRUFBRSxDQUFDO0lBQ3pDLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsMkJBQW1CLENBQUMsQ0FBQztJQUVoRCxPQUFPO1FBQ0wsYUFBYSxFQUFFLFFBQVEsQ0FBQyxNQUFNO1FBQzlCLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxNQUFNO1FBQzlCLFVBQVUsRUFBRSxNQUFNLENBQUMsTUFBTTtRQUN6QixNQUFNO0tBQ1AsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIENvbnRyYXN0aXZlIEZpbmUtdHVuaW5nIGZvciBSdXZMVFJBIENsYXVkZSBDb2RlIFJvdXRlclxuICpcbiAqIFVzZXMgdHJpcGxldCBsb3NzIHRvIGZpbmUtdHVuZSBlbWJlZGRpbmdzOlxuICogLSBBbmNob3I6IHRhc2sgZGVzY3JpcHRpb25cbiAqIC0gUG9zaXRpdmU6IGNvcnJlY3QgYWdlbnQgZGVzY3JpcHRpb25cbiAqIC0gTmVnYXRpdmU6IHdyb25nIGFnZW50IGRlc2NyaXB0aW9uIChoYXJkIG5lZ2F0aXZlKVxuICpcbiAqIEdvYWw6IG1pbmltaXplIGRpc3RhbmNlKGFuY2hvciwgcG9zaXRpdmUpIGFuZCBtYXhpbWl6ZSBkaXN0YW5jZShhbmNob3IsIG5lZ2F0aXZlKVxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBpbXBvcnQgeyBDb250cmFzdGl2ZVRyYWluZXIsIHRyaXBsZXRMb3NzLCBpbmZvTkNFTG9zcyB9IGZyb20gJ0BydWZ2ZWN0b3IvcnVmbGxtJztcbiAqXG4gKiBjb25zdCB0cmFpbmVyID0gbmV3IENvbnRyYXN0aXZlVHJhaW5lcih7XG4gKiAgIGVwb2NoczogMTAsXG4gKiAgIGJhdGNoU2l6ZTogMTYsXG4gKiAgIG1hcmdpbjogMC41LFxuICogfSk7XG4gKlxuICogLy8gQWRkIHRyaXBsZXRzXG4gKiB0cmFpbmVyLmFkZFRyaXBsZXQoYW5jaG9yRW1iLCBwb3NpdGl2ZUVtYiwgbmVnYXRpdmVFbWIsIHRydWUpO1xuICpcbiAqIC8vIFRyYWluIGFuZCBleHBvcnRcbiAqIGNvbnN0IHJlc3VsdHMgPSB0cmFpbmVyLnRyYWluKCk7XG4gKiB0cmFpbmVyLmV4cG9ydFRyYWluaW5nRGF0YSgnLi9vdXRwdXQnKTtcbiAqIGBgYFxuICovXG5cbmltcG9ydCB7IHdyaXRlRmlsZVN5bmMsIG1rZGlyU3luYywgZXhpc3RzU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICdwYXRoJztcbmltcG9ydCB7IEVtYmVkZGluZyB9IGZyb20gJy4vdHlwZXMnO1xuXG4vKipcbiAqIENvbnRyYXN0aXZlIHRyYWluaW5nIGNvbmZpZ3VyYXRpb25cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBDb250cmFzdGl2ZUNvbmZpZyB7XG4gIC8qKiBOdW1iZXIgb2YgdHJhaW5pbmcgZXBvY2hzIChkZWZhdWx0OiAxMCkgKi9cbiAgZXBvY2hzPzogbnVtYmVyO1xuICAvKiogQmF0Y2ggc2l6ZSAoZGVmYXVsdDogMTYpICovXG4gIGJhdGNoU2l6ZT86IG51bWJlcjtcbiAgLyoqIExlYXJuaW5nIHJhdGUgKGRlZmF1bHQ6IDAuMDAwMSkgKi9cbiAgbGVhcm5pbmdSYXRlPzogbnVtYmVyO1xuICAvKiogVHJpcGxldCBsb3NzIG1hcmdpbiAoZGVmYXVsdDogMC41KSAqL1xuICBtYXJnaW4/OiBudW1iZXI7XG4gIC8qKiBJbmZvTkNFIHRlbXBlcmF0dXJlIChkZWZhdWx0OiAwLjA3KSAqL1xuICB0ZW1wZXJhdHVyZT86IG51bWJlcjtcbiAgLyoqIFJhdGlvIG9mIGhhcmQgbmVnYXRpdmVzIChkZWZhdWx0OiAwLjcpICovXG4gIGhhcmROZWdhdGl2ZVJhdGlvPzogbnVtYmVyO1xuICAvKiogT3V0cHV0IGRpcmVjdG9yeSBmb3IgdHJhaW5pbmcgZGF0YSAqL1xuICBvdXRwdXRQYXRoPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFRyYWluaW5nIHRyaXBsZXRcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBUcmFpbmluZ1RyaXBsZXQge1xuICAvKiogQW5jaG9yIGVtYmVkZGluZyAodGFzaykgKi9cbiAgYW5jaG9yOiBzdHJpbmc7XG4gIGFuY2hvckVtYjogRW1iZWRkaW5nO1xuICAvKiogUG9zaXRpdmUgZXhhbXBsZSAoY29ycmVjdCBhZ2VudCkgKi9cbiAgcG9zaXRpdmU6IHN0cmluZztcbiAgcG9zaXRpdmVFbWI6IEVtYmVkZGluZztcbiAgLyoqIE5lZ2F0aXZlIGV4YW1wbGUgKHdyb25nIGFnZW50KSAqL1xuICBuZWdhdGl2ZTogc3RyaW5nO1xuICBuZWdhdGl2ZUVtYjogRW1iZWRkaW5nO1xuICAvKiogV2hldGhlciB0aGlzIGlzIGEgaGFyZCBuZWdhdGl2ZSAqL1xuICBpc0hhcmQ6IGJvb2xlYW47XG59XG5cbi8qKlxuICogVHJhaW5pbmcgaGlzdG9yeSBlbnRyeVxuICovXG5leHBvcnQgaW50ZXJmYWNlIFRyYWluaW5nSGlzdG9yeUVudHJ5IHtcbiAgZXBvY2g6IG51bWJlcjtcbiAgbG9zczogbnVtYmVyO1xufVxuXG4vKipcbiAqIENvbnRyYXN0aXZlIHRyYWluaW5nIHJlc3VsdHNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBDb250cmFzdGl2ZVRyYWluaW5nUmVzdWx0IHtcbiAgLyoqIFRvdGFsIHRyaXBsZXRzIHRyYWluZWQgb24gKi9cbiAgdHJpcGxldENvdW50OiBudW1iZXI7XG4gIC8qKiBGaW5hbCBsb3NzIHZhbHVlICovXG4gIGZpbmFsTG9zczogbnVtYmVyO1xuICAvKiogSW5pdGlhbCBsb3NzIHZhbHVlICovXG4gIGluaXRpYWxMb3NzOiBudW1iZXI7XG4gIC8qKiBJbXByb3ZlbWVudCBwZXJjZW50YWdlICovXG4gIGltcHJvdmVtZW50OiBudW1iZXI7XG4gIC8qKiBUcmFpbmluZyBoaXN0b3J5ICovXG4gIGhpc3Rvcnk6IFRyYWluaW5nSGlzdG9yeUVudHJ5W107XG4gIC8qKiBEdXJhdGlvbiBpbiBtcyAqL1xuICBkdXJhdGlvbk1zOiBudW1iZXI7XG59XG5cbi8qKlxuICogTG9SQSBjb25maWd1cmF0aW9uIGZvciBmaW5lLXR1bmluZ1xuICovXG5leHBvcnQgaW50ZXJmYWNlIExvUkFFeHBvcnRDb25maWcge1xuICBtb2RlbF90eXBlOiBzdHJpbmc7XG4gIGJhc2VfbW9kZWw6IHN0cmluZztcbiAgb3V0cHV0X2Rpcjogc3RyaW5nO1xuICBsb3JhX3I6IG51bWJlcjtcbiAgbG9yYV9hbHBoYTogbnVtYmVyO1xuICBsb3JhX2Ryb3BvdXQ6IG51bWJlcjtcbiAgdGFyZ2V0X21vZHVsZXM6IHN0cmluZ1tdO1xuICBsZWFybmluZ19yYXRlOiBudW1iZXI7XG4gIG51bV90cmFpbl9lcG9jaHM6IG51bWJlcjtcbiAgcGVyX2RldmljZV90cmFpbl9iYXRjaF9zaXplOiBudW1iZXI7XG4gIGdyYWRpZW50X2FjY3VtdWxhdGlvbl9zdGVwczogbnVtYmVyO1xuICB3YXJtdXBfcmF0aW86IG51bWJlcjtcbiAgbG9zc190eXBlOiBzdHJpbmc7XG4gIG1hcmdpbjogbnVtYmVyO1xuICB0ZW1wZXJhdHVyZTogbnVtYmVyO1xuICB0cmFpbl9kYXRhOiBzdHJpbmc7XG4gIGV2YWxfZGF0YTogc3RyaW5nO1xufVxuXG4vKipcbiAqIERlZmF1bHQgY29udHJhc3RpdmUgY29uZmlnXG4gKi9cbmNvbnN0IERFRkFVTFRfQ09OVFJBU1RJVkVfQ09ORklHOiBSZXF1aXJlZDxDb250cmFzdGl2ZUNvbmZpZz4gPSB7XG4gIGVwb2NoczogMTAsXG4gIGJhdGNoU2l6ZTogMTYsXG4gIGxlYXJuaW5nUmF0ZTogMC4wMDAxLFxuICBtYXJnaW46IDAuNSxcbiAgdGVtcGVyYXR1cmU6IDAuMDcsXG4gIGhhcmROZWdhdGl2ZVJhdGlvOiAwLjcsXG4gIG91dHB1dFBhdGg6ICcuL3RyYWluaW5nLW91dHB1dCcsXG59O1xuXG4vKipcbiAqIENvbXB1dGUgY29zaW5lIHNpbWlsYXJpdHkgYmV0d2VlbiB0d28gZW1iZWRkaW5nc1xuICovXG5leHBvcnQgZnVuY3Rpb24gY29zaW5lU2ltaWxhcml0eShhOiBFbWJlZGRpbmcsIGI6IEVtYmVkZGluZyk6IG51bWJlciB7XG4gIGlmICghYSB8fCAhYiB8fCBhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiAwO1xuICBsZXQgZG90ID0gMCwgbm9ybUEgPSAwLCBub3JtQiA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgIGRvdCArPSBhW2ldICogYltpXTtcbiAgICBub3JtQSArPSBhW2ldICogYVtpXTtcbiAgICBub3JtQiArPSBiW2ldICogYltpXTtcbiAgfVxuICByZXR1cm4gZG90IC8gKE1hdGguc3FydChub3JtQSkgKiBNYXRoLnNxcnQobm9ybUIpIHx8IDEpO1xufVxuXG4vKipcbiAqIENvbXB1dGUgdHJpcGxldCBsb3NzXG4gKiBMID0gbWF4KDAsIG1hcmdpbiArIGQoYW5jaG9yLCBwb3NpdGl2ZSkgLSBkKGFuY2hvciwgbmVnYXRpdmUpKVxuICovXG5leHBvcnQgZnVuY3Rpb24gdHJpcGxldExvc3MoXG4gIGFuY2hvckVtYjogRW1iZWRkaW5nLFxuICBwb3NpdGl2ZUVtYjogRW1iZWRkaW5nLFxuICBuZWdhdGl2ZUVtYjogRW1iZWRkaW5nLFxuICBtYXJnaW46IG51bWJlciA9IDAuNVxuKTogbnVtYmVyIHtcbiAgY29uc3QgcG9zRGlzdCA9IDEgLSBjb3NpbmVTaW1pbGFyaXR5KGFuY2hvckVtYiwgcG9zaXRpdmVFbWIpO1xuICBjb25zdCBuZWdEaXN0ID0gMSAtIGNvc2luZVNpbWlsYXJpdHkoYW5jaG9yRW1iLCBuZWdhdGl2ZUVtYik7XG4gIHJldHVybiBNYXRoLm1heCgwLCBtYXJnaW4gKyBwb3NEaXN0IC0gbmVnRGlzdCk7XG59XG5cbi8qKlxuICogQ29tcHV0ZSBJbmZvTkNFIGxvc3MgKGNvbnRyYXN0aXZlKVxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5mb05DRUxvc3MoXG4gIGFuY2hvckVtYjogRW1iZWRkaW5nLFxuICBwb3NpdGl2ZUVtYjogRW1iZWRkaW5nLFxuICBuZWdhdGl2ZUVtYnM6IEVtYmVkZGluZ1tdLFxuICB0ZW1wZXJhdHVyZTogbnVtYmVyID0gMC4wN1xuKTogbnVtYmVyIHtcbiAgY29uc3QgcG9zU2ltID0gY29zaW5lU2ltaWxhcml0eShhbmNob3JFbWIsIHBvc2l0aXZlRW1iKSAvIHRlbXBlcmF0dXJlO1xuICBjb25zdCBuZWdTaW1zID0gbmVnYXRpdmVFbWJzLm1hcChuZWcgPT4gY29zaW5lU2ltaWxhcml0eShhbmNob3JFbWIsIG5lZykgLyB0ZW1wZXJhdHVyZSk7XG5cbiAgLy8gU29mdG1heCBkZW5vbWluYXRvclxuICBjb25zdCBtYXhTaW0gPSBNYXRoLm1heChwb3NTaW0sIC4uLm5lZ1NpbXMpO1xuICBjb25zdCBleHBQb3MgPSBNYXRoLmV4cChwb3NTaW0gLSBtYXhTaW0pO1xuICBjb25zdCBleHBOZWdzID0gbmVnU2ltcy5tYXAoc2ltID0+IE1hdGguZXhwKHNpbSAtIG1heFNpbSkpO1xuICBjb25zdCBkZW5vbWluYXRvciA9IGV4cFBvcyArIGV4cE5lZ3MucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCk7XG5cbiAgLy8gQ3Jvc3MtZW50cm9weSBsb3NzXG4gIHJldHVybiAtTWF0aC5sb2coZXhwUG9zIC8gZGVub21pbmF0b3IpO1xufVxuXG4vKipcbiAqIENvbXB1dGUgZ3JhZGllbnQgZm9yIGVtYmVkZGluZyB1cGRhdGUgKHNpbXBsaWZpZWQpXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlR3JhZGllbnQoXG4gIGFuY2hvckVtYjogRW1iZWRkaW5nLFxuICBwb3NpdGl2ZUVtYjogRW1iZWRkaW5nLFxuICBuZWdhdGl2ZUVtYjogRW1iZWRkaW5nLFxuICBscjogbnVtYmVyID0gMC4wMDAxXG4pOiBFbWJlZGRpbmcge1xuICBjb25zdCBkaW0gPSBhbmNob3JFbWIubGVuZ3RoO1xuICBjb25zdCBncmFkaWVudDogbnVtYmVyW10gPSBuZXcgQXJyYXkoZGltKS5maWxsKDApO1xuXG4gIC8vIFB1bGwgYW5jaG9yIHRvd2FyZHMgcG9zaXRpdmVcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBkaW07IGkrKykge1xuICAgIGdyYWRpZW50W2ldICs9IGxyICogKHBvc2l0aXZlRW1iW2ldIC0gYW5jaG9yRW1iW2ldKTtcbiAgfVxuXG4gIC8vIFB1c2ggYW5jaG9yIGF3YXkgZnJvbSBuZWdhdGl2ZVxuICBmb3IgKGxldCBpID0gMDsgaSA8IGRpbTsgaSsrKSB7XG4gICAgZ3JhZGllbnRbaV0gLT0gbHIgKiAwLjUgKiAobmVnYXRpdmVFbWJbaV0gLSBhbmNob3JFbWJbaV0pO1xuICB9XG5cbiAgcmV0dXJuIGdyYWRpZW50O1xufVxuXG4vKipcbiAqIENvbnRyYXN0aXZlIFRyYWluZXIgZm9yIFJ1dkxUUkEgbW9kZWxzXG4gKlxuICogSW1wbGVtZW50cyB0cmlwbGV0IGxvc3MgYW5kIEluZm9OQ0UgbG9zcyBmb3IgZW1iZWRkaW5nIGZpbmUtdHVuaW5nLlxuICovXG5leHBvcnQgY2xhc3MgQ29udHJhc3RpdmVUcmFpbmVyIHtcbiAgcHJpdmF0ZSBjb25maWc6IFJlcXVpcmVkPENvbnRyYXN0aXZlQ29uZmlnPjtcbiAgcHJpdmF0ZSB0cmlwbGV0czogVHJhaW5pbmdUcmlwbGV0W10gPSBbXTtcbiAgcHJpdmF0ZSBoaXN0b3J5OiBUcmFpbmluZ0hpc3RvcnlFbnRyeVtdID0gW107XG4gIHByaXZhdGUgYWdlbnRFbWJlZGRpbmdzOiBNYXA8c3RyaW5nLCBFbWJlZGRpbmc+ID0gbmV3IE1hcCgpO1xuXG4gIGNvbnN0cnVjdG9yKGNvbmZpZz86IENvbnRyYXN0aXZlQ29uZmlnKSB7XG4gICAgdGhpcy5jb25maWcgPSB7IC4uLkRFRkFVTFRfQ09OVFJBU1RJVkVfQ09ORklHLCAuLi5jb25maWcgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYSB0cmFpbmluZyB0cmlwbGV0XG4gICAqL1xuICBhZGRUcmlwbGV0KFxuICAgIGFuY2hvcjogc3RyaW5nLFxuICAgIGFuY2hvckVtYjogRW1iZWRkaW5nLFxuICAgIHBvc2l0aXZlOiBzdHJpbmcsXG4gICAgcG9zaXRpdmVFbWI6IEVtYmVkZGluZyxcbiAgICBuZWdhdGl2ZTogc3RyaW5nLFxuICAgIG5lZ2F0aXZlRW1iOiBFbWJlZGRpbmcsXG4gICAgaXNIYXJkOiBib29sZWFuID0gZmFsc2VcbiAgKTogdm9pZCB7XG4gICAgdGhpcy50cmlwbGV0cy5wdXNoKHtcbiAgICAgIGFuY2hvcixcbiAgICAgIGFuY2hvckVtYixcbiAgICAgIHBvc2l0aXZlLFxuICAgICAgcG9zaXRpdmVFbWIsXG4gICAgICBuZWdhdGl2ZSxcbiAgICAgIG5lZ2F0aXZlRW1iLFxuICAgICAgaXNIYXJkLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBhZ2VudCBlbWJlZGRpbmcgZm9yIHJlZmVyZW5jZVxuICAgKi9cbiAgYWRkQWdlbnRFbWJlZGRpbmcoYWdlbnROYW1lOiBzdHJpbmcsIGVtYmVkZGluZzogRW1iZWRkaW5nKTogdm9pZCB7XG4gICAgdGhpcy5hZ2VudEVtYmVkZGluZ3Muc2V0KGFnZW50TmFtZSwgZW1iZWRkaW5nKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYWxsIGFnZW50IGVtYmVkZGluZ3NcbiAgICovXG4gIGdldEFnZW50RW1iZWRkaW5ncygpOiBNYXA8c3RyaW5nLCBFbWJlZGRpbmc+IHtcbiAgICByZXR1cm4gdGhpcy5hZ2VudEVtYmVkZGluZ3M7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRyaXBsZXQgY291bnRcbiAgICovXG4gIGdldFRyaXBsZXRDb3VudCgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLnRyaXBsZXRzLmxlbmd0aDtcbiAgfVxuXG4gIC8qKlxuICAgKiBTaW11bGF0ZSB0cmFpbmluZyAoY29tcHV0ZSBsb3NzZXMgd2l0aG91dCBhY3R1YWwgYmFja3Byb3ApXG4gICAqIEluIGEgZnVsbCBpbXBsZW1lbnRhdGlvbiwgdGhpcyB3b3VsZCB1c2UgcHJvcGVyIGdyYWRpZW50IGRlc2NlbnRcbiAgICovXG4gIHRyYWluKCk6IENvbnRyYXN0aXZlVHJhaW5pbmdSZXN1bHQge1xuICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgY29uc3QgeyBlcG9jaHMsIGJhdGNoU2l6ZSwgbWFyZ2luIH0gPSB0aGlzLmNvbmZpZztcblxuICAgIGlmICh0aGlzLnRyaXBsZXRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdHJpcGxldENvdW50OiAwLFxuICAgICAgICBmaW5hbExvc3M6IDAsXG4gICAgICAgIGluaXRpYWxMb3NzOiAwLFxuICAgICAgICBpbXByb3ZlbWVudDogMCxcbiAgICAgICAgaGlzdG9yeTogW10sXG4gICAgICAgIGR1cmF0aW9uTXM6IDAsXG4gICAgICB9O1xuICAgIH1cblxuICAgIGZvciAobGV0IGVwb2NoID0gMDsgZXBvY2ggPCBlcG9jaHM7IGVwb2NoKyspIHtcbiAgICAgIGxldCBlcG9jaExvc3MgPSAwO1xuICAgICAgbGV0IGJhdGNoQ291bnQgPSAwO1xuXG4gICAgICAvLyBTaHVmZmxlIHRyaXBsZXRzXG4gICAgICBjb25zdCBzaHVmZmxlZCA9IFsuLi50aGlzLnRyaXBsZXRzXS5zb3J0KCgpID0+IE1hdGgucmFuZG9tKCkgLSAwLjUpO1xuXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNodWZmbGVkLmxlbmd0aDsgaSArPSBiYXRjaFNpemUpIHtcbiAgICAgICAgY29uc3QgYmF0Y2ggPSBzaHVmZmxlZC5zbGljZShpLCBpICsgYmF0Y2hTaXplKTtcbiAgICAgICAgbGV0IGJhdGNoTG9zcyA9IDA7XG5cbiAgICAgICAgZm9yIChjb25zdCB0cmlwbGV0IG9mIGJhdGNoKSB7XG4gICAgICAgICAgY29uc3QgbG9zcyA9IHRyaXBsZXRMb3NzKFxuICAgICAgICAgICAgdHJpcGxldC5hbmNob3JFbWIsXG4gICAgICAgICAgICB0cmlwbGV0LnBvc2l0aXZlRW1iLFxuICAgICAgICAgICAgdHJpcGxldC5uZWdhdGl2ZUVtYixcbiAgICAgICAgICAgIG1hcmdpblxuICAgICAgICAgICk7XG4gICAgICAgICAgYmF0Y2hMb3NzICs9IGxvc3M7XG4gICAgICAgIH1cblxuICAgICAgICBlcG9jaExvc3MgKz0gYmF0Y2hMb3NzIC8gYmF0Y2gubGVuZ3RoO1xuICAgICAgICBiYXRjaENvdW50Kys7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGF2Z0xvc3MgPSBlcG9jaExvc3MgLyBiYXRjaENvdW50O1xuICAgICAgdGhpcy5oaXN0b3J5LnB1c2goeyBlcG9jaDogZXBvY2ggKyAxLCBsb3NzOiBhdmdMb3NzIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGluaXRpYWxMb3NzID0gdGhpcy5oaXN0b3J5WzBdPy5sb3NzIHx8IDA7XG4gICAgY29uc3QgZmluYWxMb3NzID0gdGhpcy5oaXN0b3J5W3RoaXMuaGlzdG9yeS5sZW5ndGggLSAxXT8ubG9zcyB8fCAwO1xuICAgIGNvbnN0IGltcHJvdmVtZW50ID0gaW5pdGlhbExvc3MgPiAwID8gKDEgLSBmaW5hbExvc3MgLyBpbml0aWFsTG9zcykgKiAxMDAgOiAwO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHRyaXBsZXRDb3VudDogdGhpcy50cmlwbGV0cy5sZW5ndGgsXG4gICAgICBmaW5hbExvc3MsXG4gICAgICBpbml0aWFsTG9zcyxcbiAgICAgIGltcHJvdmVtZW50LFxuICAgICAgaGlzdG9yeTogdGhpcy5oaXN0b3J5LFxuICAgICAgZHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEV4cG9ydCB0cmFpbmluZyBkYXRhIGZvciBleHRlcm5hbCBmaW5lLXR1bmluZyB0b29sc1xuICAgKi9cbiAgZXhwb3J0VHJhaW5pbmdEYXRhKG91dHB1dFBhdGg/OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IG91dERpciA9IG91dHB1dFBhdGggfHwgdGhpcy5jb25maWcub3V0cHV0UGF0aDtcblxuICAgIGlmICghZXhpc3RzU3luYyhvdXREaXIpKSB7XG4gICAgICBta2RpclN5bmMob3V0RGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICAvLyBKU09OTCBmb3JtYXQgZm9yIGZpbmUtdHVuaW5nXG4gICAgY29uc3QganNvbmxEYXRhID0gdGhpcy50cmlwbGV0cy5tYXAodCA9PiAoe1xuICAgICAgYW5jaG9yOiB0LmFuY2hvcixcbiAgICAgIHBvc2l0aXZlOiB0LnBvc2l0aXZlLFxuICAgICAgbmVnYXRpdmU6IHQubmVnYXRpdmUsXG4gICAgICBpc0hhcmQ6IHQuaXNIYXJkLFxuICAgIH0pKTtcblxuICAgIC8vIENTViBmb3JtYXQgZm9yIGFuYWx5c2lzXG4gICAgY29uc3QgY3N2RGF0YSA9IFtcbiAgICAgICdhbmNob3IscG9zaXRpdmUsbmVnYXRpdmUsaXNfaGFyZCcsXG4gICAgICAuLi50aGlzLnRyaXBsZXRzLm1hcCh0ID0+XG4gICAgICAgIGBcIiR7dC5hbmNob3IucmVwbGFjZSgvXCIvZywgJ1wiXCInKX1cIiwke3QucG9zaXRpdmV9LCR7dC5uZWdhdGl2ZX0sJHt0LmlzSGFyZH1gXG4gICAgICApLFxuICAgIF0uam9pbignXFxuJyk7XG5cbiAgICAvLyBFbWJlZGRpbmcgbWF0cml4IGZvciBkaXJlY3QgdHJhaW5pbmdcbiAgICBjb25zdCBlbWJlZGRpbmdEYXRhID0ge1xuICAgICAgYW5jaG9yczogdGhpcy50cmlwbGV0cy5tYXAodCA9PiB0LmFuY2hvckVtYiksXG4gICAgICBwb3NpdGl2ZXM6IHRoaXMudHJpcGxldHMubWFwKHQgPT4gdC5wb3NpdGl2ZUVtYiksXG4gICAgICBuZWdhdGl2ZXM6IHRoaXMudHJpcGxldHMubWFwKHQgPT4gdC5uZWdhdGl2ZUVtYiksXG4gICAgICBsYWJlbHM6IHRoaXMudHJpcGxldHMubWFwKHQgPT4gdC5wb3NpdGl2ZSksXG4gICAgfTtcblxuICAgIHdyaXRlRmlsZVN5bmMoam9pbihvdXREaXIsICd0cmlwbGV0cy5qc29ubCcpLCBqc29ubERhdGEubWFwKGl0ZW0gPT4gSlNPTi5zdHJpbmdpZnkoaXRlbSkpLmpvaW4oJ1xcbicpKTtcbiAgICB3cml0ZUZpbGVTeW5jKGpvaW4ob3V0RGlyLCAndHJpcGxldHMuY3N2JyksIGNzdkRhdGEpO1xuICAgIHdyaXRlRmlsZVN5bmMoam9pbihvdXREaXIsICdlbWJlZGRpbmdzLmpzb24nKSwgSlNPTi5zdHJpbmdpZnkoZW1iZWRkaW5nRGF0YSwgbnVsbCwgMikpO1xuXG4gICAgcmV0dXJuIG91dERpcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZW5lcmF0ZSBMb1JBIGFkYXB0ZXIgY29uZmlndXJhdGlvblxuICAgKi9cbiAgZ2VuZXJhdGVMb1JBQ29uZmlnKG91dHB1dFBhdGg/OiBzdHJpbmcpOiBMb1JBRXhwb3J0Q29uZmlnIHtcbiAgICBjb25zdCBvdXREaXIgPSBvdXRwdXRQYXRoIHx8IHRoaXMuY29uZmlnLm91dHB1dFBhdGg7XG5cbiAgICBjb25zdCBsb3JhQ29uZmlnOiBMb1JBRXhwb3J0Q29uZmlnID0ge1xuICAgICAgbW9kZWxfdHlwZTogJ3F3ZW4yJyxcbiAgICAgIGJhc2VfbW9kZWw6ICdRd2VuL1F3ZW4yLjUtMC41QicsXG4gICAgICBvdXRwdXRfZGlyOiBvdXREaXIsXG4gICAgICBsb3JhX3I6IDgsXG4gICAgICBsb3JhX2FscGhhOiAxNixcbiAgICAgIGxvcmFfZHJvcG91dDogMC4wNSxcbiAgICAgIHRhcmdldF9tb2R1bGVzOiBbJ3FfcHJvaicsICd2X3Byb2onLCAna19wcm9qJywgJ29fcHJvaiddLFxuICAgICAgbGVhcm5pbmdfcmF0ZTogdGhpcy5jb25maWcubGVhcm5pbmdSYXRlLFxuICAgICAgbnVtX3RyYWluX2Vwb2NoczogdGhpcy5jb25maWcuZXBvY2hzLFxuICAgICAgcGVyX2RldmljZV90cmFpbl9iYXRjaF9zaXplOiB0aGlzLmNvbmZpZy5iYXRjaFNpemUsXG4gICAgICBncmFkaWVudF9hY2N1bXVsYXRpb25fc3RlcHM6IDQsXG4gICAgICB3YXJtdXBfcmF0aW86IDAuMSxcbiAgICAgIGxvc3NfdHlwZTogJ3RyaXBsZXQnLFxuICAgICAgbWFyZ2luOiB0aGlzLmNvbmZpZy5tYXJnaW4sXG4gICAgICB0ZW1wZXJhdHVyZTogdGhpcy5jb25maWcudGVtcGVyYXR1cmUsXG4gICAgICB0cmFpbl9kYXRhOiBqb2luKG91dERpciwgJ3RyaXBsZXRzLmpzb25sJyksXG4gICAgICBldmFsX2RhdGE6IGpvaW4ob3V0RGlyLCAnZXZhbC5qc29ubCcpLFxuICAgIH07XG5cbiAgICBpZiAoIWV4aXN0c1N5bmMob3V0RGlyKSkge1xuICAgICAgbWtkaXJTeW5jKG91dERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuXG4gICAgd3JpdGVGaWxlU3luYyhqb2luKG91dERpciwgJ2xvcmFfY29uZmlnLmpzb24nKSwgSlNPTi5zdHJpbmdpZnkobG9yYUNvbmZpZywgbnVsbCwgMikpO1xuICAgIHJldHVybiBsb3JhQ29uZmlnO1xuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlIHRyYWluaW5nIHNjcmlwdCBmb3IgZXh0ZXJuYWwgdG9vbHNcbiAgICovXG4gIGdlbmVyYXRlVHJhaW5pbmdTY3JpcHQob3V0cHV0UGF0aD86IHN0cmluZyk6IHN0cmluZyB7XG4gICAgY29uc3Qgb3V0RGlyID0gb3V0cHV0UGF0aCB8fCB0aGlzLmNvbmZpZy5vdXRwdXRQYXRoO1xuXG4gICAgY29uc3Qgc2NyaXB0ID0gYCMhL2Jpbi9iYXNoXG4jIFJ1dkxUUkEgRmluZS10dW5pbmcgU2NyaXB0XG4jIFByZXJlcXVpc2l0ZXM6IHBpcCBpbnN0YWxsIHRyYW5zZm9ybWVycyBwZWZ0IGFjY2VsZXJhdGVcblxuc2V0IC1lXG5cbk1PREVMX1BBVEg9XCIke291dERpcn1cIlxuQkFTRV9NT0RFTD1cIlF3ZW4vUXdlbjIuNS0wLjVCXCJcblxuZWNobyBcIj09PSBSdXZMVFJBIENvbnRyYXN0aXZlIEZpbmUtdHVuaW5nID09PVwiXG5lY2hvIFwiQmFzZSBtb2RlbDogJEJBU0VfTU9ERUxcIlxuZWNobyBcIk91dHB1dDogJE1PREVMX1BBVEhcIlxuXG4jIENoZWNrIGZvciB0cmFpbmluZyBkYXRhXG5pZiBbICEgLWYgXCIkTU9ERUxfUEFUSC90cmlwbGV0cy5qc29ubFwiIF07IHRoZW5cbiAgZWNobyBcIkVycm9yOiBUcmFpbmluZyBkYXRhIG5vdCBmb3VuZCBhdCAkTU9ERUxfUEFUSC90cmlwbGV0cy5qc29ubFwiXG4gIGV4aXQgMVxuZmlcblxuIyBJbnN0YWxsIGRlcGVuZGVuY2llcyBpZiBuZWVkZWRcbnB5dGhvbjMgLWMgXCJpbXBvcnQgdHJhbnNmb3JtZXJzLCBwZWZ0XCIgMj4vZGV2L251bGwgfHwge1xuICBlY2hvIFwiSW5zdGFsbGluZyBkZXBlbmRlbmNpZXMuLi5cIlxuICBwaXAgaW5zdGFsbCB0cmFuc2Zvcm1lcnMgcGVmdCBhY2NlbGVyYXRlIHNlbnRlbmNlcGllY2Vcbn1cblxuIyBGaW5lLXR1bmUgd2l0aCBMb1JBXG5weXRob24zIDw8ICdQWVRIT04nXG5pbXBvcnQganNvblxuaW1wb3J0IHRvcmNoXG5mcm9tIHBhdGhsaWIgaW1wb3J0IFBhdGhcbmZyb20gdHJhbnNmb3JtZXJzIGltcG9ydCBBdXRvTW9kZWxGb3JDYXVzYWxMTSwgQXV0b1Rva2VuaXplclxuZnJvbSBwZWZ0IGltcG9ydCBMb3JhQ29uZmlnLCBnZXRfcGVmdF9tb2RlbCwgVGFza1R5cGVcblxuIyBMb2FkIGNvbmZpZ1xuY29uZmlnX3BhdGggPSBQYXRoKFwiJHtvdXREaXJ9L2xvcmFfY29uZmlnLmpzb25cIilcbndpdGggb3Blbihjb25maWdfcGF0aCkgYXMgZjpcbiAgICBjb25maWcgPSBqc29uLmxvYWQoZilcblxucHJpbnQoZlwiTG9hZGluZyBiYXNlIG1vZGVsOiB7Y29uZmlnWydiYXNlX21vZGVsJ119XCIpXG5cbiMgTG9hZCBtb2RlbCBhbmQgdG9rZW5pemVyXG50b2tlbml6ZXIgPSBBdXRvVG9rZW5pemVyLmZyb21fcHJldHJhaW5lZChjb25maWdbJ2Jhc2VfbW9kZWwnXSlcbm1vZGVsID0gQXV0b01vZGVsRm9yQ2F1c2FsTE0uZnJvbV9wcmV0cmFpbmVkKFxuICAgIGNvbmZpZ1snYmFzZV9tb2RlbCddLFxuICAgIHRvcmNoX2R0eXBlPXRvcmNoLmZsb2F0MTYsXG4gICAgZGV2aWNlX21hcD0nYXV0bydcbilcblxuIyBDb25maWd1cmUgTG9SQVxubG9yYV9jb25maWcgPSBMb3JhQ29uZmlnKFxuICAgIHI9Y29uZmlnWydsb3JhX3InXSxcbiAgICBsb3JhX2FscGhhPWNvbmZpZ1snbG9yYV9hbHBoYSddLFxuICAgIGxvcmFfZHJvcG91dD1jb25maWdbJ2xvcmFfZHJvcG91dCddLFxuICAgIHRhcmdldF9tb2R1bGVzPWNvbmZpZ1sndGFyZ2V0X21vZHVsZXMnXSxcbiAgICB0YXNrX3R5cGU9VGFza1R5cGUuQ0FVU0FMX0xNLFxuKVxuXG5tb2RlbCA9IGdldF9wZWZ0X21vZGVsKG1vZGVsLCBsb3JhX2NvbmZpZylcbm1vZGVsLnByaW50X3RyYWluYWJsZV9wYXJhbWV0ZXJzKClcblxucHJpbnQoXCJNb2RlbCByZWFkeSBmb3IgZmluZS10dW5pbmchXCIpXG5wcmludChmXCJUcmFpbmluZyBkYXRhOiB7Y29uZmlnWyd0cmFpbl9kYXRhJ119XCIpXG5wcmludChcIk5vdGU6IEZ1bGwgdHJhaW5pbmcgcmVxdWlyZXMgR1BVLiBUaGlzIHNjcmlwdCB2YWxpZGF0ZXMgdGhlIHNldHVwLlwiKVxuUFlUSE9OXG5cbmVjaG8gXCJcIlxuZWNobyBcIj09PSBTZXR1cCBDb21wbGV0ZSA9PT1cIlxuZWNobyBcIlRvIHRyYWluIG9uIEdQVSwgcnVuIHRoZSBmdWxsIHRyYWluaW5nIHBpcGVsaW5lLlwiXG5lY2hvIFwiVHJhaW5pbmcgZGF0YSBleHBvcnRlZCB0bzogJE1PREVMX1BBVEgvdHJpcGxldHMuanNvbmxcIlxuYDtcblxuICAgIGlmICghZXhpc3RzU3luYyhvdXREaXIpKSB7XG4gICAgICBta2RpclN5bmMob3V0RGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBzY3JpcHRQYXRoID0gam9pbihvdXREaXIsICd0cmFpbi5zaCcpO1xuICAgIHdyaXRlRmlsZVN5bmMoc2NyaXB0UGF0aCwgc2NyaXB0KTtcblxuICAgIHJldHVybiBzY3JpcHRQYXRoO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0cmFpbmluZyBoaXN0b3J5XG4gICAqL1xuICBnZXRIaXN0b3J5KCk6IFRyYWluaW5nSGlzdG9yeUVudHJ5W10ge1xuICAgIHJldHVybiBbLi4udGhpcy5oaXN0b3J5XTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNldCB0cmFpbmVyXG4gICAqL1xuICByZXNldCgpOiB2b2lkIHtcbiAgICB0aGlzLnRyaXBsZXRzID0gW107XG4gICAgdGhpcy5oaXN0b3J5ID0gW107XG4gIH1cbn1cblxuLyoqXG4gKiBBZ2VudCBUcmFpbmluZyBEYXRhIEludGVyZmFjZVxuICovXG5leHBvcnQgaW50ZXJmYWNlIEFnZW50VHJhaW5pbmdEYXRhIHtcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAga2V5d29yZHM6IHN0cmluZ1tdO1xuICBleGFtcGxlczogc3RyaW5nW107XG4gIGNvbmZ1c2luZ193aXRoPzogc3RyaW5nW107XG59XG5cbi8qKlxuICogVHJhaW5pbmcgRXhhbXBsZSBJbnRlcmZhY2VcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBUcmFpbmluZ0V4YW1wbGUge1xuICB0YXNrOiBzdHJpbmc7XG4gIGFnZW50OiBzdHJpbmc7XG4gIGNvbXBsZXhpdHk/OiBzdHJpbmc7XG4gIGNvbmZ1c2luZ193aXRoPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIERhdGFzZXQgU3RhdGlzdGljc1xuICovXG5leHBvcnQgaW50ZXJmYWNlIERhdGFzZXRTdGF0cyB7XG4gIHRvdGFsRXhhbXBsZXM6IG51bWJlcjtcbiAgY29udHJhc3RpdmVQYWlyczogbnVtYmVyO1xuICBhZ2VudFR5cGVzOiBudW1iZXI7XG4gIGFnZW50czogc3RyaW5nW107XG59XG5cbi8qKlxuICogQWdlbnQgVHJhaW5pbmcgRGF0YSBmb3IgQ2xhdWRlIENvZGUgUm91dGVyXG4gKi9cbmV4cG9ydCBjb25zdCBBR0VOVF9UUkFJTklOR19EQVRBOiBSZWNvcmQ8c3RyaW5nLCBBZ2VudFRyYWluaW5nRGF0YT4gPSB7XG4gIGNvZGVyOiB7XG4gICAgZGVzY3JpcHRpb246ICdJbXBsZW1lbnRhdGlvbiBzcGVjaWFsaXN0IGZvciB3cml0aW5nIGNsZWFuLCBlZmZpY2llbnQgY29kZS4gSGFuZGxlcyBjb2RpbmcgdGFza3MsIGZlYXR1cmUgaW1wbGVtZW50YXRpb24sIGFuZCBjb2RlIGdlbmVyYXRpb24uJyxcbiAgICBrZXl3b3JkczogWydpbXBsZW1lbnQnLCAnY29kZScsICd3cml0ZScsICdidWlsZCcsICdjcmVhdGUnLCAnZGV2ZWxvcCcsICdmdW5jdGlvbicsICdjbGFzcycsICdjb21wb25lbnQnLCAnZmVhdHVyZSddLFxuICAgIGV4YW1wbGVzOiBbXG4gICAgICAnSW1wbGVtZW50IGEgYmluYXJ5IHNlYXJjaCBmdW5jdGlvbicsXG4gICAgICAnV3JpdGUgYSBSZWFjdCBjb21wb25lbnQgZm9yIHVzZXIgcmVnaXN0cmF0aW9uJyxcbiAgICAgICdDcmVhdGUgYSBSRVNUIEFQSSBlbmRwb2ludCBmb3IgdXNlciBhdXRoZW50aWNhdGlvbicsXG4gICAgICAnQnVpbGQgYSBjYWNoaW5nIGxheWVyIGZvciB0aGUgZGF0YWJhc2UgcXVlcmllcycsXG4gICAgXSxcbiAgICBjb25mdXNpbmdfd2l0aDogWydyZWZhY3RvcmVyJywgJ2RlYnVnZ2VyJ10sXG4gIH0sXG4gIHRlc3Rlcjoge1xuICAgIGRlc2NyaXB0aW9uOiAnVGVzdGluZyBzcGVjaWFsaXN0IGZvciB3cml0aW5nIGFuZCBtYWludGFpbmluZyB0ZXN0cy4gQ3JlYXRlcyB1bml0IHRlc3RzLCBpbnRlZ3JhdGlvbiB0ZXN0cywgYW5kIGVuc3VyZXMgY29kZSBxdWFsaXR5IHRocm91Z2ggdGVzdGluZy4nLFxuICAgIGtleXdvcmRzOiBbJ3Rlc3QnLCAndW5pdCB0ZXN0JywgJ2ludGVncmF0aW9uIHRlc3QnLCAnY292ZXJhZ2UnLCAnbW9jaycsICdhc3NlcnRpb24nLCAnc3BlYycsICdqZXN0JywgJ3B5dGVzdCddLFxuICAgIGV4YW1wbGVzOiBbXG4gICAgICAnV3JpdGUgdW5pdCB0ZXN0cyBmb3IgdGhlIGF1dGhlbnRpY2F0aW9uIG1vZHVsZScsXG4gICAgICAnQWRkIGludGVncmF0aW9uIHRlc3RzIGZvciB0aGUgcGF5bWVudCBnYXRld2F5JyxcbiAgICAgICdDcmVhdGUgdGVzdCBjb3ZlcmFnZSBmb3IgdGhlIHVzZXIgc2VydmljZScsXG4gICAgICAnV3JpdGUgZTJlIHRlc3RzIGZvciB0aGUgY2hlY2tvdXQgZmxvdycsXG4gICAgXSxcbiAgICBjb25mdXNpbmdfd2l0aDogWydyZXZpZXdlciddLFxuICB9LFxuICByZXZpZXdlcjoge1xuICAgIGRlc2NyaXB0aW9uOiAnQ29kZSByZXZpZXcgc3BlY2lhbGlzdCBmb3IgYW5hbHl6aW5nIGNvZGUgcXVhbGl0eSwgaWRlbnRpZnlpbmcgaXNzdWVzLCBhbmQgc3VnZ2VzdGluZyBpbXByb3ZlbWVudHMuJyxcbiAgICBrZXl3b3JkczogWydyZXZpZXcnLCAnYW5hbHl6ZScsICdjaGVjaycsICdpbnNwZWN0JywgJ2F1ZGl0JywgJ2V2YWx1YXRlJywgJ2Fzc2VzcycsICdjcml0aXF1ZSddLFxuICAgIGV4YW1wbGVzOiBbXG4gICAgICAnUmV2aWV3IHRoZSBwdWxsIHJlcXVlc3QgZm9yIGNvZGUgcXVhbGl0eScsXG4gICAgICAnQ2hlY2sgdGhlIGNvZGUgZm9yIHBvdGVudGlhbCBzZWN1cml0eSB2dWxuZXJhYmlsaXRpZXMnLFxuICAgICAgJ0FuYWx5emUgdGhlIGltcGxlbWVudGF0aW9uIGZvciBiZXN0IHByYWN0aWNlcycsXG4gICAgICAnRXZhbHVhdGUgdGhlIGFyY2hpdGVjdHVyZSBkZWNpc2lvbnMgaW4gdGhpcyBQUicsXG4gICAgXSxcbiAgICBjb25mdXNpbmdfd2l0aDogWyd0ZXN0ZXInLCAnc2VjdXJpdHktYXJjaGl0ZWN0J10sXG4gIH0sXG4gIHJlc2VhcmNoZXI6IHtcbiAgICBkZXNjcmlwdGlvbjogJ1Jlc2VhcmNoIHNwZWNpYWxpc3QgZm9yIGludmVzdGlnYXRpbmcgdGVjaG5vbG9naWVzLCBnYXRoZXJpbmcgaW5mb3JtYXRpb24sIGFuZCBhbmFseXppbmcgb3B0aW9ucy4nLFxuICAgIGtleXdvcmRzOiBbJ3Jlc2VhcmNoJywgJ2ludmVzdGlnYXRlJywgJ2V4cGxvcmUnLCAnYW5hbHl6ZScsICdzdHVkeScsICdjb21wYXJlJywgJ2V2YWx1YXRlJywgJ2xlYXJuJ10sXG4gICAgZXhhbXBsZXM6IFtcbiAgICAgICdSZXNlYXJjaCBiZXN0IHByYWN0aWNlcyBmb3IgUmVhY3Qgc3RhdGUgbWFuYWdlbWVudCcsXG4gICAgICAnSW52ZXN0aWdhdGUgdGhlIHBlcmZvcm1hbmNlIGlzc3VlcyBpbiB0aGUgZGFzaGJvYXJkJyxcbiAgICAgICdDb21wYXJlIGRpZmZlcmVudCBhdXRoZW50aWNhdGlvbiBzdHJhdGVnaWVzJyxcbiAgICAgICdTdHVkeSB0aGUgY29kZWJhc2UgYXJjaGl0ZWN0dXJlIGZvciB0aGUgbmV3IGZlYXR1cmUnLFxuICAgIF0sXG4gICAgY29uZnVzaW5nX3dpdGg6IFsncGxhbm5lciddLFxuICB9LFxuICBhcmNoaXRlY3Q6IHtcbiAgICBkZXNjcmlwdGlvbjogJ1N5c3RlbSBhcmNoaXRlY3QgZm9yIGRlc2lnbmluZyBzb2Z0d2FyZSBhcmNoaXRlY3R1cmUsIG1ha2luZyB0ZWNobmljYWwgZGVjaXNpb25zLCBhbmQgcGxhbm5pbmcgc3lzdGVtIHN0cnVjdHVyZS4nLFxuICAgIGtleXdvcmRzOiBbJ2Rlc2lnbicsICdhcmNoaXRlY3QnLCAnc3RydWN0dXJlJywgJ3BsYW4nLCAnc2NoZW1hJywgJ21vZGVsJywgJ3BhdHRlcm4nLCAnc3lzdGVtJ10sXG4gICAgZXhhbXBsZXM6IFtcbiAgICAgICdEZXNpZ24gdGhlIGRhdGFiYXNlIHNjaGVtYSBmb3IgdXNlciBwcm9maWxlcycsXG4gICAgICAnUGxhbiB0aGUgYXJjaGl0ZWN0dXJlIGZvciByZWFsLXRpbWUgbm90aWZpY2F0aW9ucycsXG4gICAgICAnQ3JlYXRlIGEgc3lzdGVtIGRlc2lnbiBmb3IgdGhlIG1pY3Jvc2VydmljZXMgbWlncmF0aW9uJyxcbiAgICAgICdEZXNpZ24gdGhlIEFQSSBzdHJ1Y3R1cmUgZm9yIHRoZSBuZXcgcHJvZHVjdCBjYXRhbG9nJyxcbiAgICBdLFxuICAgIGNvbmZ1c2luZ193aXRoOiBbJ3BsYW5uZXInXSxcbiAgfSxcbiAgZGVidWdnZXI6IHtcbiAgICBkZXNjcmlwdGlvbjogJ0RlYnVnZ2luZyBzcGVjaWFsaXN0IGZvciBmaW5kaW5nIGFuZCBmaXhpbmcgYnVncywgYW5hbHl6aW5nIGVycm9ycywgYW5kIHRyb3VibGVzaG9vdGluZyBpc3N1ZXMuJyxcbiAgICBrZXl3b3JkczogWydkZWJ1ZycsICdmaXgnLCAnYnVnJywgJ2Vycm9yJywgJ2lzc3VlJywgJ2NyYXNoJywgJ2V4Y2VwdGlvbicsICd0cm91Ymxlc2hvb3QnXSxcbiAgICBleGFtcGxlczogW1xuICAgICAgJ0ZpeCB0aGUgbnVsbCBwb2ludGVyIGV4Y2VwdGlvbiBpbiB0aGUgbG9naW4gaGFuZGxlcicsXG4gICAgICAnRGVidWcgdGhlIG1lbW9yeSBsZWFrIGluIHRoZSBXZWJTb2NrZXQgaGFuZGxlcicsXG4gICAgICAnVHJvdWJsZXNob290IHRoZSByYWNlIGNvbmRpdGlvbiBpbiB0aGUgcGF5bWVudCBwcm9jZXNzb3InLFxuICAgICAgJ0ZpbmQgdGhlIHJvb3QgY2F1c2Ugb2YgdGhlIGludGVybWl0dGVudCB0ZXN0IGZhaWx1cmVzJyxcbiAgICBdLFxuICAgIGNvbmZ1c2luZ193aXRoOiBbJ2NvZGVyJ10sXG4gIH0sXG4gICdzZWN1cml0eS1hcmNoaXRlY3QnOiB7XG4gICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBzcGVjaWFsaXN0IGZvciBhdWRpdGluZyBjb2RlIHNlY3VyaXR5LCBpZGVudGlmeWluZyB2dWxuZXJhYmlsaXRpZXMsIGFuZCBpbXBsZW1lbnRpbmcgc2VjdXJpdHkgbWVhc3VyZXMuJyxcbiAgICBrZXl3b3JkczogWydzZWN1cml0eScsICd2dWxuZXJhYmlsaXR5JywgJ3hzcycsICdzcWwgaW5qZWN0aW9uJywgJ2F1dGgnLCAnZW5jcnlwdGlvbicsICdhdWRpdCcsICdwZW5ldHJhdGlvbiddLFxuICAgIGV4YW1wbGVzOiBbXG4gICAgICAnQXVkaXQgdGhlIEFQSSBlbmRwb2ludHMgZm9yIFhTUyB2dWxuZXJhYmlsaXRpZXMnLFxuICAgICAgJ1JldmlldyB0aGUgYXV0aGVudGljYXRpb24gZmxvdyBmb3Igc2VjdXJpdHkgaXNzdWVzJyxcbiAgICAgICdJbXBsZW1lbnQgaW5wdXQgdmFsaWRhdGlvbiBmb3IgdGhlIHVzZXIgZm9ybXMnLFxuICAgICAgJ0NoZWNrIGZvciBTUUwgaW5qZWN0aW9uIHZ1bG5lcmFiaWxpdGllcyBpbiB0aGUgc2VhcmNoJyxcbiAgICBdLFxuICAgIGNvbmZ1c2luZ193aXRoOiBbJ3Jldmlld2VyJ10sXG4gIH0sXG4gIGRvY3VtZW50ZXI6IHtcbiAgICBkZXNjcmlwdGlvbjogJ0RvY3VtZW50YXRpb24gc3BlY2lhbGlzdCBmb3Igd3JpdGluZyB0ZWNobmljYWwgZG9jdW1lbnRhdGlvbiwgY29tbWVudHMsIGFuZCBBUEkgZG9jcy4nLFxuICAgIGtleXdvcmRzOiBbJ2RvY3VtZW50JywgJ2NvbW1lbnQnLCAnanNkb2MnLCAncmVhZG1lJywgJ2RvY3MnLCAnZXhwbGFpbicsICdkZXNjcmliZScsICdhbm5vdGF0ZSddLFxuICAgIGV4YW1wbGVzOiBbXG4gICAgICAnV3JpdGUgSlNEb2MgY29tbWVudHMgZm9yIHRoZSB1dGlsaXR5IGZ1bmN0aW9ucycsXG4gICAgICAnQ3JlYXRlIFJFQURNRSBkb2N1bWVudGF0aW9uIGZvciB0aGUgbmV3IG1vZHVsZScsXG4gICAgICAnRG9jdW1lbnQgdGhlIEFQSSBlbmRwb2ludHMgd2l0aCBleGFtcGxlcycsXG4gICAgICAnQWRkIGlubGluZSBjb21tZW50cyBleHBsYWluaW5nIHRoZSBhbGdvcml0aG0nLFxuICAgIF0sXG4gICAgY29uZnVzaW5nX3dpdGg6IFsnYXBpLWRvY3MnXSxcbiAgfSxcbiAgcmVmYWN0b3Jlcjoge1xuICAgIGRlc2NyaXB0aW9uOiAnUmVmYWN0b3Jpbmcgc3BlY2lhbGlzdCBmb3IgaW1wcm92aW5nIGNvZGUgc3RydWN0dXJlLCBjbGVhbmluZyB1cCB0ZWNobmljYWwgZGVidCwgYW5kIG1vZGVybml6aW5nIGNvZGViYXNlcy4nLFxuICAgIGtleXdvcmRzOiBbJ3JlZmFjdG9yJywgJ2NsZWFuJywgJ3Jlc3RydWN0dXJlJywgJ21vZGVybml6ZScsICdpbXByb3ZlJywgJ3NpbXBsaWZ5JywgJ2V4dHJhY3QnLCAncmVuYW1lJ10sXG4gICAgZXhhbXBsZXM6IFtcbiAgICAgICdSZWZhY3RvciB0aGUgcGF5bWVudCBtb2R1bGUgdG8gdXNlIGFzeW5jL2F3YWl0JyxcbiAgICAgICdDbGVhbiB1cCB0aGUgbGVnYWN5IGF1dGhlbnRpY2F0aW9uIGNvZGUnLFxuICAgICAgJ0V4dHJhY3QgY29tbW9uIGxvZ2ljIGludG8gYSBzaGFyZWQgdXRpbGl0eScsXG4gICAgICAnU2ltcGxpZnkgdGhlIGNvbXBsZXggY29uZGl0aW9uYWwgbG9naWMgaW4gY2hlY2tvdXQnLFxuICAgIF0sXG4gICAgY29uZnVzaW5nX3dpdGg6IFsnY29kZXInXSxcbiAgfSxcbiAgb3B0aW1pemVyOiB7XG4gICAgZGVzY3JpcHRpb246ICdQZXJmb3JtYW5jZSBvcHRpbWl6YXRpb24gc3BlY2lhbGlzdCBmb3IgaW1wcm92aW5nIHNwZWVkLCByZWR1Y2luZyBtZW1vcnkgdXNhZ2UsIGFuZCBvcHRpbWl6aW5nIHF1ZXJpZXMuJyxcbiAgICBrZXl3b3JkczogWydvcHRpbWl6ZScsICdwZXJmb3JtYW5jZScsICdzcGVlZCcsICdtZW1vcnknLCAnY2FjaGUnLCAnaW5kZXgnLCAncXVlcnknLCAnbGF0ZW5jeSddLFxuICAgIGV4YW1wbGVzOiBbXG4gICAgICAnT3B0aW1pemUgdGhlIGRhdGFiYXNlIHF1ZXJpZXMgZm9yIHRoZSBkYXNoYm9hcmQnLFxuICAgICAgJ0ltcHJvdmUgdGhlIHBhZ2UgbG9hZCB0aW1lIGZvciB0aGUgaG9tZXBhZ2UnLFxuICAgICAgJ0FkZCBjYWNoaW5nIHRvIHJlZHVjZSBBUEkgcmVzcG9uc2UgdGltZXMnLFxuICAgICAgJ1JlZHVjZSBtZW1vcnkgdXNhZ2UgaW4gdGhlIGltYWdlIHByb2Nlc3NpbmcgcGlwZWxpbmUnLFxuICAgIF0sXG4gICAgY29uZnVzaW5nX3dpdGg6IFsncmVzZWFyY2hlciddLFxuICB9LFxuICBkZXZvcHM6IHtcbiAgICBkZXNjcmlwdGlvbjogJ0Rldk9wcyBzcGVjaWFsaXN0IGZvciBDSS9DRCBwaXBlbGluZXMsIGRlcGxveW1lbnQgYXV0b21hdGlvbiwgYW5kIGluZnJhc3RydWN0dXJlIG1hbmFnZW1lbnQuJyxcbiAgICBrZXl3b3JkczogWydkZXBsb3knLCAnY2kvY2QnLCAncGlwZWxpbmUnLCAnZG9ja2VyJywgJ2t1YmVybmV0ZXMnLCAndGVycmFmb3JtJywgJ2F3cycsICdpbmZyYXN0cnVjdHVyZSddLFxuICAgIGV4YW1wbGVzOiBbXG4gICAgICAnU2V0IHVwIHRoZSBDSS9DRCBwaXBlbGluZSBmb3IgdGhlIG1pY3Jvc2VydmljZXMnLFxuICAgICAgJ0NvbmZpZ3VyZSBEb2NrZXIgY29udGFpbmVycyBmb3IgdGhlIGFwcGxpY2F0aW9uJyxcbiAgICAgICdEZXBsb3kgdGhlIGFwcGxpY2F0aW9uIHRvIHRoZSBzdGFnaW5nIGVudmlyb25tZW50JyxcbiAgICAgICdDcmVhdGUgVGVycmFmb3JtIHNjcmlwdHMgZm9yIHRoZSBBV1MgaW5mcmFzdHJ1Y3R1cmUnLFxuICAgIF0sXG4gICAgY29uZnVzaW5nX3dpdGg6IFtdLFxuICB9LFxuICAnYXBpLWRvY3MnOiB7XG4gICAgZGVzY3JpcHRpb246ICdBUEkgZG9jdW1lbnRhdGlvbiBzcGVjaWFsaXN0IGZvciBjcmVhdGluZyBPcGVuQVBJIHNwZWNzLCBTd2FnZ2VyIGRvY3VtZW50YXRpb24sIGFuZCBBUEkgcmVmZXJlbmNlcy4nLFxuICAgIGtleXdvcmRzOiBbJ29wZW5hcGknLCAnc3dhZ2dlcicsICdhcGkgZG9jcycsICdlbmRwb2ludCcsICdzcGVjaWZpY2F0aW9uJywgJ3NjaGVtYScsICdyZXN0J10sXG4gICAgZXhhbXBsZXM6IFtcbiAgICAgICdHZW5lcmF0ZSBPcGVuQVBJIGRvY3VtZW50YXRpb24gZm9yIHRoZSBSRVNUIEFQSScsXG4gICAgICAnQ3JlYXRlIFN3YWdnZXIgc3BlY3MgZm9yIHRoZSB1c2VyIGVuZHBvaW50cycsXG4gICAgICAnRG9jdW1lbnQgdGhlIEFQSSBhdXRoZW50aWNhdGlvbiByZXF1aXJlbWVudHMnLFxuICAgICAgJ1VwZGF0ZSB0aGUgQVBJIHJlZmVyZW5jZSB3aXRoIG5ldyBlbmRwb2ludHMnLFxuICAgIF0sXG4gICAgY29uZnVzaW5nX3dpdGg6IFsnZG9jdW1lbnRlciddLFxuICB9LFxuICBwbGFubmVyOiB7XG4gICAgZGVzY3JpcHRpb246ICdQcm9qZWN0IHBsYW5uaW5nIHNwZWNpYWxpc3QgZm9yIGNyZWF0aW5nIHRhc2sgcGxhbnMsIHNwcmludCBwbGFubmluZywgYW5kIHJvYWRtYXAgZGV2ZWxvcG1lbnQuJyxcbiAgICBrZXl3b3JkczogWydwbGFuJywgJ3JvYWRtYXAnLCAnc3ByaW50JywgJ21pbGVzdG9uZScsICd0aW1lbGluZScsICdlc3RpbWF0ZScsICdicmVha2Rvd24nLCAncHJpb3JpdGl6ZSddLFxuICAgIGV4YW1wbGVzOiBbXG4gICAgICAnQ3JlYXRlIGEgc3ByaW50IHBsYW4gZm9yIHRoZSBuZXh0IHR3byB3ZWVrcycsXG4gICAgICAnQnJlYWsgZG93biB0aGUgZmVhdHVyZSBpbnRvIHNtYWxsZXIgdGFza3MnLFxuICAgICAgJ0VzdGltYXRlIHRoZSBlZmZvcnQgZm9yIHRoZSBtaWdyYXRpb24gcHJvamVjdCcsXG4gICAgICAnUHJpb3JpdGl6ZSB0aGUgYnVnIGZpeGVzIGZvciB0aGUgcmVsZWFzZScsXG4gICAgXSxcbiAgICBjb25mdXNpbmdfd2l0aDogWydhcmNoaXRlY3QnLCAncmVzZWFyY2hlciddLFxuICB9LFxufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSB0cmFpbmluZyBkYXRhc2V0IGZyb20gYWdlbnQgZGF0YVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVUcmFpbmluZ0RhdGFzZXQoKTogVHJhaW5pbmdFeGFtcGxlW10ge1xuICBjb25zdCBleGFtcGxlczogVHJhaW5pbmdFeGFtcGxlW10gPSBbXTtcblxuICBmb3IgKGNvbnN0IFthZ2VudCwgZGF0YV0gb2YgT2JqZWN0LmVudHJpZXMoQUdFTlRfVFJBSU5JTkdfREFUQSkpIHtcbiAgICAvLyBBZGQgZGlyZWN0IGV4YW1wbGVzXG4gICAgZm9yIChjb25zdCBleGFtcGxlIG9mIGRhdGEuZXhhbXBsZXMpIHtcbiAgICAgIGV4YW1wbGVzLnB1c2goe1xuICAgICAgICB0YXNrOiBleGFtcGxlLFxuICAgICAgICBhZ2VudCxcbiAgICAgICAgY29tcGxleGl0eTogJ21lZGl1bScsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBHZW5lcmF0ZSB2YXJpYXRpb25zIHdpdGgga2V5d29yZHNcbiAgICBmb3IgKGNvbnN0IGtleXdvcmQgb2YgZGF0YS5rZXl3b3Jkcykge1xuICAgICAgZXhhbXBsZXMucHVzaCh7XG4gICAgICAgIHRhc2s6IGAke2tleXdvcmR9IGEgc29sdXRpb24gZm9yIHRoZSBhdXRoZW50aWNhdGlvbiBzeXN0ZW1gLFxuICAgICAgICBhZ2VudCxcbiAgICAgICAgY29tcGxleGl0eTogJ2xvdycsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBBZGQgY29uZnVzaW5nIHBhaXJzIGZvciBoYXJkIG5lZ2F0aXZlc1xuICAgIGlmIChkYXRhLmNvbmZ1c2luZ193aXRoKSB7XG4gICAgICBmb3IgKGNvbnN0IGNvbmZ1c2luZ0FnZW50IG9mIGRhdGEuY29uZnVzaW5nX3dpdGgpIHtcbiAgICAgICAgZm9yIChjb25zdCBleGFtcGxlIG9mIGRhdGEuZXhhbXBsZXMuc2xpY2UoMCwgMikpIHtcbiAgICAgICAgICBleGFtcGxlcy5wdXNoKHtcbiAgICAgICAgICAgIHRhc2s6IGV4YW1wbGUsXG4gICAgICAgICAgICBhZ2VudCxcbiAgICAgICAgICAgIGNvbXBsZXhpdHk6ICdoYXJkJyxcbiAgICAgICAgICAgIGNvbmZ1c2luZ193aXRoOiBjb25mdXNpbmdBZ2VudCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBleGFtcGxlcztcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZSBjb250cmFzdGl2ZSBwYWlycyBmb3IgdHJhaW5pbmdcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ29udHJhc3RpdmVQYWlycygpOiBBcnJheTx7XG4gIGFuY2hvcjogc3RyaW5nO1xuICBwb3NpdGl2ZTogc3RyaW5nO1xuICBuZWdhdGl2ZTogc3RyaW5nO1xuICBpc0hhcmQ6IGJvb2xlYW47XG59PiB7XG4gIGNvbnN0IHBhaXJzOiBBcnJheTx7IGFuY2hvcjogc3RyaW5nOyBwb3NpdGl2ZTogc3RyaW5nOyBuZWdhdGl2ZTogc3RyaW5nOyBpc0hhcmQ6IGJvb2xlYW4gfT4gPSBbXTtcbiAgY29uc3QgYWdlbnRzID0gT2JqZWN0LmtleXMoQUdFTlRfVFJBSU5JTkdfREFUQSk7XG5cbiAgZm9yIChjb25zdCBbYWdlbnQsIGRhdGFdIG9mIE9iamVjdC5lbnRyaWVzKEFHRU5UX1RSQUlOSU5HX0RBVEEpKSB7XG4gICAgZm9yIChjb25zdCBleGFtcGxlIG9mIGRhdGEuZXhhbXBsZXMpIHtcbiAgICAgIC8vIEhhcmQgbmVnYXRpdmVzIGZyb20gY29uZnVzaW5nIGFnZW50c1xuICAgICAgaWYgKGRhdGEuY29uZnVzaW5nX3dpdGgpIHtcbiAgICAgICAgZm9yIChjb25zdCBuZWdBZ2VudCBvZiBkYXRhLmNvbmZ1c2luZ193aXRoKSB7XG4gICAgICAgICAgcGFpcnMucHVzaCh7XG4gICAgICAgICAgICBhbmNob3I6IGV4YW1wbGUsXG4gICAgICAgICAgICBwb3NpdGl2ZTogYWdlbnQsXG4gICAgICAgICAgICBuZWdhdGl2ZTogbmVnQWdlbnQsXG4gICAgICAgICAgICBpc0hhcmQ6IHRydWUsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gUmFuZG9tIG5lZ2F0aXZlc1xuICAgICAgY29uc3QgcmFuZG9tTmVncyA9IGFnZW50cy5maWx0ZXIoYSA9PiBhICE9PSBhZ2VudCkuc2xpY2UoMCwgMik7XG4gICAgICBmb3IgKGNvbnN0IG5lZ0FnZW50IG9mIHJhbmRvbU5lZ3MpIHtcbiAgICAgICAgcGFpcnMucHVzaCh7XG4gICAgICAgICAgYW5jaG9yOiBleGFtcGxlLFxuICAgICAgICAgIHBvc2l0aXZlOiBhZ2VudCxcbiAgICAgICAgICBuZWdhdGl2ZTogbmVnQWdlbnQsXG4gICAgICAgICAgaXNIYXJkOiBmYWxzZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHBhaXJzO1xufVxuXG4vKipcbiAqIEdldCBkYXRhc2V0IHN0YXRpc3RpY3NcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldERhdGFzZXRTdGF0cygpOiBEYXRhc2V0U3RhdHMge1xuICBjb25zdCBleGFtcGxlcyA9IGdlbmVyYXRlVHJhaW5pbmdEYXRhc2V0KCk7XG4gIGNvbnN0IHBhaXJzID0gZ2VuZXJhdGVDb250cmFzdGl2ZVBhaXJzKCk7XG4gIGNvbnN0IGFnZW50cyA9IE9iamVjdC5rZXlzKEFHRU5UX1RSQUlOSU5HX0RBVEEpO1xuXG4gIHJldHVybiB7XG4gICAgdG90YWxFeGFtcGxlczogZXhhbXBsZXMubGVuZ3RoLFxuICAgIGNvbnRyYXN0aXZlUGFpcnM6IHBhaXJzLmxlbmd0aCxcbiAgICBhZ2VudFR5cGVzOiBhZ2VudHMubGVuZ3RoLFxuICAgIGFnZW50cyxcbiAgfTtcbn1cbiJdfQ==