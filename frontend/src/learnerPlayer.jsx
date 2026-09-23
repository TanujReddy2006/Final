import React, { useEffect, useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  PlayCircle,
  Sparkles,
  Video
} from 'lucide-react';
import { api, unwrap } from './services/api';

/**
 * Extracts YouTube video ID from various YouTube URL formats
 */
export function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const cleanUrl = url.trim();
  const watchMatch = cleanUrl.match(
    /(?:youtube\.com\/(?:watch\?.*?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  );
  return watchMatch ? watchMatch[1] : null;
}

/**
 * Safe video embed and resource player
 */
function LessonVideoPlayer({ url, title }) {
  if (!url || typeof url !== 'string') return null;
  const cleanUrl = url.trim();
  const youtubeId = extractYouTubeId(cleanUrl);

  if (youtubeId) {
    return (
      <div className="video-container">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`}
          title={title || 'Lesson Video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  // Direct video file playback (.mp4, .webm, .ogg)
  if (/\.(mp4|webm|ogg)($|\?)/i.test(cleanUrl)) {
    return (
      <div className="video-container">
        <video controls src={cleanUrl}>
          Your browser does not support HTML5 video playback.
        </video>
      </div>
    );
  }

  // Safe external link for other URLs
  if (/^https?:\/\//i.test(cleanUrl)) {
    return (
      <a
        href={cleanUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="video-external-card"
        title="Open external lesson resource"
      >
        <ExternalLink size={18} />
        <div>
          <strong>External Video / Lesson Resource</strong>
          <small style={{ display: 'block', color: 'var(--muted)' }}>{cleanUrl}</small>
        </div>
      </a>
    );
  }

  return null;
}

export function LearnerPlayer() {
  const params = useParams();
  const location = useLocation();
  const id = params.id || location.pathname.split('/')[2];

  const [course, setCourse] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [certificate, setCertificate] = useState(null);
  const [selected, setSelected] = useState(0);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [state, setState] = useState(null);
  const [answer, setAnswer] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const [courseData, enrollments, certs] = await Promise.all([
        unwrap(api.get(`/courses/${id}`)),
        unwrap(api.get('/enrollments/me')),
        unwrap(api.get('/certificates/me')).catch(() => [])
      ]);
      if (courseData && courseData.modules) {
        courseData.modules.forEach((m, idx) => {
          if (!m.id) m.id = `mod-${idx}`;
          if (m.lessons) {
            m.lessons.forEach((l, lIdx) => {
              if (!l.id) l.id = `les-${idx}-${lIdx}`;
            });
          }
        });
      }
      let enr = enrollments.find(item => item.courseId === id);
      if (!enr) {
        try {
          enr = await unwrap(api.post('/enrollments', { courseId: id }));
        } catch {
          // ignore
        }
      }
      const existingCert = certs.find(c => c.courseId === id);
      setCourse(courseData);
      setEnrollment(enr);
      if (existingCert) {
        setCertificate(existingCert);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (course && course.modules && course.modules[selected]) {
      const currentModule = course.modules[selected];
      unwrap(api.get(`/progress/${id}/${currentModule.id}`))
        .then(setState)
        .catch(console.error);

      // Initialize to first uncompleted lesson in this module if available
      const lessons = currentModule.lessons || [];
      const completedIds = enrollment?.completedLessonIds || [];
      const firstUncompleted = lessons.findIndex(l => !completedIds.includes(l.id));
      setCurrentLessonIndex(firstUncompleted !== -1 ? firstUncompleted : 0);
    }
  }, [course, selected, id]);

  if (loading) return <div className="loading">Loading learning room...</div>;
  if (!course) {
    return (
      <div className="empty-state">
        <BookOpen size={40} />
        <h2>Course not found</h2>
        <p className="muted">We could not locate this course in your enrolled list.</p>
        <Link className="button dark" to="/my-courses">Back to my learning</Link>
      </div>
    );
  }
  if (!enrollment) {
    return (
      <div className="empty-state">
        <BookOpen size={40} />
        <h2>Not enrolled</h2>
        <p className="muted">You must enroll in this course before accessing the learning room.</p>
        <Link className="button dark" to={`/courses/${id}`}>View course details</Link>
      </div>
    );
  }

  const module = course.modules?.[selected] || {};
  const lessons = module.lessons || [];
  const completedLessonIds = enrollment.completedLessonIds || [];
  const currentLesson = lessons[currentLessonIndex] || lessons[0];
  const isCurrentLessonCompleted = currentLesson && completedLessonIds.includes(currentLesson.id);

  const quiz = module.quiz?.[0];
  const isModuleCompleted = enrollment.completedModuleIds?.includes(module.id);
  const isQuizPassed = !quiz || enrollment.passedQuizIds?.includes(quiz.id);
  const allModulesCompleted =
    course.modules?.length > 0 &&
    course.modules.every(m => enrollment.completedModuleIds?.includes(m.id));

  // Mark lesson completed and advance to next lesson sequentially
  const handleNextLesson = async () => {
    if (!currentLesson) return;
    setActionLoading(true);
    setMessage('');
    try {
      const modId = module.id || 'default';
      // Mark current lesson as complete
      await unwrap(api.post(`/progress/${id}/${modId}/lessons/${currentLesson.id}/complete`));
      // Mark module as viewed/read
      await unwrap(api.post(`/progress/${id}/${modId}/read`)).catch(() => {});
      setState(cur => ({ ...cur, viewed: true }));

      // Optimistically update local enrollment completed lessons
      const updatedLessons = Array.from(new Set([...completedLessonIds, currentLesson.id]));
      setEnrollment(prev => ({ ...prev, completedLessonIds: updatedLessons }));

      // Advance to next lesson if one exists
      if (currentLessonIndex < lessons.length - 1) {
        setCurrentLessonIndex(currentLessonIndex + 1);
        setMessage(`Completed "${currentLesson.title}". Moving to next lesson.`);
      } else {
        setMessage(`All lessons in ${module.title} completed!`);
      }
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not update lesson progress.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePreviousLesson = () => {
    if (currentLessonIndex > 0) {
      setCurrentLessonIndex(currentLessonIndex - 1);
      setMessage('');
    }
  };

  const markRead = async () => {
    try {
      const modId = module.id || 'default';
      await unwrap(api.post(`/progress/${id}/${modId}/read`));
      setState(current => ({ ...current, viewed: true }));
      setMessage('Content marked as read.');
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not update read state.');
    }
  };

  const quizSubmit = async () => {
    if (!quiz || !answer) return;
    try {
      const modId = module.id || 'default';
      const res = await unwrap(api.post(`/modules/${id}/${modId}/quiz`, { answers: { [quiz.id]: answer } }));
      setMessage(res.passed ? 'Quiz passed!' : 'Incorrect answer. Review and try again.');
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Quiz submission failed.');
    }
  };

  const completeModule = async () => {
    setActionLoading(true);
    try {
      const modId = module.id || 'default';
      if (module.lessons?.length) {
        for (const lesson of module.lessons) {
          if (!enrollment.completedLessonIds?.includes(lesson.id)) {
            await unwrap(api.post(`/progress/${id}/${modId}/lessons/${lesson.id}/complete`));
          }
        }
      }
      const res = await unwrap(api.post('/progress', { courseId: id, moduleId: modId }));
      setMessage('Module completed!');
      if (res?.certificate) {
        setCertificate(res.certificate);
      }
      await load();
      if (selected < course.modules.length - 1) {
        setSelected(selected + 1);
        setCurrentLessonIndex(0);
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not complete module.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <Link className="back-link" to="/my-courses">← Back to my learning</Link>
      <div className="learning-head">
        <div>
          <p className="eyebrow">LEARNING ROOM · {course.category}</p>
          <h1>{course.title}</h1>
          <p className="muted">{enrollment.progress}% complete · {course.difficulty}</p>
        </div>
        <div className="learning-progress">
          <strong>{enrollment.progress}%</strong>
          <div className="progress"><span style={{ width: `${enrollment.progress}%` }} /></div>
        </div>
      </div>

      <div className="player-layout">
        <aside className="module-nav panel">
          <p className="eyebrow">COURSE MODULES</p>
          {course.modules?.map((item, index) => {
            const isCompleted = enrollment.completedModuleIds?.includes(item.id);
            return (
              <button
                key={item.id}
                className={selected === index ? 'module-nav-item selected' : 'module-nav-item'}
                onClick={() => { setSelected(index); setMessage(''); }}
              >
                <span className={isCompleted ? 'done-check' : ''}>
                  {isCompleted ? <CheckCircle2 size={16} /> : `0${index + 1}`}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.lessons?.length || 0} lessons · {item.duration || '30 min'}</small>
                </div>
                <ChevronRight size={14} />
              </button>
            );
          })}

          {course.assessmentId && (
            <div className="final-link">
              <span>CERTIFICATION</span>
              <Link to={`/assessments/${course.assessmentId}`}>
                <Award size={16} /> Take final assessment <ChevronRight size={14} />
              </Link>
            </div>
          )}
        </aside>

        <section className="learning-main">
          <div className="content-reader">
            <span className="content-type">
              <BookOpen size={14} /> MODULE {selected + 1} OF {course.modules?.length || 1}
            </span>
            <h2>{module.title}</h2>
            {module.description && <p className="reader-copy">{module.description}</p>}

            {/* Sequential Lesson Progress (Top-to-Bottom) */}
            {lessons.length > 0 && (
              <div className="lesson-stepper">
                <div className="lesson-stepper-title">Lessons Sequential Progress</div>
                <div className="lesson-stepper-items">
                  {lessons.map((les, idx) => {
                    const isDone = completedLessonIds.includes(les.id);
                    const isCurrent = idx === currentLessonIndex;
                    return (
                      <div
                        key={les.id || idx}
                        className={`lesson-stepper-item ${
                          isCurrent ? 'current' : isDone ? 'completed' : 'upcoming'
                        }`}
                        onClick={() => {
                          setCurrentLessonIndex(idx);
                          setMessage('');
                        }}
                      >
                        <span className="lesson-stepper-badge">
                          {isDone ? (
                            <CheckCircle2 size={13} />
                          ) : isCurrent ? (
                            '→'
                          ) : (
                            idx + 1
                          )}
                        </span>
                        <div style={{ flex: 1 }}>
                          <strong>Lesson {idx + 1}: {les.title}</strong>
                          <span style={{ fontSize: '11px', marginLeft: '8px', color: 'var(--muted)' }}>
                            {les.duration || '15 min'}
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600 }}>
                          {isDone ? '✓ Completed' : isCurrent ? '→ Current' : '○ Not started'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active Lesson Content and Video */}
            {currentLesson ? (
              <article className="active-lesson-card" style={{ marginTop: '20px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    borderBottom: '1px solid var(--line)',
                    paddingBottom: '12px',
                    marginBottom: '18px'
                  }}
                >
                  <div>
                    <span className="eyebrow" style={{ color: 'var(--orange)' }}>
                      LESSON {currentLessonIndex + 1} OF {lessons.length}
                    </span>
                    <h3 style={{ font: '600 22px "Space Grotesk"', margin: '4px 0 0' }}>
                      {currentLesson.title}
                    </h3>
                  </div>
                  <span
                    className={isCurrentLessonCompleted ? 'status-badge' : 'muted'}
                    style={{ fontSize: '11px' }}
                  >
                    {isCurrentLessonCompleted ? '✓ Completed' : 'Not completed yet'}
                  </span>
                </div>

                {/* Embedded Video Player if videoUrl exists */}
                {currentLesson.videoUrl && (
                  <LessonVideoPlayer url={currentLesson.videoUrl} title={currentLesson.title} />
                )}

                {/* Lesson Content Text */}
                <div
                  style={{
                    fontSize: '15px',
                    lineHeight: '1.75',
                    color: '#2a3b36',
                    whiteSpace: 'pre-wrap',
                    margin: '18px 0'
                  }}
                >
                  {currentLesson.content || 'No text content provided for this lesson.'}
                </div>

                {/* Supplemental Resource Link if present */}
                {currentLesson.resourceUrl && (
                  <a
                    href={currentLesson.resourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="video-external-card"
                    style={{ margin: '14px 0' }}
                  >
                    <ExternalLink size={16} />
                    <div>
                      <strong>Supplemental Material</strong>
                      <small style={{ display: 'block', color: 'var(--muted)' }}>
                        {currentLesson.resourceUrl}
                      </small>
                    </div>
                  </a>
                )}

                {/* Sequential Navigation Bar: Previous and Next */}
                <div className="lesson-navigation-bar">
                  <button
                    type="button"
                    className="button"
                    style={{ border: '1px solid var(--line)' }}
                    onClick={handlePreviousLesson}
                    disabled={currentLessonIndex === 0 || actionLoading}
                  >
                    <ChevronLeft size={16} /> Previous
                  </button>

                  {currentLessonIndex < lessons.length - 1 ? (
                    <button
                      type="button"
                      className="button primary"
                      onClick={handleNextLesson}
                      disabled={actionLoading}
                    >
                      {actionLoading ? 'Updating...' : 'Next'} <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button primary"
                      onClick={handleNextLesson}
                      disabled={actionLoading || isCurrentLessonCompleted}
                    >
                      {isCurrentLessonCompleted
                        ? 'Lesson finished'
                        : 'Mark finished'} <CheckCircle2 size={15} />
                    </button>
                  )}
                </div>
              </article>
            ) : (
              <p className="muted">This module does not contain any lessons yet.</p>
            )}
          </div>

          {quiz && (
            <div className="module-quiz panel" style={{ marginTop: '20px' }}>
              <p className="eyebrow">UNWEIGHTED MODULE CHECK</p>
              <h3>{quiz.text}</h3>
              <div className="quiz-options">
                {quiz.options?.map(option => (
                  <label className={`quiz-option ${answer === option.id ? 'selected' : ''}`} key={option.id}>
                    <input
                      type="radio"
                      name={quiz.id}
                      value={option.id}
                      checked={answer === option.id}
                      onChange={e => setAnswer(e.target.value)}
                    />
                    {option.text}
                  </label>
                ))}
              </div>
              <div className="quiz-actions">
                <button
                  className="button dark"
                  disabled={!answer || isQuizPassed}
                  onClick={quizSubmit}
                >
                  {isQuizPassed ? 'Quiz passed' : 'Check answer'}
                </button>
                {isQuizPassed && <span className="read-state"><CheckCircle2 size={14} /> Passed</span>}
              </div>
            </div>
          )}

          <div className="complete-bar" style={{ marginTop: '20px' }}>
            {message ? <span className="module-message">{message}</span> : <div />}
            <button
              className="button primary"
              disabled={actionLoading || !isQuizPassed || isModuleCompleted}
              onClick={completeModule}
            >
              {isModuleCompleted ? 'Module completed' : 'Complete module'} <ChevronRight size={16} />
            </button>
          </div>

          {certificate ? (
            <div className="reader-callout" style={{ marginTop: '25px', background: 'var(--mint)', border: '1px solid var(--mint-strong)' }}>
              <Award size={28} style={{ color: 'var(--orange)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <strong>Course Certified!</strong>
                <p style={{ margin: '4px 0 10px' }}>
                  Congratulations! You have completed this course and earned your verified credential with a top score of {certificate.score}%.
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <a
                    className="button primary"
                    style={{ height: '36px', fontSize: '12px' }}
                    href={`${api.defaults.baseURL.replace('/api/v1', '')}${certificate.pdfUrl}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={15} /> Download Certificate (PDF)
                  </a>
                  <Link
                    to={`/verify/${certificate.certificateId}`}
                    className="button dark"
                    style={{ height: '36px', fontSize: '12px' }}
                  >
                    Verify in Registry
                  </Link>
                  {course.assessmentId && (
                    <Link
                      to={`/assessments/${course.assessmentId}`}
                      className="button"
                      style={{ height: '36px', fontSize: '12px', border: '1px solid var(--line)', background: '#fff' }}
                    >
                      Retake Assessment
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ) : allModulesCompleted && course.assessmentId && (
            <div className="reader-callout" style={{ marginTop: '25px' }}>
              <Sparkles size={20} />
              <div>
                <strong>All modules complete!</strong>
                <p>You have finished the content requirements. Take the final assessment to earn your verified credential.</p>
                <Link
                  className="button primary"
                  style={{ marginTop: '10px' }}
                  to={`/assessments/${course.assessmentId}`}
                >
                  <Award size={16} /> Launch final assessment
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}