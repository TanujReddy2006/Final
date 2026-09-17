import React, { useEffect, useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { Award, BookOpen, CheckCircle2, ChevronRight, Clock3, Download, FileText, Send, Sparkles } from 'lucide-react';
import { api, unwrap } from './services/api';

export function LearnerPlayer() {
  const params = useParams();
  const location = useLocation();
  const id = params.id || location.pathname.split('/')[2];

  const [course, setCourse] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [certificate, setCertificate] = useState(null);
  const [selected, setSelected] = useState(0);
  const [state, setState] = useState(null);
  const [answer, setAnswer] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

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
      unwrap(api.get(`/progress/${id}/${course.modules[selected].id}`))
        .then(setState)
        .catch(err => console.error(err));
    }
  }, [course, selected, id]);

  if (loading) return <div className="loading">Loading learning room...</div>;
  if (!course) return (
    <div className="empty-state">
      <BookOpen size={40} />
      <h2>Course not found</h2>
      <p className="muted">We could not locate this course in your enrolled list.</p>
      <Link className="button dark" to="/my-courses">Back to my learning</Link>
    </div>
  );
  if (!enrollment) return (
    <div className="empty-state">
      <BookOpen size={40} />
      <h2>Not enrolled</h2>
      <p className="muted">You must enroll in this course before accessing the learning room.</p>
      <Link className="button dark" to={`/courses/${id}`}>View course details</Link>
    </div>
  );

  const module = course.modules?.[selected] || {};
  const quiz = module.quiz?.[0];
  const isModuleCompleted = enrollment.completedModuleIds?.includes(module.id);
  const isQuizPassed = !quiz || enrollment.passedQuizIds?.includes(quiz.id);
  const allModulesCompleted = course.modules?.length > 0 && course.modules.every(m => enrollment.completedModuleIds?.includes(m.id));

  const markRead = async () => {
    try {
      const modId = module.id || course.modules?.[selected]?.id || 'default';
      await unwrap(api.post(`/progress/${id}/${modId}/read`));
      setState(current => ({ ...current, viewed: true }));
      setMessage('Content marked as read.');
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not update read state.');
    }
  };

  const completeLesson = async (lessonId) => {
    try {
      const modId = module.id || course.modules?.[selected]?.id || 'default';
      await unwrap(api.post(`/progress/${id}/${modId}/lessons/${lessonId || 'default'}/complete`));
      await load();
      setMessage('Lesson marked as completed.');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not complete lesson.');
    }
  };

  const quizSubmit = async () => {
    if (!quiz || !answer) return;
    try {
      const modId = module.id || course.modules?.[selected]?.id || 'default';
      const res = await unwrap(api.post(`/modules/${id}/${modId}/quiz`, { answers: { [quiz.id]: answer } }));
      setMessage(res.passed ? 'Quiz passed!' : 'Incorrect answer. Review and try again.');
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Quiz submission failed.');
    }
  };

  const completeModule = async () => {
    try {
      const modId = module.id || course.modules?.[selected]?.id || 'default';
      if (module.lessons?.length) {
        for (const lesson of module.lessons) {
          if (!enrollment.completedLessonIds?.includes(lesson.id)) {
            await unwrap(api.post(`/progress/${id}/${modId}/lessons/${lesson.id || 'default'}/complete`));
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
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not complete module.');
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
              <BookOpen size={14} /> MODULE {selected + 1}
            </span>
            <h2>{module.title}</h2>
            {module.description && <p className="reader-copy">{module.description}</p>}

            {module.lessons?.map((lesson, idx) => {
              const lessonCompleted = enrollment.completedLessonIds?.includes(lesson.id);
              return (
                <article className="lesson-reader" key={lesson.id || idx}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>{lesson.title}</h3>
                    <button
                      type="button"
                      className={lessonCompleted ? 'read-state' : 'button dark'}
                      style={{ height: '32px', fontSize: '11px', padding: '0 10px' }}
                      onClick={() => completeLesson(lesson.id)}
                    >
                      {lessonCompleted ? <><CheckCircle2 size={13} /> Completed</> : 'Mark finished'}
                    </button>
                  </div>
                  <p>{lesson.content}</p>
                </article>
              );
            })}

            <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
              {state?.viewed ? (
                <span className="read-state"><CheckCircle2 size={15} /> Content read</span>
              ) : (
                <button className="button dark" onClick={markRead}>Mark content as read</button>
              )}
            </div>
          </div>

          {quiz && (
            <div className="module-quiz panel">
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
                  disabled={!state?.viewed || !answer || isQuizPassed}
                  onClick={quizSubmit}
                >
                  {isQuizPassed ? 'Quiz passed' : 'Check answer'}
                </button>
                {isQuizPassed && <span className="read-state"><CheckCircle2 size={14} /> Passed</span>}
              </div>
            </div>
          )}

          <div className="complete-bar">
            {message ? <span className="module-message">{message}</span> : <div />}
            <button
              className="button primary"
              disabled={!state?.viewed || !isQuizPassed || isModuleCompleted}
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