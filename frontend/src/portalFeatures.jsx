import React, { useEffect, useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
  XCircle
} from 'lucide-react';
import { api, unwrap } from './services/api';

const blankLesson = () => ({
  title: '',
  description: '',
  content: '',
  type: 'READING',
  duration: '30 min',
  videoUrl: '',
  resourceUrl: ''
});

const blankModule = () => ({
  title: '',
  description: '',
  duration: '1 hour',
  learningObjectives: [],
  lessons: [blankLesson()]
});

const blankQuestion = () => ({
  text: '',
  type: 'SINGLE',
  marks: 1,
  options: [
    { id: `option-${Date.now()}-a`, text: '', correct: true },
    { id: `option-${Date.now()}-b`, text: '', correct: false }
  ]
});

function Field({ label, value, onChange, area, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {area ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} {...props} />
      ) : (
        <input value={value || ''} onChange={e => onChange(e.target.value)} {...props} />
      )}
    </label>
  );
}

export function CompanyStudio() {
  const params = useParams();
  const loc = useLocation();
  const pathParts = loc.pathname.split('/');
  const id =
    params.id ||
    (pathParts[2] === 'courses' && pathParts[3] ? pathParts[3] : pathParts[2] || '');

  const [step, setStep] = useState(0);
  const [message, setMessage] = useState('');
  const [savedId, setSavedId] = useState(id || '');

  const [form, setForm] = useState({
    title: '',
    description: '',
    detailedDescription: '',
    category: 'Engineering',
    difficulty: 'BEGINNER',
    duration: '',
    instructorName: '',
    instructorBio: '',
    thumbnail: '',
    learningObjectives: [''],
    prerequisites: '',
    targetAudience: '',
    skills: [''],
    modules: [blankModule()],
    assessmentTitle: '',
    assessmentDescription: '',
    passingScore: 70,
    maxAttempts: 3,
    timeLimit: '',
    randomizeQuestions: false,
    showAnswersAfterSubmission: false,
    questions: [blankQuestion()]
  });

  useEffect(() => {
    if (id) {
      unwrap(api.get(`/company/courses/${id}`)).then(course => {
        if (course.assessmentId) {
          unwrap(api.get(`/assessments/${course.assessmentId}`)).then(assessment => {
            setForm(current => ({
              ...current,
              ...course,
              learningObjectives: course.learningObjectives?.length
                ? course.learningObjectives
                : [''],
              skills: course.skills?.length ? course.skills : [''],
              assessmentTitle: assessment.title,
              assessmentDescription: assessment.description,
              passingScore: assessment.passingScore,
              maxAttempts: assessment.maxAttempts || 3,
              timeLimit: assessment.timeLimit || '',
              randomizeQuestions: assessment.randomizeQuestions,
              showAnswersAfterSubmission: assessment.showAnswersAfterSubmission,
              questions: assessment.questions
            }));
          });
        } else {
          setForm(current => ({
            ...current,
            ...course,
            learningObjectives: course.learningObjectives?.length
              ? course.learningObjectives
              : [''],
            skills: course.skills?.length ? course.skills : ['']
          }));
        }
      });
    }
  }, [id]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const updateModule = (index, value) =>
    set(
      'modules',
      form.modules.map((module, itemIndex) => (itemIndex === index ? value : module))
    );

  const updateLesson = (moduleIndex, lessonIndex, value) =>
    updateModule(moduleIndex, {
      ...form.modules[moduleIndex],
      lessons: form.modules[moduleIndex].lessons.map((lesson, index) =>
        index === lessonIndex ? value : lesson
      )
    });

  const updateQuestion = (index, value) =>
    set(
      'questions',
      form.questions.map((question, questionIndex) =>
        questionIndex === index ? value : question
      )
    );

  const payload = {
    ...form,
    learningObjectives: form.learningObjectives.filter(Boolean),
    skills: form.skills.filter(Boolean)
  };

  const save = async () => {
    try {
      const saved = id
        ? await unwrap(api.patch(`/courses/${id}`, payload))
        : await unwrap(api.post('/courses', payload));
      const courseId = saved.id;
      setSavedId(courseId);

      if (id || saved.assessmentId) {
        await unwrap(
          api.patch(`/assessments/${id ? form.assessmentId : saved.assessmentId}`, payload)
        );
      }
      setMessage('Draft saved. You can continue editing or review and publish.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Draft could not be saved');
    }
  };

  const publish = async () => {
    try {
      await save();
      await unwrap(api.patch(`/courses/${savedId || id}/publish`));
      setMessage('Course published and available to learners.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Course cannot be published yet');
    }
  };

  const stepNames = ['Basic information', 'Course content', 'Assessments', 'Review & publish'];

  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">COURSE STUDIO</p>
          <h1>{id ? 'Edit course' : 'Create a course'}</h1>
          <p className="muted">Build a complete course without leaving your company workspace.</p>
        </div>
        <button className="button dark" type="button" onClick={save}>
          <Save size={16} /> Save draft
        </button>
      </div>

      <div className="builder-steps">
        {stepNames.map((name, index) => (
          <button
            className={step === index ? 'builder-step active' : 'builder-step'}
            onClick={() => setStep(index)}
            key={name}
          >
            <span>{index + 1}</span>
            {name}
          </button>
        ))}
      </div>

      <section className="panel studio-section builder-panel">
        {step === 0 && <BasicStep form={form} set={set} />}
        {step === 1 && (
          <ContentStep
            form={form}
            set={set}
            updateModule={updateModule}
            updateLesson={updateLesson}
          />
        )}
        {step === 2 && (
          <AssessmentStep form={form} set={set} updateQuestion={updateQuestion} />
        )}
        {step === 3 && <ReviewStep form={form} />}
      </section>

      <div className="builder-actions">
        {message && <span className="read-state">{message}</span>}
        <div>
          <button
            className="button dark"
            type="button"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            Back
          </button>
          {step < 3 ? (
            <button className="button primary" type="button" onClick={() => setStep(step + 1)}>
              Continue <ChevronRight size={16} />
            </button>
          ) : (
            <button className="button primary" type="button" onClick={publish}>
              <Send size={16} /> Publish course
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function BasicStep({ form, set }) {
  const list = (key, label) => (
    <div className="dynamic-list">
      <div className="panel-heading">
        <h3>{label}</h3>
        <button type="button" className="text-link" onClick={() => set(key, [...form[key], ''])}>
          <Plus size={15} /> Add
        </button>
      </div>
      {form[key].map((item, index) => (
        <div className="dynamic-row" key={index}>
          <input
            value={item}
            onChange={e =>
              set(
                key,
                form[key].map((value, itemIndex) => (itemIndex === index ? e.target.value : value))
              )
            }
            placeholder={`${label} ${index + 1}`}
          />
          {form[key].length > 1 && (
            <button
              type="button"
              onClick={() => set(key, form[key].filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <>
      <h2>Basic information</h2>
      <div className="studio-grid">
        <Field label="Course title" value={form.title} onChange={v => set('title', v)} />
        <Field label="Short description" value={form.description} onChange={v => set('description', v)} />
        <Field label="Category" value={form.category} onChange={v => set('category', v)} />
        <Field label="Difficulty" value={form.difficulty} onChange={v => set('difficulty', v)} />
        <Field label="Duration" value={form.duration} onChange={v => set('duration', v)} />
        <Field label="Instructor name" value={form.instructorName} onChange={v => set('instructorName', v)} />
        <Field label="Instructor bio" value={form.instructorBio} onChange={v => set('instructorBio', v)} area />
        <Field label="Detailed description" value={form.detailedDescription} onChange={v => set('detailedDescription', v)} area />
        <Field label="Thumbnail URL" value={form.thumbnail} onChange={v => set('thumbnail', v)} />
        <Field label="Prerequisites" value={form.prerequisites} onChange={v => set('prerequisites', v)} />
        <Field label="Target audience" value={form.targetAudience} onChange={v => set('targetAudience', v)} />
      </div>
      {list('learningObjectives', 'Learning objective')}
      {list('skills', 'Skill gained')}
    </>
  );
}

function ContentStep({ form, updateModule, updateLesson }) {
  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Course content</h2>
          <p className="muted">Add unlimited modules and lessons.</p>
        </div>
        <button
          type="button"
          className="button dark"
          onClick={() => updateModule(form.modules.length, blankModule())}
        >
          <Plus size={16} /> Add module
        </button>
      </div>

      {form.modules.map((module, moduleIndex) => (
        <article className="builder-module-card" key={moduleIndex}>
          <div className="panel-heading">
            <h3>Module {moduleIndex + 1}</h3>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                updateModule(moduleIndex, {
                  ...module,
                  lessons: [...module.lessons, blankLesson()]
                })
              }
            >
              <Plus size={15} /> Add lesson
            </button>
          </div>
          <div className="studio-grid">
            <Field
              label="Module title"
              value={module.title}
              onChange={v => updateModule(moduleIndex, { ...module, title: v })}
            />
            <Field
              label="Module description"
              value={module.description}
              onChange={v => updateModule(moduleIndex, { ...module, description: v })}
            />
            <Field
              label="Duration"
              value={module.duration}
              onChange={v => updateModule(moduleIndex, { ...module, duration: v })}
            />
          </div>

          {module.lessons.map((lesson, lessonIndex) => (
            <div className="lesson-editor" key={lessonIndex}>
              <strong>Lesson {lessonIndex + 1}</strong>
              <div className="studio-grid">
                <Field
                  label="Title"
                  value={lesson.title}
                  onChange={v =>
                    updateLesson(moduleIndex, lessonIndex, { ...lesson, title: v })
                  }
                />
                <Field
                  label="Type"
                  value={lesson.type}
                  onChange={v =>
                    updateLesson(moduleIndex, lessonIndex, { ...lesson, type: v })
                  }
                />
                <Field
                  label="Duration"
                  value={lesson.duration}
                  onChange={v =>
                    updateLesson(moduleIndex, lessonIndex, { ...lesson, duration: v })
                  }
                />
                <Field
                  label="Video URL"
                  value={lesson.videoUrl}
                  onChange={v =>
                    updateLesson(moduleIndex, lessonIndex, { ...lesson, videoUrl: v })
                  }
                />
                <Field
                  label="Resource URL"
                  value={lesson.resourceUrl}
                  onChange={v =>
                    updateLesson(moduleIndex, lessonIndex, { ...lesson, resourceUrl: v })
                  }
                />
                <Field
                  label="Content"
                  value={lesson.content}
                  onChange={v =>
                    updateLesson(moduleIndex, lessonIndex, { ...lesson, content: v })
                  }
                  area
                />
              </div>
            </div>
          ))}
        </article>
      ))}
    </>
  );
}

function AssessmentStep({ form, set, updateQuestion }) {
  const addQuestion = () => set('questions', [...form.questions, blankQuestion()]);

  const addOption = index =>
    updateQuestion(index, {
      ...form.questions[index],
      options: [
        ...form.questions[index].options,
        { id: `option-${Date.now()}`, text: '', correct: false }
      ]
    });

  return (
    <>
      <div className="studio-grid">
        <Field
          label="Assessment title"
          value={form.assessmentTitle}
          onChange={v => set('assessmentTitle', v)}
        />
        <Field
          label="Passing percentage"
          value={form.passingScore}
          onChange={v => set('passingScore', v)}
          type="number"
        />
        <Field
          label="Maximum attempts"
          value={form.maxAttempts}
          onChange={v => set('maxAttempts', v)}
          type="number"
        />
        <Field
          label="Time limit (minutes)"
          value={form.timeLimit}
          onChange={v => set('timeLimit', v)}
          type="number"
        />
      </div>

      <div className="panel-heading">
        <h2>Questions</h2>
        <button type="button" className="text-link" onClick={addQuestion}>
          <Plus size={15} /> Add question
        </button>
      </div>

      {form.questions.map((question, index) => (
        <article className="question-builder" key={index}>
          <div className="panel-heading">
            <h3>Question {index + 1}</h3>
            <Field
              label="Marks"
              value={question.marks}
              onChange={v => updateQuestion(index, { ...question, marks: v })}
              type="number"
            />
          </div>
          <Field
            label="Question text"
            value={question.text}
            onChange={v => updateQuestion(index, { ...question, text: v })}
            area
          />
          {question.options.map((option, optionIndex) => (
            <div className="dynamic-row" key={option.id}>
              <input
                placeholder={`Option ${optionIndex + 1}`}
                value={option.text}
                onChange={e =>
                  updateQuestion(index, {
                    ...question,
                    options: question.options.map((item, itemIndex) =>
                      itemIndex === optionIndex ? { ...item, text: e.target.value } : item
                    )
                  })
                }
              />
              <label>
                <input
                  type="radio"
                  checked={option.correct}
                  onChange={() =>
                    updateQuestion(index, {
                      ...question,
                      options: question.options.map((item, itemIndex) => ({
                        ...item,
                        correct: itemIndex === optionIndex
                      }))
                    })
                  }
                />{' '}
                Correct
              </label>
            </div>
          ))}
          <button type="button" className="text-link" onClick={() => addOption(index)}>
            <Plus size={15} /> Add option
          </button>
        </article>
      ))}
    </>
  );
}

function ReviewStep({ form }) {
  return (
    <div className="review-course">
      <p className="eyebrow">REVIEW BEFORE PUBLISHING</p>
      <h2>{form.title || 'Untitled course'}</h2>
      <p>{form.description || 'No description yet.'}</p>
      <div className="review-grid">
        <span>{form.modules.length} modules</span>
        <span>
          {form.modules.reduce((total, module) => total + module.lessons.length, 0)} lessons
        </span>
        <span>{form.questions.length} final questions</span>
        <span>{form.passingScore}% passing score</span>
      </div>
      {form.modules.map((module, index) => (
        <div className="review-module" key={index}>
          <strong>
            Module {index + 1}: {module.title || 'Untitled'}
          </strong>
          {module.lessons.map((lesson, lessonIndex) => (
            <span key={lessonIndex}>
              Lesson {lessonIndex + 1}: {lesson.title || 'Untitled'}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function CoursePlayer() {
  const params = useParams();
  const loc = useLocation();
  const id = params.id || loc.pathname.split('/')[2];

  const [course, setCourse] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [selected, setSelected] = useState(0);
  const [state, setState] = useState(null);
  const [answer, setAnswer] = useState('');

  const load = async () => {
    const [courseData, enrollments] = await Promise.all([
      unwrap(api.get(`/courses/${id}`)),
      unwrap(api.get('/enrollments/me'))
    ]);
    setCourse(courseData);
    setEnrollment(enrollments.find(item => item.courseId === id));
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (course && enrollment) {
      unwrap(api.get(`/progress/${id}/${course.modules[selected].id}`)).then(setState);
    }
  }, [course, enrollment, selected]);

  if (!course || !enrollment || !state) {
    return <div className="loading">Loading learning room...</div>;
  }

  const module = course.modules[selected];
  const quiz = module.quiz?.[0];
  const complete = enrollment.completedModuleIds?.includes(module.id);
  const passed = !quiz || enrollment.passedQuizIds?.includes(quiz.id);

  const markRead = async () => {
    await unwrap(api.post(`/progress/${id}/${module.id}/read`));
    setState({ ...state, viewed: true });
  };

  const quizSubmit = async () => {
    await unwrap(api.post(`/modules/${id}/${module.id}/quiz`, { answers: { [quiz.id]: answer } }));
    await load();
  };

  const completeModule = async () => {
    await unwrap(api.post('/progress', { courseId: id, moduleId: module.id }));
    await load();
    if (selected < course.modules.length - 1) setSelected(selected + 1);
  };

  return (
    <>
      <Link className="back-link" to="/my-courses">
        ← Back to my learning
      </Link>
      <div className="learning-head">
        <div>
          <p className="eyebrow">LEARNING ROOM</p>
          <h1>{course.title}</h1>
          <p className="muted">{enrollment.progress}% complete</p>
        </div>
      </div>
      <div className="player-layout">
        <aside className="module-nav panel">
          {course.modules.map((item, index) => (
            <button
              className={selected === index ? 'module-nav-item selected' : 'module-nav-item'}
              onClick={() => setSelected(index)}
              key={item.id}
            >
              <strong>
                {index + 1}. {item.title}
              </strong>
              <small>{item.lessons?.length || 0} lessons</small>
            </button>
          ))}
        </aside>
        <section className="learning-main">
          <div className="content-reader">
            <p className="eyebrow">MODULE {selected + 1}</p>
            <h2>{module.title}</h2>
            {module.lessons?.map(lesson => (
              <article className="lesson-reader" key={lesson.id}>
                <h3>{lesson.title}</h3>
                <p>{lesson.content}</p>
              </article>
            ))}
            {state.viewed ? (
              <span className="read-state">
                <CheckCircle2 size={15} /> Content read
              </span>
            ) : (
              <button className="button dark" onClick={markRead}>
                Mark content as read
              </button>
            )}
          </div>
          {quiz && (
            <div className="module-quiz panel">
              <p className="eyebrow">UNWEIGHTED MODULE CHECK</p>
              <h3>{quiz.text}</h3>
              {quiz.options.map(option => (
                <label className="quiz-option" key={option.id}>
                  <input
                    type="radio"
                    name={quiz.id}
                    value={option.id}
                    onChange={e => setAnswer(e.target.value)}
                  />
                  {option.text}
                </label>
              ))}
              <button
                className="button dark"
                disabled={!state.viewed || !answer || passed}
                onClick={quizSubmit}
              >
                {passed ? 'Quiz passed' : 'Check answer'}
              </button>
            </div>
          )}
          <button
            className="button primary"
            disabled={!state.viewed || !passed || complete}
            onClick={completeModule}
          >
            {complete ? 'Module completed' : 'Complete module'}
          </button>
        </section>
      </div>
    </>
  );
}

export function FinalAssessment() {
  const params = useParams();
  const loc = useLocation();
  const id = params.id || loc.pathname.split('/')[2];

  const [assessment, setAssessment] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadAssessment = () => {
    if (!id) return;
    unwrap(api.get(`/assessments/${id}`))
      .then(setAssessment)
      .catch(err => setError(err.response?.data?.message || 'Could not load assessment'));
  };

  useEffect(() => {
    loadAssessment();
  }, [id]);

  if (error) {
    return (
      <div className="empty-state">
        <AlertTriangle size={40} />
        <h2>Assessment error</h2>
        <p className="muted">{error}</p>
        <Link className="button dark" to="/my-courses">
          Return to my learning
        </Link>
      </div>
    );
  }

  if (!assessment) {
    return <div className="loading">Loading assessment...</div>;
  }

  const maxAttempts = Number(assessment.maxAttempts || 3);
  const attemptsTaken = assessment.attemptsTaken || 0;
  const remainingAttempts = Math.max(0, maxAttempts - attemptsTaken);
  const highestScore = assessment.highestScore;
  const hasPassed = assessment.passed;
  const attemptsExhausted = attemptsTaken >= maxAttempts;

  const submit = async e => {
    e.preventDefault();
    if (attemptsExhausted) {
      setError('You have reached the maximum allowed attempts (3).');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await unwrap(api.post(`/assessments/${id}/submit`, { answers }));
      setResult(res);
      loadAssessment();
    } catch (err) {
      setError(err.response?.data?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Link className="back-link" to="/my-courses">
        ← Back to my learning
      </Link>

      <div className="assessment-head">
        <p className="eyebrow">FINAL CERTIFICATION ASSESSMENT</p>
        <h1>{assessment.title}</h1>
        <p className="muted">
          Pass threshold: {assessment.passingScore}% · Total marks:{' '}
          {assessment.questions.reduce((sum, question) => sum + Number(question.marks || 1), 0)}
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '15px',
            marginTop: '15px',
            padding: '12px 18px',
            background: 'var(--paper)',
            borderRadius: '8px',
            border: '1px solid var(--line)',
            fontSize: '12px'
          }}
        >
          <span>
            <strong>Attempts:</strong> {attemptsTaken} of {maxAttempts} taken
          </span>
          <span>
            <strong>Remaining:</strong> {remainingAttempts}
          </span>
          {highestScore !== null && (
            <span>
              <strong>Highest Score:</strong> {highestScore}% (used on certificate)
            </span>
          )}
          {hasPassed && (
            <span className="valid" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={15} /> Passed
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="error" style={{ marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {result ? (
        <div className="panel result-card" style={{ margin: '0 auto' }}>
          <div className={`verify-icon ${result.passed ? '' : 'invalid'}`}>
            {result.passed ? <CheckCircle2 size={36} /> : <AlertTriangle size={36} />}
          </div>
          <h2>{result.passed ? 'Congratulations! Assessment passed.' : 'Assessment not passed.'}</h2>
          <p className="muted" style={{ margin: '10px 0 20px' }}>
            Current Attempt Score: <strong>{result.score}%</strong> · Highest Score:{' '}
            <strong>{result.highestScore}%</strong>
          </p>

          <div
            style={{
              padding: '12px',
              background: 'var(--paper)',
              borderRadius: '7px',
              marginBottom: '20px',
              fontSize: '12px'
            }}
          >
            <p style={{ margin: '0 0 6px' }}>
              Attempt {result.attemptsTaken} of {result.maxAttempts}
            </p>
            {result.remainingAttempts > 0 ? (
              <span className="muted">
                You have {result.remainingAttempts} attempt{result.remainingAttempts > 1 ? 's' : ''}{' '}
                remaining. Your highest score will always be used on your certificate.
              </span>
            ) : (
              <span className="muted">All 3 attempts have been used.</span>
            )}
          </div>

          {result.certificate ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                alignItems: 'center',
                marginTop: '15px'
              }}
            >
              <span className="read-state">
                <CheckCircle2 size={16} /> Certificate successfully generated!
              </span>
              <a
                className="button primary"
                href={`${api.defaults.baseURL.replace('/api/v1', '')}${result.certificate.pdfUrl}`}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={16} /> Download Certificate (PDF)
              </a>
              <Link to="/certificates" className="button dark">
                View in Certificates Registry
              </Link>
            </div>
          ) : result.passed ? (
            <div>
              <p className="muted">
                You passed the assessment! Complete any remaining modules to automatically unlock your certificate.
              </p>
              <Link to="/my-courses" className="button primary" style={{ marginTop: '10px' }}>
                Continue Learning
              </Link>
            </div>
          ) : result.remainingAttempts > 0 ? (
            <button
              className="button dark"
              onClick={() => {
                setResult(null);
                setAnswers({});
              }}
            >
              <RotateCcw size={16} /> Try Again ({result.remainingAttempts} left)
            </button>
          ) : (
            <p className="muted">Maximum attempts reached. Please contact your instructor.</p>
          )}
        </div>
      ) : attemptsExhausted && !hasPassed ? (
        <div className="panel empty-state">
          <AlertTriangle size={42} />
          <h2>Maximum attempts reached</h2>
          <p className="muted">
            You have used all {maxAttempts} attempts for this assessment. Maximum score achieved was{' '}
            {highestScore !== null ? `${highestScore}%` : '0%'}.
          </p>
          <Link to="/my-courses" className="button dark">
            Return to My Learning
          </Link>
        </div>
      ) : (
        <form className="assessment-form" onSubmit={submit}>
          {hasPassed && (
            <div className="read-state" style={{ margin: '0 0 15px' }}>
              <CheckCircle2 size={16} /> You have already passed this assessment with {highestScore}%.
              {remainingAttempts > 0
                ? ` You have ${remainingAttempts} attempts remaining if you wish to improve your score.`
                : ' All attempts used.'}
            </div>
          )}

          {assessment.questions.map((question, qIdx) => (
            <div className="panel question-card" key={question.id}>
              <span className="eyebrow">
                QUESTION {qIdx + 1} · {question.marks} {question.marks === 1 ? 'MARK' : 'MARKS'}
              </span>
              <h3>{question.text}</h3>
              <div className="quiz-options">
                {question.options.map(option => (
                  <label
                    className={`quiz-option ${answers[question.id] === option.id ? 'selected' : ''}`}
                    key={option.id}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={option.id}
                      checked={answers[question.id] === option.id}
                      onChange={event =>
                        setAnswers({ ...answers, [question.id]: event.target.value })
                      }
                    />
                    {option.text}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <button className="button primary" disabled={submitting || attemptsExhausted}>
            {submitting ? 'Submitting...' : `Submit Assessment (Attempt ${attemptsTaken + 1} of ${maxAttempts})`}{' '}
            <Send size={16} />
          </button>
        </form>
      )}
    </>
  );
}

