/**
 * Security Manager - Authentication, encryption, and access control
 *
 * Features:
 * - JWT token generation and validation
 * - AES-256 encryption for data at rest
 * - Tenant isolation
 * - mTLS certificate management
 */
export interface AgentTokenPayload {
    agentId: string;
    tenantId: string;
    expiresAt: number;
}
export interface EncryptionKeys {
    encryptionKey: Buffer;
    iv: Buffer;
}
export declare class SecurityManager {
    private readonly algorithm;
    private readonly jwtSecret;
    private encryptionCache;
    constructor();
    /**
     * Create JWT token for agent authentication
     */
    createAgentToken(payload: AgentTokenPayload): Promise<string>;
    /**
     * Verify JWT token
     */
    verifyAgentToken(token: string): Promise<AgentTokenPayload>;
    /**
     * Get or create encryption key for a tenant (key only, IV generated per operation)
     * SECURITY FIX: IV is now generated fresh for each encryption operation
     */
    getEncryptionKey(tenantId: string): Promise<Buffer>;
    /**
     * Legacy method for backwards compatibility - prefer getEncryptionKey
     * @deprecated Use getEncryptionKey instead and generate IV per-operation
     */
    getEncryptionKeys(tenantId: string): Promise<EncryptionKeys>;
    /**
     * Encrypt data with AES-256-GCM
     * SECURITY FIX: Now generates a fresh IV for each encryption and returns it
     */
    encrypt(data: string, tenantId: string): Promise<{
        encrypted: string;
        authTag: string;
        iv: string;
    }>;
    /**
     * Decrypt data with AES-256-GCM
     * SECURITY FIX: Now accepts IV as parameter (required for proper decryption)
     */
    decrypt(encrypted: string, authTag: string, tenantId: string, iv?: string): Promise<string>;
    /**
     * Generate mTLS certificates for agent-to-hub communication
     */
    generateMTLSCertificates(agentId: string): Promise<{
        cert: string;
        key: string;
        ca: string;
    }>;
    /**
     * Validate tenant access to data
     */
    validateTenantAccess(requestTenantId: string, dataTenantId: string): boolean;
    /**
     * Hash sensitive data for storage (one-way)
     */
    hashData(data: string): string;
    /**
     * Generate secure random ID
     */
    generateSecureId(): string;
    /**
     * Base64 URL-safe encoding
     */
    private base64UrlEncode;
    /**
     * Base64 URL-safe decoding
     */
    private base64UrlDecode;
    /**
     * Clear cached keys (for testing or security refresh)
     */
    clearCache(): void;
}
//# sourceMappingURL=SecurityManager.d.ts.map