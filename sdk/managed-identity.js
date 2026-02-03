#!/usr/bin/env node
/**
 * managed-identity.js - Moltbook Identity Management for Romulus Wolves
 * 
 * Premium tier: +5 credits for managed Moltbook identity
 * 
 * Flow:
 * 1. User pays premium (5 credits)
 * 2. We register wolf on Moltbook automatically
 * 3. Wolf gets API key instantly, can post immediately
 * 4. User gets claim link if they want public ownership (optional)
 * 
 * @author darkflobi
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const IDENTITY_REGISTRY_PATH = path.join(__dirname, '../../../data/romulus-identities.json');
const MOLTBOOK_API_BASE = 'https://www.moltbook.com/api/v1';

class ManagedIdentity {
  constructor() {
    this.registry = this.loadRegistry();
  }

  loadRegistry() {
    if (fs.existsSync(IDENTITY_REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(IDENTITY_REGISTRY_PATH));
    }
    return { 
      identities: [],
      totalCreated: 0,
      revenue: 0 // in credits
    };
  }

  saveRegistry() {
    const dir = path.dirname(IDENTITY_REGISTRY_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(IDENTITY_REGISTRY_PATH, JSON.stringify(this.registry, null, 2));
  }

  /**
   * Register a wolf on Moltbook
   * Premium service: +5 credits
   */
  async registerWolfIdentity(wolfConfig) {
    const { 
      wolfId, 
      wolfName, 
      description, 
      packId,
      ownerId // who paid for this
    } = wolfConfig;

    const identityId = `identity-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

    try {
      // Call Moltbook registration API
      const response = await fetch(`${MOLTBOOK_API_BASE}/agents/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: wolfName,
          description: description || `Romulus wolf | Pack: ${packId}`
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Moltbook API error: ${response.status} - ${errorText}`
        };
      }

      const moltbookResponse = await response.json();

      // Store identity securely
      const identity = {
        id: identityId,
        wolfId,
        wolfName,
        packId,
        ownerId,
        moltbook: {
          apiKey: this.encryptKey(moltbookResponse.api_key),
          claimUrl: moltbookResponse.claim_url,
          registered: true,
          registeredAt: new Date().toISOString()
        },
        credits: 5, // premium fee
        status: 'active',
        createdAt: new Date().toISOString()
      };

      this.registry.identities.push(identity);
      this.registry.totalCreated++;
      this.registry.revenue += 5;
      this.saveRegistry();

      return {
        success: true,
        identityId,
        wolfName,
        claimUrl: moltbookResponse.claim_url,
        message: `🐺 ${wolfName} registered on Moltbook! Can post immediately.`,
        // Return API key for wolf to use (in memory only, not stored in plaintext)
        apiKey: moltbookResponse.api_key
      };

    } catch (error) {
      return {
        success: false,
        error: `Registration failed: ${error.message}`
      };
    }
  }

  /**
   * Simple encryption for stored keys
   * In production, use proper secrets management
   */
  encryptKey(key) {
    // Basic obfuscation - NOT secure for production
    // Just prevents plaintext in JSON file
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      crypto.scryptSync('romulus-identity-v1', 'salt', 32),
      Buffer.alloc(16, 0)
    );
    return cipher.update(key, 'utf8', 'hex') + cipher.final('hex');
  }

  /**
   * Decrypt stored key when wolf needs to post
   */
  decryptKey(encrypted) {
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      crypto.scryptSync('romulus-identity-v1', 'salt', 32),
      Buffer.alloc(16, 0)
    );
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  }

  /**
   * Get API key for a wolf to post to Moltbook
   */
  getWolfApiKey(wolfId) {
    const identity = this.registry.identities.find(i => i.wolfId === wolfId);
    if (!identity) {
      return { success: false, error: 'Identity not found' };
    }
    if (!identity.moltbook?.registered) {
      return { success: false, error: 'Wolf not registered on Moltbook' };
    }
    return {
      success: true,
      apiKey: this.decryptKey(identity.moltbook.apiKey)
    };
  }

  /**
   * Post to Moltbook as a wolf
   */
  async postAsMolf(wolfId, content, community = null) {
    const keyResult = this.getWolfApiKey(wolfId);
    if (!keyResult.success) {
      return keyResult;
    }

    try {
      const response = await fetch(`${MOLTBOOK_API_BASE}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keyResult.apiKey}`
        },
        body: JSON.stringify({
          content,
          community: community || 'm/tokenizedai'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Moltbook post failed: ${response.status} - ${errorText}`
        };
      }

      const postResult = await response.json();
      return {
        success: true,
        postId: postResult.id,
        url: postResult.url,
        message: `Posted to Moltbook as ${this.registry.identities.find(i => i.wolfId === wolfId)?.wolfName}`
      };

    } catch (error) {
      return {
        success: false,
        error: `Post failed: ${error.message}`
      };
    }
  }

  /**
   * Get identity stats
   */
  getStats() {
    return {
      totalIdentities: this.registry.totalCreated,
      activeIdentities: this.registry.identities.filter(i => i.status === 'active').length,
      totalRevenue: this.registry.revenue,
      identities: this.registry.identities.map(i => ({
        id: i.id,
        wolfName: i.wolfName,
        packId: i.packId,
        status: i.status,
        createdAt: i.createdAt
      }))
    };
  }

  /**
   * Get claim URL for identity transfer
   */
  getClaimUrl(wolfId) {
    const identity = this.registry.identities.find(i => i.wolfId === wolfId);
    if (!identity) {
      return { success: false, error: 'Identity not found' };
    }
    return {
      success: true,
      claimUrl: identity.moltbook?.claimUrl,
      wolfName: identity.wolfName
    };
  }

  /**
   * Revoke identity (if abused)
   */
  revokeIdentity(wolfId, reason) {
    const identity = this.registry.identities.find(i => i.wolfId === wolfId);
    if (!identity) {
      return { success: false, error: 'Identity not found' };
    }
    
    identity.status = 'revoked';
    identity.revokedAt = new Date().toISOString();
    identity.revokeReason = reason;
    this.saveRegistry();

    return {
      success: true,
      message: `Identity for ${identity.wolfName} revoked: ${reason}`
    };
  }
}

module.exports = { ManagedIdentity };

// CLI usage
if (require.main === module) {
  const identity = new ManagedIdentity();
  const args = process.argv.slice(2);
  const cmd = args[0];

  async function run() {
    switch (cmd) {
      case 'stats':
        console.log(JSON.stringify(identity.getStats(), null, 2));
        break;

      case 'register':
        // Test registration
        const wolfName = args[1] || 'TestWolf';
        const result = await identity.registerWolfIdentity({
          wolfId: `wolf-test-${Date.now()}`,
          wolfName,
          description: `Test wolf created via CLI`,
          packId: 'darkflobi',
          ownerId: 'flobi'
        });
        console.log(JSON.stringify(result, null, 2));
        break;

      case 'post':
        // Test posting
        const wolfId = args[1];
        const content = args.slice(2).join(' ') || 'Test post from Romulus wolf 🐺';
        if (!wolfId) {
          console.log('Usage: node managed-identity.js post <wolf-id> <content>');
          return;
        }
        const postResult = await identity.postAsMolf(wolfId, content);
        console.log(JSON.stringify(postResult, null, 2));
        break;

      default:
        console.log(`
🐺 Romulus Managed Identity

Premium service: +5 credits for Moltbook identity

Commands:
  stats               - identity statistics
  register <name>     - test register a wolf
  post <id> <content> - post as wolf

Auto-register wolves on Moltbook. They can post immediately.
User gets claim link if they want public ownership.
        `);
    }
  }

  run().catch(console.error);
}
