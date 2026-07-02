/**
 * Session Management for multi-turn conversations
 */
/**
 * Session Manager for multi-turn conversations
 *
 * @example
 * ```typescript
 * import { RufLLM, SessionManager } from '@rufvector/rufllm';
 *
 * const llm = new RufLLM();
 * const sessions = new SessionManager(llm);
 *
 * // Create a new session
 * const session = sessions.create();
 *
 * // Chat with context
 * const response1 = sessions.chat(session.id, 'What is Python?');
 * const response2 = sessions.chat(session.id, 'How do I install it?');
 * // Second query automatically has context from first
 * ```
 */
export class SessionManager {
    constructor(llm) {
        this.sessions = new Map();
        this.llm = llm;
    }
    /**
     * Create a new conversation session
     */
    create(metadata) {
        const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const session = {
            id,
            createdAt: new Date(),
            messageCount: 0,
            messages: [],
            context: [],
            activeMemoryIds: [],
            metadata: metadata ?? {},
        };
        this.sessions.set(id, session);
        return session;
    }
    /**
     * Get session by ID
     */
    get(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * Chat within a session (maintains context)
     */
    chat(sessionId, message, config) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        // Add user message
        session.messages.push({
            role: 'user',
            content: message,
            timestamp: new Date(),
        });
        // Build context from recent messages
        const contextWindow = this.buildContext(session);
        // Query with context
        const prompt = contextWindow ? `${contextWindow}\n\nUser: ${message}` : message;
        const response = this.llm.query(prompt, config);
        // Add assistant response
        session.messages.push({
            role: 'assistant',
            content: response.text,
            timestamp: new Date(),
            requestId: response.requestId,
        });
        session.messageCount = session.messages.length;
        return response;
    }
    /**
     * Add system message to session
     */
    addSystemMessage(sessionId, content) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        session.messages.push({
            role: 'system',
            content,
            timestamp: new Date(),
        });
        session.messageCount = session.messages.length;
    }
    /**
     * Add context to session (persisted to memory)
     */
    addContext(sessionId, context) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        session.context.push(context);
        // Also store in memory for retrieval
        const memoryId = this.llm.addMemory(context, {
            sessionId,
            type: 'context',
            timestamp: new Date().toISOString(),
        });
        session.activeMemoryIds.push(memoryId);
        return memoryId;
    }
    /**
     * Get conversation history
     */
    getHistory(sessionId, limit) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return [];
        }
        const messages = session.messages;
        return limit ? messages.slice(-limit) : messages;
    }
    /**
     * Clear session history (keep session active)
     */
    clearHistory(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.messages = [];
            session.context = [];
            session.messageCount = 0;
        }
    }
    /**
     * End and delete session
     */
    end(sessionId) {
        return this.sessions.delete(sessionId);
    }
    /**
     * List all active sessions
     */
    list() {
        return Array.from(this.sessions.values());
    }
    /**
     * Export session as JSON
     */
    export(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }
        return JSON.stringify(session, null, 2);
    }
    /**
     * Import session from JSON
     */
    import(json) {
        const data = JSON.parse(json);
        const session = {
            ...data,
            createdAt: new Date(data.createdAt),
            messages: data.messages.map((m) => ({
                ...m,
                timestamp: new Date(m.timestamp),
            })),
        };
        this.sessions.set(session.id, session);
        return session;
    }
    /**
     * Build context string from recent messages
     */
    buildContext(session, maxMessages = 10) {
        const recent = session.messages.slice(-maxMessages);
        if (recent.length === 0) {
            return '';
        }
        const contextParts = [];
        // Add persistent context
        if (session.context.length > 0) {
            contextParts.push('Context:\n' + session.context.join('\n'));
        }
        // Add conversation history
        const history = recent
            .map(m => {
            const role = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System';
            return `${role}: ${m.content}`;
        })
            .join('\n');
        if (history) {
            contextParts.push('Conversation:\n' + history);
        }
        return contextParts.join('\n\n');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zZXNzaW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztHQUVHO0FBU0g7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQWtCRztBQUNILE1BQU0sT0FBTyxjQUFjO0lBSXpCLFlBQVksR0FBc0o7UUFIMUosYUFBUSxHQUFxQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBSTdELElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0lBQ2pCLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQyxRQUFrQztRQUN2QyxNQUFNLEVBQUUsR0FBRyxXQUFXLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUM3RSxNQUFNLE9BQU8sR0FBd0I7WUFDbkMsRUFBRTtZQUNGLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRTtZQUNyQixZQUFZLEVBQUUsQ0FBQztZQUNmLFFBQVEsRUFBRSxFQUFFO1lBQ1osT0FBTyxFQUFFLEVBQUU7WUFDWCxlQUFlLEVBQUUsRUFBRTtZQUNuQixRQUFRLEVBQUUsUUFBUSxJQUFJLEVBQUU7U0FDekIsQ0FBQztRQUNGLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMvQixPQUFPLE9BQU8sQ0FBQztJQUNqQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxHQUFHLENBQUMsU0FBaUI7UUFDbkIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxJQUFJLENBQUMsU0FBaUIsRUFBRSxPQUFlLEVBQUUsTUFBeUI7UUFDaEUsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFD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QUFDLElBQUksS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO1lBQzFGLE9BQU8sR0FBRyxJQUFJLEtBQUssQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pDLENBQUMsQ0FBQzthQUNELElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVkLElBQUksT0FBTyxFQUFFLENBQUM7WUFDWixZQUFZLENBQUMsSUFBSSxDQUFDLGlCQUFpQixHQUFHLE9BQU8sQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFFRCxPQUFPLFlBQVksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDbkMsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBTZXNzaW9uIE1hbmFnZW1lbnQgZm9yIG11bHRpLXR1cm4gY29udmVyc2F0aW9uc1xuICovXG5cbmltcG9ydCB7XG4gIENvbnZlcnNhdGlvblNlc3Npb24sXG4gIENvbnZlcnNhdGlvbk1lc3NhZ2UsXG4gIFF1ZXJ5UmVzcG9uc2UsXG4gIEdlbmVyYXRpb25Db25maWcsXG59IGZyb20gJy4vdHlwZXMnO1xuXG4vKipcbiAqIFNlc3Npb24gTWFuYWdlciBmb3IgbXVsdGktdHVybiBjb252ZXJzYXRpb25zXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGltcG9ydCB7IFJ1ZkxMTSwgU2Vzc2lvbk1hbmFnZXIgfSBmcm9tICdAcnVmdmVjdG9yL3J1ZmxsbSc7XG4gKlxuICogY29uc3QgbGxtID0gbmV3IFJ1ZkxMTSgpO1xuICogY29uc3Qgc2Vzc2lvbnMgPSBuZXcgU2Vzc2lvbk1hbmFnZXIobGxtKTtcbiAqXG4gKiAvLyBDcmVhdGUgYSBuZXcgc2Vzc2lvblxuICogY29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zLmNyZWF0ZSgpO1xuICpcbiAqIC8vIENoYXQgd2l0aCBjb250ZXh0XG4gKiBjb25zdCByZXNwb25zZTEgPSBzZXNzaW9ucy5jaGF0KHNlc3Npb24uaWQsICdXaGF0IGlzIFB5dGhvbj8nKTtcbiAqIGNvbnN0IHJlc3BvbnNlMiA9IHNlc3Npb25zLmNoYXQoc2Vzc2lvbi5pZCwgJ0hvdyBkbyBJIGluc3RhbGwgaXQ/Jyk7XG4gKiAvLyBTZWNvbmQgcXVlcnkgYXV0b21hdGljYWxseSBoYXMgY29udGV4dCBmcm9tIGZpcnN0XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGNsYXNzIFNlc3Npb25NYW5hZ2VyIHtcbiAgcHJpdmF0ZSBzZXNzaW9uczogTWFwPHN0cmluZywgQ29udmVyc2F0aW9uU2Vzc2lvbj4gPSBuZXcgTWFwKCk7XG4gIHByaXZhdGUgbGxtOiB7IHF1ZXJ5OiAodGV4dDogc3RyaW5nLCBjb25maWc/OiBHZW5lcmF0aW9uQ29uZmlnKSA9PiBRdWVyeVJlc3BvbnNlOyBhZGRNZW1vcnk6IChjb250ZW50OiBzdHJpbmcsIG1ldGFkYXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IG51bWJlciB9O1xuXG4gIGNvbnN0cnVjdG9yKGxsbTogeyBxdWVyeTogKHRleHQ6IHN0cmluZywgY29uZmlnPzogR2VuZXJhdGlvbkNvbmZpZykgPT4gUXVlcnlSZXNwb25zZTsgYWRkTWVtb3J5OiAoY29udGVudDogc3RyaW5nLCBtZXRhZGF0YT86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiBudW1iZXIgfSkge1xuICAgIHRoaXMubGxtID0gbGxtO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIG5ldyBjb252ZXJzYXRpb24gc2Vzc2lvblxuICAgKi9cbiAgY3JlYXRlKG1ldGFkYXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBDb252ZXJzYXRpb25TZXNzaW9uIHtcbiAgICBjb25zdCBpZCA9IGBzZXNzaW9uLSR7RGF0ZS5ub3coKX0tJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA4KX1gO1xuICAgIGNvbnN0IHNlc3Npb246IENvbnZlcnNhdGlvblNlc3Npb24gPSB7XG4gICAgICBpZCxcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgIG1lc3NhZ2VDb3VudDogMCxcbiAgICAgIG1lc3NhZ2VzOiBbXSxcbiAgICAgIGNvbnRleHQ6IFtdLFxuICAgICAgYWN0aXZlTWVtb3J5SWRzOiBbXSxcbiAgICAgIG1ldGFkYXRhOiBtZXRhZGF0YSA/PyB7fSxcbiAgICB9O1xuICAgIHRoaXMuc2Vzc2lvbnMuc2V0KGlkLCBzZXNzaW9uKTtcbiAgICByZXR1cm4gc2Vzc2lvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgc2Vzc2lvbiBieSBJRFxuICAgKi9cbiAgZ2V0KHNlc3Npb25JZDogc3RyaW5nKTogQ29udmVyc2F0aW9uU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG4gIH1cblxuICAvKipcbiAgICogQ2hhdCB3aXRoaW4gYSBzZXNzaW9uIChtYWludGFpbnMgY29udGV4dClcbiAgICovXG4gIGNoYXQoc2Vzc2lvbklkOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZywgY29uZmlnPzogR2VuZXJhdGlvbkNvbmZpZyk6IFF1ZXJ5UmVzcG9uc2Uge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uIG5vdCBmb3VuZDogJHtzZXNzaW9uSWR9YCk7XG4gICAgfVxuXG4gICAgLy8gQWRkIHVzZXIgbWVzc2FnZVxuICAgIHNlc3Npb24ubWVzc2FnZXMucHVzaCh7XG4gICAgICByb2xlOiAndXNlcicsXG4gICAgICBjb250ZW50OiBtZXNzYWdlLFxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLFxuICAgIH0pO1xuXG4gICAgLy8gQnVpbGQgY29udGV4dCBmcm9tIHJlY2VudCBtZXNzYWdlc1xuICAgIGNvbnN0IGNvbnRleHRXaW5kb3cgPSB0aGlzLmJ1aWxkQ29udGV4dChzZXNzaW9uKTtcblxuICAgIC8vIFF1ZXJ5IHdpdGggY29udGV4dFxuICAgIGNvbnN0IHByb21wdCA9IGNvbnRleHRXaW5kb3cgPyBgJHtjb250ZXh0V2luZG93fVxcblxcblVzZXI6ICR7bWVzc2FnZX1gIDogbWVzc2FnZTtcbiAgICBjb25zdCByZXNwb25zZSA9IHRoaXMubGxtLnF1ZXJ5KHByb21wdCwgY29uZmlnKTtcblxuICAgIC8vIEFkZCBhc3Npc3RhbnQgcmVzcG9uc2VcbiAgICBzZXNzaW9uLm1lc3NhZ2VzLnB1c2goe1xuICAgICAgcm9sZTogJ2Fzc2lzdGFudCcsXG4gICAgICBjb250ZW50OiByZXNwb25zZS50ZXh0LFxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLFxuICAgICAgcmVxdWVzdElkOiByZXNwb25zZS5yZXF1ZXN0SWQsXG4gICAgfSk7XG5cbiAgICBzZXNzaW9uLm1lc3NhZ2VDb3VudCA9IHNlc3Npb24ubWVzc2FnZXMubGVuZ3RoO1xuXG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBzeXN0ZW0gbWVzc2FnZSB0byBzZXNzaW9uXG4gICAqL1xuICBhZGRTeXN0ZW1NZXNzYWdlKHNlc3Npb25JZDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiBub3QgZm91bmQ6ICR7c2Vzc2lvbklkfWApO1xuICAgIH1cblxuICAgIHNlc3Npb24ubWVzc2FnZXMucHVzaCh7XG4gICAgICByb2xlOiAnc3lzdGVtJyxcbiAgICAgIGNvbnRlbnQsXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCksXG4gICAgfSk7XG4gICAgc2Vzc2lvbi5tZXNzYWdlQ291bnQgPSBzZXNzaW9uLm1lc3NhZ2VzLmxlbmd0aDtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgY29udGV4dCB0byBzZXNzaW9uIChwZXJzaXN0ZWQgdG8gbWVtb3J5KVxuICAgKi9cbiAgYWRkQ29udGV4dChzZXNzaW9uSWQ6IHN0cmluZywgY29udGV4dDogc3RyaW5nKTogbnVtYmVyIHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiBub3QgZm91bmQ6ICR7c2Vzc2lvbklkfWApO1xuICAgIH1cblxuICAgIHNlc3Npb24uY29udGV4dC5wdXNoKGNvbnRleHQpO1xuXG4gICAgLy8gQWxzbyBzdG9yZSBpbiBtZW1vcnkgZm9yIHJldHJpZXZhbFxuICAgIGNvbnN0IG1lbW9yeUlkID0gdGhpcy5sbG0uYWRkTWVtb3J5KGNvbnRleHQsIHtcbiAgICAgIHNlc3Npb25JZCxcbiAgICAgIHR5cGU6ICdjb250ZXh0JyxcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgIH0pO1xuXG4gICAgc2Vzc2lvbi5hY3RpdmVNZW1vcnlJZHMucHVzaChtZW1vcnlJZCk7XG4gICAgcmV0dXJuIG1lbW9yeUlkO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBjb252ZXJzYXRpb24gaGlzdG9yeVxuICAgKi9cbiAgZ2V0SGlzdG9yeShzZXNzaW9uSWQ6IHN0cmluZywgbGltaXQ/OiBudW1iZXIpOiBDb252ZXJzYXRpb25NZXNzYWdlW10ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cblxuICAgIGNvbnN0IG1lc3NhZ2VzID0gc2Vzc2lvbi5tZXNzYWdlcztcbiAgICByZXR1cm4gbGltaXQgPyBtZXNzYWdlcy5zbGljZSgtbGltaXQpIDogbWVzc2FnZXM7XG4gIH1cblxuICAvKipcbiAgICogQ2xlYXIgc2Vzc2lvbiBoaXN0b3J5IChrZWVwIHNlc3Npb24gYWN0aXZlKVxuICAgKi9cbiAgY2xlYXJIaXN0b3J5KHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG4gICAgaWYgKHNlc3Npb24pIHtcbiAgICAgIHNlc3Npb24ubWVzc2FnZXMgPSBbXTtcbiAgICAgIHNlc3Npb24uY29udGV4dCA9IFtdO1xuICAgICAgc2Vzc2lvbi5tZXNzYWdlQ291bnQgPSAwO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBFbmQgYW5kIGRlbGV0ZSBzZXNzaW9uXG4gICAqL1xuICBlbmQoc2Vzc2lvbklkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5zZXNzaW9ucy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBMaXN0IGFsbCBhY3RpdmUgc2Vzc2lvbnNcbiAgICovXG4gIGxpc3QoKTogQ29udmVyc2F0aW9uU2Vzc2lvbltdIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLnNlc3Npb25zLnZhbHVlcygpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFeHBvcnQgc2Vzc2lvbiBhcyBKU09OXG4gICAqL1xuICBleHBvcnQoc2Vzc2lvbklkOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShzZXNzaW9uLCBudWxsLCAyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbXBvcnQgc2Vzc2lvbiBmcm9tIEpTT05cbiAgICovXG4gIGltcG9ydChqc29uOiBzdHJpbmcpOiBDb252ZXJzYXRpb25TZXNzaW9uIHtcbiAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZShqc29uKTtcbiAgICBjb25zdCBzZXNzaW9uOiBDb252ZXJzYXRpb25TZXNzaW9uID0ge1xuICAgICAgLi4uZGF0YSxcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoZGF0YS5jcmVhdGVkQXQpLFxuICAgICAgbWVzc2FnZXM6IGRhdGEubWVzc2FnZXMubWFwKChtOiBDb252ZXJzYXRpb25NZXNzYWdlKSA9PiAoe1xuICAgICAgICAuLi5tLFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKG0udGltZXN0YW1wKSxcbiAgICAgIH0pKSxcbiAgICB9O1xuXG4gICAgdGhpcy5zZXNzaW9ucy5zZXQoc2Vzc2lvbi5pZCwgc2Vzc2lvbik7XG4gICAgcmV0dXJuIHNlc3Npb247XG4gIH1cblxuICAvKipcbiAgICogQnVpbGQgY29udGV4dCBzdHJpbmcgZnJvbSByZWNlbnQgbWVzc2FnZXNcbiAgICovXG4gIHByaXZhdGUgYnVpbGRDb250ZXh0KHNlc3Npb246IENvbnZlcnNhdGlvblNlc3Npb24sIG1heE1lc3NhZ2VzID0gMTApOiBzdHJpbmcge1xuICAgIGNvbnN0IHJlY2VudCA9IHNlc3Npb24ubWVzc2FnZXMuc2xpY2UoLW1heE1lc3NhZ2VzKTtcbiAgICBpZiAocmVjZW50Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRleHRQYXJ0czogc3RyaW5nW10gPSBbXTtcblxuICAgIC8vIEFkZCBwZXJzaXN0ZW50IGNvbnRleHRcbiAgICBpZiAoc2Vzc2lvbi5jb250ZXh0Lmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnRleHRQYXJ0cy5wdXNoKCdDb250ZXh0OlxcbicgKyBzZXNzaW9uLmNvbnRleHQuam9pbignXFxuJykpO1xuICAgIH1cblxuICAgIC8vIEFkZCBjb252ZXJzYXRpb24gaGlzdG9yeVxuICAgIGNvbnN0IGhpc3RvcnkgPSByZWNlbnRcbiAgICAgIC5tYXAobSA9PiB7XG4gICAgICAgIGNvbnN0IHJvbGUgPSBtLnJvbGUgPT09ICd1c2VyJyA/ICdVc2VyJyA6IG0ucm9sZSA9PT0gJ2Fzc2lzdGFudCcgPyAnQXNzaXN0YW50JyA6ICdTeXN0ZW0nO1xuICAgICAgICByZXR1cm4gYCR7cm9sZX06ICR7bS5jb250ZW50fWA7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJ1xcbicpO1xuXG4gICAgaWYgKGhpc3RvcnkpIHtcbiAgICAgIGNvbnRleHRQYXJ0cy5wdXNoKCdDb252ZXJzYXRpb246XFxuJyArIGhpc3RvcnkpO1xuICAgIH1cblxuICAgIHJldHVybiBjb250ZXh0UGFydHMuam9pbignXFxuXFxuJyk7XG4gIH1cbn1cbiJdfQ==