import React, { useState } from 'react';
import { Course, CourseQuestion, UserProfile } from '../types';
import { MessageSquare, Send, CheckCircle2, Clock } from 'lucide-react';

interface CourseQAChatboxProps {
  mode: 'student' | 'tutor';
  currentUser: UserProfile;
  courses: Course[];
  questions: CourseQuestion[];
  onAskQuestion?: (params: {
    courseId: string;
    languageName: string;
    questionText: string;
  }) => Promise<void> | void;
  onReplyQuestion?: (questionId: string, tutorReply: string) => Promise<void> | void;
}

export const CourseQAChatbox: React.FC<CourseQAChatboxProps> = ({
  mode,
  courses,
  questions,
  onAskQuestion,
  onReplyQuestion,
}) => {
  const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || '');
  const [questionText, setQuestionText] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'answered'>('all');
  const [submitting, setSubmitting] = useState(false);

  const visibleQuestions = questions.filter((q) => {
    if (filterStatus !== 'all' && q.status !== filterStatus) return false;
    return true;
  });

  const handlePostQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim() || !onAskQuestion) return;
    const course = courses.find((c) => c.id === selectedCourseId) || courses[0];
    setSubmitting(true);
    try {
      await onAskQuestion({
        courseId: course?.id || selectedCourseId,
        languageName: course?.languageName || 'General',
        questionText: questionText.trim(),
      });
      setQuestionText('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async (questionId: string) => {
    const text = (replyDrafts[questionId] || '').trim();
    if (!text || !onReplyQuestion) return;
    setSubmitting(true);
    try {
      await onReplyQuestion(questionId, text);
      setReplyDrafts((prev) => ({ ...prev, [questionId]: '' }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-[#E5E3DC] rounded-2xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E3DC] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#0F6B4B]/10 text-[#0F6B4B] flex items-center justify-center">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-[#18181B]">
              {mode === 'tutor' ? 'Student Questions & Tutor Q&A Inbox' : 'Ask Your Tutor Q&A'}
            </h3>
            <p className="text-xs text-[#71717A]">
              {mode === 'tutor'
                ? 'Review student questions and post answers visible in their dashboard.'
                : 'Post grammar, pronunciation, or lesson questions anytime—your tutor replies here.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          {(['all', 'open', 'answered'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilterStatus(tab)}
              className={`px-3 py-1.5 rounded-lg font-medium capitalize cursor-pointer ${
                filterStatus === tab
                  ? 'bg-[#0F6B4B] text-white'
                  : 'bg-[#F3F2EE] text-[#52525B] hover:text-[#18181B]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {mode === 'student' && courses.length > 0 && (
        <form onSubmit={handlePostQuestion} className="space-y-3 bg-[#FAFAF8] p-4 rounded-xl border border-[#E5E3DC]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#3F3F46] mb-1">
                Course / Language
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#D4D4D8] bg-white text-xs"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.languageName} · {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-[#3F3F46] mb-1">
                Your Question for the Tutor
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="e.g. How do I pronounce the third tone in Mandarin before a fourth tone?"
                  className="flex-1 px-3.5 py-2 rounded-xl border border-[#D4D4D8] bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#0F6B4B]"
                />
                <button
                  type="submit"
                  disabled={submitting || !questionText.trim()}
                  className="px-4 py-2 bg-[#0F6B4B] hover:bg-[#0B533A] disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Post</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {visibleQuestions.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#71717A] border border-dashed border-[#E5E3DC] rounded-xl">
            No questions in this view yet.
          </div>
        ) : (
          visibleQuestions.map((q) => (
            <div
              key={q.id}
              className="p-4 rounded-xl border border-[#E5E3DC] bg-[#FAFAF8] space-y-3 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#18181B]">{q.studentName}</span>
                  <span className="px-2 py-0.5 rounded-md bg-white border border-[#E5E3DC] text-[11px] text-[#0F6B4B] font-medium">
                    {q.languageName}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[#71717A]">
                  {q.status === 'answered' ? (
                    <span className="inline-flex items-center gap-1 text-[#0F6B4B] font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Answered
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[#B45309] font-semibold">
                      <Clock className="w-3.5 h-3.5" /> Awaiting Tutor Reply
                    </span>
                  )}
                  <span>· {q.createdAt}</span>
                </div>
              </div>

              <p className="text-[#18181B] leading-relaxed bg-white p-3 rounded-lg border border-[#E5E3DC]">
                {q.questionText}
              </p>

              {q.tutorReply ? (
                <div className="pl-3 border-l-2 border-[#0F6B4B] bg-[#0F6B4B]/5 p-3 rounded-r-lg space-y-1">
                  <div className="text-[11px] font-semibold text-[#0F6B4B]">
                    Reply from {q.repliedByName || 'Tutor'} {q.repliedAt ? `· ${q.repliedAt}` : ''}
                  </div>
                  <p className="text-[#18181B] leading-relaxed">{q.tutorReply}</p>
                </div>
              ) : (
                mode === 'tutor' && (
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={replyDrafts[q.id] || ''}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      placeholder="Write your answer for this student..."
                      className="flex-1 px-3.5 py-2 rounded-xl border border-[#D4D4D8] bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#0F6B4B]"
                    />
                    <button
                      type="button"
                      disabled={submitting || !(replyDrafts[q.id] || '').trim()}
                      onClick={() => handleSendReply(q.id)}
                      className="px-4 py-2 bg-[#0F6B4B] hover:bg-[#0B533A] disabled:opacity-50 text-white font-semibold rounded-xl cursor-pointer"
                    >
                      Reply
                    </button>
                  </div>
                )
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};