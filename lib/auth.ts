import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, LoginCredentials, AuthResponse } from '@/types/exam';
import { userQueries } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'school-exam-secret-key-2024';
const JWT_EXPIRES_IN = '7d';

export interface JWTPayload {
  userId: number;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// Compare password
export async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// Generate JWT token
export function generateToken(user: Omit<User, 'password'>): string {
  const payload: JWTPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Verify JWT token
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

// Authenticate user
export async function authenticateUser(credentials: LoginCredentials): Promise<AuthResponse> {
  try {
    const { username, password } = credentials;

    if (!username || !password) {
      return {
        success: false,
        message: 'Username and password are required'
      };
    }

    // Find user by username
    const user = userQueries.findByUsername.get(username) as User | undefined;
    
    if (!user) {
      return {
        success: false,
        message: 'Invalid username or password'
      };
    }

    // Compare password
    const isValidPassword = await comparePassword(password, user.password);
    
    if (!isValidPassword) {
      return {
        success: false,
        message: 'Invalid username or password'
      };
    }

    // Generate token
    const userWithoutPassword = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      class: user.class,
      subject: user.subject,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    } as Omit<User, 'password'>;

    const token = generateToken(userWithoutPassword);

    return {
      success: true,
      user: userWithoutPassword,
      token,
      message: 'Login successful'
    };

  } catch (error) {
    console.error('Authentication error:', error);
    return {
      success: false,
      message: 'Internal server error'
    };
  }
}

// Get user from token
export function getUserFromToken(token: string): Omit<User, 'password'> | null {
  try {
    const decoded = verifyToken(token);
    if (!decoded) return null;

    const user = userQueries.findById.get(decoded.userId) as User | undefined;
    if (!user) return null;

    const userWithoutPassword = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      class: user.class,
      subject: user.subject,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    } as Omit<User, 'password'>;

    return userWithoutPassword;
  } catch (error) {
    console.error('Get user from token error:', error);
    return null;
  }
}

// Middleware to extract token from request headers
export function extractTokenFromHeaders(headers: Headers): string | null {
  const authHeader = headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7); // Remove 'Bearer ' prefix
}

// Role-based access control
export function hasRole(user: Omit<User, 'password'>, roles: string[]): boolean {
  return roles.includes(user.role);
}

// Check if user is admin
export function isAdmin(user: Omit<User, 'password'>): boolean {
  return user.role === 'admin';
}

// Check if user is teacher
export function isTeacher(user: Omit<User, 'password'>): boolean {
  return user.role === 'teacher';
}

// Check if user is student
export function isStudent(user: Omit<User, 'password'>): boolean {
  return user.role === 'student';
}

// Validate user permissions for exam
export function canAccessExam(user: Omit<User, 'password'>, teacherId?: number): boolean {
  if (isAdmin(user)) return true;
  if (isTeacher(user) && teacherId === user.id) return true;
  if (isStudent(user)) return true; // Students can access exams to take them
  return false;
}

// Validate user permissions for exam management
export function canManageExam(user: Omit<User, 'password'>, teacherId?: number): boolean {
  if (isAdmin(user)) return true;
  if (isTeacher(user) && teacherId === user.id) return true;
  return false;
}

// Generate secure session ID
export function generateSessionId(): string {
  return jwt.sign(
    { sessionId: Math.random().toString(36).substring(2, 15), timestamp: Date.now() },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Password strength validation
export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }
  
  if (!/[A-Za-z]/.test(password)) {
    errors.push('Password must contain at least one letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Email validation
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Username validation
export function validateUsername(username: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (username.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }
  
  if (username.length > 20) {
    errors.push('Username must be less than 20 characters');
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, and underscores');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Clean user data for frontend (remove sensitive info)
export function sanitizeUser(user: User): Omit<User, 'password'> {
  const { password, ...sanitizedUser } = user;
  return sanitizedUser;
}

export default {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  authenticateUser,
  getUserFromToken,
  extractTokenFromHeaders,
  hasRole,
  isAdmin,
  isTeacher,
  isStudent,
  canAccessExam,
  canManageExam,
  generateSessionId,
  validatePassword,
  validateEmail,
  validateUsername,
  sanitizeUser
};