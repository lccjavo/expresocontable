import { getStore } from '@netlify/blobs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export function parseBody(event) {
  try {
    return JSON.parse(event.body || '{}');
  } catch {
    return {};
  }
}

export function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

export function userKey(email) {
  return `users/${normalizeEmail(email)}`;
}

export function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-only-change-me-expreso-contable';
}

export function getUsersStore() {
  return getStore('expreso-contable-users');
}

export function publicUser(user) {
  return {
    email: user.email,
    businessName: user.businessName,
    createdAt: user.createdAt,
  };
}

export function signToken(user) {
  return jwt.sign({ email: user.email, businessName: user.businessName }, getJwtSecret(), { expiresIn: '7d' });
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function checkPassword(password, hash) {
  return bcrypt.compare(password, hash);
}
