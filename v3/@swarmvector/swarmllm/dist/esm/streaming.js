/**
 * Streaming response support for SwarmLLM
 */
/**
 * Async generator for streaming responses
 *
 * @example
 * ```typescript
 * import { SwarmLLM, StreamingGenerator } from '@swarmvector/swarmllm';
 *
 * const llm = new SwarmLLM();
 * const streamer = new StreamingGenerator(llm);
 *
 * // Stream with async iterator
 * for await (const chunk of streamer.stream('Write a story')) {
 *   process.stdout.write(chunk.text);
 * }
 *
 * // Stream with callbacks
 * await streamer.streamWithCallbacks('Write a poem', {
 *   onChunk: (chunk) => console.log(chunk.text),
 *   onComplete: (response) => console.log('Done!', response.latencyMs),
 * });
 * ```
 */
export class StreamingGenerator {
    constructor(llm) {
        this.llm = llm;
    }
    /**
     * Stream response as async generator
     *
     * Note: This simulates streaming by chunking the full response.
     * Native streaming requires native module support.
     */
    async *stream(prompt, config) {
        const start = Date.now();
        // Generate full response (native streaming would yield real chunks)
        const fullText = this.llm.generate(prompt, config);
        // Simulate streaming by yielding words
        const words = fullText.split(/(\s+)/);
        let accumulated = '';
        let tokenCount = 0;
        for (let i = 0; i < words.length; i++) {
            accumulated += words[i];
            tokenCount++;
            // Yield every few tokens or at end
            if (tokenCount % 3 === 0 || i === words.length - 1) {
                yield {
                    text: words.slice(Math.max(0, i - 2), i + 1).join(''),
                    done: i === words.length - 1,
                    tokenCount,
                    latencyMs: Date.now() - start,
                };
                // Small delay to simulate streaming
                await this.delay(10);
            }
        }
    }
    /**
     * Stream with callback handlers
     */
    async streamWithCallbacks(prompt, options) {
        const start = Date.now();
        let fullText = '';
        let tokenCount = 0;
        try {
            for await (const chunk of this.stream(prompt, options)) {
                fullText += chunk.text;
                tokenCount = chunk.tokenCount;
                if (options.onChunk) {
                    options.onChunk(chunk);
                }
            }
            const response = {
                text: fullText.trim(),
                confidence: 0.8,
                model: 'streaming',
                contextSize: tokenCount,
                latencyMs: Date.now() - start,
                requestId: `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            };
            if (options.onComplete) {
                options.onComplete(response);
            }
            return response;
        }
        catch (error) {
            if (options.onError) {
                options.onError(error);
            }
            throw error;
        }
    }
    /**
     * Collect stream into single response
     */
    async collect(prompt, config) {
        let result = '';
        for await (const chunk of this.stream(prompt, config)) {
            result = chunk.text; // Each chunk is cumulative
        }
        return result.trim();
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
/**
 * Create a readable stream from response
 * (For Node.js stream compatibility)
 */
export function createReadableStream(generator) {
    return new ReadableStream({
        async pull(controller) {
            const { value, done } = await generator.next();
            if (done) {
                controller.close();
            }
            else {
                controller.enqueue(value.text);
            }
        },
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyZWFtaW5nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N0cmVhbWluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7R0FFRztBQVNIOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FxQkc7QUFDSCxNQUFNLE9BQU8sa0JBQWtCO0lBTTdCLFlBQVksR0FHWDtRQUNDLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0lBQ2pCLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FDWCxNQUFjLEVBQ2QsTUFBeUI7UUFFekIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBRXpCLG9FQUFvRTtRQUNwRSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFbkQsdUNBQXVDO1FBQ3ZDLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdEMsSUFBSSxXQUFXLEdBQUcsRUFBRSxDQUFDO1FBQ3JCLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztRQUVuQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3RDLFdBQVcsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEIsVUFBVSxFQUFFLENBQUM7WUFFYixtQ0FBbUM7WUFDbkMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDbkQsTUFBTTtvQkFDSixJQUFJLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ3JELElBQUksRUFBRSxDQUFDLEtBQUssS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDO29CQUM1QixVQUFVO29CQUNWLFNBQVMsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsS0FBSztpQkFDOUIsQ0FBQztnQkFFRixvQ0FBb0M7Z0JBQ3BDLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN2QixDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxtQkFBbUIsQ0FDdkIsTUFBYyxFQUNkLE9BQXNCO1FBRXRCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN6QixJQUFJLFFBQVEsR0FBRyxFQUFFLENBQUM7UUFDbEIsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO1FBRW5CLElBQUksQ0FBQztZQUNILElBQUksS0FBSyxFQUFFLE1BQU0sS0FBSyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZELFFBQVEsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDO2dCQUN2QixVQUFVLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQztnQkFFOUIsSUFBSSxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ3BCLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3pCLENBQUM7WUFDSCxDQUFDO1lBRUQsTUFBTSxRQUFRLEdBQWtCO2dCQUM5QixJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRTtnQkFDckIsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsS0FBSyxFQUFFLFdBQVc7Z0JBQ2xCLFdBQVcsRUFBRSxVQUFVO2dCQUN2QixTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLEtBQUs7Z0JBQzdCLFNBQVMsRUFBRSxVQUFVLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRTthQUN6RSxDQUFDO1lBRUYsSUFBSSxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ3ZCLE9BQU8sQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDL0IsQ0FBQztZQUVELE9BQU8sUUFBUSxDQUFDO1FBQ2xCLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsSUFBSSxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ3BCLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBYyxDQUFDLENBQUM7WUFDbEMsQ0FBQztZQUNELE1BQU0sS0FBSyxDQUFDO1FBQ2QsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBYyxFQUFFLE1BQXlCO1FBQ3JELElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNoQixJQUFJLEtBQUssRUFBRSxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ3RELE1BQU0sR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsMkJBQTJCO1FBQ2xELENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBRU8sS0FBSyxDQUFDLEVBQVU7UUFDdEIsT0FBTyxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN6RCxDQUFDO0NBQ0Y7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsb0JBQW9CLENBQ2xDLFNBQXNDO0lBRXRDLE9BQU8sSUFBSSxjQUFjLENBQUM7UUFDeEIsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVO1lBQ25CLE1BQU0sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsTUFBTSxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDL0MsSUFBSSxJQUFJLEVBQUUsQ0FBQztnQkFDVCxVQUFVLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDckIsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2pDLENBQUM7UUFDSCxDQUFDO0tBQ0YsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogU3RyZWFtaW5nIHJlc3BvbnNlIHN1cHBvcnQgZm9yIFJ1ZkxMTVxuICovXG5cbmltcG9ydCB7XG4gIFN0cmVhbUNodW5rLFxuICBTdHJlYW1PcHRpb25zLFxuICBRdWVyeVJlc3BvbnNlLFxuICBHZW5lcmF0aW9uQ29uZmlnLFxufSBmcm9tICcuL3R5cGVzJztcblxuLyoqXG4gKiBBc3luYyBnZW5lcmF0b3IgZm9yIHN0cmVhbWluZyByZXNwb25zZXNcbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogaW1wb3J0IHsgUnVmTExNLCBTdHJlYW1pbmdHZW5lcmF0b3IgfSBmcm9tICdAcnVmdmVjdG9yL3J1ZmxsbSc7XG4gKlxuICogY29uc3QgbGxtID0gbmV3IFJ1ZkxMTSgpO1xuICogY29uc3Qgc3RyZWFtZXIgPSBuZXcgU3RyZWFtaW5nR2VuZXJhdG9yKGxsbSk7XG4gKlxuICogLy8gU3RyZWFtIHdpdGggYXN5bmMgaXRlcmF0b3JcbiAqIGZvciBhd2FpdCAoY29uc3QgY2h1bmsgb2Ygc3RyZWFtZXIuc3RyZWFtKCdXcml0ZSBhIHN0b3J5JykpIHtcbiAqICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY2h1bmsudGV4dCk7XG4gKiB9XG4gKlxuICogLy8gU3RyZWFtIHdpdGggY2FsbGJhY2tzXG4gKiBhd2FpdCBzdHJlYW1lci5zdHJlYW1XaXRoQ2FsbGJhY2tzKCdXcml0ZSBhIHBvZW0nLCB7XG4gKiAgIG9uQ2h1bms6IChjaHVuaykgPT4gY29uc29sZS5sb2coY2h1bmsudGV4dCksXG4gKiAgIG9uQ29tcGxldGU6IChyZXNwb25zZSkgPT4gY29uc29sZS5sb2coJ0RvbmUhJywgcmVzcG9uc2UubGF0ZW5jeU1zKSxcbiAqIH0pO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBTdHJlYW1pbmdHZW5lcmF0b3Ige1xuICBwcml2YXRlIGxsbToge1xuICAgIGdlbmVyYXRlOiAocHJvbXB0OiBzdHJpbmcsIGNvbmZpZz86IEdlbmVyYXRpb25Db25maWcpID0+IHN0cmluZztcbiAgICBxdWVyeTogKHRleHQ6IHN0cmluZywgY29uZmlnPzogR2VuZXJhdGlvbkNvbmZpZykgPT4gUXVlcnlSZXNwb25zZTtcbiAgfTtcblxuICBjb25zdHJ1Y3RvcihsbG06IHtcbiAgICBnZW5lcmF0ZTogKHByb21wdDogc3RyaW5nLCBjb25maWc/OiBHZW5lcmF0aW9uQ29uZmlnKSA9PiBzdHJpbmc7XG4gICAgcXVlcnk6ICh0ZXh0OiBzdHJpbmcsIGNvbmZpZz86IEdlbmVyYXRpb25Db25maWcpID0+IFF1ZXJ5UmVzcG9uc2U7XG4gIH0pIHtcbiAgICB0aGlzLmxsbSA9IGxsbTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdHJlYW0gcmVzcG9uc2UgYXMgYXN5bmMgZ2VuZXJhdG9yXG4gICAqXG4gICAqIE5vdGU6IFRoaXMgc2ltdWxhdGVzIHN0cmVhbWluZyBieSBjaHVua2luZyB0aGUgZnVsbCByZXNwb25zZS5cbiAgICogTmF0aXZlIHN0cmVhbWluZyByZXF1aXJlcyBuYXRpdmUgbW9kdWxlIHN1cHBvcnQuXG4gICAqL1xuICBhc3luYyAqc3RyZWFtKFxuICAgIHByb21wdDogc3RyaW5nLFxuICAgIGNvbmZpZz86IEdlbmVyYXRpb25Db25maWdcbiAgKTogQXN5bmNHZW5lcmF0b3I8U3RyZWFtQ2h1bms+IHtcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG5cbiAgICAvLyBHZW5lcmF0ZSBmdWxsIHJlc3BvbnNlIChuYXRpdmUgc3RyZWFtaW5nIHdvdWxkIHlpZWxkIHJlYWwgY2h1bmtzKVxuICAgIGNvbnN0IGZ1bGxUZXh0ID0gdGhpcy5sbG0uZ2VuZXJhdGUocHJvbXB0LCBjb25maWcpO1xuXG4gICAgLy8gU2ltdWxhdGUgc3RyZWFtaW5nIGJ5IHlpZWxkaW5nIHdvcmRzXG4gICAgY29uc3Qgd29yZHMgPSBmdWxsVGV4dC5zcGxpdCgvKFxccyspLyk7XG4gICAgbGV0IGFjY3VtdWxhdGVkID0gJyc7XG4gICAgbGV0IHRva2VuQ291bnQgPSAwO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB3b3Jkcy5sZW5ndGg7IGkrKykge1xuICAgICAgYWNjdW11bGF0ZWQgKz0gd29yZHNbaV07XG4gICAgICB0b2tlbkNvdW50Kys7XG5cbiAgICAgIC8vIFlpZWxkIGV2ZXJ5IGZldyB0b2tlbnMgb3IgYXQgZW5kXG4gICAgICBpZiAodG9rZW5Db3VudCAlIDMgPT09IDAgfHwgaSA9PT0gd29yZHMubGVuZ3RoIC0gMSkge1xuICAgICAgICB5aWVsZCB7XG4gICAgICAgICAgdGV4dDogd29yZHMuc2xpY2UoTWF0aC5tYXgoMCwgaSAtIDIpLCBpICsgMSkuam9pbignJyksXG4gICAgICAgICAgZG9uZTogaSA9PT0gd29yZHMubGVuZ3RoIC0gMSxcbiAgICAgICAgICB0b2tlbkNvdW50LFxuICAgICAgICAgIGxhdGVuY3lNczogRGF0ZS5ub3coKSAtIHN0YXJ0LFxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIFNtYWxsIGRlbGF5IHRvIHNpbXVsYXRlIHN0cmVhbWluZ1xuICAgICAgICBhd2FpdCB0aGlzLmRlbGF5KDEwKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU3RyZWFtIHdpdGggY2FsbGJhY2sgaGFuZGxlcnNcbiAgICovXG4gIGFzeW5jIHN0cmVhbVdpdGhDYWxsYmFja3MoXG4gICAgcHJvbXB0OiBzdHJpbmcsXG4gICAgb3B0aW9uczogU3RyZWFtT3B0aW9uc1xuICApOiBQcm9taXNlPFF1ZXJ5UmVzcG9uc2U+IHtcbiAgICBjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG4gICAgbGV0IGZ1bGxUZXh0ID0gJyc7XG4gICAgbGV0IHRva2VuQ291bnQgPSAwO1xuXG4gICAgdHJ5IHtcbiAgICAgIGZvciBhd2FpdCAoY29uc3QgY2h1bmsgb2YgdGhpcy5zdHJlYW0ocHJvbXB0LCBvcHRpb25zKSkge1xuICAgICAgICBmdWxsVGV4dCArPSBjaHVuay50ZXh0O1xuICAgICAgICB0b2tlbkNvdW50ID0gY2h1bmsudG9rZW5Db3VudDtcblxuICAgICAgICBpZiAob3B0aW9ucy5vbkNodW5rKSB7XG4gICAgICAgICAgb3B0aW9ucy5vbkNodW5rKGNodW5rKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCByZXNwb25zZTogUXVlcnlSZXNwb25zZSA9IHtcbiAgICAgICAgdGV4dDogZnVsbFRleHQudHJpbSgpLFxuICAgICAgICBjb25maWRlbmNlOiAwLjgsXG4gICAgICAgIG1vZGVsOiAnc3RyZWFtaW5nJyxcbiAgICAgICAgY29udGV4dFNpemU6IHRva2VuQ291bnQsXG4gICAgICAgIGxhdGVuY3lNczogRGF0ZS5ub3coKSAtIHN0YXJ0LFxuICAgICAgICByZXF1ZXN0SWQ6IGBzdHJlYW0tJHtEYXRlLm5vdygpfS0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpfWAsXG4gICAgICB9O1xuXG4gICAgICBpZiAob3B0aW9ucy5vbkNvbXBsZXRlKSB7XG4gICAgICAgIG9wdGlvbnMub25Db21wbGV0ZShyZXNwb25zZSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKG9wdGlvbnMub25FcnJvcikge1xuICAgICAgICBvcHRpb25zLm9uRXJyb3IoZXJyb3IgYXMgRXJyb3IpO1xuICAgICAgfVxuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENvbGxlY3Qgc3RyZWFtIGludG8gc2luZ2xlIHJlc3BvbnNlXG4gICAqL1xuICBhc3luYyBjb2xsZWN0KHByb21wdDogc3RyaW5nLCBjb25maWc/OiBHZW5lcmF0aW9uQ29uZmlnKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBsZXQgcmVzdWx0ID0gJyc7XG4gICAgZm9yIGF3YWl0IChjb25zdCBjaHVuayBvZiB0aGlzLnN0cmVhbShwcm9tcHQsIGNvbmZpZykpIHtcbiAgICAgIHJlc3VsdCA9IGNodW5rLnRleHQ7IC8vIEVhY2ggY2h1bmsgaXMgY3VtdWxhdGl2ZVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0LnRyaW0oKTtcbiAgfVxuXG4gIHByaXZhdGUgZGVsYXkobXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgbXMpKTtcbiAgfVxufVxuXG4vKipcbiAqIENyZWF0ZSBhIHJlYWRhYmxlIHN0cmVhbSBmcm9tIHJlc3BvbnNlXG4gKiAoRm9yIE5vZGUuanMgc3RyZWFtIGNvbXBhdGliaWxpdHkpXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSZWFkYWJsZVN0cmVhbShcbiAgZ2VuZXJhdG9yOiBBc3luY0dlbmVyYXRvcjxTdHJlYW1DaHVuaz5cbik6IFJlYWRhYmxlU3RyZWFtPHN0cmluZz4ge1xuICByZXR1cm4gbmV3IFJlYWRhYmxlU3RyZWFtKHtcbiAgICBhc3luYyBwdWxsKGNvbnRyb2xsZXIpIHtcbiAgICAgIGNvbnN0IHsgdmFsdWUsIGRvbmUgfSA9IGF3YWl0IGdlbmVyYXRvci5uZXh0KCk7XG4gICAgICBpZiAoZG9uZSkge1xuICAgICAgICBjb250cm9sbGVyLmNsb3NlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb250cm9sbGVyLmVucXVldWUodmFsdWUudGV4dCk7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG59XG4iXX0=