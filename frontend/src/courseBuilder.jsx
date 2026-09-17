import React, { useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { ChevronRight, Plus, Save, Send, Trash2 } from 'lucide-react';
import { api, unwrap } from './services/api';

const lesson = () => ({
  id: crypto.randomUUID(),
  title: '',
  content: '',
  type: 'READING',
  duration: '30 min',
  videoUrl: '',
  resourceUrl: ''
});

const moduleItem = () => ({
  id: crypto.randomUUID(),
  title: '',
  description: '',
  duration: '1 hour',
  lessons: [lesson()]
});

const question = () => ({
  text: '',
  marks: 1,
  type: 'SINGLE',
  options: [
    { id: crypto.randomUUID(), text: '', correct: true },
    { id: crypto.randomUUID(), text: '', correct: false }
  ]
});

const initial = {
  title: '',
  description: '',
  detailedDescription: '',
  category: 'Engineering',
  difficulty: 'BEGINNER',
  duration: '',
  instructorName: '',
  instructorBio: '',
  thumbnail: '',
  prerequisites: '',
  targetAudience: '',
  learningObjectives: [''],
  skills: [''],
  modules: [moduleItem()],
  assessmentTitle: '',
  assessmentDescription: '',
  passingScore: 70,
  maxAttempts: 3,
  timeLimit: '',
  questions: [question()]
};

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

export function CompanyCourseBuilder() {
  const params = useParams();
  const loc = useLocation();
  const pathParts = loc.pathname.split('/');
  const id =
    params.id ||
    (pathParts[2] === 'courses' && pathParts[3] ? pathParts[3] : '');

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initial);
  const [savedId, setSavedId] = useState(id || '');
  const [assessmentId, setAssessmentId] = useState(null);
  const [message, setMessage] = useState('');

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const save = async () => {
    try {
      const payload = {
        ...form,
        learningObjectives: form.learningObjectives.filter(Boolean),
        skills: form.skills.filter(Boolean)
      };
      const course = id
        ? await unwrap(api.patch(`/courses/${id}`, payload))
        : await unwrap(api.post('/courses/draft', payload));

      setSavedId(course.id);
      setAssessmentId(course.assessmentId);

      if (course.assessmentId) {
        await unwrap(api.patch(`/assessments/${course.assessmentId}`, payload));
      }

      setMessage('Draft saved.');
      return course.id;
    } catch (error) {
      setMessage(error.response?.data?.message || 'Draft could not be saved');
      return null;
    }
  };

  const publish = async () => {
    try {
      const courseId = await save();
      if (!courseId) return;
      await unwrap(api.patch(`/courses/${courseId}/publish`));
      setMessage('Course published successfully.');
    } catch (error) {
      setMessage(
        error.response?.data?.data?.errors?.join(' • ') ||
          error.response?.data?.message ||
          'Course cannot be published'
      );
    }
  };

  const updateModule = (index, value) =>
    set(
      'modules',
      form.modules.map((item, itemIndex) => (itemIndex === index ? value : item))
    );

  const steps = ['Basic information', 'Course content', 'Assessments', 'Review & publish'];

  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">COURSE STUDIO</p>
          <h1>{id ? 'Edit course' : 'Create a course'}</h1>
          <p className="muted">Save a draft at any step, then review and publish when complete.</p>
        </div>
        <button className="button dark" type="button" onClick={save}>
          <Save size={16} /> Save draft
        </button>
      </div>

      <div className="builder-steps">
        {steps.map((name, index) => (
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
        {step === 0 && <Basic form={form} set={set} />}
        {step === 1 && <Content form={form} set={set} updateModule={updateModule} />}
        {step === 2 && <Assessments form={form} set={set} />}
        {step === 3 && <Review form={form} />}
      </section>

      <div className="builder-actions">
        <span className="read-state">{message}</span>
        <div>
          <button
            className="button dark"
            type="button"
            disabled={!step}
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

function Basic({ form, set }) {
  const list = key => (
    <div className="dynamic-list">
      <div className="panel-heading">
        <h3>{key === 'learningObjectives' ? 'Learning objectives' : 'Skills gained'}</h3>
        <button className="text-link" type="button" onClick={() => set(key, [...form[key], ''])}>
          <Plus size={15} /> Add
        </button>
      </div>
      {form[key].map((value, index) => (
        <div className="dynamic-row" key={index}>
          <input
            value={value}
            onChange={e =>
              set(
                key,
                form[key].map((item, itemIndex) => (itemIndex === index ? e.target.value : item))
              )
            }
            placeholder="Add an item"
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
        <Field
          label="Short description"
          value={form.description}
          onChange={v => set('description', v)}
        />
        <Field
          label="Detailed description"
          value={form.detailedDescription}
          onChange={v => set('detailedDescription', v)}
          area
        />
        <Field label="Category" value={form.category} onChange={v => set('category', v)} />
        <Field label="Difficulty" value={form.difficulty} onChange={v => set('difficulty', v)} />
        <Field label="Duration" value={form.duration} onChange={v => set('duration', v)} />
        <Field
          label="Instructor name"
          value={form.instructorName}
          onChange={v => set('instructorName', v)}
        />
        <Field
          label="Instructor bio"
          value={form.instructorBio}
          onChange={v => set('instructorBio', v)}
          area
        />
        <Field
          label="Thumbnail URL"
          value={form.thumbnail}
          onChange={v => set('thumbnail', v)}
        />
        <Field
          label="Prerequisites"
          value={form.prerequisites}
          onChange={v => set('prerequisites', v)}
        />
        <Field
          label="Target audience"
          value={form.targetAudience}
          onChange={v => set('targetAudience', v)}
        />
      </div>
      {list('learningObjectives')}
      {list('skills')}
    </>
  );
}

function Content({ form, set, updateModule }) {
  const addModule = () => set('modules', [...form.modules, moduleItem()]);

  const addLesson = index =>
    updateModule(index, {
      ...form.modules[index],
      lessons: [...form.modules[index].lessons, lesson()]
    });

  const updateLesson = (moduleIndex, lessonIndex, value) =>
    updateModule(moduleIndex, {
      ...form.modules[moduleIndex],
      lessons: form.modules[moduleIndex].lessons.map((item, index) =>
        index === lessonIndex ? value : item
      )
    });

  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Course content</h2>
          <p className="muted">Create as many modules and lessons as the course needs.</p>
        </div>
        <button className="button dark" type="button" onClick={addModule}>
          <Plus size={16} /> Add module
        </button>
      </div>

      {form.modules.map((item, moduleIndex) => (
        <article className="builder-module-card" key={moduleIndex}>
          <div className="panel-heading">
            <h3>Module {moduleIndex + 1}</h3>
            <button
              className="text-link"
              type="button"
              onClick={() => addLesson(moduleIndex)}
            >
              <Plus size={15} /> Add lesson
            </button>
          </div>
          <div className="studio-grid">
            <Field
              label="Module title"
              value={item.title}
              onChange={v => updateModule(moduleIndex, { ...item, title: v })}
            />
            <Field
              label="Module description"
              value={item.description}
              onChange={v => updateModule(moduleIndex, { ...item, description: v })}
            />
            <Field
              label="Duration"
              value={item.duration}
              onChange={v => updateModule(moduleIndex, { ...item, duration: v })}
            />
          </div>

          {item.lessons.map((lessonItem, lessonIndex) => (
            <div className="lesson-editor" key={lessonIndex}>
              <strong>Lesson {lessonIndex + 1}</strong>
              <div className="studio-grid">
                <Field
                  label="Title"
                  value={lessonItem.title}
                  onChange={v =>
                    updateLesson(moduleIndex, lessonIndex, { ...lessonItem, title: v })
                  }
                />
                <Field
                  label="Lesson type"
                  value={lessonItem.type}
                  onChange={v =>
                    updateLesson(moduleIndex, lessonIndex, { ...lessonItem, type: v })
                  }
                />
                <Field
                  label="Duration"
                  value={lessonItem.duration}
                  onChange={v =>
                    updateLesson(moduleIndex, lessonIndex, { ...lessonItem, duration: v })
                  }
                />
                <Field
                  label="Video URL"
                  value={lessonItem.videoUrl}
                  onChange={v =>
                    updateLesson(moduleIndex, lessonIndex, { ...lessonItem, videoUrl: v })
                  }
                />
                <Field
                  label="Resource URL"
                  value={lessonItem.resourceUrl}
                  onChange={v =>
                    updateLesson(moduleIndex, lessonIndex, { ...lessonItem, resourceUrl: v })
                  }
                />
                <Field
                  label="Content"
                  value={lessonItem.content}
                  onChange={v =>
                    updateLesson(moduleIndex, lessonIndex, { ...lessonItem, content: v })
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

function Assessments({ form, set }) {
  const addQuestion = () => set('questions', [...form.questions, question()]);

  const update = (index, value) =>
    set(
      'questions',
      form.questions.map((item, itemIndex) => (itemIndex === index ? value : item))
    );

  return (
    <>
      <h2>Final assessment</h2>
      <div className="studio-grid">
        <Field
          label="Assessment title"
          value={form.assessmentTitle}
          onChange={v => set('assessmentTitle', v)}
        />
        <Field
          label="Description"
          value={form.assessmentDescription}
          onChange={v => set('assessmentDescription', v)}
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
          label="Time limit"
          value={form.timeLimit}
          onChange={v => set('timeLimit', v)}
        />
      </div>

      <div className="panel-heading">
        <h3>Questions</h3>
        <button className="text-link" type="button" onClick={addQuestion}>
          <Plus size={15} /> Add question
        </button>
      </div>

      {form.questions.map((item, index) => (
        <article className="question-builder" key={index}>
          <div className="panel-heading">
            <h3>Question {index + 1}</h3>
            <Field
              label="Marks"
              value={item.marks}
              onChange={v => update(index, { ...item, marks: v })}
              type="number"
            />
          </div>
          <Field
            label="Question text"
            value={item.text}
            onChange={v => update(index, { ...item, text: v })}
            area
          />
          {item.options.map((option, optionIndex) => (
            <div className="dynamic-row" key={option.id}>
              <input
                value={option.text}
                placeholder="Option"
                onChange={e =>
                  update(index, {
                    ...item,
                    options: item.options.map((choice, choiceIndex) =>
                      choiceIndex === optionIndex ? { ...choice, text: e.target.value } : choice
                    )
                  })
                }
              />
              <label>
                <input
                  type="radio"
                  checked={option.correct}
                  onChange={() =>
                    update(index, {
                      ...item,
                      options: item.options.map((choice, choiceIndex) => ({
                        ...choice,
                        correct: choiceIndex === optionIndex
                      }))
                    })
                  }
                />{' '}
                Correct
              </label>
            </div>
          ))}
          <button
            className="text-link"
            type="button"
            onClick={() =>
              update(index, {
                ...item,
                options: [...item.options, { id: crypto.randomUUID(), text: '', correct: false }]
              })
            }
          >
            <Plus size={15} /> Add option
          </button>
        </article>
      ))}
    </>
  );
}

function Review({ form }) {
  return (
    <div className="review-course">
      <p className="eyebrow">REVIEW & PUBLISH</p>
      <h2>{form.title || 'Untitled course'}</h2>
      <p>{form.description || 'No description entered.'}</p>
      <div className="review-grid">
        <span>{form.modules.length} modules</span>
        <span>
          {form.modules.reduce((total, item) => total + item.lessons.length, 0)} lessons
        </span>
        <span>{form.questions.length} questions</span>
        <span>{form.passingScore}% passing score</span>
      </div>
      {form.modules.map((module, index) => (
        <div className="review-module" key={index}>
          <strong>
            Module {index + 1}: {module.title || 'Untitled'}
          </strong>
          {module.lessons.map((item, lessonIndex) => (
            <span key={lessonIndex}>
              Lesson {lessonIndex + 1}: {item.title || 'Untitled'}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

