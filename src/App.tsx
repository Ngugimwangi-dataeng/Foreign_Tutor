import React, { useCallback, useEffect, useState } from 'react';
import {
  Course,
  Enrollment,
  SharedMaterial,
  LanguageTest,
  TestSubmission,
  AudioSubmission,
  TutorRating,
  WordGameScore,
  UserProfile,
  PaymentMethod,
  PlanType,
  DailyLiveSession,
  ClassEmailNotification,
  SecurityAuditLog,
} from './types';
import {
  SEED_COURSES,
  SEED_ENROLLMENTS,
  SEED_MATERIALS,
  SEED_TESTS,
  SEED_TEST_SUBMISSIONS,
  SEED_AUDIO_SUBMISSIONS,
  SEED_RATINGS,
  SEED_LIVE_SESSIONS,
  SEED_EMAIL_NOTIFICATIONS,
} from './data/seedData';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { StudentEnrollmentArea } from './components/StudentEnrollmentArea';
import { TutorWorkspace } from './components/TutorWorkspace';
import { TutorAdminGate } from './components/TutorAdminGate';
import { CheckoutModal } from './components/CheckoutModal';
import { AuthModal } from './components/AuthModal';

import heroBannerImg from './assets/images/lughasmart_hero_banner_1794473845041.jpg';
import childrenWordGameImg from './assets/images/children_word_game_learning_1794674777766.jpg';
import culturalBridgeImg from './assets/images/kenyan_foreign_cultural_bridge_1794674777306.jpg';
import maasaiCultureImg from './assets/images/kenya_maasai_culture_1794473845063.jpg';
import swahiliCoastalImg from './assets/images/swahili_coastal_lamu_1794473845839.jpg';
import nairobiMarketImg from './assets/images/nairobi_market_visual_lesson_1794674778595.jpg';
import tutorAminaAvatarImg from './assets/images/tutor_amina_avatar_1794473845671.jpg';

const INITIAL_AUDIT_LOGS: SecurityAuditLog[] = [
  {
    id: 'audit-init-1',
    timestamp: '2026-11-14 08:00',
    actorEmail: 'amina.wambui@lughasmart.ac.ke',
    actorRole: 'tutor_admin',
    endpoint: '/tutor-admin',
    action: 'SYSTEM_BOOT_POLICY',
    httpStatus: 200,
    details: 'Isolated Tutor & Admin portal enabled. Student RBAC isolation enforced.',
  },
];

type AuthApiResponse = {
  user?: UserProfile;
  error?: string;
};

async function postAuthRequest(
  endpoint: '/api/auth/register' | '/api/auth/login',
  credentials: Record<string, string>
): Promise<UserProfile> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

  let payload: AuthApiResponse;
  try {
    payload = (await response.json()) as AuthApiResponse;
  } catch {
    throw new Error('Authentication service returned an invalid response.');
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Authentication request failed.');
  }
  if (!payload.user) {
    throw new Error('Authentication service did not return a user account.');
  }
  return payload.user;
}

function isTutorAdminUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.hash === '#/tutor-admin' ||
    window.location.pathname === '/tutor-admin'
  );
}

const BUNDLED_IMAGE_BY_FILENAME: Record<string, string> = {
  'lughasmart_hero_banner_1794473845041.jpg': heroBannerImg,
  'children_word_game_learning_1794674777766.jpg': childrenWordGameImg,
  'kenyan_foreign_cultural_bridge_1794674777306.jpg': culturalBridgeImg,
  'kenya_maasai_culture_1794473845063.jpg': maasaiCultureImg,
  'swahili_coastal_lamu_1794473845839.jpg': swahiliCoastalImg,
  'nairobi_market_visual_lesson_1794674778595.jpg': nairobiMarketImg,
  'tutor_amina_avatar_1794473845671.jpg': tutorAminaAvatarImg,
};

function resolveCourseImageUrl(
  rawDbUrl: string,
  fallbackSeedUrl: string,
  audience: 'adult' | 'children'
): string {
  const defaultImg = audience === 'children' ? childrenWordGameImg : culturalBridgeImg;
  const candidate = (rawDbUrl || fallbackSeedUrl || '').trim();

  if (!candidate) return defaultImg;
  if (
    candidate.startsWith('http://') ||
    candidate.startsWith('https://') ||
    candidate.startsWith('data:')
  ) {
    return candidate;
  }

  const fileName = candidate.split('/').pop()?.split('?')[0] || '';
  if (fileName && BUNDLED_IMAGE_BY_FILENAME[fileName]) {
    return BUNDLED_IMAGE_BY_FILENAME[fileName];
  }

  // If DB has a relative path that Vite won't serve in dist/, fall back to bundled asset
  if (candidate.startsWith('/src/') || candidate.startsWith('src/')) {
    return defaultImg;
  }

  return candidate.startsWith('/') ? candidate : `/${candidate}`;
}

function mapApiCourse(raw: Record<string, unknown>, fallback?: Course): Course {
  const perSession = Number(
    raw.per_session_price_kes ?? raw.perSessionPriceKes ?? fallback?.perSessionPriceKes ?? 1500
  );
  const monthlyPass = Number(
    raw.monthly_pass_price_kes ?? raw.monthlyPassPriceKes ?? fallback?.monthlyPassPriceKes ?? 9600
  );
  const durationMinutes = Number(
    raw.session_duration_minutes ??
      raw.sessionDurationMinutes ??
      fallback?.sessionDurationMinutes ??
      180
  );
  const courseId = String(raw.id ?? fallback?.id ?? '');

  const audience: 'adult' | 'children' = raw.audience === 'children' ? 'children' : 'adult';
  const rawFromDb = raw.image_url ?? raw.imageUrl;
  const dbUrl = typeof rawFromDb === 'string' ? rawFromDb.trim() : '';
  const seedUrl = typeof fallback?.imageUrl === 'string' ? fallback.imageUrl.trim() : '';
  const resolvedImageUrl = resolveCourseImageUrl(dbUrl, seedUrl, audience);

  return {
    id: courseId,
    title: String(raw.title ?? fallback?.title ?? ''),
    languageName: String(raw.language_name ?? raw.languageName ?? fallback?.languageName ?? ''),
    category: raw.category === 'foreign' ? 'foreign' : 'kenyan',
    audience,
    sessionDurationMinutes: durationMinutes === 60 ? 60 : 180,
    description: String(raw.description ?? fallback?.description ?? ''),
    level: String(raw.level ?? fallback?.level ?? 'Beginner to Intermediate'),
    perSessionPriceKes: perSession,
    monthlyPassPriceKes: monthlyPass,
    jitsiRoomName: String(raw.jitsi_room_name ?? raw.jitsiRoomName ?? fallback?.jitsiRoomName ?? ''),
    pdfTitle: String(raw.pdf_title ?? raw.pdfTitle ?? fallback?.pdfTitle ?? ''),
    tutorUid: String(raw.tutor_uid ?? raw.tutorUid ?? fallback?.tutorUid ?? ''),
    tutorName: String(raw.tutor_name ?? raw.tutorName ?? fallback?.tutorName ?? 'Dr. Amina Wambui'),
    imageUrl: resolvedImageUrl,
    lessonsCount: Number(raw.lessons_count ?? raw.lessonsCount ?? fallback?.lessonsCount ?? 10),
    modules: fallback?.modules ?? [],
  };
}

function mapApiEnrollment(
  raw: Record<string, unknown>,
  coursesList: Course[]
): Enrollment {
  const studentObj =
    raw.student && typeof raw.student === 'object'
      ? (raw.student as Record<string, unknown>)
      : null;
  const courseObj =
    raw.course && typeof raw.course === 'object'
      ? (raw.course as Record<string, unknown>)
      : null;
  const courseId = String(raw.course_id ?? raw.courseId ?? courseObj?.id ?? '');
  const matchedCourse = coursesList.find((c) => c.id === courseId);
  const audience =
    raw.audience === 'children' || matchedCourse?.audience === 'children'
      ? 'children'
      : 'adult';

  return {
    id: String(raw.enrollment_id ?? raw.id ?? `enr-${Date.now()}`),
    studentUid: String(
      raw.studentUid ?? raw.student_id ?? studentObj?.uid ?? studentObj?.id ?? ''
    ),
    studentName: String(raw.studentName ?? studentObj?.full_name ?? 'Student'),
    studentEmail: String(raw.studentEmail ?? studentObj?.email ?? ''),
    courseId,
    courseTitle: String(raw.courseTitle ?? courseObj?.title ?? matchedCourse?.title ?? ''),
    languageName: String(
      raw.languageName ?? courseObj?.language_name ?? matchedCourse?.languageName ?? ''
    ),
    audience,
    planType:
      raw.plan_type === 'monthly_pass' || raw.planType === 'monthly_pass'
        ? 'monthly_pass'
        : 'per_session',
    amountKes: Number(raw.amount_kes ?? raw.amountKes ?? 0),
    paymentMethod:
      raw.payment_method === 'visa' || raw.paymentMethod === 'visa' ? 'visa' : 'mpesa',
    transactionRef: String(raw.transaction_ref ?? raw.transactionRef ?? raw.payment_ref ?? ''),
    paymentStatus:
      raw.payment_status === 'revoked' || raw.paymentStatus === 'revoked'
        ? 'revoked'
        : raw.payment_status === 'pending' || raw.paymentStatus === 'pending'
        ? 'pending'
        : 'completed',
    jitsiRoomUrl: String(
      raw.jitsi_room_url ??
        raw.jitsiRoomUrl ??
        (matchedCourse ? `https://meet.jit.si/${matchedCourse.jitsiRoomName}` : '')
    ),
    preferredSlot: String(
      raw.preferred_time_slot ?? raw.preferred_slot ?? raw.preferredSlot ?? ''
    ),
    isReadyForClass: Boolean(raw.is_ready ?? raw.is_ready_for_class ?? raw.isReadyForClass),
    modulesCompletedCount: Number(
      raw.modules_completed_count ?? raw.modulesCompletedCount ?? 0
    ),
    totalModules: Number(
      raw.total_modules ?? raw.totalModules ?? matchedCourse?.modules.length ?? 4
    ),
    completedModuleIds: Array.isArray(raw.completedModuleIds)
      ? (raw.completedModuleIds as string[])
      : [],
    testScoreAvg: Number(raw.test_score_avg ?? raw.testScoreAvg ?? 0),
    enrolledAt: String(
      raw.enrolled_at ?? raw.enrolledAt ?? new Date().toISOString().slice(0, 10)
    ),
    updatedAt: String(
      raw.updated_at ?? raw.updatedAt ?? new Date().toISOString().slice(0, 10)
    ),
  };
}

function mapApiAudioSubmission(raw: Record<string, unknown>): AudioSubmission {
  return {
    id: String(raw.id ?? `aud-${Date.now()}`),
    studentUid: String(raw.studentUid ?? raw.student_id ?? ''),
    studentName: String(raw.studentName ?? raw.student_name ?? 'Student'),
    courseId: String(raw.course_id ?? raw.courseId ?? ''),
    language: String(raw.language ?? ''),
    phrase: String(raw.phrase ?? ''),
    accuracyScore: Number(raw.accuracy_score ?? raw.accuracyScore ?? 0),
    tutorFeedback: String(raw.tutor_feedback ?? raw.feedback ?? raw.tutorFeedback ?? ''),
    submittedAt: String(
      raw.submitted_at ?? raw.submittedAt ?? new Date().toISOString().slice(0, 10)
    ),
    updatedAt: String(
      raw.updated_at ?? raw.updatedAt ?? new Date().toISOString().slice(0, 10)
    ),
  };
}

function mapApiLiveSession(
  raw: Record<string, unknown>,
  coursesList: Course[]
): DailyLiveSession {
  const courseId = String(raw.course_id ?? raw.courseId ?? '');
  const matched = coursesList.find((c) => c.id === courseId);
  const rawStatus = String(raw.status ?? 'scheduled');
  const status: DailyLiveSession['status'] =
    rawStatus === 'live_now' || rawStatus === 'completed' ? rawStatus : 'scheduled';

  return {
    id: String(raw.id ?? `sess-${Date.now()}`),
    courseId,
    languageName: String(raw.language_name ?? raw.languageName ?? matched?.languageName ?? ''),
    audience:
      raw.audience === 'children' || matched?.audience === 'children' ? 'children' : 'adult',
    sessionDate: String(raw.session_date ?? raw.sessionDate ?? '').slice(0, 10),
    startTimeEat: String(raw.start_time_eat ?? raw.startTimeEat ?? '18:00 EAT'),
    endTimeEat: String(raw.end_time_eat ?? raw.endTimeEat ?? '21:00 EAT'),
    topic: String(raw.topic ?? 'Daily Live Class'),
    jitsiRoomUrl: String(
      raw.jitsi_room_url ??
        raw.jitsiRoomUrl ??
        (matched ? `https://meet.jit.si/${matched.jitsiRoomName}` : '')
    ),
    status,
    tutorName: String(raw.tutor_name ?? raw.tutorName ?? matched?.tutorName ?? 'Dr. Amina Wambui'),
    updatedAt: String(raw.updated_at ?? raw.updatedAt ?? ''),
  };
}

function mapApiEmailNotification(
  raw: Record<string, unknown>,
  coursesList: Course[]
): ClassEmailNotification {
  const courseId = String(raw.course_id ?? raw.courseId ?? '');
  const matched = coursesList.find((c) => c.id === courseId);
  return {
    id: String(raw.id ?? `email-${Date.now()}`),
    courseId,
    languageName: String(raw.language_name ?? raw.languageName ?? matched?.languageName ?? ''),
    recipientEmail: String(raw.recipient_email ?? raw.recipientEmail ?? ''),
    recipientName: String(raw.recipient_name ?? raw.recipientName ?? ''),
    subject: String(raw.subject ?? ''),
    messageBody: String(raw.message_body ?? raw.messageBody ?? ''),
    classTimeInfo: String(raw.class_time_info ?? raw.classTimeInfo ?? ''),
    sentByName: String(raw.sent_by_name ?? raw.sentByName ?? 'Dr. Amina Wambui'),
    sentAt: String(raw.sent_at ?? raw.sentAt ?? ''),
  };
}

function mapApiMaterial(
  raw: Record<string, unknown>,
  coursesList: Course[]
): SharedMaterial {
  const courseId = String(raw.course_id ?? raw.courseId ?? '');
  const matched = coursesList.find((c) => c.id === courseId);
  const rawType = String(raw.material_type ?? raw.materialType ?? 'image');
  const materialType: SharedMaterial['materialType'] =
    rawType === 'pdf' || rawType === 'audio' ? rawType : 'image';

  return {
    id: String(raw.id ?? `mat-${Date.now()}`),
    courseId,
    languageName: String(raw.language_name ?? raw.languageName ?? matched?.languageName ?? ''),
    materialType,
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    fileName: String(raw.file_name ?? raw.fileName ?? ''),
    mediaUrl: String(raw.media_url ?? raw.mediaUrl ?? ''),
    durationLabel:
      typeof (raw.duration_label ?? raw.durationLabel) === 'string'
        ? String(raw.duration_label ?? raw.durationLabel)
        : undefined,
    tutorUid: String(raw.tutor_uid ?? raw.tutorUid ?? ''),
    tutorName: String(raw.tutor_name ?? raw.tutorName ?? matched?.tutorName ?? 'Dr. Amina Wambui'),
    createdAt: String(raw.created_at ?? raw.createdAt ?? '').slice(0, 10),
  };
}

function mapApiTest(
  raw: Record<string, unknown>,
  coursesList: Course[]
): LanguageTest {
  const courseId = String(raw.course_id ?? raw.courseId ?? '');
  const matched = coursesList.find((c) => c.id === courseId);
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];
  return {
    id: String(raw.id ?? `test-${Date.now()}`),
    courseId,
    languageName: String(raw.language_name ?? raw.languageName ?? matched?.languageName ?? ''),
    audience:
      raw.audience === 'children' || matched?.audience === 'children' ? 'children' : 'adult',
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    tutorUid: String(raw.tutor_uid ?? raw.tutorUid ?? ''),
    createdAt: String(raw.created_at ?? raw.createdAt ?? '').slice(0, 10),
    questions: rawQuestions.map((q, idx) => {
      const qObj = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>;
      return {
        id: String(qObj.id ?? `q-${idx}`),
        prompt: String(qObj.prompt ?? ''),
        options: Array.isArray(qObj.options) ? (qObj.options as string[]) : [],
        correctIndex: Number(qObj.correctIndex ?? qObj.correct_index ?? 0),
      };
    }),
  };
}

function mapApiRating(
  raw: Record<string, unknown>,
  coursesList: Course[]
): TutorRating {
  const courseId = String(raw.course_id ?? raw.courseId ?? '');
  const matched = coursesList.find((c) => c.id === courseId);
  const rawSat = String(raw.satisfaction_level ?? raw.satisfactionLevel ?? 'Satisfied');
  const satisfactionLevel: TutorRating['satisfactionLevel'] =
    rawSat === 'Very Satisfied' ||
    rawSat === 'Neutral' ||
    rawSat === 'Needs Improvement'
      ? rawSat
      : 'Satisfied';

  return {
    id: String(raw.id ?? `rat-${Date.now()}`),
    studentUid: String(raw.studentUid ?? raw.student_id ?? ''),
    studentName: String(raw.studentName ?? raw.student_name ?? 'Student'),
    courseId,
    languageName: String(raw.language_name ?? raw.languageName ?? matched?.languageName ?? ''),
    tutorName: String(raw.tutor_name ?? raw.tutorName ?? matched?.tutorName ?? 'Dr. Amina Wambui'),
    rating: Number(raw.rating ?? 5),
    satisfactionLevel,
    comment: String(raw.comment ?? ''),
    createdAt: String(raw.created_at ?? raw.createdAt ?? '').slice(0, 10),
  };
}

function mapApiWordGameScore(raw: Record<string, unknown>): WordGameScore {
  return {
    id: String(raw.id ?? `wg-${Date.now()}`),
    studentUid: String(raw.studentUid ?? raw.student_id ?? ''),
    studentName: String(raw.studentName ?? raw.student_name ?? 'Student'),
    languageName: String(raw.language_name ?? raw.languageName ?? ''),
    score: Number(raw.score ?? 0),
    pairsMatched: Number(raw.pairs_matched ?? raw.pairsMatched ?? 0),
    playedAt: String(raw.played_at ?? raw.playedAt ?? '').slice(0, 10),
  };
}

function mapApiAuditLog(raw: Record<string, unknown>): SecurityAuditLog {
  return {
    id: String(raw.id ?? `audit-${Date.now()}`),
    timestamp: String(raw.created_at ?? raw.timestamp ?? ''),
    actorEmail: String(raw.user_email ?? raw.actorEmail ?? ''),
    actorRole: String(raw.role ?? raw.actorRole ?? ''),
    endpoint: String(raw.endpoint ?? '/tutor-admin'),
    action: String(raw.action ?? ''),
    httpStatus: Number(raw.http_status ?? raw.httpStatus ?? 200),
    details: String(raw.details ?? ''),
  };
}

export default function App() {
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeView, setActiveView] = useState<'landing' | 'enrollment' | 'tutor' | 'tutor_gate'>(
    () => (isTutorAdminUrl() ? 'tutor_gate' : 'landing')
  );
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [pendingEnrollCourse, setPendingEnrollCourse] = useState<Course | null>(null);
  const [checkoutCourse, setCheckoutCourse] = useState<Course | null>(null);
  const [checkoutCompleted, setCheckoutCompleted] = useState(false);

  const [courses, setCourses] = useState<Course[]>(SEED_COURSES);
  const [enrollments, setEnrollments] = useState<Enrollment[]>(SEED_ENROLLMENTS);
  const [liveSessions, setLiveSessions] = useState<DailyLiveSession[]>(SEED_LIVE_SESSIONS);
  const [emailNotifications, setEmailNotifications] = useState<ClassEmailNotification[]>(
    SEED_EMAIL_NOTIFICATIONS
  );
  const [materials, setMaterials] = useState<SharedMaterial[]>(SEED_MATERIALS);
  const [tests, setTests] = useState<LanguageTest[]>(SEED_TESTS);
  const [testSubmissions, setTestSubmissions] = useState<TestSubmission[]>(SEED_TEST_SUBMISSIONS);
  const [audioSubmissions, setAudioSubmissions] = useState<AudioSubmission[]>(SEED_AUDIO_SUBMISSIONS);
  const [ratings, setRatings] = useState<TutorRating[]>(SEED_RATINGS);
  const [wordGameScores, setWordGameScores] = useState<WordGameScore[]>([]);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLog[]>(INITIAL_AUDIT_LOGS);

  const userRole = currentUser?.role || 'student';
  const isVerifiedAdmin = Boolean(
    currentUser && currentUser.role === 'tutor' && currentUser.isAdmin
  );

  const tutorHeaders = useCallback((): Record<string, string> => {
    return {
      'Content-Type': 'application/json',
      'x-user-role': 'tutor',
      'x-user-email': currentUser?.email || 'amina.wambui@lughasmart.ac.ke',
    };
  }, [currentUser]);

  const appendAuditLog = useCallback(
    ({
      actorEmail,
      actorRole,
      endpoint = '/tutor-admin',
      action,
      httpStatus,
      details,
    }: {
      actorEmail: string;
      actorRole: string;
      endpoint?: string;
      action: string;
      httpStatus: number;
      details: string;
    }) => {
      setAuditLogs((prev) => [
        {
          id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
          actorEmail,
          actorRole,
          endpoint,
          action,
          httpStatus,
          details,
        },
        ...prev,
      ]);
    },
    []
  );

  useEffect(() => {
    let active = true;
    fetch('/api/courses')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data || !Array.isArray(data.courses) || data.courses.length === 0) {
          return;
        }
        setCourses((prev) =>
          (data.courses as Record<string, unknown>[]).map((raw) => {
            const fallback = prev.find((c) => c.id === String(raw.id ?? ''));
            return mapApiCourse(raw, fallback);
          })
        );
      })
      .catch(() => {
        // Keep seeded courses if backend API is unreachable
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'tutor' || !currentUser.isAdmin) return;
    let active = true;
    const headers = {
      'x-user-role': 'tutor',
      'x-user-email': currentUser.email,
    };

    fetch('/api/tutor/live-students', { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (Array.isArray(data.all_roster) && data.all_roster.length > 0) {
          setEnrollments(
            (data.all_roster as Record<string, unknown>[]).map((r) =>
              mapApiEnrollment(r, courses)
            )
          );
        }
        if (Array.isArray(data.audio_submissions) && data.audio_submissions.length > 0) {
          setAudioSubmissions(
            (data.audio_submissions as Record<string, unknown>[]).map(mapApiAudioSubmission)
          );
        }
      })
      .catch(() => {
        // Keep current state if backend API is unreachable
      });

    fetch('/api/tutor/workspace', { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (Array.isArray(data.live_sessions) && data.live_sessions.length > 0) {
          setLiveSessions(
            (data.live_sessions as Record<string, unknown>[]).map((s) =>
              mapApiLiveSession(s, courses)
            )
          );
        }
        if (Array.isArray(data.email_notifications) && data.email_notifications.length > 0) {
          setEmailNotifications(
            (data.email_notifications as Record<string, unknown>[]).map((n) =>
              mapApiEmailNotification(n, courses)
            )
          );
        }
        if (Array.isArray(data.materials) && data.materials.length > 0) {
          setMaterials(
            (data.materials as Record<string, unknown>[]).map((m) =>
              mapApiMaterial(m, courses)
            )
          );
        }
        if (Array.isArray(data.tests) && data.tests.length > 0) {
          setTests(
            (data.tests as Record<string, unknown>[]).map((t) =>
              mapApiTest(t, courses)
            )
          );
        }
        if (Array.isArray(data.ratings) && data.ratings.length > 0) {
          setRatings(
            (data.ratings as Record<string, unknown>[]).map((r) =>
              mapApiRating(r, courses)
            )
          );
        }
        if (Array.isArray(data.word_game_scores) && data.word_game_scores.length > 0) {
          setWordGameScores(
            (data.word_game_scores as Record<string, unknown>[]).map(mapApiWordGameScore)
          );
        }
        if (Array.isArray(data.users) && data.users.length > 0) {
          setRegisteredUsers(data.users as UserProfile[]);
        }
        if (Array.isArray(data.audit_logs) && data.audit_logs.length > 0) {
          setAuditLogs(
            (data.audit_logs as Record<string, unknown>[]).map(mapApiAuditLog)
          );
        }
      })
      .catch(() => {
        // Keep current state if backend API is unreachable
      });

    return () => {
      active = false;
    };
  }, [currentUser, courses]);

  useEffect(() => {
    const syncRoute = () => {
      if (isTutorAdminUrl()) {
        if (currentUser && currentUser.role === 'tutor' && currentUser.isAdmin) {
          setActiveView('tutor');
        } else {
          if (currentUser && currentUser.role === 'student') {
            appendAuditLog({
              actorEmail: currentUser.email,
              actorRole: 'student',
              endpoint: '/tutor-admin',
              action: 'UNAUTHORIZED_ADMIN_PROBE',
              httpStatus: 403,
              details: `Blocked student (${currentUser.fullName}) from accessing isolated Tutor/Admin portal.`,
            });
          }
          setActiveView('tutor_gate');
        }
      }
    };

    syncRoute();
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('popstate', syncRoute);
    };
  }, [currentUser, appendAuditLog]);

  const openIsolatedTutorPortal = () => {
    if (window.location.hash !== '#/tutor-admin') {
      window.location.hash = '#/tutor-admin';
    }
    if (currentUser && currentUser.role === 'tutor' && currentUser.isAdmin) {
      setActiveView('tutor');
    } else {
      if (currentUser && currentUser.role === 'student') {
        appendAuditLog({
          actorEmail: currentUser.email,
          actorRole: 'student',
          endpoint: '/tutor-admin',
          action: 'UNAUTHORIZED_ADMIN_PROBE',
          httpStatus: 403,
          details: `Blocked student (${currentUser.fullName}) from accessing isolated Tutor/Admin portal.`,
        });
      }
      setActiveView('tutor_gate');
    }
  };

  const clearAdminHashAndGoLanding = () => {
    if (window.location.hash === '#/tutor-admin') {
      window.history.replaceState(null, '', window.location.pathname || '/');
    }
    setActiveView('landing');
  };

  const handleRequestEnroll = (course: Course) => {
    if (!currentUser) {
      setPendingEnrollCourse(course);
      setAuthNotice('Please register or log in as a Student first to enroll in a course.');
      setShowAuthModal(true);
      return;
    }
    if (currentUser.role === 'tutor') {
      return;
    }
    setCheckoutCompleted(false);
    setCheckoutCourse(course);
  };

  const handleNavigate = (view: 'landing' | 'enrollment' | 'tutor') => {
    if (view === 'landing') {
      clearAdminHashAndGoLanding();
      return;
    }
    if (view === 'enrollment') {
      if (window.location.hash === '#/tutor-admin') {
        window.history.replaceState(null, '', window.location.pathname || '/');
      }
      if (!currentUser) {
        setAuthNotice('Please register or log in to view your Enrollment Area.');
        setShowAuthModal(true);
        return;
      }
      if (currentUser.role === 'tutor') {
        setActiveView('tutor');
        return;
      }
      setActiveView('enrollment');
      return;
    }
    if (view === 'tutor') {
      if (!currentUser || currentUser.role !== 'tutor' || !currentUser.isAdmin) {
        if (currentUser && currentUser.role === 'student') {
          appendAuditLog({
            actorEmail: currentUser.email,
            actorRole: 'student',
            endpoint: '/tutor-admin',
            action: 'UNAUTHORIZED_DASHBOARD_ACCESS',
            httpStatus: 403,
            details: `Student ${currentUser.email} attempted to open Tutor/Admin console.`,
          });
        }
        setActiveView('tutor_gate');
        return;
      }
      setActiveView('tutor');
    }
  };

  const handleRegisterStudent = async (credentials: {
    fullName: string;
    email: string;
    password: string;
  }) => {
    const newUser = await postAuthRequest('/api/auth/register', credentials);
    setRegisteredUsers((prev) => [...prev, newUser]);
    appendAuditLog({
      actorEmail: newUser.email,
      actorRole: 'student',
      endpoint: '/api/auth/register',
      action: 'STUDENT_REGISTERED',
      httpStatus: 201,
      details: `New student registered: ${newUser.fullName}.`,
    });
    return newUser;
  };

  const handleStudentLogin = (credentials: { email: string; password: string }) =>
    postAuthRequest('/api/auth/login', credentials);

  const handleStudentLoginSuccess = (user: UserProfile) => {
    if (user.role !== 'student') return;
    setCurrentUser(user);
    setAuthNotice(null);

    if (pendingEnrollCourse) {
      setCheckoutCompleted(false);
      setCheckoutCourse(pendingEnrollCourse);
      setPendingEnrollCourse(null);
    } else {
      setActiveView('enrollment');
    }
  };

  const handleAdminLoginSuccess = (adminUser: UserProfile) => {
    if (adminUser.role !== 'tutor' || !adminUser.isAdmin) return;
    setPendingEnrollCourse(null);
    setCheckoutCourse(null);
    setShowAuthModal(false);
    setCurrentUser(adminUser);
    if (window.location.hash !== '#/tutor-admin') {
      window.location.hash = '#/tutor-admin';
    }
    setActiveView('tutor');
    appendAuditLog({
      actorEmail: adminUser.email,
      actorRole: 'tutor_admin',
      endpoint: '/api/auth/tutor-login',
      action: 'TUTOR_3FA_LOGIN_SUCCESS',
      httpStatus: 200,
      details: `Authenticated Tutor & Admin ${adminUser.fullName}.`,
    });
  };

  const handleSignOut = () => {
    if (currentUser?.role === 'tutor') {
      appendAuditLog({
        actorEmail: currentUser.email,
        actorRole: 'tutor_admin',
        endpoint: '/tutor-admin',
        action: 'ADMIN_SIGN_OUT',
        httpStatus: 200,
        details: `Administrator ${currentUser.fullName} signed out.`,
      });
    }
    setCurrentUser(null);
    setPendingEnrollCourse(null);
    setCheckoutCourse(null);
    clearAdminHashAndGoLanding();
  };

  const handleToggleUserSuspended = async (uid: string) => {
    if (!currentUser || currentUser.role !== 'tutor' || !currentUser.isAdmin) return;
    let nextSuspended = false;
    setRegisteredUsers((prev) =>
      prev.map((u) => {
        if (u.uid !== uid || u.role === 'tutor') return u;
        nextSuspended = !u.isSuspended;
        appendAuditLog({
          actorEmail: currentUser.email,
          actorRole: 'tutor_admin',
          endpoint: '/api/tutor/users/toggle-suspend',
          action: nextSuspended ? 'STUDENT_SUSPENDED' : 'STUDENT_REACTIVATED',
          httpStatus: 200,
          details: `${nextSuspended ? 'Suspended' : 'Reactivated'} student account ${u.email}.`,
        });
        return { ...u, isSuspended: nextSuspended };
      })
    );

    try {
      const res = await fetch('/api/tutor/users/toggle-suspend', {
        method: 'POST',
        headers: tutorHeaders(),
        body: JSON.stringify({ uid }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setRegisteredUsers((prev) =>
            prev.map((u) => (u.uid === uid ? (data.user as UserProfile) : u))
          );
        }
      }
    } catch {
      // Fallback gracefully when running offline or without API server
    }
  };

  const handleCreateTutorAccount = async ({
    fullName,
    email,
    password,
    adminPin,
  }: {
    fullName: string;
    email: string;
    password: string;
    adminPin: string;
  }) => {
    if (!currentUser || currentUser.role !== 'tutor' || !currentUser.isAdmin) return;
    if (registeredUsers.some((u) => u.email.toLowerCase() === email.toLowerCase())) return;
    const fallbackTutor: UserProfile = {
      uid: `tutor-${Date.now()}`,
      fullName,
      email,
      password,
      role: 'tutor',
      isAdmin: true,
      isSuspended: false,
      adminPin,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setRegisteredUsers((prev) => [...prev, fallbackTutor]);
    appendAuditLog({
      actorEmail: currentUser.email,
      actorRole: 'tutor_admin',
      endpoint: '/api/tutor/users/create-tutor',
      action: 'TUTOR_ADMIN_PROVISIONED',
      httpStatus: 201,
      details: `Authorized new Tutor & Admin account for ${email}.`,
    });

    try {
      const res = await fetch('/api/tutor/users/create-tutor', {
        method: 'POST',
        headers: tutorHeaders(),
        body: JSON.stringify({ fullName, email, password, adminPin }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setRegisteredUsers((prev) =>
            prev.map((u) =>
              u.email.toLowerCase() === email.toLowerCase()
                ? (data.user as UserProfile)
                : u
            )
          );
        }
      }
    } catch {
      // Fallback gracefully when running offline or without API server
    }
  };

  const handleCompleteEnrollment = ({
    course,
    planType,
    amountKes,
    paymentMethod,
    transactionRef,
  }: {
    course: Course;
    planType: PlanType;
    amountKes: number;
    paymentMethod: PaymentMethod;
    transactionRef: string;
  }) => {
    if (!currentUser || currentUser.role !== 'student') return;

    const newEnrollment: Enrollment = {
      id: `enr-${Date.now()}`,
      studentUid: currentUser.uid,
      studentName: currentUser.fullName,
      studentEmail: currentUser.email,
      courseId: course.id,
      courseTitle: course.title,
      languageName: course.languageName,
      audience: course.audience,
      planType,
      amountKes,
      paymentMethod,
      transactionRef,
      paymentStatus: 'completed',
      jitsiRoomUrl: `https://meet.jit.si/${course.jitsiRoomName}`,
      preferredSlot:
        course.audience === 'adult'
          ? 'Tue & Thu · 18:00 - 21:00 EAT (3-Hr Adult Session)'
          : 'Sat · 10:00 - 11:00 EAT (1-Hr Children Interactive)',
      isReadyForClass: true,
      modulesCompletedCount: 0,
      totalModules: course.modules.length,
      completedModuleIds: [],
      testScoreAvg: 0,
      enrolledAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    setEnrollments((prev) => {
      const existingIdx = prev.findIndex(
        (e) => e.courseId === course.id && e.studentUid === currentUser.uid
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = {
          ...copy[existingIdx],
          planType,
          amountKes,
          paymentMethod,
          transactionRef,
          paymentStatus: 'completed',
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        return copy;
      }
      return [newEnrollment, ...prev];
    });
    setCheckoutCompleted(true);
    appendAuditLog({
      actorEmail: currentUser.email,
      actorRole: 'student',
      endpoint: '/api/payments/checkout',
      action: 'PAYMENT_COMPLETED',
      httpStatus: 200,
      details: `${paymentMethod.toUpperCase()} KES ${amountKes} (${transactionRef}) for ${course.languageName}.`,
    });
    fetch('/api/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: currentUser.uid,
        student_email: currentUser.email,
        course_id: course.id,
        plan_type: planType,
        amount_kes: amountKes,
        payment_method: paymentMethod,
        transaction_ref: transactionRef,
        preferred_slot: newEnrollment.preferredSlot,
      }),
    }).catch(() => {
      
    });
  };

  const handleToggleReady = (enrollmentId: string) => {
    setEnrollments((prev) =>
      prev.map((e) => (e.id === enrollmentId ? { ...e, isReadyForClass: !e.isReadyForClass } : e))
    );
  };

  const handleToggleModuleComplete = (enrollmentId: string, moduleId: string) => {
    setEnrollments((prev) =>
      prev.map((e) => {
        if (e.id !== enrollmentId) return e;
        const exists = e.completedModuleIds.includes(moduleId);
        const nextIds = exists
          ? e.completedModuleIds.filter((id) => id !== moduleId)
          : [...e.completedModuleIds, moduleId];
        return {
          ...e,
          completedModuleIds: nextIds,
          modulesCompletedCount: nextIds.length,
        };
      })
    );
  };

  const handleSubmitTest = (
    test: LanguageTest,
    selectedAnswers: Record<string, number>
  ): TestSubmission => {
    const student = currentUser!;
    let correct = 0;
    test.questions.forEach((q) => {
      if (selectedAnswers[q.id] === q.correctIndex) correct += 1;
    });
    const scorePercent = Math.round((correct / test.questions.length) * 100);

    const submission: TestSubmission = {
      id: `ts-${Date.now()}`,
      testId: test.id,
      testTitle: test.title,
      courseId: test.courseId,
      languageName: test.languageName,
      studentUid: student.uid,
      studentName: student.fullName,
      scorePercent,
      correctCount: correct,
      totalCount: test.questions.length,
      submittedAt: new Date().toISOString().slice(0, 10),
    };

    setTestSubmissions((prev) => [submission, ...prev]);
    setEnrollments((prev) =>
      prev.map((e) =>
        e.courseId === test.courseId && e.studentUid === student.uid
          ? { ...e, testScoreAvg: scorePercent }
          : e
      )
    );
    return submission;
  };

  const handleSubmitAudio = (courseId: string, language: string, phrase: string, score: number) => {
    if (!currentUser) return;
    const sub: AudioSubmission = {
      id: `aud-${Date.now()}`,
      studentUid: currentUser.uid,
      studentName: currentUser.fullName,
      courseId,
      language,
      phrase,
      accuracyScore: score,
      tutorFeedback: '',
      submittedAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    setAudioSubmissions((prev) => [sub, ...prev]);
  };

  const handleSubmitRating = (ratingData: Omit<TutorRating, 'id' | 'createdAt'>) => {
    setRatings((prev) => [
      {
        ...ratingData,
        id: `rat-${Date.now()}`,
        createdAt: new Date().toISOString().slice(0, 10),
      },
      ...prev,
    ]);
  };

  const handleSaveWordGameScore = (languageName: string, score: number, pairsMatched: number) => {
    if (!currentUser) return;
    setWordGameScores((prev) => [
      {
        id: `wg-${Date.now()}`,
        studentUid: currentUser.uid,
        studentName: currentUser.fullName,
        languageName,
        score,
        pairsMatched,
        playedAt: new Date().toISOString().slice(0, 10),
      },
      ...prev,
    ]);
  };

  const handleVerifyEnrollment = (enrollmentId: string, status: 'completed' | 'revoked') => {
    if (!currentUser || currentUser.role !== 'tutor' || !currentUser.isAdmin) return;
    setEnrollments((prev) =>
      prev.map((e) => (e.id === enrollmentId ? { ...e, paymentStatus: status } : e))
    );
    appendAuditLog({
      actorEmail: currentUser.email,
      actorRole: 'tutor_admin',
      endpoint: '/api/tutor/verify-payment',
      action: status === 'revoked' ? 'ENROLLMENT_REVOKED' : 'ENROLLMENT_VERIFIED',
      httpStatus: 200,
      details: `Updated enrollment ${enrollmentId} payment status to ${status}.`,
    });
  };

  const handleAddOrUpdateLiveSession = async (
    sessData: Omit<DailyLiveSession, 'id' | 'updatedAt'>
  ) => {
    if (!currentUser || currentUser.role !== 'tutor' || !currentUser.isAdmin) return;
    const tempId = `sess-${Date.now()}`;
    const localSession: DailyLiveSession = {
      ...sessData,
      id: tempId,
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    setLiveSessions((prev) => [localSession, ...prev]);

    try {
      const res = await fetch('/api/tutor/live-sessions', {
        method: 'POST',
        headers: tutorHeaders(),
        body: JSON.stringify({
          id: tempId,
          course_id: sessData.courseId,
          session_date: sessData.sessionDate,
          start_time_eat: sessData.startTimeEat,
          end_time_eat: sessData.endTimeEat,
          topic: sessData.topic,
          jitsi_room_url: sessData.jitsiRoomUrl,
          status: sessData.status,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          const saved = mapApiLiveSession(data.session as Record<string, unknown>, courses);
          setLiveSessions((prev) =>
            prev.map((s) => (s.id === tempId ? { ...saved, languageName: sessData.languageName, audience: sessData.audience, tutorName: sessData.tutorName } : s))
          );
        }
      }
    } catch {
    }
  };

  const handleUpdateSessionStatus = async (
    sessionId: string,
    status: DailyLiveSession['status']
  ) => {
    if (!currentUser || currentUser.role !== 'tutor' || !currentUser.isAdmin) return;
    setLiveSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, status, updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') }
          : s
      )
    );

    try {
      await fetch('/api/tutor/live-sessions/status', {
        method: 'POST',
        headers: tutorHeaders(),
        body: JSON.stringify({ session_id: sessionId, status }),
      });
    } catch {
      // Fallback gracefully when running offline or without API server
    }
  };

  const handleSendClassEmail = async (
    emailData: Omit<ClassEmailNotification, 'id' | 'sentAt'>
  ) => {
    if (!currentUser || currentUser.role !== 'tutor' || !currentUser.isAdmin) return;
    const tempId = `email-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const localEmail: ClassEmailNotification = {
      ...emailData,
      id: tempId,
      sentAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    setEmailNotifications((prev) => [localEmail, ...prev]);

    try {
      await fetch('/api/tutor/class-emails', {
        method: 'POST',
        headers: tutorHeaders(),
        body: JSON.stringify({
          course_id: emailData.courseId,
          recipient_email: emailData.recipientEmail,
          recipient_name: emailData.recipientName,
          subject: emailData.subject,
          message_body: emailData.messageBody,
          class_time_info: emailData.classTimeInfo,
        }),
      });
    } catch {
      // Fallback gracefully when running offline or without API server
    }
  };

  const handleAddMaterial = async (mat: Omit<SharedMaterial, 'id' | 'createdAt'>) => {
    if (!currentUser || currentUser.role !== 'tutor' || !currentUser.isAdmin) return;
    const tempId = `mat-${Date.now()}`;
    const localMat: SharedMaterial = {
      ...mat,
      id: tempId,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setMaterials((prev) => [localMat, ...prev]);

    try {
      const res = await fetch('/api/tutor/materials', {
        method: 'POST',
        headers: tutorHeaders(),
        body: JSON.stringify({
          course_id: mat.courseId,
          material_type: mat.materialType,
          title: mat.title,
          description: mat.description,
          file_name: mat.fileName,
          media_url: mat.mediaUrl,
          duration_label: mat.durationLabel ?? null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.material) {
          const saved = mapApiMaterial(data.material as Record<string, unknown>, courses);
          setMaterials((prev) =>
            prev.map((m) => (m.id === tempId ? { ...saved, languageName: mat.languageName, tutorName: mat.tutorName } : m))
          );
        }
      }
    } catch {
      // Fallback gracefully when running offline or without API server
    }
  };

  const handleCreateTest = async (test: Omit<LanguageTest, 'id' | 'createdAt'>) => {
    if (!currentUser || currentUser.role !== 'tutor' || !currentUser.isAdmin) return;
    const tempId = `test-${Date.now()}`;
    const localTest: LanguageTest = {
      ...test,
      id: tempId,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setTests((prev) => [localTest, ...prev]);

    try {
      const res = await fetch('/api/tutor/tests', {
        method: 'POST',
        headers: tutorHeaders(),
        body: JSON.stringify({
          course_id: test.courseId,
          audience: test.audience,
          title: test.title,
          description: test.description,
          questions: test.questions,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.test) {
          const saved = mapApiTest(data.test as Record<string, unknown>, courses);
          setTests((prev) =>
            prev.map((t) => (t.id === tempId ? { ...saved, languageName: test.languageName } : t))
          );
        }
      }
    } catch {
      // Fallback gracefully when running offline or without API server
    }
  };

  const handleFeedbackAudio = (submissionId: string, feedback: string) => {
    if (!currentUser || currentUser.role !== 'tutor' || !currentUser.isAdmin) return;
    setAudioSubmissions((prev) =>
      prev.map((s) => (s.id === submissionId ? { ...s, tutorFeedback: feedback } : s))
    );
  };

  const activeStudentEnrollments = enrollments.filter(
    (e) =>
      currentUser &&
      (e.studentUid === currentUser.uid ||
        (currentUser.email && e.studentEmail.toLowerCase() === currentUser.email.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#18181B] flex flex-col">
      <Navbar
        activeView={activeView}
        onNavigate={handleNavigate}
        userRole={userRole}
        currentUser={currentUser}
        onOpenAuth={() => {
          setAuthNotice(null);
          setShowAuthModal(true);
        }}
        onSignOut={handleSignOut}
        onEnrollNow={() => handleRequestEnroll(courses[0])}
      />

      <main className="flex-1">
        {activeView === 'landing' && (
          <LandingPage
            courses={courses}
            ratings={ratings}
            onEnrollCourse={handleRequestEnroll}
            onGoToEnrollment={() => handleNavigate('enrollment')}
          />
        )}

        {activeView === 'enrollment' && currentUser && currentUser.role === 'student' && (
          <StudentEnrollmentArea
            currentUser={currentUser}
            courses={courses}
            enrollments={activeStudentEnrollments}
            liveSessions={liveSessions}
            emailNotifications={emailNotifications}
            materials={materials}
            tests={tests}
            testSubmissions={testSubmissions}
            audioSubmissions={audioSubmissions}
            onEnrollCourse={handleRequestEnroll}
            onToggleReady={handleToggleReady}
            onToggleModuleComplete={handleToggleModuleComplete}
            onSubmitTest={handleSubmitTest}
            onSubmitAudio={handleSubmitAudio}
            onSubmitRating={handleSubmitRating}
            onSaveWordGameScore={handleSaveWordGameScore}
          />
        )}

        {activeView === 'tutor_gate' && (
          <TutorAdminGate
            currentUser={currentUser}
            onAdminLoginSuccess={handleAdminLoginSuccess}
            onBackToLanding={clearAdminHashAndGoLanding}
            onLogout={handleSignOut}
          />
        )}

        {activeView === 'tutor' && isVerifiedAdmin && (
          <TutorWorkspace
            currentUser={currentUser}
            users={registeredUsers}
            auditLogs={auditLogs}
            courses={courses}
            enrollments={enrollments}
            liveSessions={liveSessions}
            emailNotifications={emailNotifications}
            materials={materials}
            tests={tests}
            audioSubmissions={audioSubmissions}
            ratings={ratings}
            wordGameScores={wordGameScores}
            onVerifyEnrollment={handleVerifyEnrollment}
            onAddOrUpdateLiveSession={handleAddOrUpdateLiveSession}
            onUpdateSessionStatus={handleUpdateSessionStatus}
            onSendClassEmail={handleSendClassEmail}
            onAddMaterial={handleAddMaterial}
            onCreateTest={handleCreateTest}
            onFeedbackAudio={handleFeedbackAudio}
            onToggleUserSuspended={handleToggleUserSuspended}
            onCreateTutorAccount={handleCreateTutorAccount}
          />
        )}
      </main>

     {checkoutCourse && currentUser && currentUser.role === 'student' && (
        <CheckoutModal
          course={checkoutCourse}
          currentUser={currentUser}
          onClose={() => {
            setCheckoutCourse(null);
            if (checkoutCompleted) {
              setActiveView('enrollment');
            }
          }}
          onCompleteEnrollment={handleCompleteEnrollment}
        />
      )}

      {showAuthModal && (
        <AuthModal
          registeredUsers={registeredUsers}
          initialNotice={authNotice}
          onClose={() => {
            setShowAuthModal(false);
            setAuthNotice(null);
          }}
          onRegisterStudent={handleRegisterStudent}
          onStudentLogin={handleStudentLogin}
          onStudentLoginSuccess={handleStudentLoginSuccess}
        />
      )}

      <footer className="border-t border-[#E5E3DC] bg-white py-6 text-xs text-[#71717A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-semibold text-[#18181B]">LughaSmart Language Academy</span>
            <span className="mx-2">·</span>
            <span>Kenyan Local & Global Languages</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Adult 3-Hr & Children 1-Hr Live Jitsi Sessions</span>
            <span>·</span>
            <span>M-Pesa & Visa</span>
            {(!currentUser || isVerifiedAdmin) && (
              <>
                <span>·</span>
                <button
                  onClick={openIsolatedTutorPortal}
                  className="text-[#71717A] hover:text-[#18181B] underline-offset-2 hover:underline cursor-pointer"
                >
                  Staff & Admin Portal
                </button>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}