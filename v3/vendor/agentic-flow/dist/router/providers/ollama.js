// Ollama provider - OpenAI-compatible chat completions
// Works with both ollama.com Cloud (requires OLLAMA_API_KEY) and self-hosted
// (typically http://localhost:11434, no API key required).
import axios from 'axios';
const DEFAULT_BASE_URL = 'http://localhost:11434';
export class OllamaProvider {
    name = 'ollama';
    type = 'ollama';
    supportsStreaming = true;
    supportsTools = true;
    supportsMCP = false; // Requires translation
    client;
    config;
    constructor(config) {
        this.config = config;
        const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/{1,512}$/, '');
        const headers = {
            'Content-Type': 'application/json',
        };
        // API key is optional for self-hosted Ollama; required for ollama.com Cloud
        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }
        this.client = axios.create({
            baseURL: baseUrl,
            headers,
            timeout: config.timeout || 180000,
        });
    }
    validateCapabilities(features) {
        const supported = ['chat', 'streaming', 'tools'];
        return features.every((f) => supported.includes(f));
    }
    async chat(params) {
        try {
            const body = this.formatRequest(params, false);
            const response = await this.client.post('/v1/chat/completions', body);
            return this.formatResponse(response.data, params.model);
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async *stream(params) {
        try {
            const body = this.formatRequest(params, true);
            const response = await this.client.post('/v1/chat/completions', body, {
                responseType: 'stream',
            });
            let buffer = '';
            for await (const chunk of response.data) {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data: '))
                        continue;
                    const data = trimmed.slice(6);
                    if (data === '[DONE]') {
                        yield { type: 'message_stop' };
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const out = this.formatStreamChunk(parsed);
                        if (out)
                            yield out;
                    }
                    catch {
                        // skip malformed chunks
                    }
                }
            }
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    formatRequest(params, stream) {
        const messages = params.messages.map((msg) => ({
            role: msg.role,
            content: typeof msg.content === 'string'
                ? msg.content
                : msg.content
                    .map((block) => {
                    if (block.type === 'text')
                        return block.text || '';
                    if (block.type === 'tool_use')
                        return JSON.stringify({
                            tool: block.name,
                            input: block.input,
                        });
                    if (block.type === 'tool_result')
                        return typeof block.content === 'string'
                            ? block.content
                            : JSON.stringify(block.content);
                    return '';
                })
                    .join('\n'),
        }));
        const body = {
            model: params.model,
            messages,
            temperature: params.temperature ?? 0.7,
            stream,
        };
        if (params.maxTokens) {
            body.max_tokens = params.maxTokens;
        }
        if (params.tools && params.tools.length > 0) {
            body.tools = params.tools.map((tool) => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.input_schema,
                },
            }));
            if (params.toolChoice) {
                if (params.toolChoice === 'auto' || params.toolChoice === 'none') {
                    body.tool_choice = params.toolChoice;
                }
                else if (typeof params.toolChoice === 'object') {
                    body.tool_choice = {
                        type: 'function',
                        function: { name: params.toolChoice.name },
                    };
                }
            }
        }
        return body;
    }
    formatResponse(data, model) {
        const choice = data.choices?.[0];
        if (!choice) {
            throw new Error(`Ollama returned no choices: ${JSON.stringify(data).slice(0, 200)}`);
        }
        const message = choice.message ?? {};
        const content = [];
        if (message.content) {
            content.push({ type: 'text', text: String(message.content) });
        }
        if (Array.isArray(message.tool_calls)) {
            for (const tc of message.tool_calls) {
                const fnName = tc.function?.name;
                const fnArgs = tc.function?.arguments;
                if (!fnName)
                    continue;
                let parsedInput = {};
                if (typeof fnArgs === 'string') {
                    try {
                        parsedInput = JSON.parse(fnArgs);
                    }
                    catch {
                        parsedInput = { raw: fnArgs };
                    }
                }
                else if (fnArgs && typeof fnArgs === 'object') {
                    parsedInput = fnArgs;
                }
                content.push({
                    type: 'tool_use',
                    id: tc.id || `ollama-${Date.now()}-${content.length}`,
                    name: fnName,
                    input: parsedInput,
                });
            }
        }
        return {
            id: data.id || `ollama-${Date.now()}`,
            model: data.model || model,
            content,
            stopReason: this.mapFinishReason(choice.finish_reason),
            usage: {
                inputTokens: data.usage?.prompt_tokens ?? 0,
                outputTokens: data.usage?.completion_tokens ?? 0,
            },
            metadata: {
                provider: 'ollama',
                cost: 0, // self-hosted = free; cloud users track via their plan
                latency: 0, // set by router
            },
        };
    }
    formatStreamChunk(data) {
        const choice = data.choices?.[0];
        if (!choice)
            return null;
        const delta = choice.delta;
        if (delta?.content) {
            return {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: delta.content },
            };
        }
        if (delta?.tool_calls?.length) {
            const tc = delta.tool_calls[0];
            return {
                type: 'content_block_delta',
                delta: {
                    type: 'input_json_delta',
                    partial_json: tc.function?.arguments || '',
                },
            };
        }
        if (choice.finish_reason) {
            return {
                type: 'message_stop',
                usage: data.usage
                    ? {
                        inputTokens: data.usage.prompt_tokens || 0,
                        outputTokens: data.usage.completion_tokens || 0,
                    }
                    : undefined,
            };
        }
        return null;
    }
    mapFinishReason(reason) {
        switch (reason) {
            case 'stop':
                return 'end_turn';
            case 'length':
                return 'max_tokens';
            case 'tool_calls':
                return 'tool_use';
            default:
                return 'end_turn';
        }
    }
    handleError(error) {
        const wrapped = new Error(`Ollama provider error: ${error?.response?.data?.error?.message || error.message}`);
        wrapped.provider = 'ollama';
        wrapped.statusCode = error?.response?.status;
        // Network / 5xx are retryable; 4xx (other than 429) are not
        const status = wrapped.statusCode ?? 0;
        wrapped.retryable = !status || status >= 500 || status === 429;
        return wrapped;
    }
}
//# sourceMappingURL=ollama.js.map