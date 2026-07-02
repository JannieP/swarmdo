import { LLMProvider, ChatParams, ChatResponse, StreamChunk, ProviderConfig } from '../types.js';
export declare class OllamaProvider implements LLMProvider {
    name: string;
    type: "ollama";
    supportsStreaming: boolean;
    supportsTools: boolean;
    supportsMCP: boolean;
    private client;
    private config;
    constructor(config: ProviderConfig);
    validateCapabilities(features: string[]): boolean;
    chat(params: ChatParams): Promise<ChatResponse>;
    stream(params: ChatParams): AsyncGenerator<StreamChunk>;
    private formatRequest;
    private formatResponse;
    private formatStreamChunk;
    private mapFinishReason;
    private handleError;
}
//# sourceMappingURL=ollama.d.ts.map