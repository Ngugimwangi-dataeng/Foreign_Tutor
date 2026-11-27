import React, { useEffect, useState } from 'react';
import type { Course, UserProfile } from '../types';

interface TutorCourseManagerProps {
  courses: Course[];
  currentUser: UserProfile;
  onSaveCourse: (course: Omit<Course, 'id'> & { id?: string }) => Promise<void> | void;
  onDeleteCourse: (courseId: string) => Promise<void> | void;
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

function createEmptyForm(defaultAudience: 'adult' | 'children' = 'adult'): CourseFormState {
  return {
    id: undefined,
    title: '',
    languageName: '',
    category: 'kenyan',
    audience: defaultAudience,
    sessionDurationMinutes: defaultAudience === 'children' ? 60 : 180,
    level: 'Beginner to Intermediate',
    perSessionPriceKes: defaultAudience === 'children' ? '1000' : '1500',
    monthlyPassPriceKes: defaultAudience === 'children' ? '6400' : '9600',
    jitsiRoomName: '',
    pdfTitle: '',
    lessonsCount: '10',
    imageUrl: '',
    description: '',
  };
}

function courseToForm(course: Course): CourseFormState {
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

export const TutorCourseManager: React.FC<TutorCourseManagerProps> = ({
  courses,
  currentUser,
  onSaveCourse,
  onDeleteCourse,
}) => {
  const [form, setForm] = useState<CourseFormState>(() => createEmptyForm('adult'));
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (editingCourse) {
      setForm(courseToForm(editingCourse));
    }
  }, [editingCourse]);

  const startNewCourse = () => {
    setEditingCourse(null);
    setForm(createEmptyForm('adult'));
    setStatusMessage(null);
  };

  const handleEditClick = (course: Course) => {
    setEditingCourse(course);
    setForm(courseToForm(course));
    setStatusMessage(`Editing "${course.title}"`);
  };

  const handleDeleteClick = async (course: Course) => {
    const confirmed = window.confirm(
      `Delete "${course.title}" (${course.languageName})? This removes it from the course list and database.`
    );
    if (!confirmed) return;

    if (editingCourse?.id === course.id) {
      startNewCourse();
    }
    setIsSubmitting(true);
    try {
      await onDeleteCourse(course.id);
      setStatusMessage(`Deleted "${course.title}".`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.languageName.trim()) return;

    const slug = form.languageName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const payload: Omit<Course, 'id'> & { id?: string } = {
      id: form.id,
      title: form.title.trim(),
      languageName: form.languageName.trim(),
      category: form.category,
      audience: form.audience,
      sessionDurationMinutes: form.audience === 'children' ? 60 : form.sessionDurationMinutes,
      level: form.level.trim() || 'Beginner to Intermediate',
      perSessionPriceKes: Math.max(0, Number(form.perSessionPriceKes) || 0),
      monthlyPassPriceKes: Math.max(0, Number(form.monthlyPassPriceKes) || 0),
      jitsiRoomName:
        form.jitsiRoomName.trim() || `lughasmart-${slug || 'course'}-${form.audience}`,
      pdfTitle:
        form.pdfTitle.trim() || `${form.languageName.trim()} Learner Workbook & Phrasebook.pdf`,
      lessonsCount: Math.max(1, Number(form.lessonsCount) || 10),
      imageUrl: form.imageUrl.trim(),
      description: form.description.trim(),
      tutorUid: editingCourse?.tutorUid || currentUser.uid,
      tutorName: editingCourse?.tutorName || currentUser.fullName,
      modules: editingCourse?.modules ?? [],
    };

    setIsSubmitting(true);
    try {
      await onSaveCourse(payload);
      setStatusMessage(
        form.id ? `Updated "${payload.title}" in database.` : `Added "${payload.title}" to database.`
      );
      if (!form.id) {
        setForm(createEmptyForm(form.audience));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCourses = courses.filter((c) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      c.title.toLowerCase().includes(q) ||
      c.languageName.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.audience.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E5E3DC] pb-4">
        <div>
          <h2 className="text-lg font-semibold text-[#18181B]">Course Catalog Manager</h2>
          <p className="text-xs text-[#71717A]">
            Add new courses, update pricing/schedules/details on existing courses, or delete unneeded courses.
          </p>
        </div>
        {form.id && (
          <button
            type="button"
            onClick={startNewCourse}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#D4D4D8] bg-white text-[#18181B] hover:bg-[#F4F4F5] cursor-pointer"
          >
            + Switch to Add New Course
          </button>
        )}
      </div>

      {statusMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Add / Edit Course Form */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 rounded-xl border border-[#E5E3DC] bg-white p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#18181B]">
              {form.id ? `Edit Course (${form.id})` : 'Add New Course'}
            </h3>
            {form.id && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-medium">
                Editing Mode
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#3F3F46] mb-1">
              Course Title *
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Conversational Kikuyu for Adults"
              className="w-full rounded-lg border border-[#D4D4D8] px-3 py-2 text-sm focus:outline-none focus:border-[#18181B]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#3F3F46] mb-1">
                Language Name *
              </label>
              <input
                type="text"
                required
                value={form.languageName}
                onChange={(e) => setForm((f) => ({ ...f, languageName: e.target.value }))}
                placeholder="e.g. Kikuyu, Dholuo, French"
                className="w-full rounded-lg border border-[#D4D4D8] px-3 py-2 text-sm focus:outline-none focus:border-[#18181B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3F3F46] mb-1">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    category: e.target.value === 'foreign' ? 'foreign' : 'kenyan',
                  }))
                }
                className="w-full rounded-lg border border-[#D4D4D8] px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#18181B]"
              >
                <option value="kenyan">Kenyan Local Language</option>
                <option value="foreign">Foreign / Global Language</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#3F3F46] mb-1">
                Audience
              </label>
              <select
                value={form.audience}
                onChange={(e) => {
                  const nextAudience = e.target.value === 'children' ? 'children' : 'adult';
                  setForm((f) => ({
                    ...f,
                    audience: nextAudience,
                    sessionDurationMinutes: nextAudience === 'children' ? 60 : 180,
                  }));
                }}
                className="w-full rounded-lg border border-[#D4D4D8] px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#18181B]"
              >
                <option value="adult">Adult (3-Hr Sessions)</option>
                <option value="children">Children (1-Hr Sessions)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3F3F46] mb-1">
                Proficiency Level
              </label>
              <input
                type="text"
                value={form.level}
                onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
                placeholder="Beginner to Intermediate"
                className="w-full rounded-lg border border-[#D4D4D8] px-3 py-2 text-sm focus:outline-none focus:border-[#18181B]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#3F3F46] mb-1">
                Per Session (KES)
              </label>
              <input
                type="number"
                min={0}
                value={form.perSessionPriceKes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, perSessionPriceKes: e.target.value }))
                }
                className="w-full rounded-lg border border-[#D4D4D8] px-3 py-2 text-sm focus:outline-none focus:border-[#18181B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3F3F46] mb-1">
                Monthly Pass (KES)
              </label>
              <input
                type="number"
                min={0}
                value={form.monthlyPassPriceKes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, monthlyPassPriceKes: e.target.value }))
                }
                className="w-full rounded-lg border border-[#D4D4D8] px-3 py-2 text-sm focus:outline-none focus:border-[#18181B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3F3F46] mb-1">
                Lessons Count
              </label>
              <input
                type="number"
                min={1}
                value={form.lessonsCount}
                onChange={(e) => setForm((f) => ({ ...f, lessonsCount: e.target.value }))}
                className="w-full rounded-lg border border-[#D4D4D8] px-3 py-2 text-sm focus:outline-none focus:border-[#18181B]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#3F3F46] mb-1">
                Jitsi Room Name
              </label>
              <input
                type="text"
                value={form.jitsiRoomName}
                onChange={(e) => setForm((f) => ({ ...f, jitsiRoomName: e.target.value }))}
                placeholder="Auto-generated if blank"
                className="w-full rounded-lg border border-[#D4D4D8] px-3 py-2 text-sm focus:outline-none focus:border-[#18181B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3F3F46] mb-1">
                Course Image URL
              </label>
              <input
                type="text"
                value={form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                placeholder="https://... or /images/..."
                className="w-full rounded-lg border border-[#D4D4D8] px-3 py-2 text-sm focus:outline-none focus:border-[#18181B]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#3F3F46] mb-1">
              Syllabus / PDF Title
            </label>
            <input
              type="text"
              value={form.pdfTitle}
              onChange={(e) => setForm((f) => ({ ...f, pdfTitle: e.target.value }))}
              placeholder="e.g. Kikuyu Conversational Guide.pdf"
              className="w-full rounded-lg border border-[#D4D4D8] px-3 py-2 text-sm focus:outline-none focus:border-[#18181B]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#3F3F46] mb-1">
              Course Description
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Describe what learners will practice in live sessions..."
              className="w-full rounded-lg border border-[#D4D4D8] px-3 py-2 text-sm focus:outline-none focus:border-[#18181B]"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-[#18181B] text-white px-4 py-2 text-xs font-semibold hover:bg-[#27272A] disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting
                ? 'Saving...'
                : form.id
                ? 'Save Course Changes'
                : 'Add Course to Database'}
            </button>
            {form.id && (
              <button
                type="button"
                onClick={startNewCourse}
                className="rounded-lg border border-[#D4D4D8] px-3 py-2 text-xs font-medium text-[#3F3F46] hover:bg-[#F4F4F5] cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* Existing Courses List with Edit & Delete */}
        <div className="lg:col-span-7 rounded-xl border border-[#E5E3DC] bg-white p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#18181B]">
              Existing Courses ({filteredCourses.length})
            </h3>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by title, language, audience..."
              className="w-full sm:w-60 rounded-lg border border-[#D4D4D8] px-3 py-1.5 text-xs focus:outline-none focus:border-[#18181B]"
            />
          </div>

          {filteredCourses.length === 0 ? (
            <p className="text-xs text-[#71717A] py-8 text-center">
              No matching courses found.
            </p>
          ) : (
            <div className="divide-y divide-[#ECEAE4]">
              {filteredCourses.map((course) => {
                const isBeingEdited = form.id === course.id;
                return (
                  <div
                    key={course.id}
                    className={`py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isBeingEdited ? 'bg-amber-50/60 -mx-2 px-2 rounded-lg' : ''
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#18181B] truncate">
                          {course.title}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F4F4F5] text-[#3F3F46] font-medium">
                          {course.languageName}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#EEF2FF] text-[#3730A3] font-medium capitalize">
                          {course.audience} · {course.sessionDurationMinutes}m
                        </span>
                      </div>
                      <p className="text-xs text-[#71717A] line-clamp-1">
                        {course.description || 'No description provided.'}
                      </p>
                      <div className="text-[11px] text-[#52525B]">
                        Session: KES {course.perSessionPriceKes.toLocaleString()} · Monthly: KES{' '}
                        {course.monthlyPassPriceKes.toLocaleString()} · {course.lessonsCount} lessons
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditClick(course)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#D4D4D8] bg-white text-[#18181B] hover:bg-[#F4F4F5] cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleDeleteClick(course)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};