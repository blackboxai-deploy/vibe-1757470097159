import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeaders, getUserFromToken, canManageExam, canAccessExam } from '@/lib/auth';
import { examQueries, questionQueries } from '@/lib/db';
import { Exam } from '@/types/exam';

// GET /api/exams - Get all exams or exams by teacher
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get('teacherId');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    // Get user from token
    const token = extractTokenFromHeaders(request.headers) || request.cookies.get('auth-token')?.value;
    const user = token ? getUserFromToken(token) : null;

    let exams: any[] = [];

    if (teacherId) {
      // Get exams by specific teacher
      if (user && canAccessExam(user, parseInt(teacherId))) {
        exams = examQueries.findByTeacher.all(teacherId);
      } else {
        return NextResponse.json({
          success: false,
          message: 'Unauthorized to view these exams'
        }, { status: 403 });
      }
    } else if (activeOnly) {
      // Get only active exams
      const now = new Date().toISOString();
      exams = examQueries.findActive.all(now, now);
    } else {
      // Get all exams (admin only)
      if (user?.role !== 'admin') {
        return NextResponse.json({
          success: false,
          message: 'Admin access required'
        }, { status: 403 });
      }
      exams = examQueries.getAll.all();
    }

    return NextResponse.json({
      success: true,
      data: exams,
      message: 'Exams retrieved successfully'
    });

  } catch (error) {
    console.error('Get exams error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to retrieve exams'
    }, { status: 500 });
  }
}

// POST /api/exams - Create new exam
export async function POST(request: NextRequest) {
  try {
    const token = extractTokenFromHeaders(request.headers) || request.cookies.get('auth-token')?.value;
    const user = token ? getUserFromToken(token) : null;

    if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
      return NextResponse.json({
        success: false,
        message: 'Teacher or admin access required'
      }, { status: 403 });
    }

    const examData = await request.json();

    // Validate required fields
    const requiredFields = ['title', 'subject', 'duration', 'startTime', 'endTime'];
    for (const field of requiredFields) {
      if (!examData[field]) {
        return NextResponse.json({
          success: false,
          message: `${field} is required`
        }, { status: 400 });
      }
    }

    // Validate dates
    const startTime = new Date(examData.startTime);
    const endTime = new Date(examData.endTime);
    
    if (startTime >= endTime) {
      return NextResponse.json({
        success: false,
        message: 'End time must be after start time'
      }, { status: 400 });
    }

    // Set teacherId based on user role
    const teacherId = user.role === 'admin' && examData.teacherId ? examData.teacherId : user.id;

    // Create exam
    const result = examQueries.createExam.run(
      examData.title,
      examData.description || '',
      examData.subject,
      teacherId,
      examData.duration,
      examData.passingScore || 60,
      examData.startTime,
      examData.endTime,
      examData.isActive !== false, // default true
      examData.allowReview !== false, // default true
      examData.shuffleQuestions === true // default false
    );

    const examId = result.lastInsertRowid;

    return NextResponse.json({
      success: true,
      data: { examId },
      message: 'Exam created successfully'
    });

  } catch (error) {
    console.error('Create exam error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to create exam'
    }, { status: 500 });
  }
}

// PUT /api/exams - Update exam
export async function PUT(request: NextRequest) {
  try {
    const token = extractTokenFromHeaders(request.headers) || request.cookies.get('auth-token')?.value;
    const user = token ? getUserFromToken(token) : null;

    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'Authentication required'
      }, { status: 401 });
    }

    const { examId, ...updateData } = await request.json();

    if (!examId) {
      return NextResponse.json({
        success: false,
        message: 'Exam ID is required'
      }, { status: 400 });
    }

    // Get existing exam
    const existingExam = examQueries.findById.get(examId) as Exam | undefined;
    if (!existingExam) {
      return NextResponse.json({
        success: false,
        message: 'Exam not found'
      }, { status: 404 });
    }

    // Check permissions
    if (!canManageExam(user, existingExam.teacherId)) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized to update this exam'
      }, { status: 403 });
    }

    // Validate dates if provided
    if (updateData.startTime && updateData.endTime) {
      const startTime = new Date(updateData.startTime);
      const endTime = new Date(updateData.endTime);
      
      if (startTime >= endTime) {
        return NextResponse.json({
          success: false,
          message: 'End time must be after start time'
        }, { status: 400 });
      }
    }

    // Update exam
    examQueries.updateExam.run(
      updateData.title || existingExam.title,
      updateData.description ?? existingExam.description,
      updateData.subject || existingExam.subject,
      updateData.duration || existingExam.duration,
      updateData.passingScore ?? existingExam.passingScore,
      updateData.startTime || existingExam.startTime,
      updateData.endTime || existingExam.endTime,
      updateData.isActive ?? existingExam.isActive,
      updateData.allowReview ?? existingExam.allowReview,
      updateData.shuffleQuestions ?? existingExam.shuffleQuestions,
      examId
    );

    return NextResponse.json({
      success: true,
      message: 'Exam updated successfully'
    });

  } catch (error) {
    console.error('Update exam error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to update exam'
    }, { status: 500 });
  }
}

// DELETE /api/exams - Delete exam
export async function DELETE(request: NextRequest) {
  try {
    const token = extractTokenFromHeaders(request.headers) || request.cookies.get('auth-token')?.value;
    const user = token ? getUserFromToken(token) : null;

    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'Authentication required'
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('examId');

    if (!examId) {
      return NextResponse.json({
        success: false,
        message: 'Exam ID is required'
      }, { status: 400 });
    }

    // Get existing exam
    const existingExam = examQueries.findById.get(examId) as Exam | undefined;
    if (!existingExam) {
      return NextResponse.json({
        success: false,
        message: 'Exam not found'
      }, { status: 404 });
    }

    // Check permissions
    if (!canManageExam(user, existingExam.teacherId)) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized to delete this exam'
      }, { status: 403 });
    }

    // Note: Questions and related data will be deleted automatically due to CASCADE constraints
    examQueries.updateExam.run(
      existingExam.title,
      existingExam.description,
      existingExam.subject,
      existingExam.duration,
      existingExam.passingScore,
      existingExam.startTime,
      existingExam.endTime,
      false, // set isActive to false instead of actual deletion
      existingExam.allowReview,
      existingExam.shuffleQuestions,
      examId
    );

    return NextResponse.json({
      success: true,
      message: 'Exam deactivated successfully'
    });

  } catch (error) {
    console.error('Delete exam error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete exam'
    }, { status: 500 });
  }
}