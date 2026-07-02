/**
 * Security Manager - Authentication, encryption, and access control
 *
 * Features:
 * - JWT token generation and validation
 * - AES-256 encryption for data at rest
 * - Tenant isolation
 * - mTLS certificate management
 */
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
export class SecurityManager {
    algorithm = 'aes-256-gcm';
    jwtSecret;
    encryptionCache = new Map();
    constructor() {
        // In production, load from secure vault (AWS Secrets Manager, HashiCorp Vault, etc.)
        this.jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
    }
    /**
     * Create JWT token for agent authentication
     */
    async createAgentToken(payload) {
        const header = {
            alg: 'HS256',
            typ: 'JWT'
        };
        const now = Date.now();
        const tokenPayload = {
            ...payload,
            iat: now,
            exp: payload.expiresAt,
            iss: 'agentic-flow-federation'
        };
        // Encode header and payload
        const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
        const encodedPayload = this.base64UrlEncode(JSON.stringify(tokenPayload));
        // Create signature
        const signature = crypto
            .createHmac('sha256', this.jwtSecret)
            .update(`${encodedHeader}.${encodedPayload}`)
            .digest('base64url');
        const token = `${encodedHeader}.${encodedPayload}.${signature}`;
        logger.info('Created agent token', {
            agentId: payload.agentId,
            tenantId: payload.tenantId,
            expiresAt: new Date(payload.expiresAt).toISOString()
        });
        return token;
    }
    /**
     * Verify JWT token
     */
    async verifyAgentToken(token) {
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid token format');
        }
        const [encodedHeader, encodedPayload, signature] = parts;
        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', this.jwtSecret)
            .update(`${encodedHeader}.${encodedPayload}`)
            .digest('base64url');
        if (signature !== expectedSignature) {
            throw new Error('Invalid token signature');
        }
        // Decode payload
        const payload = JSON.parse(this.base64UrlDecode(encodedPayload));
        // Check expiration
        if (Date.now() >= payload.exp) {
            throw new Error('Token expired');
        }
        logger.debug('Token verified', {
            agentId: payload.agentId,
            tenantId: payload.tenantId
        });
        return payload;
    }
    /**
     * Get or create encryption key for a tenant (key only, IV generated per operation)
     * SECURITY FIX: IV is now generated fresh for each encryption operation
     */
    async getEncryptionKey(tenantId) {
        // Check cache for encryption key only
        const cached = this.encryptionCache.get(tenantId);
        if (cached) {
            return cached.encryptionKey;
        }
        // Generate new key for tenant
        // In production, these would be stored in a secure key management service
        const encryptionKey = crypto.randomBytes(32); // 256-bit key
        // Cache only the key (IV will be generated per-operation)
        // We store a dummy IV in the cache structure for backwards compatibility
        const keys = { encryptionKey, iv: Buffer.alloc(16) };
        this.encryptionCache.set(tenantId, keys);
        logger.info('Generated encryption key for tenant', { tenantId });
        return encryptionKey;
    }
    /**
     * Legacy method for backwards compatibility - prefer getEncryptionKey
     * @deprecated Use getEncryptionKey instead and generate IV per-operation
     */
    async getEncryptionKeys(tenantId) {
        const encryptionKey = await this.getEncryptionKey(tenantId);
        // SECURITY: Generate fresh IV for each call (not cached)
        const iv = crypto.randomBytes(16);
        return { encryptionKey, iv };
    }
    /**
     * Encrypt data with AES-256-GCM
     * SECURITY FIX: Now generates a fresh IV for each encryption and returns it
     */
    async encrypt(data, tenantId) {
        const encryptionKey = await this.getEncryptionKey(tenantId);
        // SECURITY: Generate fresh IV for EACH encryption operation
        // IV reuse with AES-GCM is catastrophic - this fix prevents that
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, encryptionKey, iv);
        let encrypted = cipher.update(data, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const authTag = cipher.getAuthTag().toString('base64');
        logger.debug('Data encrypted', {
            tenantId,
            originalLength: data.length,
            encryptedLength: encrypted.length
        });
        // SECURITY: Return IV with encrypted data so it can be used for decryption
        return { encrypted, authTag, iv: iv.toString('base64') };
    }
    /**
     * Decrypt data with AES-256-GCM
     * SECURITY FIX: Now accepts IV as parameter (required for proper decryption)
     */
    async decrypt(encrypted, authTag, tenantId, iv) {
        const encryptionKey = await this.getEncryptionKey(tenantId);
        // SECURITY: IV must be provided for proper decryption
        // For backwards compatibility, generate warning if not provided
        let ivBuffer;
        if (iv) {
            ivBuffer = Buffer.from(iv, 'base64');
        }
        else {
            // Legacy fallback - try to use cached IV (will fail for new encryptions)
            logger.warn('Decrypt called without IV - this may fail for newly encrypted data', { tenantId });
            const cached = this.encryptionCache.get(tenantId);
            if (!cached) {
                throw new Error('No IV provided and no cached keys available');
            }
            ivBuffer = cached.iv;
        }
        const decipher = crypto.createDecipheriv(this.algorithm, encryptionKey, ivBuffer);
        decipher.setAuthTag(Buffer.from(authTag, 'base64'));
        let decrypted = decipher.update(encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        logger.debug('Data decrypted', {
            tenantId,
            decryptedLength: decrypted.length
        });
        return decrypted;
    }
    /**
     * Generate mTLS certificates for agent-to-hub communication
     */
    async generateMTLSCertificates(agentId) {
        // Placeholder: Actual implementation would use OpenSSL or similar
        // to generate X.509 certificates with proper CA chain
        logger.info('Generating mTLS certificates', { agentId });
        return {
            cert: 'PLACEHOLDER_CERT',
            key: 'PLACEHOLDER_KEY',
            ca: 'PLACEHOLDER_CA'
        };
    }
    /**
     * Validate tenant access to data
     */
    validateTenantAccess(requestTenantId, dataTenantId) {
        if (requestTenantId !== dataTenantId) {
            logger.warn('Tenant access violation detected', {
                requestTenantId,
                dataTenantId
            });
            return false;
        }
        return true;
    }
    /**
     * Hash sensitive data for storage (one-way)
     */
    hashData(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }
    /**
     * Generate secure random ID
     */
    generateSecureId() {
        return crypto.randomBytes(16).toString('hex');
    }
    /**
     * Base64 URL-safe encoding
     */
    base64UrlEncode(str) {
        return Buffer.from(str)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
    /**
     * Base64 URL-safe decoding
     */
    base64UrlDecode(str) {
        const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        return Buffer.from(base64, 'base64').toString('utf8');
    }
    /**
     * Clear cached keys (for testing or security refresh)
     */
    clearCache() {
        this.encryptionCache.clear();
        logger.info('Encryption cache cleared');
    }
}
//# sourceMappingURL=SecurityManager.js.map