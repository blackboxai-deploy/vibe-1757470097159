import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { User, Exam, Question, ExamAttempt, ExamAnswer, ExamResult } from '@/types/exam';

const db = new Database('exam_school.db');

// Enable foreign key constraints
db.pragma('foreign_keys = ON');

// Initialize database schema
export function initializeDatabase() {
  try {
    // Users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('admin', 'teacher', 'student')) NOT NULL,
        fullName TEXT NOT NULL,
        class TEXT,
        subject TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Exams table
    db.exec(`
      CREATE TABLE IF NOT EXISTS exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        subject TEXT NOT NULL,
        teacherId INTEGER NOT NULL,
        duration INTEGER NOT NULL, -- in minutes
        totalQuestions INTEGER DEFAULT 0,
        passingScore INTEGER DEFAULT 60, -- percentage
        startTime DATETIME NOT NULL,
        endTime DATETIME NOT NULL,
        isActive BOOLEAN DEFAULT TRUE,
        allowReview BOOLEAN DEFAULT TRUE,
        shuffleQuestions BOOLEAN DEFAULT FALSE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacherId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Questions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        examId INTEGER NOT NULL,
        questionText TEXT NOT NULL,
        questionType TEXT CHECK(questionType IN ('multiple_choice', 'true_false', 'essay')) NOT NULL,
        options TEXT, -- JSON array for multiple choice
        correctAnswer TEXT NOT NULL,
        points INTEGER DEFAULT 1,
        explanation TEXT,
        imageUrl TEXT,
        "order" INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (examId) REFERENCES exams(id) ON DELETE CASCADE
      )
    `);

    // Exam attempts table
    db.exec(`
      CREATE TABLE IF NOT EXISTS exam_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        examId INTEGER NOT NULL,
        studentId INTEGER NOT NULL,
        startTime DATETIME NOT NULL,
        endTime DATETIME,
        status TEXT CHECK(status IN ('in_progress', 'completed', 'abandoned', 'time_out')) DEFAULT 'in_progress',
        score INTEGER,
        totalPoints INTEGER,
        percentage REAL,
        timeSpent INTEGER DEFAULT 0, -- in seconds
        ipAddress TEXT,
        userAgent TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (examId) REFERENCES exams(id) ON DELETE CASCADE,
        FOREIGN KEY (studentId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Exam answers table
    db.exec(`
      CREATE TABLE IF NOT EXISTS exam_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attemptId INTEGER NOT NULL,
        questionId INTEGER NOT NULL,
        answer TEXT NOT NULL,
        isCorrect BOOLEAN DEFAULT FALSE,
        pointsEarned INTEGER DEFAULT 0,
        timeSpent INTEGER DEFAULT 0, -- seconds spent on this question
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (attemptId) REFERENCES exam_attempts(id) ON DELETE CASCADE,
        FOREIGN KEY (questionId) REFERENCES questions(id) ON DELETE CASCADE
      )
    `);

    // Exam results table
    db.exec(`
      CREATE TABLE IF NOT EXISTS exam_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attemptId INTEGER UNIQUE NOT NULL,
        studentId INTEGER NOT NULL,
        examId INTEGER NOT NULL,
        score INTEGER NOT NULL,
        totalPoints INTEGER NOT NULL,
        percentage REAL NOT NULL,
        grade TEXT,
        passed BOOLEAN NOT NULL,
        completionTime INTEGER NOT NULL, -- in seconds
        correctAnswers INTEGER DEFAULT 0,
        wrongAnswers INTEGER DEFAULT 0,
        skippedAnswers INTEGER DEFAULT 0,
        feedback TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (attemptId) REFERENCES exam_attempts(id) ON DELETE CASCADE,
        FOREIGN KEY (studentId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (examId) REFERENCES exams(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_exams_teacher ON exams(teacherId);
      CREATE INDEX IF NOT EXISTS idx_exams_subject ON exams(subject);
      CREATE INDEX IF NOT EXISTS idx_exams_active ON exams(isActive);
      CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(examId);
      CREATE INDEX IF NOT EXISTS idx_attempts_exam ON exam_attempts(examId);
      CREATE INDEX IF NOT EXISTS idx_attempts_student ON exam_attempts(studentId);
      CREATE INDEX IF NOT EXISTS idx_answers_attempt ON exam_answers(attemptId);
      CREATE INDEX IF NOT EXISTS idx_results_student ON exam_results(studentId);
      CREATE INDEX IF NOT EXISTS idx_results_exam ON exam_results(examId);
    `);

    console.log('✅ Database schema initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    return false;
  }
}

// Seed initial data
export function seedDatabase() {
  try {
    // Check if admin user exists
    const adminExists = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin');
    
    if (!adminExists) {
      // Create default admin user
      const hashedPassword = bcrypt.hashSync('admin123', 12);
      
      db.prepare(`
        INSERT INTO users (username, email, password, role, fullName)
        VALUES (?, ?, ?, ?, ?)
      `).run('admin', 'admin@school.com', hashedPassword, 'admin', 'Administrator');

      // Create sample teacher
      const teacherPassword = bcrypt.hashSync('teacher123', 12);
      const teacherId = db.prepare(`
        INSERT INTO users (username, email, password, role, fullName, subject)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('teacher1', 'teacher@school.com', teacherPassword, 'teacher', 'Budi Santoso', 'Matematika').lastInsertRowid;

      // Create sample students
      const studentPassword = bcrypt.hashSync('student123', 12);
      
      const students = [
        { username: 'siswa1', email: 'siswa1@school.com', fullName: 'Andi Wijaya', class: '10A' },
        { username: 'siswa2', email: 'siswa2@school.com', fullName: 'Sari Dewi', class: '10A' },
        { username: 'siswa3', email: 'siswa3@school.com', fullName: 'Rizki Pratama', class: '10B' },
        { username: 'siswa4', email: 'siswa4@school.com', fullName: 'Maya Sari', class: '10B' }
      ];

      for (const student of students) {
        db.prepare(`
          INSERT INTO users (username, email, password, role, fullName, class)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(student.username, student.email, studentPassword, 'student', student.fullName, student.class);
      }

      // Create sample exam
      const examId = db.prepare(`
        INSERT INTO exams (title, description, subject, teacherId, duration, passingScore, startTime, endTime)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'Ujian Matematika - Aljabar',
        'Ujian tentang konsep dasar aljabar untuk kelas 10',
        'Matematika',
        teacherId,
        90, // 90 minutes
        70, // 70% passing score
        new Date().toISOString(),
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
      ).lastInsertRowid;

      // Create sample questions
      const questions = [
        {
          questionText: 'Hasil dari 2x + 3 = 9 adalah?',
          type: 'multiple_choice',
          options: JSON.stringify(['x = 2', 'x = 3', 'x = 4', 'x = 6']),
          correctAnswer: '1', // index 1 = 'x = 3'
          points: 10,
          explanation: 'Untuk menyelesaikan 2x + 3 = 9, kurangkan 3 dari kedua sisi: 2x = 6, lalu bagi dengan 2: x = 3'
        },
        {
          questionText: 'Apa itu variabel dalam aljabar?',
          type: 'multiple_choice',
          options: JSON.stringify(['Angka tetap', 'Simbol yang mewakili nilai yang tidak diketahui', 'Operasi matematika', 'Hasil akhir']),
          correctAnswer: '1',
          points: 10,
          explanation: 'Variabel adalah simbol (biasanya huruf) yang mewakili nilai yang tidak diketahui atau dapat berubah'
        },
        {
          questionText: 'Sederhanakan: 3x + 2x',
          type: 'multiple_choice',
          options: JSON.stringify(['5x', '6x', '5x²', '3x²']),
          correctAnswer: '0',
          points: 10,
          explanation: 'Suku-suku sejenis dapat dijumlahkan: 3x + 2x = (3 + 2)x = 5x'
        },
        {
          questionText: 'Jika x = 4, maka nilai dari 2x - 5 adalah?',
          type: 'multiple_choice',
          options: JSON.stringify(['3', '5', '8', '13']),
          correctAnswer: '0',
          points: 10,
          explanation: 'Substitusikan x = 4: 2(4) - 5 = 8 - 5 = 3'
        },
        {
          questionText: 'Persamaan linear adalah persamaan yang memiliki pangkat tertinggi 1',
          type: 'true_false',
          options: JSON.stringify(['Benar', 'Salah']),
          correctAnswer: '0',
          points: 10,
          explanation: 'Benar, persamaan linear adalah persamaan yang variabelnya berpangkat tertinggi 1'
        }
      ];

      questions.forEach((q, index) => {
        db.prepare(`
          INSERT INTO questions (examId, questionText, questionType, options, correctAnswer, points, explanation, "order")
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(examId, q.questionText, q.type, q.options, q.correctAnswer, q.points, q.explanation, index + 1);
      });

      // Update total questions in exam
      db.prepare('UPDATE exams SET totalQuestions = ? WHERE id = ?').run(questions.length, examId);

      console.log('✅ Database seeded with sample data');
      console.log('📋 Login credentials:');
      console.log('   Admin: admin / admin123');
      console.log('   Teacher: teacher1 / teacher123');
      console.log('   Student: siswa1 / student123');
    }

    return true;
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    return false;
  }
}

// Database query helpers
export const userQueries = {
  findByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  findByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  findById: db.prepare('SELECT * FROM users WHERE id = ?'),
  createUser: db.prepare(`
    INSERT INTO users (username, email, password, role, fullName, class, subject)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  updateUser: db.prepare(`
    UPDATE users SET username = ?, email = ?, fullName = ?, class = ?, subject = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  getAllStudents: db.prepare('SELECT id, username, fullName, class, email FROM users WHERE role = "student"'),
  getAllTeachers: db.prepare('SELECT id, username, fullName, subject, email FROM users WHERE role = "teacher"'),
};

export const examQueries = {
  findById: db.prepare('SELECT * FROM exams WHERE id = ?'),
  findByTeacher: db.prepare('SELECT * FROM exams WHERE teacherId = ? ORDER BY createdAt DESC'),
  findActive: db.prepare('SELECT * FROM exams WHERE isActive = TRUE AND startTime <= ? AND endTime >= ?'),
  createExam: db.prepare(`
    INSERT INTO exams (title, description, subject, teacherId, duration, passingScore, startTime, endTime, isActive, allowReview, shuffleQuestions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateExam: db.prepare(`
    UPDATE exams SET title = ?, description = ?, subject = ?, duration = ?, passingScore = ?, startTime = ?, endTime = ?, isActive = ?, allowReview = ?, shuffleQuestions = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  updateTotalQuestions: db.prepare('UPDATE exams SET totalQuestions = ? WHERE id = ?'),
  getAll: db.prepare('SELECT e.*, u.fullName as teacherName FROM exams e JOIN users u ON e.teacherId = u.id ORDER BY e.createdAt DESC'),
};

export const questionQueries = {
  findByExam: db.prepare('SELECT * FROM questions WHERE examId = ? ORDER BY "order"'),
  createQuestion: db.prepare(`
    INSERT INTO questions (examId, questionText, questionType, options, correctAnswer, points, explanation, imageUrl, "order")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateQuestion: db.prepare(`
    UPDATE questions SET questionText = ?, questionType = ?, options = ?, correctAnswer = ?, points = ?, explanation = ?, imageUrl = ?, "order" = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  deleteQuestion: db.prepare('DELETE FROM questions WHERE id = ?'),
  countByExam: db.prepare('SELECT COUNT(*) as count FROM questions WHERE examId = ?'),
};

export const attemptQueries = {
  createAttempt: db.prepare(`
    INSERT INTO exam_attempts (examId, studentId, startTime, ipAddress, userAgent)
    VALUES (?, ?, ?, ?, ?)
  `),
  findById: db.prepare('SELECT * FROM exam_attempts WHERE id = ?'),
  findByStudentAndExam: db.prepare('SELECT * FROM exam_attempts WHERE studentId = ? AND examId = ?'),
  updateAttempt: db.prepare(`
    UPDATE exam_attempts SET endTime = ?, status = ?, score = ?, totalPoints = ?, percentage = ?, timeSpent = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  getStudentAttempts: db.prepare(`
    SELECT ea.*, e.title as examTitle, e.subject
    FROM exam_attempts ea
    JOIN exams e ON ea.examId = e.id
    WHERE ea.studentId = ?
    ORDER BY ea.createdAt DESC
  `),
};

export const answerQueries = {
  createAnswer: db.prepare(`
    INSERT INTO exam_answers (attemptId, questionId, answer, isCorrect, pointsEarned, timeSpent)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  findByAttempt: db.prepare('SELECT * FROM exam_answers WHERE attemptId = ?'),
  updateAnswer: db.prepare(`
    UPDATE exam_answers SET answer = ?, isCorrect = ?, pointsEarned = ?, timeSpent = ?
    WHERE attemptId = ? AND questionId = ?
  `),
};

export const resultQueries = {
  createResult: db.prepare(`
    INSERT INTO exam_results (attemptId, studentId, examId, score, totalPoints, percentage, grade, passed, completionTime, correctAnswers, wrongAnswers, skippedAnswers, feedback)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  findByAttempt: db.prepare('SELECT * FROM exam_results WHERE attemptId = ?'),
  findByStudent: db.prepare(`
    SELECT er.*, e.title as examTitle, e.subject
    FROM exam_results er
    JOIN exams e ON er.examId = e.id
    WHERE er.studentId = ?
    ORDER BY er.createdAt DESC
  `),
  findByExam: db.prepare(`
    SELECT er.*, u.fullName as studentName
    FROM exam_results er
    JOIN users u ON er.studentId = u.id
    WHERE er.examId = ?
    ORDER BY er.percentage DESC
  `),
  getExamStats: db.prepare(`
    SELECT 
      COUNT(*) as totalAttempts,
      AVG(percentage) as averageScore,
      COUNT(CASE WHEN passed = 1 THEN 1 END) as passedCount
    FROM exam_results 
    WHERE examId = ?
  `),
};

// Initialize database on module load
initializeDatabase();
seedDatabase();

export default db;