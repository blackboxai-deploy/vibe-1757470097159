import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeaders, getUserFromToken, canAccessExam } from '@/lib/auth';
import { examQueries, questionQueries } from '@/lib/db';
import { Exam, Question } from '@/types/exam';

interface RouteParams {
  params: {
    id: string;
  };
}

// GET /api/exams/[id] - Get specific exam with questions
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const examId = parseInt(params.id);
    const { searchParams } = new URL(request.url);
    const includeQuestions = searchParams.get('includeQuestions') === 'true';
    const includeAnswers = searchParams.get('includeAnswers') === 'true';

    // Get user from token
    const token = extractTokenFromHeaders(request.headers) || request.cookies.get('auth-token')?.value;
    const user = token ? getUserFromToken(token) : null;

    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'Authentication required'
      }, { status: 401 });
    }

    // Get exam
    const exam = examQueries.findById.get(examId) as Exam | undefined;
    if (!exam) {
      return NextResponse.json({
        success: false,
        message: 'Exam not found'
      }, { status: 404 });
    }

    // Check access permissions
    if (!canAccessExam(user, exam.teacherId)) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized to access this exam'
      }, { status: 403 });
    }

    let responseData: any = exam;

    if (includeQuestions) {
      const questions = questionQueries.findByExam.all(examId) as Question[];
      
      // If student is taking exam, don't include correct answers
      if (user.role === 'student' && !includeAnswers) {
        responseData.questions = questions.map(q => ({
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options ? JSON.parse(q.options) : [],
          points: q.points,
          imageUrl: q.imageUrl,
          order: q.order
        }));
      } else {
        // Teachers and admins get full question data
        responseData.questions = questions.map(q => ({
          ...q,
          options: q.options ? JSON.parse(q.options) : []
        }));
      }
    }

    return NextResponse.json({
      success: true,
      data: responseData,
      message: 'Exam retrieved successfully'
    });

  } catch (error) {
    console.error('Get exam error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to retrieve exam'
    }, { status: 500 });
  }
}

// POST /api/exams/[id] - Start exam attempt
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const examId = parseInt(params.id);
    const token = extractTokenFromHeaders(request.headers) || request.cookies.get('auth-token')?.value;
    const user = token ? getUserFromToken(token) : null;

    if (!user || user.role !== 'student') {
      return NextResponse.json({
        success: false,
        message: 'Student access required'
      }, { status: 403 });
    }

    // Get exam
    const exam = examQueries.findById.get(examId) as Exam | undefined;
    if (!exam) {
      return NextResponse.json({
        success: false,
        message: 'Exam not found'
      }, { status: 404 });
    }

    // Check if exam is active and within time window
    const now = new Date();
    const startTime = new Date(exam.startTime);
    const endTime = new Date(exam.endTime);

    if (!exam.isActive) {
      return NextResponse.json({
        success: false,
        message: 'This exam is not active'
      }, { status: 400 });
    }

    if (now < startTime) {
      return NextResponse.json({
        success: false,
        message: 'Exam has not started yet'
      }, { status: 400 });
    }

    if (now > endTime) {
      return NextResponse.json({
        success: false,
        message: 'Exam has ended'
      }, { status: 400 });
    }

    // Check if student already has an attempt for this exam
    const { attemptQueries } = await import('@/lib/db');
    const existingAttempt = attemptQueries.findByStudentAndExam.get(user.id, examId);
    
    if (existingAttempt) {
      return NextResponse.json({
        success: false,
        message: 'You have already taken this exam',
        data: { attemptId: existingAttempt.id }
      }, { status: 400 });
    }

    // Get client information
    const clientIP = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Create new attempt
    const result = attemptQueries.createAttempt.run(
      examId,
      user.id,
      now.toISOString(),
      clientIP,
      userAgent
    );

    const attemptId = result.lastInsertRowid;

    // Get questions for the exam
    const questions = questionQueries.findByExam.all(examId) as Question[];
    
    // Prepare questions for student (without correct answers)
    const examQuestions = questions.map(q => ({
      id: q.id,
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options ? JSON.parse(q.options) : [],
      points: q.points,
      imageUrl: q.imageUrl,
      order: q.order
    }));

    // Shuffle questions if required
    if (exam.shuffleQuestions) {
      examQuestions.sort(() => Math.random() - 0.5);
    }

    return NextResponse.json({
      success: true,
      data: {
        attemptId,
        exam: {
          id: exam.id,
          title: exam.title,
          description: exam.description,
          duration: exam.duration,
          totalQuestions: exam.totalQuestions
        },
        questions: examQuestions,
        startTime: now.toISOString()
      },
      message: 'Exam attempt started successfully'
    });

  } catch (error) {
    console.error('Start exam attempt error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to start exam'
    }, { status: 500 });
  }
}

// PUT /api/exams/[id] - Submit exam attempt
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const examId = parseInt(params.id);
    const token = extractTokenFromHeaders(request.headers) || request.cookies.get('auth-token')?.value;
    const user = token ? getUserFromToken(token) : null;

    if (!user || user.role !== 'student') {
      return NextResponse.json({
        success: false,
        message: 'Student access required'
      }, { status: 403 });
    }

    const { attemptId, answers, timeSpent } = await request.json();

    if (!attemptId || !answers) {
      return NextResponse.json({
        success: false,
        message: 'Attempt ID and answers are required'
      }, { status: 400 });
    }

    // Get attempt
    const { attemptQueries, answerQueries, resultQueries } = await import('@/lib/db');
    const attempt = attemptQueries.findById.get(attemptId);
    
    if (!attempt || attempt.studentId !== user.id || attempt.examId !== examId) {
      return NextResponse.json({
        success: false,
        message: 'Invalid attempt'
      }, { status: 400 });
    }

    if (attempt.status !== 'in_progress') {
      return NextResponse.json({
        success: false,
        message: 'Attempt already completed'
      }, { status: 400 });
    }

    // Get exam and questions
    const exam = examQueries.findById.get(examId) as Exam;
    const questions = questionQueries.findByExam.all(examId) as Question[];

    // Calculate score
    let totalScore = 0;
    let totalPoints = 0;
    let correctAnswers = 0;
    let wrongAnswers = 0;
    let skippedAnswers = 0;

    for (const question of questions) {
      totalPoints += question.points;
      const studentAnswer = answers[question.id];
      
      if (studentAnswer === undefined || studentAnswer === '') {
        skippedAnswers++;
        answerQueries.createAnswer.run(
          attemptId,
          question.id,
          '',
          false,
          0,
          0
        );
      } else {
        const isCorrect = studentAnswer.toString() === question.correctAnswer;
        const pointsEarned = isCorrect ? question.points : 0;
        
        totalScore += pointsEarned;
        if (isCorrect) correctAnswers++;
        else wrongAnswers++;

        answerQueries.createAnswer.run(
          attemptId,
          question.id,
          studentAnswer.toString(),
          isCorrect,
          pointsEarned,
          0 // Individual question time tracking not implemented yet
        );
      }
    }

    const percentage = totalPoints > 0 ? (totalScore / totalPoints) * 100 : 0;
    const passed = percentage >= exam.passingScore;
    const grade = getGrade(percentage);

    // Update attempt
    const now = new Date();
    attemptQueries.updateAttempt.run(
      now.toISOString(),
      'completed',
      totalScore,
      totalPoints,
      percentage,
      timeSpent || 0,
      attemptId
    );

    // Create result record
    const resultId = resultQueries.createResult.run(
      attemptId,
      user.id,
      examId,
      totalScore,
      totalPoints,
      percentage,
      grade,
      passed,
      timeSpent || 0,
      correctAnswers,
      wrongAnswers,
      skippedAnswers,
      passed ? 'Selamat! Anda lulus ujian ini.' : 'Maaf, Anda belum lulus ujian ini. Silakan belajar lebih giat.'
    );

    return NextResponse.json({
      success: true,
      data: {
        resultId: resultId.lastInsertRowid,
        score: totalScore,
        totalPoints,
        percentage: Math.round(percentage * 100) / 100,
        grade,
        passed,
        correctAnswers,
        wrongAnswers,
        skippedAnswers
      },
      message: 'Exam submitted successfully'
    });

  } catch (error) {
    console.error('Submit exam error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to submit exam'
    }, { status: 500 });
  }
}

// Helper function to calculate grade
function getGrade(percentage: number): string {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'E';
}