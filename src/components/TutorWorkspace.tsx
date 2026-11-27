import React, { useMemo, useState } from 'react';
import {
  Course,
  CourseQuestion,
  Enrollment,
  SharedMaterial,
  LanguageTest,
  AudioSubmission,
  TutorRating,
  WordGameScore,
  UserProfile,
  DailyLiveSession,
  ClassEmailNotification,
  SecurityAuditLog,
} from '../types';
import { CourseQAChatbox } from './CourseQAChatbox';
import { playAudioChime } from '../utils/audio';
import {
  ShieldAlert,
  Users,
  Image as ImageIcon,
  FileUp,
  ClipboardPlus,
  Volume2,
  Star,
  Check,
  Ban,
  Video,
  Calendar,
  Mail,
  Receipt,
  Download,
  Send,
  ShieldCheck,
  UserPlus,
  BookOpen,
  Trash2,
  Pencil,
  MessageSquare,
} from 'lucide-react';

interface TutorWorkspaceProps {
  currentUser: UserProfile | null;
  users: UserProfile[];
  auditLogs: SecurityAuditLog[];
  courses: Course[];
  enrollments: Enrollment[];
  liveSessions: DailyLiveSession[];
  emailNotifications: ClassEmailNotification[];
  materials: SharedMaterial[];
  tests: LanguageTest[];
  audioSubmissions: AudioSubmission[];
  ratings: TutorRating[];
  wordGameScores: WordGameScore[];
  questions?: CourseQuestion[];
  onReplyQuestion?: (questionId: string, tutorReply: string) => Promise<void> | void;
  onSaveCourse?: (course: Omit<Course, 'id'> & { id?: string }) => Promise<void> | void;
  onDeleteCourse?: (courseId: string) => Promise<void> | void;
  onVerifyEnrollment: (enrollmentId: string, status: 'completed' | 'revoked') => void;
  onAddOrUpdateLiveSession: (session: Omit<DailyLiveSession, 'id' | 'updatedAt'>) => void;
  onUpdateSessionStatus: (sessionId: string, status: DailyLiveSession['status']) => void;
  onSendClassEmail: (email: Omit<ClassEmailNotification, 'id' | 'sentAt'>) => void;
  onAddMaterial: (material: Omit<SharedMaterial, 'id' | 'createdAt'>) => void;
  onCreateTest: (test: Omit<LanguageTest, 'id' | 'createdAt'>) => void;
  onFeedbackAudio: (submissionId: string, feedback: string) => void;
  onToggleUserSuspended: (uid: string) => void;
  onCreateTutorAccount: (params: {
    fullName: string;
    email: string;
    password: string;
    adminPin: string;
  }) => void;
}

type CourseFormState = {
  id?: string;
  title: string;
  languageName: string;
  category: 'kenyan' | 'foreign';
  audience: 'adult' | 'children';
  sessionDurationMinutes: 60 | 180;
  level: string;
  perSessionPriceKes: string;
  monthlyPassPriceKes: string;
  jitsiRoomName: string;
  pdfTitle: string;
  lessonsCount: string;
  imageUrl: string;
  description: string;
};

function createCourseFormState(audience: 'adult' | 'children' = 'adult'): CourseFormState {
  return {
    id: undefined,
    title: '',
    languageName: '',
    category: 'kenyan',
    audience,
    sessionDurationMinutes: audience === 'children' ? 60 : 180,
    level: 'Beginner to Intermediate',
    perSessionPriceKes: audience === 'children' ? '1000' : '1500',
    monthlyPassPriceKes: audience === 'children' ? '6400' : '9600',
    jitsiRoomName: '',
    pdfTitle: '',
    lessonsCount: '10',
    imageUrl: '',
    description: '',
  };
}

function editCourseToFormState(course: Course): CourseFormState {
  return {
    id: course.id,
    title: course.title,
    languageName: course.languageName,
    category: course.category,
    audience: course.audience,
    sessionDurationMinutes: course.sessionDurationMinutes === 60 ? 60 : 180,
    level: course.level,
    perSessionPriceKes: String(course.perSessionPriceKes),
    monthlyPassPriceKes: String(course.monthlyPassPriceKes),
    jitsiRoomName: course.jitsiRoomName,
    pdfTitle: course.pdfTitle,
    lessonsCount: String(course.lessonsCount),
    imageUrl: course.imageUrl,
    description: course.description,
  };
}

export const TutorWorkspace: React.FC<TutorWorkspaceProps> = ({
  currentUser,
  users,
  auditLogs,
  courses,
  enrollments,
  liveSessions,
  emailNotifications,
  materials,
  tests,
  audioSubmissions,
  ratings,
  wordGameScores,
  questions = [],
  onReplyQuestion,
  onSaveCourse,
  onDeleteCourse,
  onVerifyEnrollment,
  onAddOrUpdateLiveSession,
  onUpdateSessionStatus,
  onSendClassEmail,
  onAddMaterial,
  onCreateTest,
  onFeedbackAudio,
  onToggleUserSuspended,
  onCreateTutorAccount,
}) => {
  const [section, setSection] = useState<
    | 'students'
    | 'courses'
    | 'live_schedule'
    | 'reports'
    | 'materials'
    | 'tests'
    | 'qa'
    | 'feedback'
    | 'admin_security'
  >('students');

  const courseById = useMemo(() => {
    const map = new Map<string, Course>();
    courses.forEach((c) => map.set(c.id, c));
    return map;
  }, [courses]);

  const userById = useMemo(() => {
    const map = new Map<string, UserProfile>();
    users.forEach((u) => map.set(u.uid, u));
    return map;
  }, [users]);

  const defaultCourseId = courses[0]?.id || 'swahili-adult-101';

  const [courseForm, setCourseForm] = useState<CourseFormState>(() =>
    createCourseFormState('adult')
  );
  const [editingCourseObj, setEditingCourseObj] = useState<Course | null>(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [courseNotice, setCourseNotice] = useState<string | null>(null);
  const [courseSaving, setCourseSaving] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);
  const [sessCourseId, setSessCourseId] = useState(defaultCourseId);
  const [sessDate, setSessDate] = useState(todayStr);
  const [sessStart, setSessStart] = useState('18:00 EAT');
  const [sessEnd, setSessEnd] = useState('21:00 EAT');
  const [sessTopic, setSessTopic] = useState('');
  const [sessNotice, setSessNotice] = useState<string | null>(null);

  const [emailTarget, setEmailTarget] = useState<Enrollment | 'all_course' | null>(null);
  const [emailCourseId, setEmailCourseId] = useState(defaultCourseId);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailClassTime, setEmailClassTime] = useState(`${todayStr} · 18:00 - 21:00 EAT`);
  const [emailBody, setEmailBody] = useState('');
  const [emailSentBanner, setEmailSentBanner] = useState<string | null>(null);

  const [reportDateFilter, setReportDateFilter] = useState<string>('all');

  const [matCourseId, setMatCourseId] = useState(defaultCourseId);
  const [matType, setMatType] = useState<'image' | 'pdf' | 'audio'>('image');
  const [matTitle, setMatTitle] = useState('');
  const [matDesc, setMatDesc] = useState('');
  const [matUrl, setMatUrl] = useState(
    '/src/assets/images/nairobi_market_visual_lesson_1794674778595.jpg'
  );
  const [matFileName, setMatFileName] = useState('visual_explanation_card.jpg');
  const [matNotice, setMatNotice] = useState<string | null>(null);

  const [testCourseId, setTestCourseId] = useState(defaultCourseId);
  const [testTitle, setTestTitle] = useState('');
  const [qPrompt, setQPrompt] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [correctIdx, setCorrectIdx] = useState(0);
  const [testNotice, setTestNotice] = useState<string | null>(null);

  const [audioNotes, setAudioNotes] = useState<Record<string, string>>({});

  const [newTutorName, setNewTutorName] = useState('');
  const [newTutorEmail, setNewTutorEmail] = useState('');
  const [newTutorPass, setNewTutorPass] = useState('');
  const [newTutorPin, setNewTutorPin] = useState('');
  const [adminNotice, setAdminNotice] = useState<string | null>(null);

  if (!currentUser || currentUser.role !== 'tutor' || !currentUser.isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="bg-white border border-red-200 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="text-xs font-mono font-semibold text-red-600">
            403 FORBIDDEN · TUTOR ACCESS REQUIRED
          </div>
          <h1 className="font-display text-2xl font-semibold text-[#18181B]">
            Students Have No Access to Tutor Tools
          </h1>
          <p className="text-sm text-[#52525B] max-w-md mx-auto">
            Only authenticated tutors and administrators can access enrolled student records, transaction reports, or live session controls.
          </p>
        </div>
      </div>
    );
  }

  const resolveCourseForId = (id: string): Course =>
    courseById.get(id) ||
    courses[0] || {
      id: 'swahili-adult-101',
      title: 'Conversational Kiswahili for Professionals & Expats',
      languageName: 'Kiswahili (Swahili)',
      category: 'kenyan',
      audience: 'adult',
      sessionDurationMinutes: 180,
      description: '',
      level: 'Beginner to Intermediate',
      perSessionPriceKes: 1500,
      monthlyPassPriceKes: 9600,
      jitsiRoomName: 'LughaSmart-Kiswahili-Adult-3Hr',
      pdfTitle: 'Kiswahili_Adult_Immersion_Workbook.pdf',
      tutorName: currentUser.fullName,
      lessonsCount: 12,
      modules: [],
    };

  const resetCourseEditor = (audience: 'adult' | 'children' = 'adult') => {
    setEditingCourseObj(null);
    setCourseForm(createCourseFormState(audience));
    setCourseNotice(null);
  };

  const handleEditCourseSelect = (course: Course) => {
    setEditingCourseObj(course);
    setCourseForm(editCourseToFormState(course));
    setCourseNotice(`Editing "${course.title}" (${course.languageName}).`);
  };

  const handleCourseFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveCourse || !courseForm.title.trim() || !courseForm.languageName.trim()) return;

    const slug = courseForm.languageName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const payload: Omit<Course, 'id'> & { id?: string } = {
      id: courseForm.id,
      title: courseForm.title.trim(),
      languageName: courseForm.languageName.trim(),
      category: courseForm.category,
      audience: courseForm.audience,
      sessionDurationMinutes:
        courseForm.audience === 'children' ? 60 : courseForm.sessionDurationMinutes,
      level: courseForm.level.trim() || 'Beginner to Intermediate',
      perSessionPriceKes: Math.max(0, Number(courseForm.perSessionPriceKes) || 0),
      monthlyPassPriceKes: Math.max(0, Number(courseForm.monthlyPassPriceKes) || 0),
      jitsiRoomName:
        courseForm.jitsiRoomName.trim() ||
        `lughasmart-${slug || 'course'}-${courseForm.audience}`,
      pdfTitle:
        courseForm.pdfTitle.trim() ||
        `${courseForm.languageName.trim()} Learner Workbook.pdf`,
      lessonsCount: Math.max(1, Number(courseForm.lessonsCount) || 10),
      imageUrl: courseForm.imageUrl.trim(),
      description: courseForm.description.trim(),
      tutorUid: editingCourseObj?.tutorUid || currentUser.uid,
      tutorName: editingCourseObj?.tutorName || currentUser.fullName,
      modules: editingCourseObj?.modules ?? [],
    };

    setCourseSaving(true);
    try {
      await onSaveCourse(payload);
      playAudioChime('success');
      setCourseNotice(
        courseForm.id
          ? `Updated course "${payload.title}" in the database.`
          : `Added course "${payload.title}" to the database.`
      );
      if (!courseForm.id) {
        setCourseForm(createCourseFormState(courseForm.audience));
      }
    } finally {
      setCourseSaving(false);
    }
  };

  const handleCourseDeleteClick = async (course: Course) => {
    if (!onDeleteCourse) return;
    const confirmed = window.confirm(
      `Delete "${course.title}" (${course.languageName})? This will remove it from the catalog.`
    );
    if (!confirmed) return;

    if (courseForm.id === course.id) {
      resetCourseEditor(course.audience);
    }
    setCourseSaving(true);
    try {
      await onDeleteCourse(course.id);
      playAudioChime('success');
      setCourseNotice(`Deleted course "${course.title}".`);
    } finally {
      setCourseSaving(false);
    }
  };

  const visibleCourses = courses.filter((c) => {
    const q = courseSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      c.title.toLowerCase().includes(q) ||
      c.languageName.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.audience.toLowerCase().includes(q)
    );
  });

  const handleVerifyEnrollmentAction = async (
    enrollmentId: string,
    status: 'completed' | 'revoked'
  ) => {
    onVerifyEnrollment(enrollmentId, status);
    try {
      await fetch('/api/tutor/verify-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'tutor',
          'x-user-email': currentUser.email,
        },
        body: JSON.stringify({
          enrollment_id: enrollmentId,
          action: status === 'completed' ? 'verify' : 'revoke',
          notes:
            status === 'completed'
              ? 'Payment verified in TutorWorkspace.'
              : 'Access revoked in TutorWorkspace.',
        }),
      });
    } catch {}
  };

  const handleCreateLiveSession = (e: React.FormEvent) => {
    e.preventDefault();
    const course = resolveCourseForId(sessCourseId);
    onAddOrUpdateLiveSession({
      courseId: course.id,
      languageName: course.languageName,
      audience: course.audience,
      sessionDate: sessDate,
      startTimeEat: sessStart.trim() || '18:00 EAT',
      endTimeEat: sessEnd.trim() || (course.audience === 'adult' ? '21:00 EAT' : '19:00 EAT'),
      topic: sessTopic.trim() || `${course.languageName} Daily Live Class`,
      jitsiRoomUrl: `https://meet.jit.si/${course.jitsiRoomName}`,
      status: 'scheduled',
      tutorName: course.tutorName || currentUser.fullName,
    });
    setSessTopic('');
    playAudioChime('success');
    setSessNotice(`Daily live session published for ${sessDate}.`);
    setTimeout(() => setSessNotice(null), 3500);
  };

  const openEmailComposer = (target: Enrollment | 'all_course') => {
    setEmailTarget(target);
    if (target === 'all_course') {
      const c = resolveCourseForId(emailCourseId);
      setEmailSubject(`Class Time Update: ${c.languageName} Live Jitsi Session`);
      setEmailBody(
        `Hello! Your ${c.languageName} live session will be held at ${emailClassTime} via Jitsi: https://meet.jit.si/${c.jitsiRoomName}`
      );
    } else {
      const c = resolveCourseForId(target.courseId);
      const student = userById.get(target.studentUid);
      const studentName = student?.fullName || target.studentName;
      const jitsiUrl = target.jitsiRoomUrl || `https://meet.jit.si/${c.jitsiRoomName}`;
      setEmailCourseId(target.courseId);
      setEmailSubject(`Class Time Update for ${c.languageName}`);
      setEmailBody(
        `Hello ${studentName}, your ${c.languageName} live session is scheduled for ${emailClassTime}. Join on Jitsi: ${jitsiUrl}`
      );
    }
  };

  const handleDispatchEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailTarget || !emailSubject.trim() || !emailBody.trim()) return;

    if (emailTarget === 'all_course') {
      const recipients = enrollments.filter(
        (enr) => enr.courseId === emailCourseId && enr.paymentStatus === 'completed'
      );
      const course = resolveCourseForId(emailCourseId);
      recipients.forEach((enr) => {
        const student = userById.get(enr.studentUid);
        onSendClassEmail({
          courseId: course.id,
          languageName: course.languageName,
          recipientEmail: student?.email || enr.studentEmail,
          recipientName: student?.fullName || enr.studentName,
          subject: emailSubject.trim(),
          messageBody: emailBody.trim(),
          classTimeInfo: emailClassTime.trim(),
          sentByName: currentUser.fullName,
        });
      });
      setEmailSentBanner(`Sent class time email update to ${recipients.length} enrolled student(s).`);
    } else {
      const course = resolveCourseForId(emailTarget.courseId);
      const student = userById.get(emailTarget.studentUid);
      onSendClassEmail({
        courseId: course.id,
        languageName: course.languageName,
        recipientEmail: student?.email || emailTarget.studentEmail,
        recipientName: student?.fullName || emailTarget.studentName,
        subject: emailSubject.trim(),
        messageBody: emailBody.trim(),
        classTimeInfo: emailClassTime.trim(),
        sentByName: currentUser.fullName,
      });
      setEmailSentBanner(
        `Class time email sent to ${student?.fullName || emailTarget.studentName} (${
          student?.email || emailTarget.studentEmail
        }).`
      );
    }

    setEmailTarget(null);
    playAudioChime('success');
    setTimeout(() => setEmailSentBanner(null), 4000);
  };

  const filteredTransactions = enrollments.filter((e) =>
    reportDateFilter === 'all' ? true : e.enrolledAt.startsWith(reportDateFilter)
  );
  const completedTx = filteredTransactions.filter((e) => e.paymentStatus === 'completed');
  const totalRevenueKes = completedTx.reduce((sum, e) => sum + Number(e.amountKes || 0), 0);
  const mpesaTotalKes = completedTx
    .filter((e) => e.paymentMethod === 'mpesa')
    .reduce((sum, e) => sum + Number(e.amountKes || 0), 0);
  const visaTotalKes = completedTx
    .filter((e) => e.paymentMethod === 'visa')
    .reduce((sum, e) => sum + Number(e.amountKes || 0), 0);

  const handleExportCsv = () => {
    const header = [
      'Date',
      'TransactionRef',
      'StudentName',
      'StudentEmail',
      'Language',
      'PlanType',
      'PaymentMethod',
      'AmountKES',
      'Status',
    ];
    const rows = filteredTransactions.map((e) => {
      const student = userById.get(e.studentUid);
      const course = resolveCourseForId(e.courseId);
      return [
        e.enrolledAt,
        e.transactionRef,
        `"${(student?.fullName || e.studentName).replace(/"/g, '""')}"`,
        student?.email || e.studentEmail,
        `"${(course.languageName || e.languageName).replace(/"/g, '""')}"`,
        e.planType,
        e.paymentMethod,
        String(e.amountKes),
        e.paymentStatus,
      ];
    });
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LughaSmart_Transactions_${reportDateFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMatFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setMatUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePublishMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matTitle.trim()) return;
    const course = resolveCourseForId(matCourseId);
    const finalFileName = matFileName.trim() || `${matType}_resource`;
    const finalMediaUrl =
      matType === 'audio'
        ? matDesc.trim() || matTitle.trim()
        : matUrl.trim() ||
          '/public/assets/curriculum/LughaSmart_System_Design___Proposal.pdf';

    onAddMaterial({
      courseId: course.id,
      languageName: course.languageName,
      materialType: matType,
      title: matTitle.trim(),
      description: matDesc.trim() || `Shared for ${course.languageName} learners.`,
      fileName: finalFileName,
      mediaUrl: finalMediaUrl,
      durationLabel: matType === 'audio' ? '08:30 min' : undefined,
      tutorUid: currentUser.uid,
      tutorName: currentUser.fullName,
    });

    if (matType === 'pdf') {
      try {
        await fetch('/api/tutor/curriculum/update-pdf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': 'tutor',
            'x-user-email': currentUser.email,
          },
          body: JSON.stringify({
            course_id: course.id,
            pdf_name: finalFileName,
            notes: matDesc.trim() || matTitle.trim(),
          }),
        });
      } catch {}
    }

    setMatTitle('');
    setMatDesc('');
    playAudioChime('success');
    setMatNotice(`Published ${matType.toUpperCase()} resource to enrolled students.`);
    setTimeout(() => setMatNotice(null), 3500);
  };

  const handlePublishTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testTitle.trim() || !qPrompt.trim() || !optA.trim() || !optB.trim()) return;
    const course = resolveCourseForId(testCourseId);
    const options = [optA.trim(), optB.trim(), optC.trim()].filter(Boolean);

    onCreateTest({
      courseId: course.id,
      languageName: course.languageName,
      audience: course.audience,
      title: testTitle.trim(),
      description: `Tutor-published assessment for ${course.languageName}`,
      tutorUid: currentUser.uid,
      questions: [
        {
          id: `q-${Date.now()}`,
          prompt: qPrompt.trim(),
          options,
          correctIndex: Math.min(correctIdx, options.length - 1),
        },
      ],
    });

    setTestTitle('');
    setQPrompt('');
    setOptA('');
    setOptB('');
    setOptC('');
    playAudioChime('success');
    setTestNotice(`Test published to ${course.languageName} students.`);
    setTimeout(() => setTestNotice(null), 3500);
  };

  const handleSaveAudioFeedback = async (submissionId: string, feedback: string) => {
    onFeedbackAudio(submissionId, feedback);
    playAudioChime('success');
    try {
      await fetch('/api/tutor/audio-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'tutor',
          'x-user-email': currentUser.email,
        },
        body: JSON.stringify({
          submission_id: submissionId,
          feedback_text: feedback,
        }),
      });
    } catch {}
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 space-y-8">
      <div className="bg-white border border-[#E5E3DC] rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="text-xs font-semibold text-[#0F6B4B]">
            Tutor & System Administrator · {currentUser.fullName} ({currentUser.email})
          </div>
          <h1 className="font-display text-3xl font-semibold text-[#18181B]">
            Tutor & Admin Operations Console
          </h1>
          <p className="text-sm text-[#52525B] mt-1">
            Manage courses, daily live Jitsi sessions, student Q&A, class-time emails, daily transaction reports, and platform security.
          </p>
        </div>

        <div className="flex items-center gap-6 text-xs shrink-0">
          <div>
            <div className="text-[#71717A]">Courses</div>
            <div className="font-mono text-2xl font-semibold text-[#18181B] tabular-nums">
              {courses.length}
            </div>
          </div>
          <div>
            <div className="text-[#71717A]">Enrolled Students</div>
            <div className="font-mono text-2xl font-semibold text-[#18181B] tabular-nums">
              {enrollments.length}
            </div>
          </div>
          <div>
            <div className="text-[#71717A]">Completed Revenue</div>
            <div className="font-mono text-2xl font-semibold text-[#0F6B4B] tabular-nums">
              KES {totalRevenueKes.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 p-1.5 bg-[#F3F2EE] border border-[#E5E3DC] rounded-xl w-fit">
        {[
          { id: 'students', label: 'Enrolled Students & Email', icon: Users },
          { id: 'courses', label: `Courses (${courses.length})`, icon: BookOpen },
          { id: 'live_schedule', label: 'Daily Live Sessions', icon: Calendar },
          { id: 'reports', label: 'Daily Transaction Reports', icon: Receipt },
          { id: 'materials', label: 'Share Images, PDFs & Audio', icon: ImageIcon },
          { id: 'tests', label: 'Create & Share Tests', icon: ClipboardPlus },
          { id: 'qa', label: `Student Q&A (${questions.length})`, icon: MessageSquare },
          { id: 'feedback', label: 'Audio Review & Ratings', icon: Star },
          { id: 'admin_security', label: 'Admin & Security', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setSection(tab.id as typeof section)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                section === tab.id
                  ? 'bg-white text-[#18181B] shadow-2xs font-semibold'
                  : 'text-[#52525B] hover:text-[#18181B]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 text-[#0F6B4B]" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {emailSentBanner && (
        <div className="p-3.5 rounded-xl bg-[#0F6B4B]/10 border border-[#0F6B4B]/30 text-xs text-[#0F6B4B] font-semibold">
          {emailSentBanner}
        </div>
      )}

      {section === 'courses' && (
        <div className="space-y-6">
          {courseNotice && (
            <div className="p-3.5 rounded-xl bg-[#0F6B4B]/10 border border-[#0F6B4B]/30 text-xs text-[#0F6B4B] font-semibold">
              {courseNotice}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <form
              onSubmit={handleCourseFormSubmit}
              className="lg:col-span-5 bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-4 text-xs h-fit"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold text-[#18181B]">
                  {courseForm.id ? 'Edit Existing Course' : 'Add New Course'}
                </h2>
                {courseForm.id && (
                  <button
                    type="button"
                    onClick={() => resetCourseEditor(courseForm.audience)}
                    className="text-xs font-semibold text-[#0F6B4B] hover:underline cursor-pointer"
                  >
                    + New Course
                  </button>
                )}
              </div>

              <div>
                <label className="block font-medium text-[#3F3F46] mb-1">Course Title *</label>
                <input
                  type="text"
                  required
                  value={courseForm.title}
                  onChange={(e) => setCourseForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Conversational Kikuyu for Adults"
                  className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#3F3F46] mb-1">Language Name *</label>
                  <input
                    type="text"
                    required
                    value={courseForm.languageName}
                    onChange={(e) =>
                      setCourseForm((f) => ({ ...f, languageName: e.target.value }))
                    }
                    placeholder="e.g. Kikuyu, Dholuo, French"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#3F3F46] mb-1">Category</label>
                  <select
                    value={courseForm.category}
                    onChange={(e) =>
                      setCourseForm((f) => ({
                        ...f,
                        category: e.target.value === 'foreign' ? 'foreign' : 'kenyan',
                      }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] bg-white"
                  >
                    <option value="kenyan">Kenyan Local Language</option>
                    <option value="foreign">Foreign / Global Language</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#3F3F46] mb-1">Audience</label>
                  <select
                    value={courseForm.audience}
                    onChange={(e) => {
                      const nextAud = e.target.value === 'children' ? 'children' : 'adult';
                      setCourseForm((f) => ({
                        ...f,
                        audience: nextAud,
                        sessionDurationMinutes: nextAud === 'children' ? 60 : 180,
                      }));
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] bg-white"
                  >
                    <option value="adult">Adult (3-Hr Live)</option>
                    <option value="children">Children (1-Hr Interactive)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-[#3F3F46] mb-1">Level</label>
                  <input
                    type="text"
                    value={courseForm.level}
                    onChange={(e) => setCourseForm((f) => ({ ...f, level: e.target.value }))}
                    placeholder="Beginner to Intermediate"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-[#3F3F46] mb-1">
                    Per Session (KES)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={courseForm.perSessionPriceKes}
                    onChange={(e) =>
                      setCourseForm((f) => ({ ...f, perSessionPriceKes: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#3F3F46] mb-1">
                    Monthly Pass (KES)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={courseForm.monthlyPassPriceKes}
                    onChange={(e) =>
                      setCourseForm((f) => ({ ...f, monthlyPassPriceKes: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#3F3F46] mb-1">Lessons</label>
                  <input
                    type="number"
                    min={1}
                    value={courseForm.lessonsCount}
                    onChange={(e) =>
                      setCourseForm((f) => ({ ...f, lessonsCount: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#3F3F46] mb-1">Jitsi Room Name</label>
                  <input
                    type="text"
                    value={courseForm.jitsiRoomName}
                    onChange={(e) =>
                      setCourseForm((f) => ({ ...f, jitsiRoomName: e.target.value }))
                    }
                    placeholder="Auto-generated if blank"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#3F3F46] mb-1">Image URL</label>
                  <input
                    type="text"
                    value={courseForm.imageUrl}
                    onChange={(e) => setCourseForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    placeholder="https://... or /images/..."
                    className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#3F3F46] mb-1">Workbook / PDF Title</label>
                <input
                  type="text"
                  value={courseForm.pdfTitle}
                  onChange={(e) => setCourseForm((f) => ({ ...f, pdfTitle: e.target.value }))}
                  placeholder="e.g. Kikuyu_Learner_Guide.pdf"
                  className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#3F3F46] mb-1">Description</label>
                <textarea
                  rows={3}
                  value={courseForm.description}
                  onChange={(e) => setCourseForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Course objectives, topics, and schedule details..."
                  className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={courseSaving || !onSaveCourse}
                  className="flex-1 py-2.5 bg-[#0F6B4B] hover:bg-[#0B533A] text-white font-semibold rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {courseSaving
                    ? 'Saving...'
                    : courseForm.id
                    ? 'Save Course Changes'
                    : 'Add Course to Database'}
                </button>
                {courseForm.id && (
                  <button
                    type="button"
                    onClick={() => resetCourseEditor(courseForm.audience)}
                    className="px-4 py-2.5 border border-[#E5E3DC] hover:bg-[#F3F2EE] text-[#3F3F46] font-medium rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="lg:col-span-7 bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5E3DC]">
                <div>
                  <h3 className="font-display text-xl font-semibold text-[#18181B]">
                    Database Courses ({visibleCourses.length})
                  </h3>
                  <p className="text-xs text-[#52525B]">
                    Click Edit to load any course into the form or Delete to remove unneeded courses.
                  </p>
                </div>
                <input
                  type="text"
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  placeholder="Search title or language..."
                  className="px-3 py-2 rounded-xl border border-[#D4D4D8] text-xs w-full sm:w-56"
                />
              </div>

              <div className="divide-y divide-[#E5E3DC]">
                {visibleCourses.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#71717A]">
                    No courses match your search filter.
                  </p>
                ) : (
                  visibleCourses.map((c) => {
                    const isSelected = courseForm.id === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs ${
                          isSelected ? 'bg-[#0F6B4B]/5 -mx-3 px-3 rounded-xl' : ''
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm text-[#18181B]">
                              {c.title}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#F3F2EE] text-[#3F3F46] font-medium">
                              {c.languageName}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#0F6B4B]/10 text-[#0F6B4B] font-semibold">
                              {c.audience === 'adult' ? 'Adult 3-Hr' : 'Children 1-Hr'}
                            </span>
                          </div>
                          {c.description && (
                            <p className="text-[#52525B] line-clamp-2">{c.description}</p>
                          )}
                          <div className="font-mono text-[11px] text-[#71717A]">
                            Session: KES {c.perSessionPriceKes.toLocaleString()} · Monthly: KES{' '}
                            {c.monthlyPassPriceKes.toLocaleString()} · {c.lessonsCount} lessons
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEditCourseSelect(c)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#E5E3DC] hover:bg-[#F3F2EE] text-[#18181B] rounded-lg font-semibold cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5 text-[#0F6B4B]" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            disabled={courseSaving || !onDeleteCourse}
                            onClick={() => handleCourseDeleteClick(c)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 border border-red-200 hover:bg-red-50 text-red-600 rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {section === 'students' && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E3DC]">
              <div>
                <h2 className="font-display text-xl font-semibold text-[#18181B]">
                  Enrolled Students & Module Coverage
                </h2>
                <p className="text-xs text-[#52525B]">
                  View enrolled learners, send individual or cohort class-time emails, and manage access.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={emailCourseId}
                  onChange={(e) => setEmailCourseId(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[#D4D4D8] text-xs bg-white"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.languageName} ({c.audience === 'adult' ? '3-Hr' : '1-Hr'})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => openEmailComposer('all_course')}
                  className="px-3.5 py-2 bg-[#0F6B4B] hover:bg-[#0B533A] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email Course Students</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E5E3DC] text-[#71717A]">
                    <th className="py-3 px-4 font-semibold">Student & Email</th>
                    <th className="py-3 px-4 font-semibold">Language & Track</th>
                    <th className="py-3 px-4 font-semibold">Pass & Payment</th>
                    <th className="py-3 px-4 font-semibold">Modules Covered</th>
                    <th className="py-3 px-4 font-semibold">Test Avg</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E3DC]">
                  {enrollments.map((enr) => {
                    const course = resolveCourseForId(enr.courseId);
                    const student = userById.get(enr.studentUid);
                    const studentName = student?.fullName || enr.studentName;
                    const studentEmail = student?.email || enr.studentEmail;
                    const totalMods = Math.max(1, course.modules?.length || enr.totalModules || 4);
                    const covered = enr.completedModuleIds?.length ?? enr.modulesCompletedCount ?? 0;
                    const jitsiUrl = enr.jitsiRoomUrl || `https://meet.jit.si/${course.jitsiRoomName}`;
                    return (
                      <tr key={enr.id}>
                        <td className="py-4 px-4">
                          <div className="font-semibold text-[#18181B]">{studentName}</div>
                          <div className="font-mono text-[11px] text-[#52525B]">{studentEmail}</div>
                          <div className="text-[11px] text-[#71717A]">
                            {enr.isReadyForClass ? 'Ready in live queue' : 'Offline'}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-semibold text-[#18181B]">{course.languageName}</div>
                          <div className="text-[11px] text-[#52525B]">
                            {course.audience === 'adult' ? 'Adult 3-Hr Live' : 'Children 1-Hr Interactive'}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-semibold text-[#0F6B4B]">
                            {enr.planType === 'monthly_pass' ? 'Monthly Unlimited' : 'Per-Session'}
                          </div>
                          <div className="font-mono text-[11px] text-[#52525B] tabular-nums">
                            {enr.paymentMethod.toUpperCase()} · KES{' '}
                            {Number(enr.amountKes || 0).toLocaleString()}
                          </div>
                        </td>
                        <td className="py-4 px-4 font-mono tabular-nums">
                          <span className="font-semibold text-[#18181B]">
                            {covered} / {totalMods}
                          </span>{' '}
                          <span className="text-[#71717A]">
                            ({Math.round((covered / totalMods) * 100)}%)
                          </span>
                        </td>
                        <td className="py-4 px-4 font-mono font-semibold text-[#0F6B4B] tabular-nums">
                          {Number(enr.testScoreAvg || 0)}%
                        </td>
                        <td className="py-4 px-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => openEmailComposer(enr)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#E5E3DC] hover:bg-[#F3F2EE] text-[#18181B] rounded-lg font-semibold cursor-pointer"
                          >
                            <Mail className="w-3.5 h-3.5 text-[#0F6B4B]" />
                            <span>Email Time</span>
                          </button>
                          <a
                            href={jitsiUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#0F6B4B] text-white rounded-lg font-semibold"
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>Jitsi</span>
                          </a>
                          {enr.paymentStatus === 'completed' ? (
                            <button
                              onClick={() => handleVerifyEnrollmentAction(enr.id, 'revoked')}
                              title="Revoke access"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#E5E3DC] hover:bg-red-50 text-[#52525B] hover:text-red-600 rounded-lg cursor-pointer"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleVerifyEnrollmentAction(enr.id, 'completed')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#0F6B4B] text-white rounded-lg cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Verify</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {emailTarget && (
            <form
              onSubmit={handleDispatchEmail}
              className="bg-white border border-[#0F6B4B] rounded-2xl p-6 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-semibold text-[#18181B]">
                  {emailTarget === 'all_course'
                    ? 'Send Class-Time Email to Enrolled Cohort'
                    : `Send Class-Time Email to ${
                        userById.get(emailTarget.studentUid)?.fullName || emailTarget.studentName
                      } (${userById.get(emailTarget.studentUid)?.email || emailTarget.studentEmail})`}
                </h3>
                <button
                  type="button"
                  onClick={() => setEmailTarget(null)}
                  className="text-[#52525B] hover:text-[#18181B] cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-[#3F3F46] mb-1">Email Subject</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3F3F46] mb-1">
                    Scheduled Class Date & Time
                  </label>
                  <input
                    type="text"
                    value={emailClassTime}
                    onChange={(e) => setEmailClassTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#3F3F46] mb-1">Message</label>
                <textarea
                  rows={3}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#0F6B4B] hover:bg-[#0B533A] text-white font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Class Update Email</span>
                </button>
                {emailTarget !== 'all_course' && (
                  <a
                    href={`mailto:${
                      userById.get(emailTarget.studentUid)?.email || emailTarget.studentEmail
                    }?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(
                      emailBody
                    )}`}
                    className="px-4 py-2.5 border border-[#E5E3DC] hover:bg-[#F3F2EE] text-[#18181B] font-medium rounded-xl"
                  >
                    Open in Mail Client
                  </a>
                )}
              </div>
            </form>
          )}

          <div className="bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-3">
            <h3 className="font-display text-lg font-semibold text-[#18181B]">
              Recent Class-Time Emails Sent ({emailNotifications.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {emailNotifications.slice(0, 6).map((mail) => (
                <div
                  key={mail.id}
                  className="p-3.5 rounded-xl bg-[#FAFAF8] border border-[#E5E3DC] text-xs space-y-1"
                >
                  <div className="flex justify-between text-[11px] text-[#71717A]">
                    <span>
                      To: <strong className="text-[#18181B]">{mail.recipientEmail}</strong>
                    </span>
                    <span className="font-mono">{mail.sentAt}</span>
                  </div>
                  <div className="font-semibold text-[#0F6B4B]">{mail.subject}</div>
                  <div className="text-[#52525B] line-clamp-2">{mail.messageBody}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {section === 'live_schedule' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <form
            onSubmit={handleCreateLiveSession}
            className="lg:col-span-5 bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-4 text-xs h-fit"
          >
            <h2 className="font-display text-xl font-semibold text-[#18181B]">
              Post Daily Live Session Schedule
            </h2>
            <p className="text-[#52525B]">
              Publish or update daily live Jitsi classes. Enrolled students see updates immediately.
            </p>

            {sessNotice && (
              <div className="p-3 rounded-xl bg-[#0F6B4B]/10 border border-[#0F6B4B]/30 text-[#0F6B4B] font-semibold">
                {sessNotice}
              </div>
            )}

            <div>
              <label className="block font-medium text-[#3F3F46] mb-1">Course</label>
              <select
                value={sessCourseId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSessCourseId(id);
                  const found = courseById.get(id);
                  if (found) {
                    setSessStart(found.audience === 'adult' ? '18:00 EAT' : '10:00 EAT');
                    setSessEnd(found.audience === 'adult' ? '21:00 EAT' : '11:00 EAT');
                  }
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] bg-white"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.languageName} — {c.audience === 'adult' ? 'Adult 3-Hr' : 'Children 1-Hr'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#3F3F46] mb-1">Session Date</label>
              <input
                type="date"
                value={sessDate}
                onChange={(e) => setSessDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#3F3F46] mb-1">Start Time</label>
                <input
                  type="text"
                  value={sessStart}
                  onChange={(e) => setSessStart(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#3F3F46] mb-1">End Time</label>
                <input
                  type="text"
                  value={sessEnd}
                  onChange={(e) => setSessEnd(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-[#3F3F46] mb-1">Today’s Lesson Topic</label>
              <input
                type="text"
                value={sessTopic}
                onChange={(e) => setSessTopic(e.target.value)}
                placeholder="e.g. Conversational Greetings & Pronunciation Lab"
                className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-[#0F6B4B] hover:bg-[#0B533A] text-white font-semibold rounded-xl cursor-pointer"
            >
              Publish Daily Live Session
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            <h3 className="font-display text-xl font-semibold text-[#18181B]">
              Active Daily Live Sessions ({liveSessions.length})
            </h3>
            {liveSessions.map((sess) => {
              const course = resolveCourseForId(sess.courseId);
              return (
                <div
                  key={sess.id}
                  className="bg-white border border-[#E5E3DC] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[#52525B]">
                      <span className="font-semibold text-[#0F6B4B]">{course.languageName}</span>
                      <span>·</span>
                      <span className="font-mono">
                        {sess.sessionDate} · {sess.startTimeEat} – {sess.endTimeEat}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-[#18181B]">{sess.topic}</div>
                    <div className="text-[11px] font-mono text-[#71717A]">{sess.jitsiRoomUrl}</div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={sess.status}
                      onChange={(e) =>
                        onUpdateSessionStatus(sess.id, e.target.value as DailyLiveSession['status'])
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-[#D4D4D8] bg-white font-medium"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="live_now">Live Now</option>
                      <option value="completed">Completed</option>
                    </select>
                    <a
                      href={sess.jitsiRoomUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-[#0F6B4B] text-white rounded-lg font-semibold"
                    >
                      Launch Jitsi
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {section === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#18181B]">
                  Daily Transaction Report
                </h2>
                <p className="text-xs text-[#52525B]">
                  Daily breakdown of M-Pesa and Visa enrollment payments across Per-Session and Monthly Passes.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="date"
                  value={reportDateFilter === 'all' ? todayStr : reportDateFilter}
                  onChange={(e) => setReportDateFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[#D4D4D8] font-mono"
                />
                <button
                  onClick={() => setReportDateFilter('all')}
                  className={`px-3 py-2 rounded-xl border font-medium cursor-pointer ${
                    reportDateFilter === 'all'
                      ? 'bg-[#0F6B4B] text-white border-[#0F6B4B]'
                      : 'border-[#E5E3DC] text-[#52525B]'
                  }`}
                >
                  All Dates
                </button>
                <button
                  onClick={handleExportCsv}
                  className="px-3.5 py-2 bg-[#18181B] text-white rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#FAFAF8] border border-[#E5E3DC]">
                <div className="text-xs text-[#71717A]">Total Completed Revenue</div>
                <div className="font-mono text-2xl font-semibold text-[#0F6B4B] tabular-nums mt-1">
                  KES {totalRevenueKes.toLocaleString()}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#FAFAF8] border border-[#E5E3DC]">
                <div className="text-xs text-[#71717A]">M-Pesa (Kenya)</div>
                <div className="font-mono text-2xl font-semibold text-[#18181B] tabular-nums mt-1">
                  KES {mpesaTotalKes.toLocaleString()}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#FAFAF8] border border-[#E5E3DC]">
                <div className="text-xs text-[#71717A]">Visa (International)</div>
                <div className="font-mono text-2xl font-semibold text-[#18181B] tabular-nums mt-1">
                  KES {visaTotalKes.toLocaleString()}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#FAFAF8] border border-[#E5E3DC]">
                <div className="text-xs text-[#71717A]">Completed Enrollments</div>
                <div className="font-mono text-2xl font-semibold text-[#18181B] tabular-nums mt-1">
                  {completedTx.length}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E5E3DC] text-[#71717A]">
                    <th className="py-3 px-4 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold">Transaction Ref</th>
                    <th className="py-3 px-4 font-semibold">Student</th>
                    <th className="py-3 px-4 font-semibold">Course</th>
                    <th className="py-3 px-4 font-semibold">Plan</th>
                    <th className="py-3 px-4 font-semibold">Method</th>
                    <th className="py-3 px-4 font-semibold">Amount (KES)</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E3DC]">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-[#71717A]">
                        No transactions recorded for {reportDateFilter}.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => {
                      const student = userById.get(tx.studentUid);
                      const course = resolveCourseForId(tx.courseId);
                      return (
                        <tr key={tx.id}>
                          <td className="py-3.5 px-4 font-mono">{tx.enrolledAt}</td>
                          <td className="py-3.5 px-4 font-mono font-semibold text-[#18181B]">
                            {tx.transactionRef}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-[#18181B]">
                              {student?.fullName || tx.studentName}
                            </div>
                            <div className="text-[11px] text-[#71717A]">
                              {student?.email || tx.studentEmail}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">{course.languageName}</td>
                          <td className="py-3.5 px-4">
                            {tx.planType === 'monthly_pass' ? 'Monthly Pass' : 'Per Session'}
                          </td>
                          <td className="py-3.5 px-4 uppercase font-mono">{tx.paymentMethod}</td>
                          <td className="py-3.5 px-4 font-mono font-semibold tabular-nums">
                            {Number(tx.amountKes || 0).toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-[#0F6B4B] capitalize">
                            {tx.paymentStatus}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {section === 'materials' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <form
            onSubmit={handlePublishMaterial}
            className="lg:col-span-5 bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-4 text-xs h-fit"
          >
            <h2 className="font-display text-xl font-semibold text-[#18181B]">
              Share Resource with Students
            </h2>

            {matNotice && (
              <div className="p-3 rounded-xl bg-[#0F6B4B]/10 border border-[#0F6B4B]/30 text-[#0F6B4B] font-semibold">
                {matNotice}
              </div>
            )}

            <div>
              <label className="block font-medium text-[#3F3F46] mb-1">Resource Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['image', 'pdf', 'audio'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMatType(t)}
                    className={`py-2 rounded-lg border font-semibold uppercase cursor-pointer ${
                      matType === t
                        ? 'border-[#0F6B4B] bg-[#0F6B4B]/5 text-[#0F6B4B]'
                        : 'border-[#E5E3DC] text-[#52525B]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-medium text-[#3F3F46] mb-1">Target Course</label>
              <select
                value={matCourseId}
                onChange={(e) => setMatCourseId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] bg-white"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.languageName} — {c.audience === 'adult' ? 'Adult 3-Hr' : 'Kids 1-Hr'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#3F3F46] mb-1">Title</label>
              <input
                type="text"
                value={matTitle}
                onChange={(e) => setMatTitle(e.target.value)}
                placeholder="e.g. Market Fruits Visual Explanation"
                className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
              />
            </div>

            {matType === 'image' && (
              <div>
                <label className="block font-medium text-[#3F3F46] mb-1">
                  Upload Image from Computer (or keep default)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileSelect}
                  className="w-full text-xs text-[#52525B]"
                />
              </div>
            )}

            <div>
              <label className="block font-medium text-[#3F3F46] mb-1">
                {matType === 'audio' ? 'Spoken Script / Audio Notes' : 'Explanation / Description'}
              </label>
              <textarea
                rows={3}
                value={matDesc}
                onChange={(e) => setMatDesc(e.target.value)}
                placeholder="Explain what students will learn from this resource..."
                className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-[#0F6B4B] hover:bg-[#0B533A] text-white font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileUp className="w-4 h-4" />
              <span>Share with Students</span>
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            <h3 className="font-display text-xl font-semibold text-[#18181B]">
              Currently Shared Library ({materials.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {materials.map((m) => {
                const course = resolveCourseForId(m.courseId);
                return (
                  <div
                    key={m.id}
                    className="bg-white border border-[#E5E3DC] rounded-2xl p-4 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-[#0F6B4B] uppercase">
                        {m.materialType}
                      </span>
                      <span className="text-[#71717A]">{course.languageName}</span>
                    </div>
                    <div className="font-semibold text-sm text-[#18181B]">{m.title}</div>
                    <p className="text-[#52525B] line-clamp-2">{m.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {section === 'tests' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <form
            onSubmit={handlePublishTest}
            className="lg:col-span-6 bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-4 text-xs"
          >
            <h2 className="font-display text-xl font-semibold text-[#18181B]">
              Create & Share Language Test
            </h2>

            {testNotice && (
              <div className="p-3 rounded-xl bg-[#0F6B4B]/10 border border-[#0F6B4B]/30 text-[#0F6B4B] font-semibold">
                {testNotice}
              </div>
            )}

            <div>
              <label className="block font-medium text-[#3F3F46] mb-1">Course</label>
              <select
                value={testCourseId}
                onChange={(e) => setTestCourseId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] bg-white"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.languageName} — {c.audience === 'adult' ? 'Adult' : 'Children'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#3F3F46] mb-1">Test Title</label>
              <input
                type="text"
                value={testTitle}
                onChange={(e) => setTestTitle(e.target.value)}
                placeholder="e.g. Module 3 Vocabulary & Etiquette Quiz"
                className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#3F3F46] mb-1">Question Prompt</label>
              <input
                type="text"
                value={qPrompt}
                onChange={(e) => setQPrompt(e.target.value)}
                placeholder="e.g. How do you say 'Good morning' in French?"
                className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={optA}
                onChange={(e) => setOptA(e.target.value)}
                placeholder="Option A"
                className="px-3 py-2 rounded-xl border border-[#D4D4D8]"
              />
              <input
                type="text"
                value={optB}
                onChange={(e) => setOptB(e.target.value)}
                placeholder="Option B"
                className="px-3 py-2 rounded-xl border border-[#D4D4D8]"
              />
              <input
                type="text"
                value={optC}
                onChange={(e) => setOptC(e.target.value)}
                placeholder="Option C"
                className="px-3 py-2 rounded-xl border border-[#D4D4D8]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#3F3F46] mb-1">Correct Option</label>
              <select
                value={correctIdx}
                onChange={(e) => setCorrectIdx(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] bg-white"
              >
                <option value={0}>Option A</option>
                <option value={1}>Option B</option>
                <option value={2}>Option C</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-[#0F6B4B] hover:bg-[#0B533A] text-white font-semibold rounded-xl cursor-pointer"
            >
              Publish Test to Students
            </button>
          </form>

          <div className="lg:col-span-6 space-y-4">
            <h3 className="font-display text-xl font-semibold text-[#18181B]">
              Published Tests & Word Game Activity
            </h3>
            {tests.map((t) => {
              const course = resolveCourseForId(t.courseId);
              return (
                <div
                  key={t.id}
                  className="bg-white border border-[#E5E3DC] rounded-2xl p-4 text-xs"
                >
                  <div className="font-semibold text-[#0F6B4B]">{course.languageName}</div>
                  <div className="font-semibold text-sm text-[#18181B] mt-0.5">{t.title}</div>
                  <div className="text-[#52525B] mt-1">{t.questions.length} question(s)</div>
                </div>
              );
            })}

            {wordGameScores.length > 0 && (
              <div className="bg-white border border-[#E5E3DC] rounded-2xl p-4 space-y-2 text-xs">
                <div className="font-semibold text-[#B45309]">Children’s Word Game Scores</div>
                {wordGameScores.map((wg) => {
                  const student = userById.get(wg.studentUid);
                  return (
                    <div key={wg.id} className="flex justify-between text-[#3F3F46]">
                      <span>
                        {student?.fullName || wg.studentName} · {wg.languageName}
                      </span>
                      <span className="font-mono font-semibold tabular-nums">{wg.score} pts</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {section === 'qa' && (
        <CourseQAChatbox
          mode="tutor"
          currentUser={currentUser}
          courses={courses}
          questions={questions}
          onReplyQuestion={onReplyQuestion}
        />
      )}

      {section === 'feedback' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-[#18181B] flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-[#0F6B4B]" />
              <span>Student Pronunciation Recordings</span>
            </h2>
            {audioSubmissions.map((sub) => {
              const student = userById.get(sub.studentUid);
              const course = resolveCourseForId(sub.courseId);
              return (
                <div
                  key={sub.id}
                  className="p-4 rounded-xl bg-[#FAFAF8] border border-[#E5E3DC] space-y-2 text-xs"
                >
                  <div className="flex justify-between">
                    <span className="font-semibold text-[#18181B]">
                      {student?.fullName || sub.studentName} ·{' '}
                      {sub.language || course.languageName}
                    </span>
                    <span className="font-mono font-semibold text-[#0F6B4B] tabular-nums">
                      {sub.accuracyScore}%
                    </span>
                  </div>
                  <div className="font-medium text-[#18181B]">"{sub.phrase}"</div>
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={audioNotes[sub.id] ?? sub.tutorFeedback}
                      onChange={(e) => setAudioNotes({ ...audioNotes, [sub.id]: e.target.value })}
                      placeholder="Write pronunciation feedback..."
                      className="flex-1 px-3 py-1.5 rounded-lg border border-[#D4D4D8] bg-white"
                    />
                    <button
                      onClick={() =>
                        handleSaveAudioFeedback(sub.id, audioNotes[sub.id] ?? sub.tutorFeedback)
                      }
                      className="px-3 py-1.5 bg-[#0F6B4B] text-white rounded-lg font-semibold cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-[#18181B] flex items-center gap-2">
              <Star className="w-5 h-5 text-[#B45309]" />
              <span>Student Satisfaction Ratings ({ratings.length})</span>
            </h2>
            {ratings.map((r) => {
              const student = userById.get(r.studentUid);
              const course = resolveCourseForId(r.courseId);
              return (
                <div
                  key={r.id}
                  className="p-4 rounded-xl bg-[#FAFAF8] border border-[#E5E3DC] space-y-1.5 text-xs"
                >
                  <div className="flex justify-between">
                    <span className="font-semibold text-[#18181B]">
                      {student?.fullName || r.studentName} · {course.languageName}
                    </span>
                    <span className="font-mono text-[#B45309]">{'★'.repeat(r.rating)}</span>
                  </div>
                  <div className="text-[#0F6B4B] font-medium">{r.satisfactionLevel}</div>
                  <p className="text-[#3F3F46]">"{r.comment}"</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {section === 'admin_security' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  !newTutorName.trim() ||
                  !newTutorEmail.includes('@') ||
                  newTutorPass.length < 6 ||
                  newTutorPin.trim().length < 4
                ) {
                  setAdminNotice('Provide full name, valid email, 6+ char password, and 4+ digit PIN.');
                  return;
                }
                onCreateTutorAccount({
                  fullName: newTutorName.trim(),
                  email: newTutorEmail.trim().toLowerCase(),
                  password: newTutorPass,
                  adminPin: newTutorPin.trim(),
                });
                setNewTutorName('');
                setNewTutorEmail('');
                setNewTutorPass('');
                setNewTutorPin('');
                playAudioChime('success');
                setAdminNotice('Authorized new Tutor & Admin account.');
                setTimeout(() => setAdminNotice(null), 4000);
              }}
              className="lg:col-span-5 bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-4 text-xs h-fit"
            >
              <div className="flex items-center gap-2 text-[#0F6B4B] font-semibold">
                <UserPlus className="w-4 h-4" />
                <span>Admin Provisioning</span>
              </div>
              <h2 className="font-display text-xl font-semibold text-[#18181B]">
                Authorize New Tutor / Admin Account
              </h2>
              <p className="text-[#52525B]">
                Tutor accounts cannot be created from the student registration page. Only an authenticated Admin can authorize staff access.
              </p>

              {adminNotice && (
                <div className="p-3 rounded-xl bg-[#0F6B4B]/10 border border-[#0F6B4B]/30 text-[#0F6B4B] font-semibold">
                  {adminNotice}
                </div>
              )}

              <div>
                <label className="block font-medium text-[#3F3F46] mb-1">Tutor Full Name</label>
                <input
                  type="text"
                  value={newTutorName}
                  onChange={(e) => setNewTutorName(e.target.value)}
                  placeholder="e.g. Prof. Kamau Njoroge"
                  className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#3F3F46] mb-1">Staff Email</label>
                <input
                  type="email"
                  value={newTutorEmail}
                  onChange={(e) => setNewTutorEmail(e.target.value)}
                  placeholder="kamau@lughasmart.ac.ke"
                  className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#3F3F46] mb-1">Password</label>
                  <input
                    type="password"
                    value={newTutorPass}
                    onChange={(e) => setNewTutorPass(e.target.value)}
                    placeholder="Min 6 chars"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3F3F46] mb-1">Security PIN</label>
                  <input
                    type="password"
                    value={newTutorPin}
                    onChange={(e) => setNewTutorPin(e.target.value)}
                    placeholder="6-digit PIN"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#D4D4D8] font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-[#18181B] hover:bg-[#27272A] text-white font-semibold rounded-xl cursor-pointer"
              >
                Create Tutor Admin Account
              </button>
            </form>

            <div className="lg:col-span-7 bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-[#18181B]">
                  Registered Accounts & Access Control ({users.length})
                </h2>
                <p className="text-xs text-[#52525B]">
                  Suspend or restore student accounts to immediately block unauthorized or suspicious logins.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E5E3DC] text-[#71717A]">
                      <th className="py-2.5 px-3 font-semibold">User</th>
                      <th className="py-2.5 px-3 font-semibold">Role</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Admin Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E3DC]">
                    {users.map((u) => (
                      <tr key={u.uid}>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-[#18181B]">{u.fullName}</div>
                          <div className="font-mono text-[11px] text-[#71717A]">{u.email}</div>
                        </td>
                        <td className="py-3 px-3">
                          {u.role === 'tutor' ? (
                            <span className="font-semibold text-[#0F6B4B]">Tutor / Admin</span>
                          ) : (
                            <span className="text-[#52525B]">Student</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {u.isSuspended ? (
                            <span className="text-red-600 font-semibold">Suspended</span>
                          ) : (
                            <span className="text-[#0F6B4B] font-semibold">Active</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {u.role === 'student' ? (
                            <button
                              onClick={() => onToggleUserSuspended(u.uid)}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                                u.isSuspended
                                  ? 'border-[#0F6B4B] text-[#0F6B4B] hover:bg-[#0F6B4B]/5'
                                  : 'border-red-200 text-red-600 hover:bg-red-50'
                              }`}
                            >
                              {u.isSuspended ? 'Reactivate' : 'Suspend'}
                            </button>
                          ) : (
                            <span className="text-[11px] text-[#71717A] font-mono">Protected</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E5E3DC] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-xl font-semibold text-[#18181B]">
                  Security & Unauthorized Access Audit Log ({auditLogs.length})
                </h3>
                <p className="text-xs text-[#52525B]">
                  Records blocked student attempts on the Tutor/Admin portal, failed logins, and admin actions.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E5E3DC] text-[#71717A]">
                    <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                    <th className="py-2.5 px-3 font-semibold">Actor</th>
                    <th className="py-2.5 px-3 font-semibold">Action & Endpoint</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E3DC]">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-3 px-3 font-mono text-[11px] text-[#52525B] whitespace-nowrap">
                        {log.timestamp}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-mono text-[11px] text-[#18181B]">{log.actorEmail}</div>
                        <div className="text-[11px] text-[#71717A]">{log.actorRole}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px]">
                        <div className="font-semibold text-[#18181B]">{log.action}</div>
                        <div className="text-[#71717A]">{log.endpoint}</div>
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold">
                        <span
                          className={
                            log.httpStatus >= 400 ? 'text-red-600' : 'text-[#0F6B4B]'
                          }
                        >
                          {log.httpStatus}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[#3F3F46]">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};