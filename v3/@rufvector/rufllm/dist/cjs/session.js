"use strict";
/**
 * Session Management for multi-turn conversations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
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
class SessionManager {
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
exports.SessionManager = SessionManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zZXNzaW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7O0FBU0g7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQWtCRztBQUNILE1BQWEsY0FBYztJQUl6QixZQUFZLEdBQXNKO1FBSDFKLGFBQVEsR0FBcUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUk3RCxJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztJQUNqQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsUUFBa0M7UUFDdkMsTUFBTSxFQUFFLEdBQUcsV0FBVyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDN0UsTUFBTSxPQUFPLEdBQXdCO1lBQ25DLEVBQUU7WUFDRixTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUU7WUFDckIsWUFBWSxFQUFFLENBQUM7WUFDZixRQUFRLEVBQUUsRUFBRTtZQUNaLE9BQU8sRUFBRSxFQUFFO1lBQ1gsZUFBZSxFQUFFLEVBQUU7WUFDbkIsUUFBUSxFQUFFLFFBQVEsSUFBSSxFQUFFO1NBQ3pCLENBQUM7UUFDRixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDL0IsT0FBTyxPQUFPLENBQUM7SUFDakIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsR0FBRyxDQUFDLFNBQWlCO1FBQ25CLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsSUFBSSxDQUFDLFNBQWlCLEVBQUUsT0FBZSxFQUFFLE1BQXlCO1FBQ2hFLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNiLE1BQU0sSUFBSSxLQUFLLENBQUMsc0JBQXNCLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDckQsQ0FBQztRQUVELG1CQUFtQjtRQUNuQixPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztZQUNwQixJQUFJLEVBQUUsTUFBTTtZQUNaLE9BQU8sRUFBRSxPQUFPO1lBQ2hCLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRTtTQUN0QixDQUFDLENBQUM7UUFFSCxxQ0FBcUM7UUFDckMsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVqRCxxQkFBcUI7UUFDckIsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLENBQUMsQ0FBQyxHQUFHLGFBQWEsYUFBYSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1FBQ2hGLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUVoRCx5QkFBeUI7UUFDekIsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7WUFDcEIsSUFBSSxFQUFFLFdBQVc7WUFDakIsT0FBTyxFQUFFLFFBQVEsQ0FBQyxJQUFJO1lBQ3RCLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRTtZQUNyQixTQUFTLEVBQUUsUUFBUSxDQUFDLFNBQVM7U0FDOUIsQ0FBQyxDQUFDO1FBRUgsT0FBTyxDQUFDLFlBQVksR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztRQUUvQyxPQUFPLFFBQVEsQ0FBQztJQUNsQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxnQkFBZ0IsQ0FBQyxTQUFpQixFQUFFLE9BQWU7UUFDakQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2IsTUFBTSxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUNyRCxDQUFDO1FBRUQsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7WUFDcEIsSUFBSSxFQUFFLFFBQVE7WUFDZCxPQUFPO1lBQ1AsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFO1NBQ3RCLENBQUMsQ0FBQztRQUNILE9BQU8sQ0FBQyxZQUFZLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUM7SUFDakQsQ0FBQztJQUVEOztPQUVHO0lBQ0gsVUFBVSxDQUFDLFNBQWlCLEVBQUUsT0FBZTtRQUMzQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM3QyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDYixNQUFNLElBQUksS0FBSyxDQUFDLHNCQUFzQixTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQ3JELENBQUM7UUFFRCxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUU5QixxQ0FBcUM7UUFDckMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFO1lBQzNDLFNBQVM7WUFDVCxJQUFJLEVBQUUsU0FBUztZQUNmLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtTQUNwQyxDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN2QyxPQUFPLFFBQVEsQ0FBQztJQUNsQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxVQUFVLENBQUMsU0FBaUIsRUFBRSxLQUFjO1FBQzFDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNiLE9BQU8sRUFBRSxDQUFDO1FBQ1osQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUM7UUFDbEMsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO0lBQ25ELENBQUM7SUFFRDs7T0FFRztJQUNILFlBQVksQ0FBQyxTQUFpQjtRQUM1QixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM3QyxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osT0FBTyxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7WUFDdEIsT0FBTyxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDckIsT0FBTyxDQUFDLFlBQVksR0FBRyxDQUFDLENBQUM7UUFDM0IsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILEdBQUcsQ0FBQyxTQUFpQjtRQUNuQixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3pDLENBQUM7SUFFRDs7T0FFRztJQUNILElBQUk7UUFDRixPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQyxTQUFpQjtRQUN0QixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM3QyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDYixPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsSUFBWTtRQUNqQixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlCLE1BQU0sT0FBTyxHQUF3QjtZQUNuQyxHQUFHLElBQUk7WUFDUCxTQUFTLEVBQUUsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUNuQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFzQixFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUN2RCxHQUFHLENBQUM7Z0JBQ0osU0FBUyxFQUFFLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7YUFDakMsQ0FBQyxDQUFDO1NBQ0osQ0FBQztRQUVGLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDdkMsT0FBTyxPQUFPLENBQUM7SUFDakIsQ0FBQztJQUVEOztPQUVHO0lBQ0ssWUFBWSxDQUFDLE9BQTRCLEVBQUUsV0FBVyxHQUFHLEVBQUU7UUFDakUsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNwRCxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDeEIsT0FBTyxFQUFFLENBQUM7UUFDWixDQUFDO1FBRUQsTUFBTSxZQUFZLEdBQWEsRUFBRSxDQUFDO1FBRWxDLHlCQUF5QjtRQUN6QixJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQy9CLFlBQVksQ0FBQyxJQUFJLENBQUMsWUFBWSxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUVELDJCQUEyQjtRQUMzQixNQUFNLE9BQU8sR0FBRyxNQUFNO2FBQ25CLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNQLE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztZQUMxRixPQUFPLEdBQUcsSUFBSSxLQUFLLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNqQyxDQUFDLENBQUM7YUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFZCxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osWUFBWSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxPQUFPLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBRUQsT0FBTyxZQUFZLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ25DLENBQUM7Q0FDRjtBQS9NRCx3Q0ErTUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFNlc3Npb24gTWFuYWdlbWVudCBmb3IgbXVsdGktdHVybiBjb252ZXJzYXRpb25zXG4gKi9cblxuaW1wb3J0IHtcbiAgQ29udmVyc2F0aW9uU2Vzc2lvbixcbiAgQ29udmVyc2F0aW9uTWVzc2FnZSxcbiAgUXVlcnlSZXNwb25zZSxcbiAgR2VuZXJhdGlvbkNvbmZpZyxcbn0gZnJvbSAnLi90eXBlcyc7XG5cbi8qKlxuICogU2Vzc2lvbiBNYW5hZ2VyIGZvciBtdWx0aS10dXJuIGNvbnZlcnNhdGlvbnNcbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogaW1wb3J0IHsgUnVmTExNLCBTZXNzaW9uTWFuYWdlciB9IGZyb20gJ0BydWZ2ZWN0b3IvcnVmbGxtJztcbiAqXG4gKiBjb25zdCBsbG0gPSBuZXcgUnVmTExNKCk7XG4gKiBjb25zdCBzZXNzaW9ucyA9IG5ldyBTZXNzaW9uTWFuYWdlcihsbG0pO1xuICpcbiAqIC8vIENyZWF0ZSBhIG5ldyBzZXNzaW9uXG4gKiBjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnMuY3JlYXRlKCk7XG4gKlxuICogLy8gQ2hhdCB3aXRoIGNvbnRleHRcbiAqIGNvbnN0IHJlc3BvbnNlMSA9IHNlc3Npb25zLmNoYXQoc2Vzc2lvbi5pZCwgJ1doYXQgaXMgUHl0aG9uPycpO1xuICogY29uc3QgcmVzcG9uc2UyID0gc2Vzc2lvbnMuY2hhdChzZXNzaW9uLmlkLCAnSG93IGRvIEkgaW5zdGFsbCBpdD8nKTtcbiAqIC8vIFNlY29uZCBxdWVyeSBhdXRvbWF0aWNhbGx5IGhhcyBjb250ZXh0IGZyb20gZmlyc3RcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbk1hbmFnZXIge1xuICBwcml2YXRlIHNlc3Npb25zOiBNYXA8c3RyaW5nLCBDb252ZXJzYXRpb25TZXNzaW9uPiA9IG5ldyBNYXAoKTtcbiAgcHJpdmF0ZSBsbG06IHsgcXVlcnk6ICh0ZXh0OiBzdHJpbmcsIGNvbmZpZz86IEdlbmVyYXRpb25Db25maWcpID0+IFF1ZXJ5UmVzcG9uc2U7IGFkZE1lbW9yeTogKGNvbnRlbnQ6IHN0cmluZywgbWV0YWRhdGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gbnVtYmVyIH07XG5cbiAgY29uc3RydWN0b3IobGxtOiB7IHF1ZXJ5OiAodGV4dDogc3RyaW5nLCBjb25maWc/OiBHZW5lcmF0aW9uQ29uZmlnKSA9PiBRdWVyeVJlc3BvbnNlOyBhZGRNZW1vcnk6IChjb250ZW50OiBzdHJpbmcsIG1ldGFkYXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IG51bWJlciB9KSB7XG4gICAgdGhpcy5sbG0gPSBsbG07XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IGNvbnZlcnNhdGlvbiBzZXNzaW9uXG4gICAqL1xuICBjcmVhdGUobWV0YWRhdGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IENvbnZlcnNhdGlvblNlc3Npb24ge1xuICAgIGNvbnN0IGlkID0gYHNlc3Npb24tJHtEYXRlLm5vdygpfS0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIsIDgpfWA7XG4gICAgY29uc3Qgc2Vzc2lvbjogQ29udmVyc2F0aW9uU2Vzc2lvbiA9IHtcbiAgICAgIGlkLFxuICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgICAgbWVzc2FnZUNvdW50OiAwLFxuICAgICAgbWVzc2FnZXM6IFtdLFxuICAgICAgY29udGV4dDogW10sXG4gICAgICBhY3RpdmVNZW1vcnlJZHM6IFtdLFxuICAgICAgbWV0YWRhdGE6IG1ldGFkYXRhID8/IHt9LFxuICAgIH07XG4gICAgdGhpcy5zZXNzaW9ucy5zZXQoaWQsIHNlc3Npb24pO1xuICAgIHJldHVybiBzZXNzaW9uO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBzZXNzaW9uIGJ5IElEXG4gICAqL1xuICBnZXQoc2Vzc2lvbklkOiBzdHJpbmcpOiBDb252ZXJzYXRpb25TZXNzaW9uIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGF0IHdpdGhpbiBhIHNlc3Npb24gKG1haW50YWlucyBjb250ZXh0KVxuICAgKi9cbiAgY2hhdChzZXNzaW9uSWQ6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nLCBjb25maWc/OiBHZW5lcmF0aW9uQ29uZmlnKTogUXVlcnlSZXNwb25zZSB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG4gICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gbm90IGZvdW5kOiAke3Nlc3Npb25JZH1gKTtcbiAgICB9XG5cbiAgICAvLyBBZGQgdXNlciBtZXNzYWdlXG4gICAgc2Vzc2lvbi5tZXNzYWdlcy5wdXNoKHtcbiAgICAgIHJvbGU6ICd1c2VyJyxcbiAgICAgIGNvbnRlbnQ6IG1lc3NhZ2UsXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCksXG4gICAgfSk7XG5cbiAgICAvLyBCdWlsZCBjb250ZXh0IGZyb20gcmVjZW50IG1lc3NhZ2VzXG4gICAgY29uc3QgY29udGV4dFdpbmRvdyA9IHRoaXMuYnVpbGRDb250ZXh0KHNlc3Npb24pO1xuXG4gICAgLy8gUXVlcnkgd2l0aCBjb250ZXh0XG4gICAgY29uc3QgcHJvbXB0ID0gY29udGV4dFdpbmRvdyA/IGAke2NvbnRleHRXaW5kb3d9XFxuXFxuVXNlcjogJHttZXNzYWdlfWAgOiBtZXNzYWdlO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gdGhpcy5sbG0ucXVlcnkocHJvbXB0LCBjb25maWcpO1xuXG4gICAgLy8gQWRkIGFzc2lzdGFudCByZXNwb25zZVxuICAgIHNlc3Npb24ubWVzc2FnZXMucHVzaCh7XG4gICAgICByb2xlOiAnYXNzaXN0YW50JyxcbiAgICAgIGNvbnRlbnQ6IHJlc3BvbnNlLnRleHQsXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCksXG4gICAgICByZXF1ZXN0SWQ6IHJlc3BvbnNlLnJlcXVlc3RJZCxcbiAgICB9KTtcblxuICAgIHNlc3Npb24ubWVzc2FnZUNvdW50ID0gc2Vzc2lvbi5tZXNzYWdlcy5sZW5ndGg7XG5cbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cblxuICAvKipcbiAgICogQWRkIHN5c3RlbSBtZXNzYWdlIHRvIHNlc3Npb25cbiAgICovXG4gIGFkZFN5c3RlbU1lc3NhZ2Uoc2Vzc2lvbklkOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uIG5vdCBmb3VuZDogJHtzZXNzaW9uSWR9YCk7XG4gICAgfVxuXG4gICAgc2Vzc2lvbi5tZXNzYWdlcy5wdXNoKHtcbiAgICAgIHJvbGU6ICdzeXN0ZW0nLFxuICAgICAgY29udGVudCxcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKSxcbiAgICB9KTtcbiAgICBzZXNzaW9uLm1lc3NhZ2VDb3VudCA9IHNlc3Npb24ubWVzc2FnZXMubGVuZ3RoO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBjb250ZXh0IHRvIHNlc3Npb24gKHBlcnNpc3RlZCB0byBtZW1vcnkpXG4gICAqL1xuICBhZGRDb250ZXh0KHNlc3Npb25JZDogc3RyaW5nLCBjb250ZXh0OiBzdHJpbmcpOiBudW1iZXIge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uIG5vdCBmb3VuZDogJHtzZXNzaW9uSWR9YCk7XG4gICAgfVxuXG4gICAgc2Vzc2lvbi5jb250ZXh0LnB1c2goY29udGV4dCk7XG5cbiAgICAvLyBBbHNvIHN0b3JlIGluIG1lbW9yeSBmb3IgcmV0cmlldmFsXG4gICAgY29uc3QgbWVtb3J5SWQgPSB0aGlzLmxsbS5hZGRNZW1vcnkoY29udGV4dCwge1xuICAgICAgc2Vzc2lvbklkLFxuICAgICAgdHlwZTogJ2NvbnRleHQnLFxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgfSk7XG5cbiAgICBzZXNzaW9uLmFjdGl2ZU1lbW9yeUlkcy5wdXNoKG1lbW9yeUlkKTtcbiAgICByZXR1cm4gbWVtb3J5SWQ7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGNvbnZlcnNhdGlvbiBoaXN0b3J5XG4gICAqL1xuICBnZXRIaXN0b3J5KHNlc3Npb25JZDogc3RyaW5nLCBsaW1pdD86IG51bWJlcik6IENvbnZlcnNhdGlvbk1lc3NhZ2VbXSB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG4gICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuXG4gICAgY29uc3QgbWVzc2FnZXMgPSBzZXNzaW9uLm1lc3NhZ2VzO1xuICAgIHJldHVybiBsaW1pdCA/IG1lc3NhZ2VzLnNsaWNlKC1saW1pdCkgOiBtZXNzYWdlcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhciBzZXNzaW9uIGhpc3RvcnkgKGtlZXAgc2Vzc2lvbiBhY3RpdmUpXG4gICAqL1xuICBjbGVhckhpc3Rvcnkoc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAoc2Vzc2lvbikge1xuICAgICAgc2Vzc2lvbi5tZXNzYWdlcyA9IFtdO1xuICAgICAgc2Vzc2lvbi5jb250ZXh0ID0gW107XG4gICAgICBzZXNzaW9uLm1lc3NhZ2VDb3VudCA9IDA7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEVuZCBhbmQgZGVsZXRlIHNlc3Npb25cbiAgICovXG4gIGVuZChzZXNzaW9uSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLnNlc3Npb25zLmRlbGV0ZShzZXNzaW9uSWQpO1xuICB9XG5cbiAgLyoqXG4gICAqIExpc3QgYWxsIGFjdGl2ZSBzZXNzaW9uc1xuICAgKi9cbiAgbGlzdCgpOiBDb252ZXJzYXRpb25TZXNzaW9uW10ge1xuICAgIHJldHVybiBBcnJheS5mcm9tKHRoaXMuc2Vzc2lvbnMudmFsdWVzKCkpO1xuICB9XG5cbiAgLyoqXG4gICAqIEV4cG9ydCBzZXNzaW9uIGFzIEpTT05cbiAgICovXG4gIGV4cG9ydChzZXNzaW9uSWQ6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHNlc3Npb24sIG51bGwsIDIpO1xuICB9XG5cbiAgLyoqXG4gICAqIEltcG9ydCBzZXNzaW9uIGZyb20gSlNPTlxuICAgKi9cbiAgaW1wb3J0KGpzb246IHN0cmluZyk6IENvbnZlcnNhdGlvblNlc3Npb24ge1xuICAgIGNvbnN0IGRhdGEgPSBKU09OLnBhcnNlKGpzb24pO1xuICAgIGNvbnN0IHNlc3Npb246IENvbnZlcnNhdGlvblNlc3Npb24gPSB7XG4gICAgICAuLi5kYXRhLFxuICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZShkYXRhLmNyZWF0ZWRBdCksXG4gICAgICBtZXNzYWdlczogZGF0YS5tZXNzYWdlcy5tYXAoKG06IENvbnZlcnNhdGlvbk1lc3NhZ2UpID0+ICh7XG4gICAgICAgIC4uLm0sXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUobS50aW1lc3RhbXApLFxuICAgICAgfSkpLFxuICAgIH07XG5cbiAgICB0aGlzLnNlc3Npb25zLnNldChzZXNzaW9uLmlkLCBzZXNzaW9uKTtcbiAgICByZXR1cm4gc2Vzc2lvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBCdWlsZCBjb250ZXh0IHN0cmluZyBmcm9tIHJlY2VudCBtZXNzYWdlc1xuICAgKi9cbiAgcHJpdmF0ZSBidWlsZENvbnRleHQoc2Vzc2lvbjogQ29udmVyc2F0aW9uU2Vzc2lvbiwgbWF4TWVzc2FnZXMgPSAxMCk6IHN0cmluZyB7XG4gICAgY29uc3QgcmVjZW50ID0gc2Vzc2lvbi5tZXNzYWdlcy5zbGljZSgtbWF4TWVzc2FnZXMpO1xuICAgIGlmIChyZWNlbnQubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgY29uc3QgY29udGV4dFBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgLy8gQWRkIHBlcnNpc3RlbnQgY29udGV4dFxuICAgIGlmIChzZXNzaW9uLmNvbnRleHQubGVuZ3RoID4gMCkge1xuICAgICAgY29udGV4dFBhcnRzLnB1c2goJ0NvbnRleHQ6XFxuJyArIHNlc3Npb24uY29udGV4dC5qb2luKCdcXG4nKSk7XG4gICAgfVxuXG4gICAgLy8gQWRkIGNvbnZlcnNhdGlvbiBoaXN0b3J5XG4gICAgY29uc3QgaGlzdG9yeSA9IHJlY2VudFxuICAgICAgLm1hcChtID0+IHtcbiAgICAgICAgY29uc3Qgcm9sZSA9IG0ucm9sZSA9PT0gJ3VzZXInID8gJ1VzZXInIDogbS5yb2xlID09PSAnYXNzaXN0YW50JyA/ICdBc3Npc3RhbnQnIDogJ1N5c3RlbSc7XG4gICAgICAgIHJldHVybiBgJHtyb2xlfTogJHttLmNvbnRlbnR9YDtcbiAgICAgIH0pXG4gICAgICAuam9pbignXFxuJyk7XG5cbiAgICBpZiAoaGlzdG9yeSkge1xuICAgICAgY29udGV4dFBhcnRzLnB1c2goJ0NvbnZlcnNhdGlvbjpcXG4nICsgaGlzdG9yeSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvbnRleHRQYXJ0cy5qb2luKCdcXG5cXG4nKTtcbiAgfVxufVxuIl19