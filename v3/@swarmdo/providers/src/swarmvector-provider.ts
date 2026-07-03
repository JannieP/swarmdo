/**
 * V3 SwarmVector Provider (via @swarmvector/swarmllm)
 *
 * Self-learning LLM orchestration with:
 * - SONA adaptive learning
 * - HNSW vector memory
 * - FastGRNN intelligent routing
 * - SIMD inference optimization
 * - Local model execution (free)
 *
 * @module @swarmdo/providers/swarmvector-provider
 */

import { BaseProvider, BaseProviderOptions } from './base-provider.js';
import {
  LLMProvider,
  LLMModel,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  ModelInfo,
  ProviderCapabilities,
  HealthCheckResult,
  ProviderUnavailableError,
  LLMProviderError,
} from './types.js';

/**
 * SwarmVector LLM configuration
 */
interface SwarmVectorConfig {
  /** Enable SONA self-learning (default: true) */
  enableSona?: boolean;
  /** SONA learning rate (default: 0.01) */
  sonaLearningRate?: number;
  /** Enable HNSW vector memory (default: true) */
  enableHnsw?: boolean;
  /** HNSW M parameter for graph construction */
  hnswM?: number;
  /** HNSW ef_construction parameter */
  hnswEfConstruction?: number;
  /** Enable FastGRNN routing (default: true) */
  enableFastGrnn?: boolean;
  /** Inference mode: 'simd' | 'standard' */
  inferenceMode?: 'simd' | 'standard';
  /** Router strategy */
  routerStrategy?: 'cost' | 'quality' | 'balanced' | 'speed';
}

interface SwarmVectorRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  sona_options?: {
    enabled: boolean;
    learning_rate: number;
    adapt_on_response: boolean;
  };
  router_options?: {
    strategy: string;
    fallback_models: string[];
  };
}

interface SwarmVectorResponse {
  id: string;
  model: string;
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  sona_metrics?: {
    adaptation_applied: boolean;
    quality_score: number;
    patterns_used: number;
  };
  router_metrics?: {
    model_selected: string;
    routing_reason: string;
    latency_ms: number;
  };
  done: boolean;
}

export class SwarmVectorProvider extends BaseProvider {
  readonly name: LLMProvider = 'swarmvector';
  readonly capabilities: ProviderCapabilities = {
    supportedModels: [
      // SwarmVector-managed models
      'swarmvector-auto',        // Auto-selects best model
      'swarmvector-fast',        // Optimized for speed
      'swarmvector-quality',     // Optimized for quality
      'swarmvector-balanced',    // Balanced speed/quality
      // Local models via swarmLLM or Ollama fallback
      'llama3.2',
      'mistral',
      'phi-4',
      'deepseek-coder',
      'codellama',
      'qwen2.5',
      'qwen2.5:0.5b',         // CPU-friendly Qwen
      'qwen2.5:1.5b',
      'smollm:135m',          // SmolLM models
      'smollm:360m',
      'tinyllama',
    ],
    maxContextLength: {
      'swarmvector-auto': 128000,
      'swarmvector-fast': 32000,
      'swarmvector-quality': 128000,
      'swarmvector-balanced': 64000,
      'llama3.2': 128000,
      'mistral': 32000,
      'phi-4': 16000,
      'deepseek-coder': 16000,
      'codellama': 16000,
      'qwen2.5': 32000,
    },
    maxOutputTokens: {
      'swarmvector-auto': 8192,
      'swarmvector-fast': 4096,
      'swarmvector-quality': 8192,
      'swarmvector-balanced': 8192,
      'llama3.2': 8192,
      'mistral': 8192,
      'phi-4': 4096,
      'deepseek-coder': 8192,
      'codellama': 8192,
      'qwen2.5': 8192,
    },
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsSystemMessages: true,
    supportsVision: false,
    supportsAudio: false,
    supportsFineTuning: true, // SONA self-learning
    supportsEmbeddings: true, // HNSW
    supportsBatching: true,
    rateLimit: {
      requestsPerMinute: 10000, // Local - no rate limit
      tokensPerMinute: 10000000,
      concurrentRequests: 100,
    },
    // Free - local execution with SONA optimization
    pricing: {
      'swarmvector-auto': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
      'swarmvector-fast': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
      'swarmvector-quality': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
      'swarmvector-balanced': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
      'llama3.2': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
      'mistral': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
      'phi-4': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
      'deepseek-coder': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
      'codellama': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
      'qwen2.5': { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
    },
  };

  private baseUrl: string = 'http://localhost:3000'; // swarmLLM default port
  private ollamaUrl: string = 'http://localhost:11434';
  private swarmvectorConfig: SwarmVectorConfig = {};
  private swarmllm: unknown; // Dynamic import of @swarmvector/swarmllm
  private useOllamaFallback: boolean = false;
  private swarmllmAvailable: boolean = false;

  constructor(options: BaseProviderOptions) {
    super(options);
    this.swarmvectorConfig = (options.config.providerOptions as SwarmVectorConfig) || {};
  }

  protected async doInitialize(): Promise<void> {
    // Configure URLs from options
    this.baseUrl = this.config.apiUrl || 'http://localhost:3000';
    this.ollamaUrl = (this.config.providerOptions as any)?.ollamaUrl || 'http://localhost:11434';

    // Try to dynamically import @swarmvector/swarmllm native module
    try {
      this.swarmllm = await import('@swarmvector/swarmllm').catch(() => null);
      if (this.swarmllm) {
        this.logger.info('SwarmVector swarmLLM native module loaded');
        this.swarmllmAvailable = true;
      }
    } catch {
      this.logger.debug('SwarmVector swarmLLM native module not available');
    }

    // Check if SwarmVector HTTP server is running
    const health = await this.doHealthCheck();
    if (health.healthy) {
      this.logger.info('SwarmVector server connected');
      return;
    }

    // Fallback: Check if Ollama is running for local model execution
    try {
      const ollamaHealth = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (ollamaHealth.ok) {
        this.useOllamaFallback = true;
        this.logger.info('Using Ollama as fallback for local model execution');
      }
    } catch {
      this.logger.warn('Neither SwarmVector nor Ollama available. Provider may not work.');
    }
  }

  protected async doComplete(request: LLMRequest): Promise<LLMResponse> {
    // Use Ollama fallback if SwarmVector server isn't available
    if (this.useOllamaFallback) {
      return this.completeWithOllama(request);
    }

    const swarmvectorRequest = this.buildSwarmvectorQuery(request);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout || 120000);

    try {
      // Use swarmLLM's /query endpoint (not OpenAI-compatible)
      const response = await fetch(`${this.baseUrl}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        },
        body: JSON.stringify(swarmvectorRequest),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = await response.json() as SwarmVectorResponse;
      return this.transformResponse(data, request);
    } catch (error) {
      clearTimeout(timeout);

      // Auto-fallback to Ollama on connection error
      if (error instanceof Error && (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed'))) {
        this.useOllamaFallback = true;
        this.logger.info('SwarmVector connection failed, falling back to Ollama');
        return this.completeWithOllama(request);
      }

      throw this.transformError(error);
    }
  }

  /**
   * Fallback completion using Ollama API
   */
  private async completeWithOllama(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.config.model;

    const ollamaRequest = {
      model,
      messages: request.messages.map((msg) => ({
        role: msg.role === 'tool' ? 'assistant' : msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      })),
      stream: false,
      options: {
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
        num_predict: request.maxTokens || this.config.maxTokens || 2048,
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout || 120000);

    try {
      const response = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ollamaRequest),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new LLMProviderError(
          `Ollama error: ${errorText}`,
          `OLLAMA_${response.status}`,
          'swarmvector',
          response.status,
          true
        );
      }

      const data = await response.json() as {
        message?: { content: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      const promptTokens = data.prompt_eval_count || this.estimateTokens(JSON.stringify(request.messages));
      const completionTokens = data.eval_count || this.estimateTokens(data.message?.content || '');

      return {
        id: `swarmvector-ollama-${Date.now()}`,
        model: model as LLMModel,
        provider: 'swarmvector',
        content: data.message?.content || '',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        cost: {
          promptCost: 0,
          completionCost: 0,
          totalCost: 0,
          currency: 'USD',
        },
        finishReason: 'stop',
        metadata: {
          backend: 'ollama',
          sona: { enabled: false },
        },
      };
    } catch (error) {
      clearTimeout(timeout);
      throw this.transformError(error);
    }
  }

  protected async *doStreamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    const swarmvectorRequest = this.buildRequest(request, true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (this.config.timeout || 120000) * 2);

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        },
        body: JSON.stringify(swarmvectorRequest),
        signal: controller.signal,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let promptTokens = 0;
      let completionTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const chunk: SwarmVectorResponse = JSON.parse(data);

              if (chunk.content) {
                yield {
                  type: 'content',
                  delta: { content: chunk.content },
                };
              }

              if (chunk.done && chunk.usage) {
                promptTokens = chunk.usage.prompt_tokens;
                completionTokens = chunk.usage.completion_tokens;

                yield {
                  type: 'done',
                  usage: {
                    promptTokens,
                    completionTokens,
                    totalTokens: promptTokens + completionTokens,
                  },
                  cost: {
                    promptCost: 0,
                    completionCost: 0,
                    totalCost: 0,
                    currency: 'USD',
                  },
                };
              }
            } catch {
              // Ignore parse errors
            }
          } else if (line.trim() && !line.startsWith(':')) {
            // Direct JSON response (non-SSE)
            try {
              const chunk: SwarmVectorResponse = JSON.parse(line);
              if (chunk.content) {
                yield {
                  type: 'content',
                  delta: { content: chunk.content },
                };
              }
            } catch {
              // Ignore
            }
          }
        }
      }

      // Ensure done event is sent
      if (completionTokens === 0) {
        yield {
          type: 'done',
          usage: {
            promptTokens: this.estimateTokens(JSON.stringify(request.messages)),
            completionTokens: 100,
            totalTokens: this.estimateTokens(JSON.stringify(request.messages)) + 100,
          },
          cost: { promptCost: 0, completionCost: 0, totalCost: 0, currency: 'USD' },
        };
      }
    } catch (error) {
      clearTimeout(timeout);
      throw this.transformError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async listModels(): Promise<LLMModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`);
      if (!response.ok) {
        return this.capabilities.supportedModels;
      }

      const data = await response.json() as { data?: Array<{ id: string }> };
      return data.data?.map((m) => m.id as LLMModel) || this.capabilities.supportedModels;
    } catch {
      return this.capabilities.supportedModels;
    }
  }

  async getModelInfo(model: LLMModel): Promise<ModelInfo> {
    const descriptions: Record<string, string> = {
      'swarmvector-auto': 'Auto-selects optimal model with SONA learning',
      'swarmvector-fast': 'Optimized for speed with FastGRNN routing',
      'swarmvector-quality': 'Highest quality with full SONA adaptation',
      'swarmvector-balanced': 'Balanced speed and quality',
      'llama3.2': 'Meta Llama 3.2 via SwarmVector',
      'mistral': 'Mistral 7B via SwarmVector',
      'phi-4': 'Microsoft Phi-4 via SwarmVector',
      'deepseek-coder': 'DeepSeek Coder via SwarmVector',
      'codellama': 'Code Llama via SwarmVector',
      'qwen2.5': 'Qwen 2.5 via SwarmVector',
    };

    return {
      model,
      name: model,
      description: descriptions[model] || 'SwarmVector-managed local model',
      contextLength: this.capabilities.maxContextLength[model] || 32000,
      maxOutputTokens: this.capabilities.maxOutputTokens[model] || 4096,
      supportedFeatures: [
        'chat',
        'completion',
        'local',
        'self-learning',
        'sona',
        'hnsw-memory',
      ],
      pricing: { promptCostPer1k: 0, completionCostPer1k: 0, currency: 'USD' },
    };
  }

  protected async doHealthCheck(): Promise<HealthCheckResult> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);

      if (response.ok) {
        const data = await response.json() as { sona?: boolean; hnsw?: boolean };
        return {
          healthy: true,
          timestamp: new Date(),
          details: {
            server: 'swarmvector',
            sona: data.sona ?? false,
            hnsw: data.hnsw ?? false,
            local: true,
          },
        };
      }

      return {
        healthy: false,
        error: `HTTP ${response.status}`,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'SwarmVector server not reachable',
        timestamp: new Date(),
        details: {
          hint: 'Start SwarmVector server: npx @swarmvector/swarmllm serve',
        },
      };
    }
  }

  /**
   * Build swarmLLM native API query format
   * See: https://github.com/ruvnet/swarmvector/tree/main/examples/swarmLLM
   */
  private buildSwarmvectorQuery(request: LLMRequest): { query: string; session_id?: string } {
    // swarmLLM uses simple query format, not OpenAI-compatible
    const lastUserMessage = [...request.messages].reverse().find(m => m.role === 'user');
    const systemPrompt = request.messages.find(m => m.role === 'system');

    let query = '';
    if (systemPrompt) {
      query += `[System]: ${typeof systemPrompt.content === 'string' ? systemPrompt.content : JSON.stringify(systemPrompt.content)}\n\n`;
    }
    query += typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : JSON.stringify(lastUserMessage?.content || '');

    return {
      query,
      session_id: request.requestId,
    };
  }

  private buildRequest(request: LLMRequest, stream = false): SwarmVectorRequest {
    const swarmvectorRequest: SwarmVectorRequest = {
      model: request.model || this.config.model,
      messages: request.messages.map((msg) => ({
        role: msg.role === 'tool' ? 'assistant' : msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      })),
      stream,
    };

    if (request.temperature !== undefined || this.config.temperature !== undefined) {
      swarmvectorRequest.temperature = request.temperature ?? this.config.temperature;
    }
    if (request.maxTokens || this.config.maxTokens) {
      swarmvectorRequest.max_tokens = request.maxTokens || this.config.maxTokens;
    }
    if (request.topP !== undefined || this.config.topP !== undefined) {
      swarmvectorRequest.top_p = request.topP ?? this.config.topP;
    }

    // SONA options
    if (this.swarmvectorConfig.enableSona !== false) {
      swarmvectorRequest.sona_options = {
        enabled: true,
        learning_rate: this.swarmvectorConfig.sonaLearningRate || 0.01,
        adapt_on_response: true,
      };
    }

    // Router options
    if (this.swarmvectorConfig.enableFastGrnn !== false) {
      swarmvectorRequest.router_options = {
        strategy: this.swarmvectorConfig.routerStrategy || 'balanced',
        fallback_models: ['llama3.2', 'mistral', 'phi-4'],
      };
    }

    return swarmvectorRequest;
  }

  private transformResponse(data: SwarmVectorResponse, request: LLMRequest): LLMResponse {
    const model = request.model || this.config.model;

    return {
      id: data.id || `swarmvector-${Date.now()}`,
      model: (data.model || model) as LLMModel,
      provider: 'custom',
      content: data.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      cost: {
        promptCost: 0,
        completionCost: 0,
        totalCost: 0,
        currency: 'USD',
      },
      finishReason: data.done ? 'stop' : 'length',
      metadata: {
        sona: data.sona_metrics,
        router: data.router_metrics,
      },
    };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const errorText = await response.text();
    let errorData: { error?: string };

    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText };
    }

    const message = errorData.error || 'Unknown error';

    if (response.status === 0 || message.includes('connection')) {
      throw new ProviderUnavailableError('custom', {
        message,
        hint: 'Start SwarmVector server: npx @swarmvector/swarmllm serve',
      });
    }

    throw new LLMProviderError(
      message,
      `SWARMVECTOR_${response.status}`,
      'custom',
      response.status,
      true,
      errorData
    );
  }

  /**
   * Get SONA learning metrics
   */
  async getSonaMetrics(): Promise<{
    enabled: boolean;
    adaptationsApplied: number;
    qualityScore: number;
    patternsLearned: number;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/sona/metrics`);
      if (response.ok) {
        return await response.json() as {
          enabled: boolean;
          adaptationsApplied: number;
          qualityScore: number;
          patternsLearned: number;
        };
      }
    } catch {
      // Ignore
    }

    return {
      enabled: false,
      adaptationsApplied: 0,
      qualityScore: 0,
      patternsLearned: 0,
    };
  }

  /**
   * Trigger SONA learning from a conversation
   */
  async triggerSonaLearning(conversationId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/sona/learn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Search HNSW memory for similar patterns
   */
  async searchMemory(query: string, limit = 5): Promise<Array<{
    id: string;
    similarity: number;
    content: string;
  }>> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/hnsw/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit }),
      });

      if (response.ok) {
        return await response.json() as Array<{ id: string; similarity: number; content: string }>;
      }
    } catch {
      // Ignore
    }

    return [];
  }
}
