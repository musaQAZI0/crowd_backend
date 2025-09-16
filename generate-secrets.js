#!/usr/bin/env node

/**
 * Generate secure secrets for CROWD backend environment variables
 * Run with: node generate-secrets.js
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');

console.log('🔐 CROWD Backend - Secret Generator');
console.log('=====================================\n');

// Function to generate random secure string
function generateSecret(length = 64) {
    return crypto.randomBytes(length).toString('hex');
}

// Function to generate JWT secret
function generateJWTSecret() {
    return crypto.randomBytes(64).toString('base64');
}

// Function to generate strong password
function generateStrongPassword(length = 16) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
}

// Function to hash password with bcrypt
async function hashPassword(password) {
    return await bcrypt.hash(password, 12);
}

async function generateAllSecrets() {
    // Generate all secrets
    const jwtSecret = generateJWTSecret();
    const jwtRefreshSecret = generateJWTSecret();
    const adminJwtSecret = generateJWTSecret();
    const sessionSecret = generateSecret(32);
    const adminPassword = generateStrongPassword(20);
    const hashedAdminPassword = await hashPassword(adminPassword);

    console.log('📋 Copy these values to your .env file:');
    console.log('==========================================\n');

    console.log('# JWT Secrets');
    console.log(`JWT_SECRET=${jwtSecret}`);
    console.log(`JWT_REFRESH_SECRET=${jwtRefreshSecret}`);
    console.log(`ADMIN_JWT_SECRET=${adminJwtSecret}`);
    console.log('');

    console.log('# Session Secret');
    console.log(`SESSION_SECRET=${sessionSecret}`);
    console.log('');

    console.log('# Admin Credentials');
    console.log(`ADMIN_USERNAME=admin`);
    console.log(`ADMIN_PASSWORD=${adminPassword}`);
    console.log(`ADMIN_EMAIL=admin@crowd.com`);
    console.log('');

    console.log('# For production (use hashed password):');
    console.log(`# ADMIN_PASSWORD_HASH=${hashedAdminPassword}`);
    console.log('');

    console.log('🔐 Security Notes:');
    console.log('==================');
    console.log('1. Keep these secrets private and secure');
    console.log('2. Never commit .env files to version control');
    console.log('3. Use different secrets for development and production');
    console.log('4. In production, consider using hashed passwords');
    console.log('5. Store secrets in your hosting platform\'s environment variables');
    console.log('');

    console.log('📝 Your admin login credentials:');
    console.log('================================');
    console.log(`Username: admin`);
    console.log(`Password: ${adminPassword}`);
    console.log('');

    console.log('💡 Next Steps:');
    console.log('==============');
    console.log('1. Copy the above values to your .env file');
    console.log('2. Restart your server');
    console.log('3. Test admin login with the generated credentials');
    console.log('4. Consider changing the admin username for additional security');
}

// Run the generator
generateAllSecrets().catch(console.error);