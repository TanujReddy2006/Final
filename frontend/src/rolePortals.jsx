  import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Download,
  Edit3,
  FileCheck2,
  Lock,
  Mail,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
  XCircle
} from 'lucide-react';
import { api, unwrap } from './services/api';

function Stat({ label, value, icon: Icon, trend = 'Current platform data' }) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <Icon size={19} />
      </div>
      <strong>{value}</strong>
      <small>{trend}</small>
    </div>
  );
}

function Title({ eyebrow, title, sub, action }) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{sub}</p>
      </div>
      {action}
    </div>
  );
}

export function CompanyOverview() {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    unwrap(api.get('/company/overview'))
      .then(setData)
      .catch(err => {
        setError(
          err.response?.status === 403
            ? 'Sign in with a Company account to open this dashboard.'
            : 'Company dashboard is unavailable right now.'
        );
      });
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async id => {
    try {
      await unwrap(api.patch(`/courses/${id}/publish`));
      setMessage('Course status updated.');
      load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to update course');
    }
  };

  if (error) {
    return (
      <div className="empty-state">
        <ShieldCheck size={40} />
        <h2>Company access required</h2>
        <p className="muted">{error}</p>
        <Link className="button dark" to="/">
          Return to sign in
        </Link>
      </div>
    );
  }

  if (!data) {
    return <div className="loading">Loading company workspace...</div>;
  }

  return (
    <>
      <Title
        eyebrow="COMPANY PORTAL"
        title="Your learning business."
        sub="Create, publish, and measure the courses your company owns."
        action={
          <Link to="/company/courses" className="button dark">
            <Plus size={16} /> Create course
          </Link>
        }
      />

      <div className="stats-grid">
        <Stat label="Total courses" value={data.metrics.totalCourses} icon={BookOpen} />
        <Stat label="Published" value={data.metrics.publishedCourses} icon={CheckCircle2} />
        <Stat label="Drafts" value={data.metrics.draftCourses} icon={BarChart3} />
        <Stat label="Learners" value={data.metrics.totalLearners} icon={Users} />
        <Stat
          label="Completion rate"
          value={`${data.metrics.completionRate}%`}
          icon={Award}
          trend="Overall completions"
        />
      </div>

      <section className="panel table-panel">
        <div className="panel-heading">
          <h3>My courses</h3>
          <span className="muted">Only courses owned by your company</span>
        </div>

        {data.courses.length ? (
          data.courses.map(course => (
            <div className="table-row company-course-row" key={course.id}>
              <div>
                <strong>{course.title}</strong>
                <small>
                  {course.category} · {course.modules.length} modules · {course.status}
                </small>
              </div>
              <span className="status-badge">{course.status}</span>
              <Link className="text-link" to={`/company/courses/${course.id}/edit`}>
                Edit
              </Link>
              <button className="text-link" onClick={() => toggle(course.id)}>
                {course.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
              </button>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <BookOpen size={35} />
            <h3>No courses created yet.</h3>
            <p className="muted">
              Create your first course to make it available in the learner catalog.
            </p>
            <Link to="/company/courses" className="button primary">
              <Plus size={16} /> Create course
            </Link>
          </div>
        )}

        {message && <p className="read-state" style={{ margin: '15px 24px' }}>{message}</p>}
      </section>
    </>
  );
}

export function CompanyLearners() {
  const [learners, setLearners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    unwrap(api.get('/company/learners'))
      .then(setLearners)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = learners.filter(item => {
    const term = search.toLowerCase();
    return (
      item.learnerName.toLowerCase().includes(term) ||
      item.learnerEmail.toLowerCase().includes(term) ||
      item.courseTitle.toLowerCase().includes(term)
    );
  });

  return (
    <>
      <Title
        eyebrow="COMPANY PORTAL"
        title="Enrolled Learners"
        sub="Track learner progress, assessment achievements, and certificates across your courses."
      />

      <div className="catalog-tools" style={{ marginBottom: '20px' }}>
        <div className="searchbox">
          <Search size={18} />
          <input
            placeholder="Search learner by name, email, or course..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <section className="panel table-panel">
        <div className="panel-heading">
          <h3>Active Enrollments ({filtered.length})</h3>
          <span className="muted">Real-time enrollment tracking</span>
        </div>

        {loading ? (
          <div className="loading">Loading learner records...</div>
        ) : filtered.length ? (
          filtered.map(item => (
            <div className="table-row" key={item.id}>
              <div>
                <strong>{item.learnerName}</strong>
                <small className="muted">{item.learnerEmail}</small>
              </div>
              <div>
                <span>{item.courseTitle}</span>
                <div className="progress">
                  <span style={{ width: `${item.progress}%` }} />
                </div>
              </div>
              <div>
                <span className="status-badge">
                  {item.status === 'COMPLETED' ? 'COMPLETED' : `${item.progress}% PROGRESS`}
                </span>
              </div>
              <div>
                {item.certified ? (
                  <span className="valid" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <CheckCircle2 size={15} /> Certified
                  </span>
                ) : (
                  <span className="muted" style={{ fontSize: '11px' }}>In progress</span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Users size={36} />
            <h3>No learners enrolled yet</h3>
            <p className="muted">When learners enroll in your published courses, they will appear here.</p>
          </div>
        )}
      </section>
    </>
  );
}

export function LearnerOverview({ user }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    unwrap(api.get('/dashboard')).then(setData);
  }, []);

  if (!data) return <div className="loading">Loading learning workspace...</div>;

  const enrollments = data.enrollments || [];
  const completed = enrollments.filter(item => item.status === 'COMPLETED').length;
  const average = enrollments.length
    ? Math.round(enrollments.reduce((total, item) => total + item.progress, 0) / enrollments.length)
    : 0;

  return (
    <>
      <Title
        eyebrow="LEARNING HUB"
        title={`Welcome back, ${user.name?.split(' ')[0]}.`}
        sub="Your personal workspace for progress, active courses, and verified certifications."
        action={
          <Link className="button dark" to="/courses">
            Browse courses <ChevronRight size={16} />
          </Link>
        }
      />

      <div className="stats-grid">
        <Stat label="Enrolled courses" value={enrollments.length} icon={BookOpen} />
        <Stat label="Completed courses" value={completed} icon={CheckCircle2} />
        <Stat label="Average progress" value={`${average}%`} icon={BarChart3} />
        <Stat label="Certificates" value={data.certificates.length} icon={Award} />
      </div>

      {enrollments.length ? (
        <>
          <div className="section-heading">
            <h3>Continue learning</h3>
            <Link to="/my-courses">
              View all <ChevronRight size={15} />
            </Link>
          </div>
          <div className="course-grid">
            {enrollments.map(item => (
              <Link className="course-card" to={`/my-courses/${item.courseId}`} key={item.id}>
                <div className="course-cover" style={{ background: '#d5f6e6' }}>
                  <span>{item.course?.category || 'Skills'}</span>
                  <BookOpen size={34} />
                </div>
                <div className="course-card-body">
                  <div className="card-meta">
                    <span>{item.course?.difficulty || 'Beginner'}</span>
                    <span>{item.course?.modules?.length || 0} modules</span>
                  </div>
                  <h3>{item.course?.title}</h3>
                  <p>{item.course?.description}</p>
                  <div className="course-footer">
                    <span className="mini-progress">{item.progress}% complete</span>
                    <ChevronRight size={17} />
                  </div>
                  <div className="progress">
                    <span style={{ width: `${item.progress}%` }} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <BookOpen size={38} />
          <h2>Your learning catalog is waiting.</h2>
          <p className="muted">No courses are enrolled yet. Browse courses created by training providers.</p>
          <Link to="/courses" className="button dark">
            Browse courses
          </Link>
        </div>
      )}
    </>
  );
}

export function LearnerProfile({ user: initialUser }) {
  const [data, setData] = useState(null);
  const [currentUser, setCurrentUser] = useState(initialUser);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    unwrap(api.get('/dashboard'))
      .then(res => {
        setData(res);
        if (res?.user) {
          setCurrentUser(res.user);
        }
      })
      .catch(console.error);
  }, []);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const openModal = () => {
    setNameInput(currentUser.name || '');
    setNameError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setNameError('');
  };

  const handleNameChange = val => {
    setNameInput(val);
    if (!val.trim()) {
      setNameError('Full name is required');
    } else if (val.trim().length < 2) {
      setNameError('Full name must be at least 2 characters');
    } else {
      setNameError('');
    }
  };

  const handleSaveName = async e => {
    e?.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError('Full name is required');
      return;
    }
    if (trimmed.length < 2) {
      setNameError('Full name must be at least 2 characters');
      return;
    }

    setSaveLoading(true);
    setNameError('');
    try {
      const res = await unwrap(api.patch('/users/me', { name: trimmed }));
      const updatedUser = { ...currentUser, ...res.user, name: trimmed };
      setCurrentUser(updatedUser);
      // Persist in localStorage so page reloads have the latest user
      try {
        localStorage.setItem('learnforge_user', JSON.stringify(updatedUser));
      } catch {
        // ignore
      }
      setFeedbackMessage({ text: 'Full name updated successfully!', type: 'success' });
      setIsModalOpen(false);
      setTimeout(() => setFeedbackMessage({ text: '', type: '' }), 4000);
    } catch (err) {
      setNameError(err.response?.data?.message || 'Could not update name. Please try again.');
    } finally {
      setSaveLoading(false);
    }
  };

  const enrollments = data?.enrollments || [];
  const certs = data?.certificates || [];

  return (
    <>
      <Title
        eyebrow="LEARNER PROFILE"
        title={currentUser.name}
        sub="Your verified skills profile and credentials summary."
      />

      <div className="stats-grid">
        <Stat label="Account role" value={currentUser.role} icon={UserCheck} />
        <Stat label="Enrolled courses" value={enrollments.length} icon={BookOpen} />
        <Stat label="Certifications" value={certs.length} icon={Award} />
        <Stat
          label="Highest Score"
          value={certs.length ? `${Math.max(...certs.map(c => c.score || 0))}%` : 'N/A'}
          icon={CheckCircle2}
        />
      </div>

      {feedbackMessage.text && (
        <div
          style={{
            marginBottom: '20px',
            padding: '12px 18px',
            borderRadius: '8px',
            background: feedbackMessage.type === 'success' ? '#e3f7ed' : '#fff0ee',
            color: feedbackMessage.type === 'success' ? '#1e754a' : '#b64c39',
            fontWeight: 600,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <CheckCircle2 size={16} /> {feedbackMessage.text}
        </div>
      )}

      <div className="dashboard-lower">
        <section className="panel">
          <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Account details</h3>
            <button
              type="button"
              className="button dark"
              style={{ height: '34px', fontSize: '12px', padding: '0 14px', gap: '6px' }}
              onClick={openModal}
              title="Edit full name in profile modal"
            >
              <Edit3 size={13} /> Edit Profile
            </button>
          </div>
          <div style={{ display: 'grid', gap: '15px' }}>
            <div>
              <small className="muted">FULL NAME</small>
              <p style={{ margin: '4px 0 0', fontWeight: 600 }}>{currentUser.name}</p>
            </div>
            <div>
              <small className="muted">EMAIL ADDRESS</small>
              <p style={{ margin: '4px 0 0', fontWeight: 600 }}>{currentUser.email}</p>
            </div>
            <div>
              <small className="muted">ACCOUNT ROLE</small>
              <p style={{ margin: '4px 0 0', fontWeight: 600 }}>{currentUser.role}</p>
            </div>
            <div>
              <small className="muted">STATUS</small>
              <p style={{ margin: '4px 0 0' }}>
                <span className="status-badge">ACTIVE ACCOUNT</span>
              </p>
            </div>
          </div>
        </section>

        {isModalOpen && (
          <div className="modal-backdrop" onClick={closeModal} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 id="modal-title">Edit Profile</h3>
                  <small className="muted">You can edit your full name below. Other fields are read-only.</small>
                </div>
                <button type="button" className="modal-close" onClick={closeModal} aria-label="Close modal">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveName}>
                <div className="modal-body">
                  <label className="field" style={{ marginTop: 0 }}>
                    <span>Full name (editable)</span>
                    <input
                      type="text"
                      value={nameInput}
                      onChange={e => handleNameChange(e.target.value)}
                      placeholder="e.g. Maya Chen"
                      autoFocus
                    />
                    {nameError && <span className="field-error">{nameError}</span>}
                  </label>

                  <label className="field field-readonly" style={{ marginTop: '12px' }}>
                    <span>Email address (read-only)</span>
                    <input
                      type="email"
                      value={currentUser.email || ''}
                      disabled
                      readOnly
                      title="Email address cannot be edited"
                    />
                  </label>

                  <label className="field field-readonly" style={{ marginTop: '12px' }}>
                    <span>Account role (read-only)</span>
                    <input
                      type="text"
                      value={currentUser.role || ''}
                      disabled
                      readOnly
                      title="Account role is managed by administrator"
                    />
                  </label>

                  <label className="field field-readonly" style={{ marginTop: '12px' }}>
                    <span>Status (read-only)</span>
                    <input
                      type="text"
                      value="ACTIVE ACCOUNT"
                      disabled
                      readOnly
                      title="Account status"
                    />
                  </label>
                </div>

                <div className="modal-footer">
                  <button type="button" className="button" onClick={closeModal} disabled={saveLoading}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="button primary"
                    disabled={saveLoading || !!nameError}
                  >
                    {saveLoading ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <section className="panel">
          <div className="panel-heading">
            <h3>Earned Certificates ({certs.length})</h3>
            <Link to="/certificates" className="text-link">
              View all <ChevronRight size={14} />
            </Link>
          </div>
          {certs.length ? (
            certs.slice(0, 3).map(c => (
              <div
                key={c.id}
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid var(--line)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <strong>{c.certification}</strong>
                  <small style={{ display: 'block', color: 'var(--muted)' }}>
                    Score: {c.score}% · {c.certificateId}
                  </small>
                </div>
                <a
                  className="button dark"
                  style={{ height: '32px', fontSize: '11px', padding: '0 12px' }}
                  href={`${api.defaults.baseURL.replace('/api/v1', '')}${c.pdfUrl}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={13} /> PDF
                </a>
              </div>
            ))
          ) : (
            <p className="muted">No certificates earned yet. Complete courses to earn credentials.</p>
          )}
        </section>
      </div>
    </>
  );
}

export function HRHome() {
  const [overview, setOverview] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [quickId, setQuickId] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState('');

  const loadData = () => {
    Promise.all([
      unwrap(api.get('/hr/overview')).catch(() => ({})),
      unwrap(api.get('/hr/certificates')).catch(() => [])
    ])
      .then(([overviewData, certsData]) => {
        setOverview(overviewData);
        setCertificates(certsData || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleQuickVerify = async (idToVerify) => {
    const raw = idToVerify || quickId;
    let target = String(raw || '').trim();
    if (target.startsWith('http://') || target.startsWith('https://') || target.includes('/')) {
      const parts = target.replace(/\/+$/, '').split('/').filter(Boolean);
      target = parts.length > 0 ? parts[parts.length - 1] : target;
    }
    if (!target) {
      setMessage('Please enter a certificate ID or URL to verify');
      return;
    }
    setVerifying(true);
    setMessage('');
    try {
      const res = await unwrap(api.get(`/verify/${encodeURIComponent(target)}`));
      setVerifyResult(res);
      setQuickId(res.certificateId || target);
    } catch (err) {
      setVerifyResult({
        status: 'NOT FOUND',
        message: err.response?.data?.message || 'Certificate not found in registry'
      });
    } finally {
      setVerifying(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text);
    setMessage(`Copied ${text} to clipboard!`);
    setTimeout(() => setMessage(''), 3000);
  };

  const filtered = certificates.filter(c => {
    const term = search.toLowerCase();
    return (
      (c.certificateId && c.certificateId.toLowerCase().includes(term)) ||
      (c.certificateNumber && c.certificateNumber.toLowerCase().includes(term)) ||
      (c.learnerName && c.learnerName.toLowerCase().includes(term)) ||
      (c.courseName && c.courseName.toLowerCase().includes(term))
    );
  });

  return (
    <>
      <Title
        eyebrow="HR PORTAL"
        title="Candidate & Credential Verification"
        sub="Verify authentic academic and professional certifications issued to candidates across LearnForge."
        action={
          <Link to="/hr/verify" className="button dark">
            <ShieldCheck size={16} /> Advanced Verification Form
          </Link>
        }
      />

      <div className="stats-grid">
        <Stat
          label="Total Credentials"
          value={overview?.certificatesCount ?? certificates.length}
          trend="Issued across platform"
          icon={Award}
        />
        <Stat
          label="Valid & Active"
          value={overview?.validCertificates ?? certificates.filter(c => c.status === 'VALID').length}
          trend="Authentic credentials"
          icon={CheckCircle2}
        />
        <Stat
          label="Tamper Verifications"
          value={overview?.verificationsCount ?? 0}
          trend="Public registry checks"
          icon={ShieldCheck}
        />
        <Stat
          label="Revoked Credentials"
          value={overview?.revokedCertificates ?? certificates.filter(c => c.status === 'REVOKED').length}
          trend="Flagged or retracted"
          icon={AlertTriangle}
        />
      </div>

      <div className="hr-layout" style={{ marginBottom: '32px' }}>
        <section className="panel verify-form">
          <ShieldCheck size={28} />
          <h2>Instant Credential Lookup</h2>
          <p className="muted">
            Enter candidate's certificate ID or paste verification URL to verify authenticity against the registry.
          </p>
          <form
            onSubmit={e => {
              e.preventDefault();
              handleQuickVerify();
            }}
          >
            <input
              value={quickId}
              onChange={e => setQuickId(e.target.value)}
              placeholder="e.g. CERT-2026-XXXX or paste candidate link"
            />
            <button className="button dark" type="submit" disabled={verifying}>
              {verifying ? 'Verifying...' : 'Verify Now'} <Search size={16} />
            </button>
          </form>
          {message && (
            <div className="read-state" style={{ marginTop: '12px' }}>
              <CheckCircle2 size={15} /> {message}
            </div>
          )}
        </section>

        {verifyResult ? (
          <section className="panel result">
            <div className={`verify-icon mini ${verifyResult.status === 'VALID' ? '' : 'invalid'}`}>
              {verifyResult.status === 'VALID' ? <CheckCircle2 /> : '!'}
            </div>
            <span className="eyebrow">{verifyResult.status}</span>
            <h2>{verifyResult.certification || verifyResult.courseName || 'Verification Failed'}</h2>
            {verifyResult.status === 'VALID' ? (
              <div style={{ width: '100%', marginTop: '10px' }}>
                <p style={{ margin: '3px 0' }}>
                  Candidate: <strong>{verifyResult.learnerName}</strong>
                </p>
                <p className="muted" style={{ margin: '3px 0' }}>
                  Course: <strong>{verifyResult.courseName}</strong>
                </p>
                <p className="muted" style={{ margin: '3px 0' }}>
                  Issuer: <strong>{verifyResult.issuedBy}</strong> · Passing Score: <strong>{verifyResult.score}%</strong>
                </p>
                <p className="muted" style={{ margin: '3px 0' }}>
                  Certificate ID: <code style={{ background: '#f0f3f1', padding: '2px 5px', borderRadius: '4px' }}>{verifyResult.certificateId}</code>
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                  {verifyResult.pdfUrl && (
                    <a
                      href={`${api.defaults.baseURL.replace('/api/v1', '')}${verifyResult.pdfUrl}`}
                      className="button dark"
                      style={{ height: '32px', fontSize: '11px', padding: '0 10px' }}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download size={13} /> View PDF
                    </a>
                  )}
                  <Link
                    to={`/verify/${verifyResult.certificateId}`}
                    className="button primary"
                    style={{ height: '32px', fontSize: '11px', padding: '0 10px' }}
                    target="_blank"
                  >
                    Registry Page
                  </Link>
                </div>
              </div>
            ) : (
              <p className="muted" style={{ marginTop: '8px' }}>
                {verifyResult.message || 'No matching certificate found in the LearnForge registry.'}
              </p>
            )}
          </section>
        ) : (
          <section className="panel result" style={{ justifyContent: 'center' }}>
            <span className="eyebrow">REGISTRY VERIFICATION</span>
            <h2 style={{ fontSize: '18px' }}>Ready for lookup</h2>
            <p className="muted">
              Enter an ID or select any candidate certificate below to instantly load and verify credentials.
            </p>
          </section>
        )}
      </div>

      <section className="panel table-panel">
        <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h3>Issued Credentials Registry ({filtered.length})</h3>
            <span className="muted">All certifications currently recorded on LearnForge</span>
          </div>
          <div className="searchbox" style={{ width: '280px', height: '38px' }}>
            <Search size={16} />
            <input
              placeholder="Search candidate, ID, or course..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading credentials registry...</div>
        ) : filtered.length ? (
          filtered.map(cert => (
            <div className="table-row" key={cert.id || cert.certificateId}>
              <div>
                <strong>{cert.certification || cert.courseName}</strong>
                <small className="muted" style={{ display: 'block', marginTop: '3px' }}>
                  Candidate: <strong>{cert.learnerName}</strong> · ID: <code>{cert.certificateId}</code>
                </small>
              </div>

              <div>
                <span>Score: {cert.score}%</span>
                <small className="muted" style={{ display: 'block' }}>
                  Issued: {new Date(cert.issuedDate).toLocaleDateString()}
                </small>
              </div>

              <div>
                <span className={cert.status === 'VALID' ? 'status-badge' : 'status-badge invalid'}>
                  {cert.status}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="button primary"
                  style={{ height: '30px', fontSize: '11px', padding: '0 8px' }}
                  onClick={() => handleQuickVerify(cert.certificateId)}
                >
                  <ShieldCheck size={12} /> Verify
                </button>
                <button
                  type="button"
                  className="button dark"
                  style={{ height: '30px', fontSize: '11px', padding: '0 8px' }}
                  onClick={() => copyToClipboard(cert.certificateId)}
                >
                  Copy ID
                </button>
                {cert.pdfUrl && (
                  <a
                    className="button"
                    style={{ height: '30px', fontSize: '11px', padding: '0 8px', border: '1px solid var(--line)' }}
                    href={`${api.defaults.baseURL.replace('/api/v1', '')}${cert.pdfUrl}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={12} /> PDF
                  </a>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Award size={36} />
            <h3>No candidate certificates found</h3>
            <p className="muted">Certificates will appear here once learners complete courses and pass assessments.</p>
          </div>
        )}
      </section>
    </>
  );
}

export function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  const load = () => {
    unwrap(api.get('/admin/users'))
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const toggleStatus = async (userId, currentActive) => {
    try {
      await unwrap(api.patch(`/admin/users/${userId}`, { active: !currentActive }));
      setMessage(`User account ${!currentActive ? 'activated' : 'deactivated'}`);
      load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to update user status');
    }
  };

  const deleteUser = async (userId, userName) => {
    if (!window.confirm(`Permanently delete deactivated user "${userName}"? This cannot be undone and will delete the entry from the database.`)) {
      return;
    }
    try {
      await unwrap(api.delete(`/admin/users/${userId}`));
      setMessage(`User "${userName}" was permanently deleted from the database.`);
      load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to delete user');
    }
  };

  const filtered = users.filter(u => {
    const term = search.toLowerCase();
    return u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term);
  });

  return (
    <>
      <Title
        eyebrow="ADMIN PORTAL"
        title="People & Accounts"
        sub="Manage registered users and control account access."
      />

      <div className="catalog-tools" style={{ marginBottom: '20px' }}>
        <div className="searchbox">
          <Search size={18} />
          <input
            placeholder="Search user by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {message && (
        <div className="read-state" style={{ marginBottom: '15px' }}>
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      <section className="panel table-panel">
        <div className="panel-heading">
          <h3>Registered Users ({filtered.length})</h3>
          <span className="muted">All system accounts</span>
        </div>

        {loading ? (
          <div className="loading">Loading users...</div>
        ) : filtered.length ? (
          filtered.map(u => (
            <div className="table-row" key={u.id}>
              <div>
                <strong>{u.name}</strong>
                <small className="muted">{u.email}</small>
              </div>

              <div>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: '5px',
                    background: 'var(--paper)',
                    border: '1px solid var(--line)',
                    fontWeight: 600,
                    fontSize: '11px',
                    letterSpacing: '0.4px',
                    color: 'var(--ink)'
                  }}
                >
                  {u.role === 'ADMIN' ? 'ADMIN (System Admin)' : u.role}
                </span>
              </div>

              <div>
                <span className={u.active ? 'status-badge' : 'status-badge invalid'}>
                  {u.active ? 'ACTIVE' : 'DEACTIVATED'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="button dark"
                  disabled={u.role === 'ADMIN'}
                  style={{
                    height: '32px',
                    fontSize: '11px',
                    padding: '0 12px',
                    opacity: u.role === 'ADMIN' ? 0.5 : 1,
                    cursor: u.role === 'ADMIN' ? 'not-allowed' : 'pointer'
                  }}
                  onClick={() => toggleStatus(u.id, u.active)}
                  title={u.role === 'ADMIN' ? 'System administrator cannot be deactivated' : undefined}
                >
                  {u.active ? 'Deactivate' : 'Activate'}
                </button>

                {!u.active && u.role !== 'ADMIN' && (
                  <button
                    type="button"
                    className="button"
                    style={{
                      height: '32px',
                      fontSize: '11px',
                      padding: '0 12px',
                      background: '#fff0ee',
                      color: '#b64c39',
                      border: '1px solid #ffd5cf',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onClick={() => deleteUser(u.id, u.name)}
                    title="Permanently delete deactivated account from database"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Users size={36} />
            <h3>No users found</h3>
            <p className="muted">No registered users matched your search criteria.</p>
          </div>
        )}
      </section>
    </>
  );
}

export function AdminCertificates() {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  const load = () => {
    unwrap(api.get('/admin/certificates'))
      .then(setCertificates)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const revoke = async certId => {
    const reason = window.prompt('Enter reason for revoking this certificate:');
    if (!reason) return;
    try {
      await unwrap(api.post(`/certificates/${certId}/revoke`, { reason }));
      setMessage(`Certificate ${certId} revoked successfully`);
      load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to revoke certificate');
    }
  };

  const filtered = certificates.filter(c => {
    const term = search.toLowerCase();
    return (
      c.certificateId.toLowerCase().includes(term) ||
      c.learnerName.toLowerCase().includes(term) ||
      c.courseName.toLowerCase().includes(term)
    );
  });

  return (
    <>
      <Title
        eyebrow="ADMIN PORTAL"
        title="Certificate Management"
        sub="Review all issued certificates, view verification registries, and manage revocations."
      />

      <div className="catalog-tools" style={{ marginBottom: '20px' }}>
        <div className="searchbox">
          <Search size={18} />
          <input
            placeholder="Search certificate by ID, learner, or course..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {message && (
        <div className="read-state" style={{ marginBottom: '15px' }}>
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      <section className="panel table-panel">
        <div className="panel-heading">
          <h3>Issued Certificates ({filtered.length})</h3>
          <span className="muted">Official credential registry</span>
        </div>

        {loading ? (
          <div className="loading">Loading certificates...</div>
        ) : filtered.length ? (
          filtered.map(cert => (
            <div className="table-row" key={cert.id}>
              <div>
                <strong>{cert.certification}</strong>
                <small className="muted">
                  ID: {cert.certificateId} · Recipient: {cert.learnerName}
                </small>
              </div>

              <div>
                <span>Score: {cert.score}%</span>
                <small className="muted" style={{ display: 'block' }}>
                  {new Date(cert.issuedDate).toLocaleDateString()}
                </small>
              </div>

              <div>
                <span className={cert.status === 'VALID' ? 'status-badge' : 'status-badge invalid'}>
                  {cert.status}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <a
                  className="button dark"
                  style={{ height: '32px', fontSize: '11px', padding: '0 10px' }}
                  href={`${api.defaults.baseURL.replace('/api/v1', '')}${cert.pdfUrl}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={13} /> PDF
                </a>
                <Link
                  className="button dark"
                  style={{ height: '32px', fontSize: '11px', padding: '0 10px' }}
                  to={`/verify/${cert.certificateId}`}
                >
                  Verify
                </Link>
                {cert.status === 'VALID' && (
                  <button
                    type="button"
                    className="button"
                    style={{
                      height: '32px',
                      fontSize: '11px',
                      padding: '0 10px',
                      background: '#fff0ee',
                      color: 'var(--orange)'
                    }}
                    onClick={() => revoke(cert.id)}
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Award size={36} />
            <h3>No certificates found</h3>
            <p className="muted">No issued certificates matched your search criteria.</p>
          </div>
        )}
      </section>
    </>
  );
}

