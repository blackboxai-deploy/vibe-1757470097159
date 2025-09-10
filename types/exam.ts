// Types for School Exam Application

export interface User {
  id: number;
  username: string;
  email: string;
  password: string; // hashed
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
  class?: string; // for students
  subject?: string; // for teachers
  createdAt: string;
  updatedAt: string;
}

export interface Exam {
  id: number;
  title: string;
  description: string;
  subject: string;
  teacherId: number;
  duration: number; // in minutes
  totalQuestions: number;
  passingScore: number; // percentage
  startTime: string;
  endTime: string;
  isActive: boolean;
  allowReview: boolean;
  shuffleQuestions: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Question {
  id: number;
  examId: number;
  questionText: string;
  questionType: 'multiple_choice' | 'true_false' | 'essay';
  options: string[]; // JSON array for multiple choice
  correctAnswer: string | number; // index for multiple choice, text for others
  points: number;
  explanation?: string;
  imageUrl?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExamAttempt {
  id: number;
  examId: number;
  studentId: number;
  startTime: string;
  endTime?: string;
  status: 'in_progress' | 'completed' | 'abandoned' | 'time_out';
  score?: number;
  totalPoints?: number;
  percentage?: number;
  answers: ExamAnswer[];
  timeSpent: number; // in seconds
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamAnswer {
  id: number;
  attemptId: number;
  questionId: number;
  answer: string | number;
  isCorrect: boolean;
  pointsEarned: number;
  timeSpent: number; // seconds spent on this question
  createdAt: string;
}

export interface ExamResult {
  id: number;
  attemptId: number;
  studentId: number;
  examId: number;
  score: number;
  totalPoints: number;
  percentage: number;
  grade: string;
  passed: boolean;
  completionTime: number; // in seconds
  correctAnswers: number;
  wrongAnswers: number;
  skippedAnswers: number;
  feedback?: string;
  createdAt: string;
}

// Frontend specific types
export interface ExamSession {
  exam: Exam;
  questions: Question[];
  currentQuestionIndex: number;
  answers: Record<number, string | number>;
  timeRemaining: number; // in seconds
  startTime: string;
  isSubmitted: boolean;
}

export interface QuestionCardProps {
  question: Question;
  answer?: string | number;
  onAnswerChange: (questionId: number, answer: string | number) => void;
  showCorrectAnswer?: boolean;
  showExplanation?: boolean;
  isReviewMode?: boolean;
  questionNumber: number;
  totalQuestions: number;
}

export interface TimerProps {
  duration: number; // in seconds
  onTimeUp: () => void;
  onTick?: (timeRemaining: number) => void;
  autoStart?: boolean;
}

export interface ExamStats {
  totalExams: number;
  activeExams: number;
  totalStudents: number;
  totalAttempts: number;
  averageScore: number;
  passRate: number;
  topPerformers: Array<{
    studentName: string;
    score: number;
    examTitle: string;
  }>;
  recentActivity: Array<{
    type: 'exam_created' | 'exam_completed' | 'student_registered';
    description: string;
    timestamp: string;
  }>;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  user?: Omit<User, 'password'>;
  token?: string;
  message: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message: string;
  error?: string;
}

// Chart data types for results visualization
export interface ChartDataPoint {
  name: string;
  value: number;
  percentage?: number;
}

export interface ExamPerformanceData {
  examTitle: string;
  averageScore: number;
  totalAttempts: number;
  passRate: number;
  scoreDistribution: ChartDataPoint[];
  questionAnalysis: Array<{
    questionId: number;
    questionText: string;
    correctRate: number;
    averageTime: number;
  }>;
}

// PWA and Mobile types
export interface PWAConfig {
  name: string;
  short_name: string;
  description: string;
  theme_color: string;
  background_color: string;
  display: 'standalone' | 'fullscreen' | 'minimal-ui';
  orientation: 'portrait' | 'landscape' | 'any';
  start_url: string;
  scope: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: any;
}