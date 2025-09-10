import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, hashPassword, validatePassword, validateEmail, validateUsername } from '@/lib/auth';
import { userQueries } from '@/lib/db';
import { LoginCredentials } from '@/types/exam';

// POST /api/auth - Login
export async function POST(request: NextRequest) {
  try {
    const { action, ...data } = await request.json();

    if (action === 'login') {
      return await handleLogin(data);
    } else if (action === 'register') {
      return await handleRegister(data);
    } else if (action === 'verify-token') {
      return await handleVerifyToken(request);
    }

    return NextResponse.json(
      { success: false, message: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Auth API error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle login
async function handleLogin(credentials: LoginCredentials) {
  const result = await authenticateUser(credentials);

  if (result.success) {
    const response = NextResponse.json(result);
    
    // Set HTTP-only cookie for token
    if (result.token) {
      response.cookies.set('auth-token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: '/'
      });
    }
    
    return response;
  } else {
    return NextResponse.json(result, { status: 401 });
  }
}

// Handle registration (admin only)
async function handleRegister(data: {
  username: string;
  email: string;
  password: string;
  role: 'teacher' | 'student';
  fullName: string;
  class?: string;
  subject?: string;
}) {
  try {
    // Validate input
    const usernameValidation = validateUsername(data.username);
    if (!usernameValidation.isValid) {
      return NextResponse.json({
        success: false,
        message: 'Username validation failed',
        errors: usernameValidation.errors
      }, { status: 400 });
    }

    if (!validateEmail(data.email)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid email format'
      }, { status: 400 });
    }

    const passwordValidation = validatePassword(data.password);
    if (!passwordValidation.isValid) {
      return NextResponse.json({
        success: false,
        message: 'Password validation failed',
        errors: passwordValidation.errors
      }, { status: 400 });
    }

    // Check if username or email already exists
    const existingUsername = userQueries.findByUsername.get(data.username);
    if (existingUsername) {
      return NextResponse.json({
        success: false,
        message: 'Username already exists'
      }, { status: 409 });
    }

    const existingEmail = userQueries.findByEmail.get(data.email);
    if (existingEmail) {
      return NextResponse.json({
        success: false,
        message: 'Email already exists'
      }, { status: 409 });
    }

    // Hash password
    const hashedPassword = await hashPassword(data.password);

    // Create user
    const result = userQueries.createUser.run(
      data.username,
      data.email,
      hashedPassword,
      data.role,
      data.fullName,
      data.class || null,
      data.subject || null
    );

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      data: { userId: result.lastInsertRowid }
    });

  } catch (error: any) {
    console.error('Registration error:', error);
    
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json({
        success: false,
        message: 'Username or email already exists'
      }, { status: 409 });
    }

    return NextResponse.json({
      success: false,
      message: 'Registration failed'
    }, { status: 500 });
  }
}

// Handle token verification
async function handleVerifyToken(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('auth-token')?.value;
    
    const token = authHeader?.replace('Bearer ', '') || cookieToken;
    
    if (!token) {
      return NextResponse.json({
        success: false,
        message: 'No token provided'
      }, { status: 401 });
    }

    const { getUserFromToken } = await import('@/lib/auth');
    const user = getUserFromToken(token);

    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'Invalid or expired token'
      }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user,
      message: 'Token valid'
    });

  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json({
      success: false,
      message: 'Token verification failed'
    }, { status: 401 });
  }
}

// GET /api/auth - Get current user
export async function GET(request: NextRequest) {
  return await handleVerifyToken(request);
}

// DELETE /api/auth - Logout
export async function DELETE(request: NextRequest) {
  try {
    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    });

    // Clear the auth cookie
    response.cookies.set('auth-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/'
    });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({
      success: false,
      message: 'Logout failed'
    }, { status: 500 });
  }
}